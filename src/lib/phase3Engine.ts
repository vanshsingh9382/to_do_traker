import {
  addDays,
  eachDayOfInterval,
  format,
  parseISO,
  startOfWeek,
  subDays,
} from 'date-fns';
import {
  DayReview,
  DayTemplate,
  Goal,
  GoogleCalendarEvent,
  Habit,
  HabitCheck,
  MoodLog,
  SavedView,
  Settings,
  Task,
  TaskTemplate,
  TimeLog,
  UnlockedAchievement,
  WeeklyReview,
} from '../types';
import { computeDayScore, computeStreaksAndSummary, getTaskActualMinutes } from './analyticsEngine';
import { expandTasksForDate, parseTaskIdentity } from './recurrenceEngine';
import { isHabitScheduledOnDate } from './habitEngine';

export type MatrixQuadrantId = 'q1' | 'q2' | 'q3' | 'q4';

export interface MatrixQuadrantMeta {
  id: MatrixQuadrantId;
  title: string;
  subtitle: string;
  important: boolean;
  urgent: boolean;
  color: string;
}

export const MATRIX_QUADRANTS: MatrixQuadrantMeta[] = [
  {
    id: 'q1',
    title: 'Do First',
    subtitle: 'Urgent & Important',
    important: true,
    urgent: true,
    color: '#EF4444', // rose/red
  },
  {
    id: 'q2',
    title: 'Schedule',
    subtitle: 'Important, Not Urgent',
    important: true,
    urgent: false,
    color: '#2563EB', // blue
  },
  {
    id: 'q3',
    title: 'Quick Tasks',
    subtitle: 'Urgent, Not Important',
    important: false,
    urgent: true,
    color: '#F59E0B', // amber
  },
  {
    id: 'q4',
    title: 'Eliminate / Later',
    subtitle: 'Neither Urgent Nor Important',
    important: false,
    urgent: false,
    color: '#64748B', // slate
  },
];

export function getQuadrantForTask(
  task: Pick<Task, 'important' | 'urgent'>
): MatrixQuadrantId {
  if (task.important && task.urgent) return 'q1';
  if (task.important && !task.urgent) return 'q2';
  if (!task.important && task.urgent) return 'q3';
  return 'q4';
}

export function getFlagsForQuadrant(q: MatrixQuadrantId): {
  important: boolean;
  urgent: boolean;
} {
  switch (q) {
    case 'q1':
      return { important: true, urgent: true };
    case 'q2':
      return { important: true, urgent: false };
    case 'q3':
      return { important: false, urgent: true };
    case 'q4':
      return { important: false, urgent: false };
  }
}

/**
 * Computes actual logged time (in minutes and hours) per Eisenhower Quadrant from real TimeLogs.
 */
export function computeTimeByQuadrant(
  tasks: Task[],
  timeLogs: TimeLog[],
  startDateStr?: string,
  endDateStr?: string,
  categoryFilter?: string
): Array<{
  id: MatrixQuadrantId;
  name: string;
  subtitle: string;
  minutes: number;
  hours: number;
  color: string;
}> {
  const taskMap = new Map<string, Task>();
  for (const t of tasks) {
    taskMap.set(t.id, t);
  }

  const totals: Record<MatrixQuadrantId, number> = {
    q1: 0,
    q2: 0,
    q3: 0,
    q4: 0,
  };

  for (const log of timeLogs) {
    const logDate = log.occurrenceDate || log.startedAt.slice(0, 10);
    if (startDateStr && logDate < startDateStr) continue;
    if (endDateStr && logDate > endDateStr) continue;

    const { masterId } = parseTaskIdentity(log.taskId);
    const task = taskMap.get(log.taskId) || taskMap.get(masterId);
    if (!task) continue;
    if (categoryFilter && categoryFilter !== 'All' && task.category !== categoryFilter) {
      continue;
    }

    const q = getQuadrantForTask(task);
    totals[q] += Math.max(0, log.durationMinutes);
  }

  return MATRIX_QUADRANTS.map((meta) => ({
    id: meta.id,
    name: meta.title,
    subtitle: meta.subtitle,
    minutes: Math.round(totals[meta.id]),
    hours: Number((totals[meta.id] / 60).toFixed(1)),
    color: meta.color,
  }));
}

// ==========================================
// SMART PLANNING ENGINE (Rule-based, no AI)
// ==========================================

