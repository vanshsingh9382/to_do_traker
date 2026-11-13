import {
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  getDay,
  parseISO,
} from 'date-fns';
import { OccurrenceOverride, RecurrenceRule, Task } from '../types';

/**
 * Normalizes legacy Phase 1 `task.recurrence` ('daily' | 'weekdays' | 'weekly')
 * into a structured RecurrenceRule if `task.recurrenceRule` is not explicitly set.
 */
export function getEffectiveRecurrenceRule(task: Task): RecurrenceRule | null {
  if (task.recurrence === 'none' && !task.recurrenceRule) return null;
  if (task.recurrenceRule) return task.recurrenceRule;

  if (task.recurrence === 'daily') {
    return { frequency: 'daily', interval: 1, endType: 'never' };
  }
  if (task.recurrence === 'weekdays') {
    return { frequency: 'weekdays', interval: 1, endType: 'never' };
  }
  if (task.recurrence === 'weekly') {
    const startDow = getDay(parseISO(task.date));
    return {
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [startDow],
      endType: 'never',
    };
  }
  return null;
}

/**
 * Checks whether `dateStr` matches the recurrence pattern of `task` (ignoring `after_count` and overrides).
 */
function matchesBasePattern(task: Task, rule: RecurrenceRule, dateStr: string): boolean {
  if (dateStr < task.date) return false;
  if (rule.endType === 'on_date' && rule.endDate && dateStr > rule.endDate) {
    return false;
  }

  const startDate = parseISO(task.date);
  const targetDate = parseISO(dateStr);
  const diffDays = differenceInCalendarDays(targetDate, startDate);
  if (diffDays < 0) return false;

  const dow = getDay(targetDate);
  const interval = Math.max(1, rule.interval || 1);

  switch (rule.frequency) {
    case 'daily':
      return diffDays % interval === 0;
    case 'every_n_days':
      return diffDays % interval === 0;
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'weekly': {
      const allowedDays =
        rule.daysOfWeek && rule.daysOfWeek.length > 0
          ? rule.daysOfWeek
          : [getDay(startDate)];
      if (!allowedDays.includes(dow)) return false;
      const weeksDiff = Math.floor(diffDays / 7);
      return weeksDiff % interval === 0;
    }
    case 'every_n_weeks': {
      const allowedDays =
        rule.daysOfWeek && rule.daysOfWeek.length > 0
          ? rule.daysOfWeek
          : [getDay(startDate)];
      if (!allowedDays.includes(dow)) return false;
      const weeksDiff = Math.floor(diffDays / 7);
      return weeksDiff % interval === 0;
    }
    default:
      return diffDays === 0;
  }
}

/**
 * Checks if a recurring task occurs on `dateStr`, respecting `endType === 'after_count'`.
 */
export function doesRecurringTaskOccurOnDate(task: Task, dateStr: string): boolean {
  const rule = getEffectiveRecurrenceRule(task);
  if (!rule) return task.date === dateStr;
  if (!matchesBasePattern(task, rule, dateStr)) return false;

  if (rule.endType === 'after_count' && rule.endCount && rule.endCount > 0) {
    const start = parseISO(task.date);
    const target = parseISO(dateStr);
    const days = eachDayOfInterval({ start, end: target });
    let count = 0;
    for (const d of days) {
      const dStr = format(d, 'yyyy-MM-dd');
      if (matchesBasePattern(task, rule, dStr)) {
        count += 1;
      }
    }
    return count <= rule.endCount;
  }

  return true;
}

/**
 * Materializes all tasks (single + recurring occurrences) for a single `dateStr`.
 */
export function expandTasksForDate(allTasks: Task[], dateStr: string): Task[] {
  const results: Task[] = [];

  for (const task of allTasks) {
    const rule = getEffectiveRecurrenceRule(task);
    if (!rule) {
      if (task.date === dateStr) {
        results.push(task);
      }
      continue;
    }

    const overrides = task.occurrenceOverrides || {};

    // 1. Check if an occurrence originally on `dateStr` exists and wasn't deleted or moved away
    if (doesRecurringTaskOccurOnDate(task, dateStr)) {
      const ov: OccurrenceOverride | undefined = overrides[dateStr];
      if (!ov?.deleted && (!ov?.movedToDate || ov.movedToDate === dateStr)) {
        results.push(materializeOccurrence(task, dateStr, dateStr, ov));
      }
    }

    // 2. Check if an occurrence from another original date was moved to `dateStr`
    for (const [origDate, ov] of Object.entries(overrides)) {
      if (
        origDate !== dateStr &&
        !ov.deleted &&
        ov.movedToDate === dateStr &&
        doesRecurringTaskOccurOnDate(task, origDate)
      ) {
        results.push(materializeOccurrence(task, origDate, dateStr, ov));
      }
    }
  }

  return results.sort((a, b) => a.order - b.order);
}

