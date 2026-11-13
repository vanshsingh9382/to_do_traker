import { eachDayOfInterval, format, parseISO, subDays, getDay, getHours } from 'date-fns';
import { DayScoreBreakdown, Settings, Task, TimeLog } from '../types';
import { expandTasksForDate, parseTaskIdentity } from './recurrenceEngine';

/**
 * Returns total logged actual minutes for a given task (or recurring task occurrence) from TimeLogs.
 */
export function getTaskActualMinutes(
  taskOrId: Task | string,
  timeLogs: TimeLog[],
  occurrenceDateFilter?: string
): number {
  const { masterId, occurrenceDate } = parseTaskIdentity(taskOrId);
  const effDate = occurrenceDateFilter || occurrenceDate;

  return timeLogs
    .filter((log) => {
      if (log.taskId === (typeof taskOrId === 'string' ? taskOrId : taskOrId.id)) {
        return true;
      }
      if (log.taskId === masterId) {
        if (effDate) {
          return (log.occurrenceDate || log.startedAt.slice(0, 10)) === effDate;
        }
        return true;
      }
      return false;
    })
    .reduce((sum, log) => sum + Math.max(0, log.durationMinutes), 0);
}

/**
 * Computes exact DayScoreBreakdown for a specific YYYY-MM-DD date.
 * Rules from prompt:
 * - Each recurring task occurrence counts separately in analytics (only dates up to today count as planned).
 * - External events (Google Calendar / .ics read-only) are not in `allTasks` and never count in productivity stats.
 * - Completion rate = completed / (all planned - skipped). Unfinished task is never completed.
 * - Actual time comes ONLY from timer sessions and manual entries (TimeLog).
 * - Productivity Score (0-100) =
 *     50% completion rate +
 *     30% focus progress (actual focus / daily focus target, max 100%) +
 *     20% time accuracy (how close actual was to estimated on completed tasks; drop this part if there is no data).
 * - A day with nothing planned or logged has NO score (null, not 0).
 * - A day is "goal met" when its score >= goalThresholdScore (default 60).
 */
export function computeDayScore(
  dateStr: string,
  allTasks: Task[],
  allTimeLogs: TimeLog[],
  settings: Pick<Settings, 'dailyFocusTargetMinutes' | 'goalThresholdScore' | 'workingDays'>,
  categoryFilter?: string,
  maxPlannedDateStr?: string
): DayScoreBreakdown {
  // Expand recurring occurrences for `dateStr`
  const expandedDayTasks = expandTasksForDate(allTasks, dateStr).filter(
    (t) => !categoryFilter || categoryFilter === 'All' || t.category === categoryFilter
  );

  // Only dates up to today count as planned for recurring tasks if maxPlannedDateStr is provided
  const dayTasks = maxPlannedDateStr
    ? expandedDayTasks.filter((t) => !t.isVirtualOccurrence || dateStr <= maxPlannedDateStr)
    : expandedDayTasks;

  const allTasksById = new Map<string, Task>();
  for (const t of allTasks) allTasksById.set(t.id, t);
  for (const t of dayTasks) allTasksById.set(t.id, t);

  const dayLogs = allTimeLogs.filter((log) => {
    const logDate = log.occurrenceDate || log.startedAt.slice(0, 10);
    if (logDate !== dateStr) return false;
    if (categoryFilter && categoryFilter !== 'All') {
      const { masterId } = parseTaskIdentity(log.taskId);
      const task = allTasksById.get(log.taskId) || allTasksById.get(masterId);
      return task?.category === categoryFilter;
    }
    return true;
  });

  const plannedCount = dayTasks.length;
  const completedTasks = dayTasks.filter((t) => t.status === 'Completed');
  const skippedTasks = dayTasks.filter((t) => t.status === 'Skipped');
  const completedCount = completedTasks.length;
  const skippedCount = skippedTasks.length;
  const activePlannedCount = Math.max(0, plannedCount - skippedCount);
  const pendingCount = Math.max(0, activePlannedCount - completedCount);

  const plannedMinutes = dayTasks
    .filter((t) => t.status !== 'Skipped')
    .reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);

  const actualMinutes = dayLogs.reduce((sum, log) => sum + Math.max(0, log.durationMinutes), 0);

  const dayOfWeek = getDay(parseISO(dateStr));
  const isWorkingDay = settings.workingDays.includes(dayOfWeek);

  // A day with nothing planned (active) and nothing logged has NO score (null, not 0)
  if (activePlannedCount === 0 && actualMinutes === 0) {
    return {
      date: dateStr,
      plannedCount,
      completedCount,
      skippedCount,
      pendingCount,
      activePlannedCount,
      completionRate: 0,
      plannedMinutes,
      actualMinutes: 0,
      focusProgress: 0,
      timeAccuracy: null,
      productivityScore: null,
      goalMet: false,
      isWorkingDay,
    };
  }

  const completionRate =
    activePlannedCount > 0 ? Math.min(100, Math.round((completedCount / activePlannedCount) * 100)) : 0;

  const targetFocus = Math.max(1, settings.dailyFocusTargetMinutes || 240);
  const focusProgress = Math.min(100, Math.round((actualMinutes / targetFocus) * 100));

  // Time accuracy on completed tasks that have estimatedMinutes > 0 and actual logged time > 0
  const accuracySamples: number[] = [];
  for (const t of completedTasks) {
    if (t.estimatedMinutes > 0) {
      const taskActual = getTaskActualMinutes(t, allTimeLogs, dateStr);
      if (taskActual > 0) {
        const deviationRatio = Math.abs(taskActual - t.estimatedMinutes) / t.estimatedMinutes;
        const acc = Math.max(0, 1 - deviationRatio) * 100;
        accuracySamples.push(acc);
      }
    }
  }

  const timeAccuracy =
    accuracySamples.length > 0
      ? Math.round(accuracySamples.reduce((a, b) => a + b, 0) / accuracySamples.length)
      : null;

  let productivityScore: number;
  if (timeAccuracy !== null) {
    productivityScore = Math.round(0.5 * completionRate + 0.3 * focusProgress + 0.2 * timeAccuracy);
  } else {
    // Drop the 20% accuracy part and re-normalize 50% and 30% weights (50/80 = 0.625, 30/80 = 0.375)
    productivityScore = Math.round(0.625 * completionRate + 0.375 * focusProgress);
  }

  productivityScore = Math.max(0, Math.min(100, productivityScore));
  const goalMet = productivityScore >= (settings.goalThresholdScore || 60);

  return {
    date: dateStr,
    plannedCount,
    completedCount,
    skippedCount,
    pendingCount,
    activePlannedCount,
    completionRate,
    plannedMinutes,
    actualMinutes,
    focusProgress,
    timeAccuracy,
    productivityScore,
    goalMet,
    isWorkingDay,
  };
}