export function parseHHMMToMinutes(timeStr: string | undefined, fallback = 480): number {
  if (!timeStr || !/^\d{1,2}:\d{2}$/.test(timeStr)) return fallback;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToHHMM(totalMin: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMin)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface DayCapacityLoad {
  workdayMinutes: number;
  externalEventMinutes: number;
  availableMinutes: number;
  plannedMinutes: number;
  unallocatedMinutes: number;
  loadPercent: number;
  loadState: 'ok' | 'nearly_full' | 'overbooked';
}

export function computeDayCapacityAndLoad(
  dateStr: string,
  dayTasks: Task[],
  externalEvents: GoogleCalendarEvent[],
  settings: Pick<Settings, 'workDayStart' | 'workDayEnd'>
): DayCapacityLoad {
  const workStartMin = parseHHMMToMinutes(settings.workDayStart, 8 * 60);
  const workEndMin = parseHHMMToMinutes(settings.workDayEnd, 20 * 60);
  const workdayMinutes = Math.max(60, workEndMin - workStartMin);

  // Sum external calendar events on dateStr that overlap working hours
  const dayExtEvents = externalEvents.filter(
    (ev) => ev.date === dateStr && !ev.isAllDay && ev.startTime && ev.endTime
  );
  let externalEventMinutes = 0;
  for (const ev of dayExtEvents) {
    const es = Math.max(workStartMin, parseHHMMToMinutes(ev.startTime));
    const ee = Math.min(workEndMin, parseHHMMToMinutes(ev.endTime));
    if (ee > es) {
      externalEventMinutes += ee - es;
    }
  }

  const availableMinutes = Math.max(0, workdayMinutes - externalEventMinutes);
  const plannedMinutes = dayTasks
    .filter((t) => t.status !== 'Skipped')
    .reduce((sum, t) => sum + Math.max(0, t.estimatedMinutes || 0), 0);

  const unallocatedMinutes = Math.max(0, availableMinutes - plannedMinutes);
  const loadPercent =
    availableMinutes > 0
      ? Math.round((plannedMinutes / availableMinutes) * 100)
      : plannedMinutes > 0
      ? 101
      : 0;

  let loadState: 'ok' | 'nearly_full' | 'overbooked' = 'ok';
  if (loadPercent > 100) {
    loadState = 'overbooked';
  } else if (loadPercent >= 85) {
    loadState = 'nearly_full';
  }

  return {
    workdayMinutes,
    externalEventMinutes,
    availableMinutes,
    plannedMinutes,
    unallocatedMinutes,
    loadPercent,
    loadState,
  };
}

export interface ScheduleConflictWarning {
  id: string;
  taskId: string;
  taskTitle: string;
  taskStart: string;
  taskEnd: string;
  durationMinutes: number;
  conflictsWithTitle: string;
  conflictsWithType: 'task' | 'external';
  suggestedSlot: { start: string; end: string } | null;
}

/**
 * Finds up to `count` nearest free slots inside working hours on `dateStr` that do not overlap
 * any active scheduled task or external event.
 */
export function findNearestFreeSlots(
  dateStr: string,
  durationMinutes: number,
  dayTasks: Task[],
  externalEvents: GoogleCalendarEvent[],
  settings: Pick<Settings, 'workDayStart' | 'workDayEnd'>,
  fromTimeStr?: string,
  excludeTaskId?: string,
  count = 3,
  bufferMinutes = 0
): Array<{ start: string; end: string }> {
  const workStartMin = parseHHMMToMinutes(settings.workDayStart, 8 * 60);
  const workEndMin = parseHHMMToMinutes(settings.workDayEnd, 20 * 60);
  const dur = Math.max(15, durationMinutes || 30);

  const rawStartMin = fromTimeStr
    ? Math.max(workStartMin, parseHHMMToMinutes(fromTimeStr, workStartMin))
    : workStartMin;
  // Round up to next 5-minute mark
  const searchStartMin = Math.ceil(rawStartMin / 5) * 5;

  // Build busy intervals [startMin, endMin]
  const busy: Array<{ start: number; end: number }> = [];

  for (const t of dayTasks) {
    if (t.status === 'Skipped') continue;
    if (excludeTaskId && (t.id === excludeTaskId || parseTaskIdentity(t.id).masterId === parseTaskIdentity(excludeTaskId).masterId)) {
      continue;
    }
    if (t.start && t.end) {
      const s = parseHHMMToMinutes(t.start);
      const e = parseHHMMToMinutes(t.end);
      if (e > s) {
        busy.push({ start: Math.max(0, s - bufferMinutes), end: e + bufferMinutes });
      }
    }
  }

  for (const ev of externalEvents) {
    if (ev.date !== dateStr || ev.isAllDay || !ev.startTime || !ev.endTime) continue;
    const s = parseHHMMToMinutes(ev.startTime);
    const e = parseHHMMToMinutes(ev.endTime);
    if (e > s) {
      busy.push({ start: Math.max(0, s - bufferMinutes), end: e + bufferMinutes });
    }
  }

  busy.sort((a, b) => a.start - b.start);

  // Merge overlapping busy intervals
  const mergedBusy: Array<{ start: number; end: number }> = [];
  for (const interval of busy) {
    if (mergedBusy.length === 0 || mergedBusy[mergedBusy.length - 1].end < interval.start) {
      mergedBusy.push({ ...interval });
    } else {
      mergedBusy[mergedBusy.length - 1].end = Math.max(
        mergedBusy[mergedBusy.length - 1].end,
        interval.end
      );
    }
  }

  const slots: Array<{ start: string; end: string }> = [];
  let cursor = searchStartMin;

  while (cursor + dur <= workEndMin && slots.length < count) {
    const candidateEnd = cursor + dur;
    const conflict = mergedBusy.find((b) => cursor < b.end && candidateEnd > b.start);
    if (!conflict) {
      slots.push({
        start: minutesToHHMM(cursor),
        end: minutesToHHMM(candidateEnd),
      });
      // Advance cursor by at least 30 mins (or dur) to offer distinct slot choices
      cursor = Math.ceil((cursor + Math.max(30, Math.min(60, dur))) / 15) * 15;
    } else {
      cursor = Math.ceil(conflict.end / 5) * 5;
    }
  }

  return slots;
}

/**
 * Detects overlaps between tasks and other tasks or external calendar events, with a Fix suggestion.
 */
export function detectScheduleConflicts(
  dayTasks: Task[],
  externalEvents: GoogleCalendarEvent[],
  dateStr: string,
  settings: Pick<Settings, 'workDayStart' | 'workDayEnd'>
): ScheduleConflictWarning[] {
  const warnings: ScheduleConflictWarning[] = [];
  const activeTimedTasks = dayTasks
    .filter((t) => t.status !== 'Skipped' && t.start && t.end)
    .map((t) => ({
      task: t,
      startMin: parseHHMMToMinutes(t.start),
      endMin: parseHHMMToMinutes(t.end),
    }))
    .filter((x) => x.endMin > x.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const dayExt = externalEvents
    .filter((e) => e.date === dateStr && !e.isAllDay && e.startTime && e.endTime)
    .map((e) => ({
      ev: e,
      startMin: parseHHMMToMinutes(e.startTime),
      endMin: parseHHMMToMinutes(e.endTime),
    }))
    .filter((x) => x.endMin > x.startMin);

  // 1. Task vs Task overlaps
  for (let i = 0; i < activeTimedTasks.length; i++) {
    for (let j = i + 1; j < activeTimedTasks.length; j++) {
      const a = activeTimedTasks[i];
      const b = activeTimedTasks[j];
      if (b.startMin < a.endMin) {
        const dur = b.task.estimatedMinutes || b.endMin - b.startMin;
        const freeSlots = findNearestFreeSlots(
          dateStr,
          dur,
          dayTasks,
          externalEvents,
          settings,
          minutesToHHMM(a.endMin),
          b.task.id,
          1
        );
        warnings.push({
          id: `conflict-task-${a.task.id}-${b.task.id}`,
          taskId: b.task.id,
          taskTitle: b.task.title,
          taskStart: b.task.start!,
          taskEnd: b.task.end!,
          durationMinutes: dur,
          conflictsWithTitle: a.task.title,
          conflictsWithType: 'task',
          suggestedSlot: freeSlots[0] || null,
        });
      }
    }
  }

  // 2. Task vs External Event overlaps
  for (const item of activeTimedTasks) {
    for (const ext of dayExt) {
      if (item.startMin < ext.endMin && item.endMin > ext.startMin) {
        const dur = item.task.estimatedMinutes || item.endMin - item.startMin;
        const freeSlots = findNearestFreeSlots(
          dateStr,
          dur,
          dayTasks,
          externalEvents,
          settings,
          minutesToHHMM(ext.endMin),
          item.task.id,
          1
        );
        warnings.push({
          id: `conflict-ext-${item.task.id}-${ext.ev.id}`,
          taskId: item.task.id,
          taskTitle: item.task.title,
          taskStart: item.task.start!,
          taskEnd: item.task.end!,
          durationMinutes: dur,
          conflictsWithTitle: ext.ev.summary,
          conflictsWithType: 'external',
          suggestedSlot: freeSlots[0] || null,
        });
      }
    }
  }

  return warnings;
}

export interface ReplanProposedMove {
  taskId: string;
  title: string;
  category: string;
  priority: Task['priority'];
  important: boolean;
  urgent: boolean;
  estimatedMinutes: number;
  oldStart?: string;
  oldEnd?: string;
  newStart: string;
  newEnd: string;
  reason: string;
  selected: boolean;
}

export interface ReplanOverflowItem {
  taskId: string;
  title: string;
  category: string;
  priority: Task['priority'];
  estimatedMinutes: number;
  oldStart?: string;
  oldEnd?: string;
  reason: string;
  choice: 'tomorrow' | 'keep';
}

export interface ReplanProposalResult {
  dateStr: string;
  startFromTime: string;
  bufferMinutes: number;
  fixedCount: number;
  externalCount: number;
  moves: ReplanProposedMove[];
  overflowTasks: ReplanOverflowItem[];
}

function getTaskReplanRank(t: Task): number {
  // Lower score = higher priority in queue
  // 1) Order by important+urgent (Q1=0, Q2=1, Q3=2, Q4=3)
  const qRank = t.important && t.urgent ? 0 : t.important ? 1 : t.urgent ? 2 : 3;
  // 2) Then priority (High=0, Med=1, Low=2)
  const pRank = t.priority === 'High' ? 0 : t.priority === 'Med' ? 1 : 2;
  return qRank * 10 + pRank;
}

/**
 * Rule-based "Replan my day" engine:
 * - Starts from `currentTimeStr` (clamped to >= workDayStart, rounded up to 5-minute mark).
 * - Never touches external events, Completed/Skipped tasks, or tasks marked `fixedTime: true`.
 * - Orders remaining unfinished tasks by: important+urgent, then priority, then estimatedMinutes ascending.
 * - First-fit into free gaps inside working hours with configurable buffer (default 5 min).
 * - Tasks that cannot fit before workDayEnd are listed in `overflowTasks` ("Can't fit today: move to tomorrow?").
 */
export function proposeReplanForDay(
  dateStr: string,
  currentTimeStr: string,
  dayTasks: Task[],
  externalEvents: GoogleCalendarEvent[],
  settings: Pick<Settings, 'workDayStart' | 'workDayEnd' | 'replanBufferMinutes'>
): ReplanProposalResult {
  const workStartMin = parseHHMMToMinutes(settings.workDayStart, 8 * 60);
  const workEndMin = parseHHMMToMinutes(settings.workDayEnd, 20 * 60);
  const buffer = Math.max(0, settings.replanBufferMinutes ?? 5);

  const nowMinRaw = parseHHMMToMinutes(currentTimeStr, workStartMin);
  const effectiveStartMin = Math.ceil(Math.max(workStartMin, nowMinRaw) / 5) * 5;

  // Locked intervals: external events, fixedTime tasks, and already completed tasks with times
  const lockedIntervals: Array<{ start: number; end: number; label: string }> = [];

  const dayExt = externalEvents.filter(
    (e) => e.date === dateStr && !e.isAllDay && e.startTime && e.endTime
  );
  for (const ev of dayExt) {
    const s = parseHHMMToMinutes(ev.startTime);
    const e = parseHHMMToMinutes(ev.endTime);
    if (e > s) {
      lockedIntervals.push({ start: s, end: e, label: `External: ${ev.summary}` });
    }
  }

  const fixedTasks = dayTasks.filter(
    (t) =>
      t.status !== 'Skipped' &&
      (t.fixedTime || t.status === 'Completed') &&
      t.start &&
      t.end
  );
  for (const ft of fixedTasks) {
    const s = parseHHMMToMinutes(ft.start);
    const e = parseHHMMToMinutes(ft.end);
    if (e > s) {
      lockedIntervals.push({
        start: s,
        end: e,
        label: ft.fixedTime ? `Fixed task: ${ft.title}` : `Completed: ${ft.title}`,
      });
    }
  }

  // Unfinished, movable tasks
  const movableTasks = dayTasks
    .filter(
      (t) =>
        (t.status === 'To Do' || t.status === 'In Progress') &&
        !t.fixedTime
    )
    .sort((a, b) => {
      const rankDiff = getTaskReplanRank(a) - getTaskReplanRank(b);
      if (rankDiff !== 0) return rankDiff;
      return (a.estimatedMinutes || 30) - (b.estimatedMinutes || 30);
    });

  const moves: ReplanProposedMove[] = [];
  const overflowTasks: ReplanOverflowItem[] = [];

  for (const task of movableTasks) {
    const dur = Math.max(15, task.estimatedMinutes || 30);
    // Find first free gap >= dur starting from effectiveStartMin and ending <= workEndMin
    let cursor = effectiveStartMin;
    let placedSlot: { startMin: number; endMin: number } | null = null;

    while (cursor + dur <= workEndMin) {
      const candidateEnd = cursor + dur;
      // Check against all locked intervals (including buffer around them)
      const hit = lockedIntervals.find(
        (lock) => cursor < lock.end + buffer && candidateEnd + buffer > lock.start
      );
      if (!hit) {
        placedSlot = { startMin: cursor, endMin: candidateEnd };
        break;
      }
      cursor = Math.ceil((hit.end + buffer) / 5) * 5;
    }

    if (placedSlot) {
      const newStart = minutesToHHMM(placedSlot.startMin);
      const newEnd = minutesToHHMM(placedSlot.endMin);
      lockedIntervals.push({
        start: placedSlot.startMin,
        end: placedSlot.endMin,
        label: task.title,
      });

      const quadrantLabel =
        task.important && task.urgent
          ? 'Do First (Urgent + Important)'
          : task.important
          ? 'Schedule (Important)'
          : task.urgent
          ? 'Quick Task (Urgent)'
          : `${task.priority} priority`;

      let reason = `Prioritized as ${quadrantLabel}`;
      if (!task.start) {
        reason = `Assigned first open ${dur}m slot (${quadrantLabel})`;
      } else if (parseHHMMToMinutes(task.start) < effectiveStartMin) {
        reason = `Rescheduled from past slot ${task.start} into next open gap (${quadrantLabel})`;
      } else if (task.start !== newStart) {
        reason = `Packed into free gap with ${buffer}m buffer (${quadrantLabel})`;
      } else {
        reason = `Kept in optimal slot (${quadrantLabel})`;
      }

      moves.push({
        taskId: task.id,
        title: task.title,
        category: task.category,
        priority: task.priority,
        important: task.important,
        urgent: task.urgent,
        estimatedMinutes: dur,
        oldStart: task.start,
        oldEnd: task.end,
        newStart,
        newEnd,
        reason,
        selected: true,
      });
    } else {
      overflowTasks.push({
        taskId: task.id,
        title: task.title,
        category: task.category,
        priority: task.priority,
        estimatedMinutes: dur,
        oldStart: task.start,
        oldEnd: task.end,
        reason: `No ${dur}m free gap left before workday ends at ${settings.workDayEnd}`,
        choice: 'tomorrow',
      });
    }
  }

  return {
    dateStr,
    startFromTime: minutesToHHMM(effectiveStartMin),
    bufferMinutes: buffer,
    fixedCount: dayTasks.filter((t) => t.fixedTime && t.status !== 'Skipped').length,
    externalCount: dayExt.length,
    moves,
    overflowTasks,
  };
}

// ==========================================
// WEEKLY REVIEW & INSIGHTS ENGINE
// ==========================================

export interface WeeklyReviewComputedStats {
  weekStart: string;
  weekEnd: string;
  activeDaysCount: number;
  plannedTasks: number;
  completedTasks: number;
  completionRate: number; // matches Analytics page formula for the same week
  focusMinutes: number;
  focusHours: number;
  avgScore: number | null;
  prevWeekComparison: {
    completionRateDiff: number;
    focusMinutesDiff: number;
    avgScoreDiff: number | null;
  };
  bestDay: { date: string; label: string; score: number } | null;
  weakestDay: { date: string; label: string; score: number } | null;
  bestCategoryByTime: { category: string; minutes: number } | null;
  bestCategoryByCompletion: { category: string; rate: number; completed: number } | null;
  habitConsistencyRate: number;
  avgMood: number | null;
  avgEnergy: number | null;
  insights: string[];
  hasEnoughDataForInsights: boolean;
}

export function computeWeeklyReviewStats(
  weekStartStr: string,
  allTasks: Task[],
  allTimeLogs: TimeLog[],
  habits: Habit[],
  habitChecks: HabitCheck[],
  moodLogs: MoodLog[],
  dayReviews: DayReview[],
  settings: Settings,
  maxPlannedDateStr?: string
): WeeklyReviewComputedStats {
  const start = parseISO(weekStartStr);
  const end = addDays(start, 6);
  const weekEndStr = format(end, 'yyyy-MM-dd');
  const days = eachDayOfInterval({ start, end });

  const breakdowns = days.map((d) =>
    computeDayScore(
      format(d, 'yyyy-MM-dd'),
      allTasks,
      allTimeLogs,
      settings,
      undefined,
      maxPlannedDateStr
    )
  );

  // Previous week breakdowns for delta comparison
  const prevStart = subDays(start, 7);
  const prevEnd = subDays(start, 1);
  const prevDays = eachDayOfInterval({ start: prevStart, end: prevEnd });
  const prevBreakdowns = prevDays.map((d) =>
    computeDayScore(
      format(d, 'yyyy-MM-dd'),
      allTasks,
      allTimeLogs,
      settings,
      undefined,
      maxPlannedDateStr
    )
  );

  const plannedTasks = breakdowns.reduce((s, b) => s + b.activePlannedCount, 0);
  const completedTasks = breakdowns.reduce((s, b) => s + b.completedCount, 0);
  const completionRate =
    plannedTasks > 0 ? Math.round((completedTasks / plannedTasks) * 100) : 0;

  const focusMinutes = breakdowns.reduce((s, b) => s + b.actualMinutes, 0);
  const focusHours = Number((focusMinutes / 60).toFixed(1));

  const scoredDays = breakdowns.filter((b) => b.productivityScore !== null);
  const avgScore =
    scoredDays.length > 0
      ? Math.round(
          scoredDays.reduce((s, b) => s + (b.productivityScore || 0), 0) /
            scoredDays.length
        )
      : null;

  const prevPlanned = prevBreakdowns.reduce((s, b) => s + b.activePlannedCount, 0);
  const prevCompleted = prevBreakdowns.reduce((s, b) => s + b.completedCount, 0);
  const prevCompletionRate =
    prevPlanned > 0 ? Math.round((prevCompleted / prevPlanned) * 100) : 0;
  const prevFocusMinutes = prevBreakdowns.reduce((s, b) => s + b.actualMinutes, 0);
  const prevScored = prevBreakdowns.filter((b) => b.productivityScore !== null);
  const prevAvgScore =
    prevScored.length > 0
      ? Math.round(
          prevScored.reduce((s, b) => s + (b.productivityScore || 0), 0) /
            prevScored.length
        )
      : null;

  // Best & weakest day
  let bestDay: { date: string; label: string; score: number } | null = null;
  let weakestDay: { date: string; label: string; score: number } | null = null;
  for (const b of scoredDays) {
    const score = b.productivityScore!;
    const label = format(parseISO(b.date), 'EEE, MMM d');
    if (!bestDay || score > bestDay.score) {
      bestDay = { date: b.date, label, score };
    }
    if (!weakestDay || score < weakestDay.score) {
      weakestDay = { date: b.date, label, score };
    }
  }

  // Category aggregation across the 7 days
  const catTime = new Map<string, number>();
  const catPlanned = new Map<string, number>();
  const catCompleted = new Map<string, number>();

  for (const d of days) {
    const dStr = format(d, 'yyyy-MM-dd');
    const dayTasks = expandTasksForDate(allTasks, dStr).filter(
      (t) => t.status !== 'Skipped' && (!maxPlannedDateStr || !t.isVirtualOccurrence || dStr <= maxPlannedDateStr)
    );
    for (const t of dayTasks) {
      catPlanned.set(t.category, (catPlanned.get(t.category) || 0) + 1);
      if (t.status === 'Completed') {
        catCompleted.set(t.category, (catCompleted.get(t.category) || 0) + 1);
      }
      const mins = getTaskActualMinutes(t, allTimeLogs, dStr);
      if (mins > 0) {
        catTime.set(t.category, (catTime.get(t.category) || 0) + mins);
      }
    }
  }

  let bestCategoryByTime: { category: string; minutes: number } | null = null;
  for (const [cat, mins] of catTime.entries()) {
    if (!bestCategoryByTime || mins > bestCategoryByTime.minutes) {
      bestCategoryByTime = { category: cat, minutes: mins };
    }
  }

  let bestCategoryByCompletion: { category: string; rate: number; completed: number } | null = null;
  for (const [cat, planned] of catPlanned.entries()) {
    if (planned <= 0) continue;
    const comp = catCompleted.get(cat) || 0;
    const rate = Math.round((comp / planned) * 100);
    if (
      !bestCategoryByCompletion ||
      rate > bestCategoryByCompletion.rate ||
      (rate === bestCategoryByCompletion.rate && comp > bestCategoryByCompletion.completed)
    ) {
      bestCategoryByCompletion = { category: cat, rate, completed: comp };
    }
  }

  // Habit consistency across the 7 days
  const activeHabits = habits.filter((h) => !h.archived);
  let schedHabitSlots = 0;
  let doneHabitSlots = 0;
  for (const d of days) {
    const dStr = format(d, 'yyyy-MM-dd');
    if (maxPlannedDateStr && dStr > maxPlannedDateStr) continue;
    for (const h of activeHabits) {
      const check = habitChecks.find((hc) => hc.habitId === h.id && hc.date === dStr);
      if (check?.status === 'skipped') continue;
      if (isHabitScheduledOnDate(h, dStr)) {
        schedHabitSlots += 1;
        if (check?.completed) doneHabitSlots += 1;
      }
    }
  }
  const habitConsistencyRate =
    schedHabitSlots > 0 ? Math.round((doneHabitSlots / schedHabitSlots) * 100) : 0;

  // Mood & energy average across the 7 days
  const moodValues: number[] = [];
  const energyValues: number[] = [];
  for (const d of days) {
    const dStr = format(d, 'yyyy-MM-dd');
    const mLog = moodLogs.find((m) => m.date === dStr);
    const rev = dayReviews.find((r) => r.date === dStr);
    const mood = mLog?.mood ?? rev?.mood;
    const energy = mLog?.energy ?? rev?.energy;
    if (typeof mood === 'number' && mood >= 1 && mood <= 5) moodValues.push(mood);
    if (typeof energy === 'number' && energy >= 1 && energy <= 5) energyValues.push(energy);
  }

  const avgMood =
    moodValues.length > 0
      ? Number((moodValues.reduce((a, b) => a + b, 0) / moodValues.length).toFixed(1))
      : null;
  const avgEnergy =
    energyValues.length > 0
      ? Number((energyValues.reduce((a, b) => a + b, 0) / energyValues.length).toFixed(1))
      : null;

  const activeDaysCount = scoredDays.length;
  const hasEnoughDataForInsights = activeDaysCount >= 3;
  const insights: string[] = [];

  if (!hasEnoughDataForInsights) {
    insights.push(
      `There isn't enough data for weekly insights yet (${activeDaysCount} of 3 required active days logged in this week).`
    );
  } else {
    const compDiff = completionRate - prevCompletionRate;
    const compDirection =
      compDiff > 0
        ? `up ${compDiff} percentage points from last week`
        : compDiff < 0
        ? `down ${Math.abs(compDiff)} percentage points from last week`
        : `matching last week's rate`;
    insights.push(
      `You completed ${completionRate}% of planned tasks (${completedTasks}/${plannedTasks}), ${compDirection}.`
    );

    const focusDiffHours = Number(((focusMinutes - prevFocusMinutes) / 60).toFixed(1));
    const focusPhrase =
      focusDiffHours > 0
        ? `+${focusDiffHours}h more than the previous week`
        : focusDiffHours < 0
        ? `${focusDiffHours}h compared to the previous week`
        : `identical to the previous week`;
    insights.push(
      `Total logged focus reached ${focusHours}h across ${activeDaysCount} active days (${focusPhrase})${
        bestCategoryByTime
          ? `, led by ${bestCategoryByTime.category} (${(
              bestCategoryByTime.minutes / 60
            ).toFixed(1)}h).`
          : '.'
      }`
    );

    if (bestDay && weakestDay && bestDay.date !== weakestDay.date) {
      insights.push(
        `Your strongest execution day was ${bestDay.label} (score ${bestDay.score}/100), while ${weakestDay.label} had the lowest score (${weakestDay.score}/100).`
      );
    }
  }

  return {
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    activeDaysCount,
    plannedTasks,
    completedTasks,
    completionRate,
    focusMinutes,
    focusHours,
    avgScore,
    prevWeekComparison: {
      completionRateDiff: completionRate - prevCompletionRate,
      focusMinutesDiff: focusMinutes - prevFocusMinutes,
      avgScoreDiff:
        avgScore !== null && prevAvgScore !== null ? avgScore - prevAvgScore : null,
    },
    bestDay,
    weakestDay,
    bestCategoryByTime,
    bestCategoryByCompletion,
    habitConsistencyRate,
    avgMood,
    avgEnergy,
    insights,
    hasEnoughDataForInsights,
  };
}

// ==========================================
// GOALS PROGRESS ENGINE
// ==========================================

export interface GoalProgressSummary {
  goalId: string;
  measureType: 'tasks' | 'hours' | 'manual';
  currentValue: number;
  targetValue: number;
  percent: number;
  linkedTasksCount: number;
  completedLinkedTasksCount: number;
  loggedMinutes: number;
  loggedHours: number;
  weeklyContributions: Array<{ weekLabel: string; hours: number; tasksCompleted: number }>;
}

export function computeGoalProgress(
  goal: Goal,
  allTasks: Task[],
  allTimeLogs: TimeLog[],
  referenceDate = new Date()
): GoalProgressSummary {
  const measureType = goal.measureType || 'hours';
  const linkedTasks = allTasks.filter(
    (t) => t.goalId === goal.id || (!t.goalId && t.isDemo && goal.isDemo && t.category === goal.category)
  );
  const linkedTaskIds = new Set(linkedTasks.map((t) => t.id));
  const completedLinked = linkedTasks.filter((t) => t.status === 'Completed');

  const loggedMinutes = allTimeLogs
    .filter((log) => {
      const { masterId } = parseTaskIdentity(log.taskId);
      return linkedTaskIds.has(log.taskId) || linkedTaskIds.has(masterId);
    })
    .reduce((sum, l) => sum + Math.max(0, l.durationMinutes), 0);

  const loggedHours = Number((loggedMinutes / 60).toFixed(1));

  let currentValue = 0;
  let targetValue = 1;
  let percent = 0;

  if (measureType === 'tasks') {
    currentValue = completedLinked.length;
    targetValue = Math.max(1, goal.targetTasks || linkedTasks.length || 10);
    percent = Math.min(100, Math.round((currentValue / targetValue) * 100));
  } else if (measureType === 'manual') {
    currentValue = Math.max(0, Math.min(100, goal.manualProgress ?? 0));
    targetValue = 100;
    percent = Math.round(currentValue);
  } else {
    currentValue = loggedHours;
    targetValue = Math.max(1, goal.targetHours || 20);
    percent = Math.min(100, Math.round((loggedHours / targetValue) * 100));
  }

  // Last 4 weeks contribution bars
  const weeklyContributions: Array<{
    weekLabel: string;
    hours: number;
    tasksCompleted: number;
  }> = [];
  for (let w = 3; w >= 0; w--) {
    const wStart = startOfWeek(subDays(referenceDate, w * 7), { weekStartsOn: 1 });
    const wEnd = addDays(wStart, 6);
    const wStartStr = format(wStart, 'yyyy-MM-dd');
    const wEndStr = format(wEnd, 'yyyy-MM-dd');

    const wMins = allTimeLogs
      .filter((log) => {
        const d = log.occurrenceDate || log.startedAt.slice(0, 10);
        if (d < wStartStr || d > wEndStr) return false;
        const { masterId } = parseTaskIdentity(log.taskId);
        return linkedTaskIds.has(log.taskId) || linkedTaskIds.has(masterId);
      })
      .reduce((s, l) => s + Math.max(0, l.durationMinutes), 0);

    const wTasks = completedLinked.filter(
      (t) => t.date >= wStartStr && t.date <= wEndStr
    ).length;

    weeklyContributions.push({
      weekLabel: format(wStart, 'MMM d'),
      hours: Number((wMins / 60).toFixed(1)),
      tasksCompleted: wTasks,
    });
  }

  return {
    goalId: goal.id,
    measureType,
    currentValue,
    targetValue,
    percent,
    linkedTasksCount: linkedTasks.length,
    completedLinkedTasksCount: completedLinked.length,
    loggedMinutes,
    loggedHours,
    weeklyContributions,
  };
}

// ==========================================
// MOOD & ENERGY CORRELATION ENGINE
// ==========================================

export interface MoodEnergyDataPoint {
  date: string;
  label: string;
  mood: number | null;
  energy: number | null;
  productivityScore: number | null;
  note?: string;
}

export function computeMoodEnergySeriesAndObservation(
  moodLogs: MoodLog[],
  dayReviews: DayReview[],
  allTasks: Task[],
  allTimeLogs: TimeLog[],
  settings: Settings,
  daysCount = 21,
  referenceDateStr = format(new Date(), 'yyyy-MM-dd')
): {
  series: MoodEnergyDataPoint[];
  loggedDaysCount: number;
  observation: string | null;
} {
  const ref = parseISO(referenceDateStr);
  const days = eachDayOfInterval({
    start: subDays(ref, Math.max(14, daysCount - 1)),
    end: ref,
  });

  const series: MoodEnergyDataPoint[] = [];
  const validPairs: Array<{ mood: number; energy: number; score: number }> = [];

  for (const d of days) {
    const dStr = format(d, 'yyyy-MM-dd');
    const mLog = moodLogs.find((m) => m.date === dStr);
    const rev = dayReviews.find((r) => r.date === dStr);
    const mood = mLog?.mood ?? rev?.mood ?? null;
    const energy = mLog?.energy ?? rev?.energy ?? null;
    const note = mLog?.note ?? rev?.moodNote;

    const scoreObj = computeDayScore(
      dStr,
      allTasks,
      allTimeLogs,
      settings,
      undefined,
      referenceDateStr
    );

    series.push({
      date: dStr,
      label: format(d, 'MM-dd'),
      mood,
      energy,
      productivityScore: scoreObj.productivityScore,
      note,
    });

    if (
      typeof energy === 'number' &&
      typeof mood === 'number' &&
      scoreObj.productivityScore !== null
    ) {
      validPairs.push({
        mood,
        energy,
        score: scoreObj.productivityScore,
      });
    }
  }

  let observation: string | null = null;
  if (validPairs.length >= 10) {
    const highEnergy = validPairs.filter((p) => p.energy >= 4);
    const lowModEnergy = validPairs.filter((p) => p.energy <= 3);
    if (highEnergy.length > 0 && lowModEnergy.length > 0) {
      const avgHigh = Math.round(
        highEnergy.reduce((s, p) => s + p.score, 0) / highEnergy.length
      );
      const avgLow = Math.round(
        lowModEnergy.reduce((s, p) => s + p.score, 0) / lowModEnergy.length
      );
      observation = `Observation across ${validPairs.length} logged days: average productivity score on energy 4–5 days was ${avgHigh}/100 vs ${avgLow}/100 on energy 1–3 days.`;
    } else {
      const avgAll = Math.round(
        validPairs.reduce((s, p) => s + p.score, 0) / validPairs.length
      );
      const avgEnergy = (
        validPairs.reduce((s, p) => s + p.energy, 0) / validPairs.length
      ).toFixed(1);
      observation = `Observation across ${validPairs.length} logged days: your average logged energy is ${avgEnergy}/5 alongside an average productivity score of ${avgAll}/100.`;
    }
  }

  return {
    series,
    loggedDaysCount: validPairs.length,
    observation,
  };
}

// ==========================================
// ACHIEVEMENTS ENGINE (Demo data never counts!)
// ==========================================

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  unit: string;
}

export interface EvaluatedAchievement extends AchievementDefinition {
  current: number;
  percent: number;
  unlocked: boolean;
  unlockedAt?: string;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'first-task',
    title: 'First Forge',
    description: 'Complete your first real (non-demo) task.',
    icon: '✅',
    target: 1,
    unit: 'task',
  },
  {
    id: 'tasks-10',
    title: 'Momentum Builder',
    description: 'Complete 10 real tasks.',
    icon: '🚀',
    target: 10,
    unit: 'tasks',
  },
  {
    id: 'tasks-100',
    title: 'Centurion Executor',
    description: 'Complete 100 real tasks.',
    icon: '🏅',
    target: 100,
    unit: 'tasks',
  },
  {
    id: 'tasks-500',
    title: 'Master of Execution',
    description: 'Complete 500 real tasks.',
    icon: '👑',
    target: 500,
    unit: 'tasks',
  },
  {
    id: 'first-pomodoro',
    title: 'Deep Focus Initiate',
    description: 'Complete your first real Pomodoro focus session.',
    icon: '🍅',
    target: 1,
    unit: 'pomodoro',
  },
  {
    id: 'focus-10h',
    title: '10 Hours of Deep Work',
    description: 'Log 10 hours of real tracked focus time.',
    icon: '⏱️',
    target: 10,
    unit: 'hours',
  },
  {
    id: 'focus-50h',
    title: '50 Hours of Deep Work',
    description: 'Log 50 hours of real tracked focus time.',
    icon: '🔥',
    target: 50,
    unit: 'hours',
  },
  {
    id: 'focus-100h',
    title: '100 Hours Club',
    description: 'Log 100 hours of real tracked focus time.',
    icon: '💎',
    target: 100,
    unit: 'hours',
  },
  {
    id: 'streak-3d',
    title: '3-Day Goal-Met Streak',
    description: 'Reach a 3-day productivity score streak on real data.',
    icon: '⚡',
    target: 3,
    unit: 'days',
  },
  {
    id: 'streak-7d',
    title: '7-Day Goal-Met Streak',
    description: 'Reach a 7-day productivity score streak on real data.',
    icon: '🌟',
    target: 7,
    unit: 'days',
  },
  {
    id: 'streak-30d',
    title: '30-Day Unstoppable Streak',
    description: 'Reach a 30-day productivity score streak on real data.',
    icon: '🏆',
    target: 30,
    unit: 'days',
  },
  {
    id: 'first-wrapup',
    title: 'Sunsama Ritualist',
    description: 'Finish your first Daily Wrap-Up ritual.',
    icon: '🌅',
    target: 1,
    unit: 'wrap-up',
  },
  {
    id: 'first-weekly-review',
    title: 'Weekly Architect',
    description: 'Save your first Weekly Review reflection.',
    icon: '📊',
    target: 1,
    unit: 'review',
  },
  {
    id: 'habit-streak-7d',
    title: '7-Day Habit Consistency',
    description: 'Complete 7 real habit check-ins.',
    icon: '🔁',
    target: 7,
    unit: 'check-ins',
  },
];