function materializeOccurrence(
  master: Task,
  originalDate: string,
  effectiveDate: string,
  ov?: OccurrenceOverride
): Task {
  const isBaseDate = originalDate === master.date && !ov;
  return {
    ...master,
    id: isBaseDate ? master.id : `${master.id}::${originalDate}`,
    masterTaskId: master.id,
    occurrenceDate: originalDate,
    isVirtualOccurrence: !isBaseDate,
    date: effectiveDate,
    title: ov?.title ?? master.title,
    description: ov?.description ?? master.description,
    status: ov?.status ?? (originalDate === master.date ? master.status : 'To Do'),
    completedAt:
      ov?.completedAt ?? (originalDate === master.date ? master.completedAt : undefined),
    start: ov?.start ?? master.start,
    end: ov?.end ?? master.end,
    estimatedMinutes: ov?.estimatedMinutes ?? master.estimatedMinutes,
    googleEventId: ov?.googleEventId ?? master.googleEventId,
  };
}

/**
 * Expands all tasks across a date interval `[startDateStr, endDateStr]`.
 */
export function expandTasksForRange(
  allTasks: Task[],
  startDateStr: string,
  endDateStr: string
): Task[] {
  const days = eachDayOfInterval({
    start: parseISO(startDateStr),
    end: parseISO(endDateStr),
  });
  const allExpanded: Task[] = [];
  for (const d of days) {
    const dStr = format(d, 'yyyy-MM-dd');
    allExpanded.push(...expandTasksForDate(allTasks, dStr));
  }
  return allExpanded;
}

/**
 * Parses a potentially virtual task ID (`masterId::YYYY-MM-DD`) into `{ masterId, occurrenceDate }`.
 */
export function parseTaskIdentity(taskOrId: Task | string): {
  masterId: string;
  occurrenceDate: string | null;
} {
  if (typeof taskOrId !== 'string') {
    if (taskOrId.masterTaskId && taskOrId.occurrenceDate) {
      return { masterId: taskOrId.masterTaskId, occurrenceDate: taskOrId.occurrenceDate };
    }
    if (taskOrId.id.includes('::')) {
      const [mId, occDate] = taskOrId.id.split('::');
      return { masterId: mId, occurrenceDate: occDate };
    }
    return { masterId: taskOrId.id, occurrenceDate: null };
  }
  if (taskOrId.includes('::')) {
    const [mId, occDate] = taskOrId.split('::');
    return { masterId: mId, occurrenceDate: occDate };
  }
  return { masterId: taskOrId, occurrenceDate: null };
}

/**
 * Generates an RFC 5545 RRULE string (without the leading `RRULE:`) for a recurring task.
 */
export function buildRRULEString(task: Task): string | null {
  const rule = getEffectiveRecurrenceRule(task);
  if (!rule) return null;

  const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const parts: string[] = [];
  const interval = Math.max(1, rule.interval || 1);

  if (rule.frequency === 'daily' || rule.frequency === 'every_n_days') {
    parts.push('FREQ=DAILY');
    if (interval > 1) parts.push(`INTERVAL=${interval}`);
  } else if (rule.frequency === 'weekdays') {
    parts.push('FREQ=WEEKLY');
    parts.push('BYDAY=MO,TU,WE,TH,FR');
  } else if (rule.frequency === 'weekly' || rule.frequency === 'every_n_weeks') {
    parts.push('FREQ=WEEKLY');
    if (interval > 1) parts.push(`INTERVAL=${interval}`);
    const dows =
      rule.daysOfWeek && rule.daysOfWeek.length > 0
        ? rule.daysOfWeek
        : [getDay(parseISO(task.date))];
    parts.push(`BYDAY=${dows.map((d) => dayMap[d] || 'MO').join(',')}`);
  }

  if (rule.endType === 'after_count' && rule.endCount && rule.endCount > 0) {
    parts.push(`COUNT=${rule.endCount}`);
  } else if (rule.endType === 'on_date' && rule.endDate) {
    const cleanDate = rule.endDate.replace(/-/g, '');
    parts.push(`UNTIL=${cleanDate}T235959Z`);
  }

  return parts.join(';');
}