/**
 * Calculates current streak, longest streak, perfect days, and weekly consistency %.
 * Streaks count only working days; rest days never break a streak.
 */
export function computeStreaksAndSummary(
  referenceDateStr: string,
  allTasks: Task[],
  allTimeLogs: TimeLog[],
  settings: Pick<Settings, 'dailyFocusTargetMinutes' | 'goalThresholdScore' | 'workingDays'>
) {
  const refDate = parseISO(referenceDateStr);
  const startWindow = subDays(refDate, 120);
  const days = eachDayOfInterval({ start: startWindow, end: refDate });

  const dayBreakdowns = days.map((d) =>
    computeDayScore(
      format(d, 'yyyy-MM-dd'),
      allTasks,
      allTimeLogs,
      settings,
      undefined,
      referenceDateStr
    )
  );

  let longestStreak = 0;
  let runningStreak = 0;
  let perfectDays = 0;

  for (const b of dayBreakdowns) {
    if (b.activePlannedCount > 0 && b.completedCount === b.activePlannedCount) {
      perfectDays += 1;
    }
    if (b.goalMet) {
      runningStreak += 1;
      if (runningStreak > longestStreak) longestStreak = runningStreak;
    } else if (!b.isWorkingDay) {
      continue;
    } else {
      if (b.date === referenceDateStr) {
        continue;
      }
      runningStreak = 0;
    }
  }

  let currentStreak = 0;
  for (let i = dayBreakdowns.length - 1; i >= 0; i--) {
    const b = dayBreakdowns[i];
    if (b.goalMet) {
      currentStreak += 1;
    } else if (!b.isWorkingDay) {
      continue;
    } else if (b.date === referenceDateStr) {
      continue;
    } else {
      break;
    }
  }

  const last7 = dayBreakdowns.slice(-7);
  const workingInLast7 = last7.filter((d) => d.isWorkingDay);
  const metInLast7 = workingInLast7.filter((d) => d.goalMet);
  const weeklyConsistency =
    workingInLast7.length > 0 ? Math.round((metInLast7.length / workingInLast7.length) * 100) : 0;

  const last30Active = dayBreakdowns
    .slice(-30)
    .filter((d) => d.actualMinutes > 0 || d.activePlannedCount > 0);
  const avgDailyFocusMinutes =
    last30Active.length > 0
      ? Math.round(last30Active.reduce((s, d) => s + d.actualMinutes, 0) / last30Active.length)
      : 0;

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    perfectDays,
    weeklyConsistency,
    avgDailyFocusMinutes,
    dayBreakdowns,
  };
}

/**
 * Detects overlapping tasks on a given day (returns Set of task IDs that overlap in start..end).
 */
export function detectOverlappingTaskIds(tasks: Task[]): Set<string> {
  const timed = tasks
    .filter((t) => t.start && t.end && t.status !== 'Skipped')
    .map((t) => {
      const [sh, sm] = t.start!.split(':').map(Number);
      const [eh, em] = t.end!.split(':').map(Number);
      return {
        id: t.id,
        startMin: sh * 60 + sm,
        endMin: eh * 60 + em,
      };
    })
    .filter((t) => t.endMin > t.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const overlapping = new Set<string>();
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[j].startMin < timed[i].endMin) {
        overlapping.add(timed[i].id);
        overlapping.add(timed[j].id);
      } else {
        break;
      }
    }
  }
  return overlapping;
}

/**
 * Computes productive hours distribution (06:00 to 23:00) from TimeLog entries.
 */
export function computeProductiveHours(timeLogs: TimeLog[]): { hour: string; minutes: number }[] {
  const buckets = new Array(24).fill(0);
  for (const log of timeLogs) {
    const d = parseISO(log.startedAt);
    const h = getHours(d);
    if (!isNaN(h) && h >= 0 && h < 24) {
      buckets[h] += Math.max(0, log.durationMinutes);
    }
  }
  const result: { hour: string; minutes: number }[] = [];
  for (let h = 6; h <= 23; h++) {
    result.push({
      hour: `${String(h).padStart(2, '0')}:00`,
      minutes: Math.round(buckets[h]),
    });
  }
  return result;
}