/**
 * Evaluates all achievements strictly from NON-DEMO stored data.
 * Demo data (`isDemo === true`) NEVER unlocks or increments any achievement.
 */
export function evaluateAchievements(params: {
  tasks: Task[];
  timeLogs: TimeLog[];
  dayReviews: DayReview[];
  weeklyReviews: WeeklyReview[];
  habitChecks: HabitCheck[];
  settings: Settings;
  unlockedAchievements: UnlockedAchievement[];
  referenceDateStr?: string;
}): {
  evaluated: EvaluatedAchievement[];
  newlyUnlocked: UnlockedAchievement[];
} {
  const {
    tasks,
    timeLogs,
    dayReviews,
    weeklyReviews,
    habitChecks,
    settings,
    unlockedAchievements,
    referenceDateStr = format(new Date(), 'yyyy-MM-dd'),
  } = params;

  // Strictly filter out all demo items
  const realTasks = tasks.filter((t) => !t.isDemo);
  const realLogs = timeLogs.filter((l) => !l.isDemo);
  const realDayReviews = dayReviews.filter((r) => !r.isDemo);
  const realWeeklyReviews = weeklyReviews.filter((w) => !w.isDemo);
  const realHabitChecks = habitChecks.filter((hc) => !hc.isDemo && hc.completed);

  // Count completed real tasks (including completed occurrences on real recurring tasks)
  let realCompletedTaskCount = 0;
  for (const t of realTasks) {
    if (t.status === 'Completed') {
      realCompletedTaskCount += 1;
    }
    if (t.occurrenceOverrides) {
      for (const ov of Object.values(t.occurrenceOverrides)) {
        if (ov.status === 'Completed') {
          realCompletedTaskCount += 1;
        }
      }
    }
  }

  const realPomodoroCount = realLogs.filter((l) => l.type === 'pomodoro').length;
  const realFocusMinutes = realLogs.reduce((s, l) => s + Math.max(0, l.durationMinutes), 0);
  const realFocusHours = Number((realFocusMinutes / 60).toFixed(1));

  // Compute real streak from realTasks and realLogs only
  const realStreakSummary =
    realTasks.length > 0 || realLogs.length > 0
      ? computeStreaksAndSummary(referenceDateStr, realTasks, realLogs, settings)
      : { currentStreak: 0, longestStreak: 0 };
  const bestRealStreak = Math.max(
    realStreakSummary.currentStreak,
    realStreakSummary.longestStreak
  );

  const closedWrapUpsCount = realDayReviews.filter((r) => r.closed).length;
  const savedWeeklyCount = realWeeklyReviews.filter(
    (w) =>
      w.wins.trim().length > 0 ||
      w.lessons.trim().length > 0 ||
      w.nextWeekFocus.trim().length > 0
  ).length;

  const existingUnlockedMap = new Map<string, string>();
  for (const u of unlockedAchievements) {
    existingUnlockedMap.set(u.id, u.unlockedAt);
  }

  const currentById: Record<string, number> = {
    'first-task': realCompletedTaskCount,
    'tasks-10': realCompletedTaskCount,
    'tasks-100': realCompletedTaskCount,
    'tasks-500': realCompletedTaskCount,
    'first-pomodoro': realPomodoroCount,
    'focus-10h': realFocusHours,
    'focus-50h': realFocusHours,
    'focus-100h': realFocusHours,
    'streak-3d': bestRealStreak,
    'streak-7d': bestRealStreak,
    'streak-30d': bestRealStreak,
    'first-wrapup': closedWrapUpsCount,
    'first-weekly-review': savedWeeklyCount,
    'habit-streak-7d': realHabitChecks.length,
  };

  const newlyUnlocked: UnlockedAchievement[] = [];
  const nowIso = new Date().toISOString();

  const evaluated: EvaluatedAchievement[] = ACHIEVEMENT_DEFINITIONS.map((def) => {
    const current = currentById[def.id] ?? 0;
    const meetsTarget = current >= def.target;
    const prevUnlockedAt = existingUnlockedMap.get(def.id);

    if (meetsTarget && !prevUnlockedAt) {
      newlyUnlocked.push({ id: def.id, unlockedAt: nowIso });
    }

    const isUnlocked = Boolean(prevUnlockedAt || meetsTarget);
    const percent = Math.min(100, Math.round((current / def.target) * 100));

    return {
      ...def,
      current,
      percent,
      unlocked: isUnlocked,
      unlockedAt: prevUnlockedAt || (meetsTarget ? nowIso : undefined),
    };
  });

  return { evaluated, newlyUnlocked };
}

// ==========================================
// CSV EXPORT ENGINE (UTF-8 with BOM + RFC 4180 escaping)
// ==========================================

export function escapeCSVCell(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCSVWithBOM(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): string {
  const headerLine = headers.map(escapeCSVCell).join(',');
  const bodyLines = rows.map((row) => row.map(escapeCSVCell).join(','));
  return '\uFEFF' + [headerLine, ...bodyLines].join('\r\n');
}

// ==========================================
// BUILT-IN SAVED VIEWS, TEMPLATES & 40 ORIGINAL MOTIVATIONAL LINES
// ==========================================

export const BUILT_IN_SAVED_VIEWS: SavedView[] = [
  {
    id: 'view-this-week',
    name: 'This Week',
    isBuiltIn: true,
    pinnedToSidebar: true,
    viewType: 'list',
    groupBy: 'date',
    sortBy: 'date',
    filterCategory: 'All',
    filterPriority: 'All',
    filterStatus: 'All',
    filterTag: 'All',
    filterDateRange: 'week',
    filterHasNote: false,
    filterRecurring: false,
    filterSynced: false,
  },
  {
    id: 'view-today',
    name: 'Today',
    isBuiltIn: true,
    pinnedToSidebar: false,
    viewType: 'list',
    groupBy: 'none',
    sortBy: 'priority',
    filterCategory: 'All',
    filterPriority: 'All',
    filterStatus: 'All',
    filterTag: 'All',
    filterDateRange: 'today',
    filterHasNote: false,
    filterRecurring: false,
    filterSynced: false,
  },
  {
    id: 'view-overdue',
    name: 'Overdue',
    isBuiltIn: true,
    pinnedToSidebar: true,
    viewType: 'list',
    groupBy: 'date',
    sortBy: 'date',
    filterCategory: 'All',
    filterPriority: 'All',
    filterStatus: 'Open',
    filterTag: 'All',
    filterDateRange: 'overdue',
    filterHasNote: false,
    filterRecurring: false,
    filterSynced: false,
  },
  {
    id: 'view-high-priority',
    name: 'High Priority',
    isBuiltIn: true,
    pinnedToSidebar: true,
    viewType: 'kanban',
    groupBy: 'none',
    sortBy: 'date',
    filterCategory: 'All',
    filterPriority: 'High',
    filterStatus: 'All',
    filterTag: 'All',
    filterDateRange: 'all',
    filterHasNote: false,
    filterRecurring: false,
    filterSynced: false,
  },
  {
    id: 'view-by-category',
    name: 'By Category',
    isBuiltIn: true,
    pinnedToSidebar: false,
    viewType: 'list',
    groupBy: 'category',
    sortBy: 'priority',
    filterCategory: 'All',
    filterPriority: 'All',
    filterStatus: 'All',
    filterTag: 'All',
    filterDateRange: 'week',
    filterHasNote: false,
    filterRecurring: false,
    filterSynced: false,
  },
  {
    id: 'view-completed',
    name: 'Completed',
    isBuiltIn: true,
    pinnedToSidebar: false,
    viewType: 'list',
    groupBy: 'date',
    sortBy: 'date',
    filterCategory: 'All',
    filterPriority: 'All',
    filterStatus: 'Completed',
    filterTag: 'All',
    filterDateRange: 'all',
    filterHasNote: false,
    filterRecurring: false,
    filterSynced: false,
  },
];

export const STARTER_TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'tpl-task-dsa',
    title: 'DSA Problem Set & Complexity Review',
    description: 'Solve 2 medium/hard problems and document time/space trade-offs in side note.',
    category: 'Study',
    priority: 'High',
    important: true,
    urgent: true,
    estimatedMinutes: 90,
    subtasks: ['Read problem & constraints', 'Write clean solution', 'Test edge cases'],
    reminders: [10],
    tags: ['dsa', 'algorithms'],
  },
  {
    id: 'tpl-task-deep-code',
    title: 'Deep Feature Implementation Block',
    description: 'Single-tasked engineering block with notifications silenced.',
    category: 'Coding',
    priority: 'High',
    important: true,
    urgent: false,
    estimatedMinutes: 120,
    subtasks: ['Outline component interfaces', 'Implement core logic', 'Run unit tests'],
    reminders: [5],
    tags: ['deep-work', 'coding'],
  },
  {
    id: 'tpl-task-workout',
    title: 'Strength & Mobility Conditioning',
    description: 'Full-body compound lifts followed by 15 minutes of mobility work.',
    category: 'Health',
    priority: 'Med',
    important: true,
    urgent: false,
    estimatedMinutes: 60,
    subtasks: ['10m dynamic warm-up', 'Main strength sets', 'Post-workout stretch'],
    reminders: [15],
    tags: ['fitness', 'health'],
  },
];

export const STARTER_DAY_TEMPLATES: DayTemplate[] = [
  {
    id: 'tpl-day-study',
    name: 'Study Day',
    description: 'Structured academic & technical mastery schedule with spaced blocks.',
    isStarter: true,
    blocks: [
      {
        id: 'sd-1',
        title: 'Morning Concept Deep-Dive & Active Recall',
        description: 'Study new architecture or algorithm topic while mind is fresh.',
        category: 'Study',
        priority: 'High',
        important: true,
        urgent: true,
        start: '08:30',
        end: '10:30',
        estimatedMinutes: 120,
        tags: ['study', 'deep-work'],
      },
      {
        id: 'sd-2',
        title: 'Timed Problem Solving & Practice Drills',
        description: 'Apply concepts without looking at reference notes.',
        category: 'Study',
        priority: 'High',
        important: true,
        urgent: false,
        start: '11:00',
        end: '13:00',
        estimatedMinutes: 120,
        tags: ['practice', 'dsa'],
      },
      {
        id: 'sd-3',
        title: 'Synthesis Notes & Flashcard Review',
        description: 'Consolidate mistakes and key patterns in Markdown notes.',
        category: 'Study',
        priority: 'Med',
        important: true,
        urgent: false,
        start: '15:00',
        end: '16:30',
        estimatedMinutes: 90,
        tags: ['notes', 'review'],
      },
    ],
  },
  {
    id: 'tpl-day-gym',
    name: 'Gym & Balanced Execution Day',
    description: 'High-output work blocks paired with a protected training and recovery window.',
    isStarter: true,
    blocks: [
      {
        id: 'gd-1',
        title: 'Morning Priority Deliverable',
        description: 'Ship the #1 needle-moving task before noon.',
        category: 'Work',
        priority: 'High',
        important: true,
        urgent: true,
        start: '09:00',
        end: '11:00',
        estimatedMinutes: 120,
        tags: ['priority', 'execution'],
      },
      {
        id: 'gd-2',
        title: 'Strength Training & Zone 2 Cardio',
        description: 'Protected physical training block.',
        category: 'Health',
        priority: 'High',
        important: true,
        urgent: false,
        start: '17:00',
        end: '18:15',
        estimatedMinutes: 75,
        tags: ['gym', 'health'],
      },
      {
        id: 'gd-3',
        title: 'Evening Reading & Next-Day Prep',
        description: 'Wind down and review tomorrow’s top 3 priorities.',
        category: 'Personal',
        priority: 'Low',
        important: true,
        urgent: false,
        start: '20:00',
        end: '20:45',
        estimatedMinutes: 45,
        tags: ['ritual', 'reading'],
      },
    ],
  },
  {
    id: 'tpl-day-deepwork',
    name: 'Deep-Work Maker Day',
    description: 'Zero-meeting maker schedule built around two long uninterrupted coding blocks.',
    isStarter: true,
    blocks: [
      {
        id: 'dw-1',
        title: 'Deep Work Block I: Core Architecture & Logic',
        description: 'Phone in another room. Focus timer running.',
        category: 'Coding',
        priority: 'High',
        important: true,
        urgent: true,
        start: '08:30',
        end: '11:00',
        estimatedMinutes: 150,
        tags: ['deep-work', 'coding'],
      },
      {
        id: 'dw-2',
        title: 'Deep Work Block II: UI Polish & Verification Tests',
        description: 'Build, test, and verify edge cases.',
        category: 'Coding',
        priority: 'High',
        important: true,
        urgent: false,
        start: '13:30',
        end: '15:30',
        estimatedMinutes: 120,
        tags: ['testing', 'frontend'],
      },
      {
        id: 'dw-3',
        title: 'Admin Batch: Code Reviews, PRs & Inbox Zero',
        description: 'Batch all shallow communication into a single 45-minute window.',
        category: 'Work',
        priority: 'Med',
        important: false,
        urgent: true,
        start: '16:15',
        end: '17:00',
        estimatedMinutes: 45,
        tags: ['admin', 'batch'],
      },
    ],
  },
];

export const ORIGINAL_MOTIVATIONAL_LINES: string[] = [
  'Protect your first two hours; the rest of the day follows their lead.',
  'A realistic plan you finish beats an ambitious list you abandon.',
  'Start the timer for five minutes—momentum handles the next forty.',
  'What gets scheduled on the timeline gets respected in reality.',
  'One completed deep-work block already makes today a win.',
  'Clarity comes from starting, not from over-planning.',
  'Treat your focus blocks like appointments you cannot cancel.',
  'Small daily consistency compounds faster than occasional intensity.',
  'Close open loops on paper so your mind can stay on one task.',
  'When everything feels urgent, pick the one task that matters tomorrow.',
  'Estimate honestly, track calmly, and adjust without self-judgment.',
  'Rest days are part of the streak—recovery fuels the next sprint.',
  'Leave ten minutes of breathing room between major context switches.',
  'Write the next concrete step in your note before you pause.',
  'Progress is measured in focused hours and finished outcomes, not busyness.',
  'Batch shallow messages into one window so deep work stays unbroken.',
  'If a task takes under five minutes and clears friction, do it or schedule it.',
  'Your calendar is a budget of energy, not just a list of wishes.',
  'End the workday intentionally so tomorrow starts with a clean slate.',
  'Reviewing a tough day takes courage and builds sharper habits.',
  'Turn vague goals into timed blocks you can actually execute today.',
  'Focus on the current block; let the rest of the timeline wait its turn.',
  'Every distraction you notice and decline strengthens your attention.',
  'Keep your workspace and your task list light enough to breathe.',
  'Consistency is built on ordinary Tuesdays, not just inspired Mondays.',
  'Link your daily tasks to a larger goal so routine work has direction.',
  'When behind schedule, replan the remaining hours instead of forcing the past.',
  'A short walk between Pomodoro cycles resets your focus better than scrolling.',
  'Capture ideas in your side note immediately, then return to the active task.',
  'Celebrate finishing what you planned—then close the laptop with peace of mind.',
  'Quality execution comes from doing one thing at a time with full presence.',
  'Your future self will thank you for the single hard task you finish right now.',
  'Build systems that work on low-energy days, not just peak-energy days.',
  'Accuracy improves every time you compare planned minutes with real logs.',
  'Simplicity in planning creates speed in execution.',
  'Guard your evening wind-down as carefully as your morning startup.',
  'Three meaningful tasks completed beat ten tasks left half-done.',
  'Let data guide your weekly adjustments—no guilt, just clear feedback.',
  'Own this hour; the week takes care of itself one block at a time.',
  'Steady craft every day builds results that speak for themselves.',
];

export function getMotivationalLineForDate(dateStr: string): string {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return ORIGINAL_MOTIVATIONAL_LINES[hash % ORIGINAL_MOTIVATIONAL_LINES.length];
}

export const getDailyMotivationalLine = getMotivationalLineForDate;

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

