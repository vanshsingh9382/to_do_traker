import {
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import { Habit, HabitCheck } from '../types';

export type HabitDayState = 'done' | 'missed' | 'rest' | 'unscheduled' | 'pending_today';

export interface HabitStatsSummary {
  habitId: string;
  currentStreak: number;
  longestStreak: number;
  weeklyCompletionPct: number;
  monthlyCompletionPct: number;
  totalCompletions: number;
  monthCalendar: Array<{
    date: string;
    state: HabitDayState;
    count: number;
  }>;
  heatmap90Days: Array<{
    date: string;
    state: HabitDayState;
    count: number;
  }>;
}

/**
 * Checks whether a habit is scheduled on a given YYYY-MM-DD date (ignoring rest-day overrides).
 */
export function isHabitScheduledOnDate(habit: Habit, dateStr: string): boolean {
  const startStr = habit.startDate || habit.createdAt || '2020-01-01';
  if (dateStr < startStr) return false;

  const targetDate = parseISO(dateStr);
  const dow = getDay(targetDate);

  switch (habit.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'weekly':
    case 'custom': {
      const allowed =
        habit.customDays && habit.customDays.length > 0
          ? habit.customDays
          : [1, 2, 3, 4, 5];
      return allowed.includes(dow);
    }
    case 'every_n_days': {
      const interval = Math.max(1, habit.intervalDays || 2);
      const diff = differenceInCalendarDays(targetDate, parseISO(startStr));
      return diff >= 0 && diff % interval === 0;
    }
    case 'times_per_week':
      // Eligible any non-rest day of the week
      return true;
    default:
      return true;
  }
}

/**
 * Checks if `dateStr` is a rest day for `habit` (either global non-working day, per-habit rest weekday, or explicitly marked 'skipped').
 */
export function isHabitRestDayOnDate(
  habit: Habit,
  dateStr: string,
  habitChecks: HabitCheck[],
  globalWorkingDays: number[]
): boolean {
  const check = habitChecks.find((hc) => hc.habitId === habit.id && hc.date === dateStr);
  if (check?.status === 'skipped') return true;

  const dow = getDay(parseISO(dateStr));
  if (habit.restDays && habit.restDays.includes(dow)) {
    return true;
  }
  if (!globalWorkingDays.includes(dow)) {
    return true;
  }
  return false;
}

export function isHabitCompletedOnDate(
  habit: Habit,
  dateStr: string,
  habitChecks: HabitCheck[]
): boolean {
  const check = habitChecks.find((hc) => hc.habitId === habit.id && hc.date === dateStr);
  if (!check || check.status === 'skipped') return false;
  const target = Math.max(1, habit.targetPerDay || 1);
  return check.completed || check.count >= target;
}

export function getHabitDayState(
  habit: Habit,
  dateStr: string,
  referenceDateStr: string,
  habitChecks: HabitCheck[],
  globalWorkingDays: number[]
): HabitDayState {
  if (isHabitCompletedOnDate(habit, dateStr, habitChecks)) {
    return 'done';
  }
  if (isHabitRestDayOnDate(habit, dateStr, habitChecks, globalWorkingDays)) {
    return 'rest';
  }
  if (!isHabitScheduledOnDate(habit, dateStr)) {
    return 'unscheduled';
  }
  if (dateStr >= referenceDateStr) {
    return 'pending_today';
  }
  return 'missed';
}

/**
 * Computes comprehensive habit stats:
 * - Streak math: scheduled days only; a rest day or unscheduled day never breaks the streak; a missed scheduled day breaks it.
 * - Rest or skipped days never count against completion %.
 */
export function computeHabitStats(
  habit: Habit,
  habitChecks: HabitCheck[],
  referenceDateStr: string,
  globalWorkingDays: number[]
): HabitStatsSummary {
  const refDate = parseISO(referenceDateStr);
  const startWindow = subDays(refDate, 120);
  const days120 = eachDayOfInterval({ start: startWindow, end: refDate });

  let longestStreak = 0;
  let runningStreak = 0;

  for (const d of days120) {
    const dStr = format(d, 'yyyy-MM-dd');
    const state = getHabitDayState(habit, dStr, referenceDateStr, habitChecks, globalWorkingDays);

    if (state === 'done') {
      runningStreak += 1;
      if (runningStreak > longestStreak) longestStreak = runningStreak;
    } else if (state === 'rest' || state === 'unscheduled' || state === 'pending_today') {
      // Never breaks a streak
      continue;
    } else if (state === 'missed') {
      runningStreak = 0;
    }
  }

  let currentStreak = 0;
  for (let i = days120.length - 1; i >= 0; i--) {
    const dStr = format(days120[i], 'yyyy-MM-dd');
    const state = getHabitDayState(habit, dStr, referenceDateStr, habitChecks, globalWorkingDays);
    if (state === 'done') {
      currentStreak += 1;
    } else if (state === 'rest' || state === 'unscheduled' || state === 'pending_today') {
      continue;
    } else {
      break;
    }
  }

  // Weekly completion % (last 7 days up to referenceDateStr)
  const last7 = days120.slice(-7).map((d) => format(d, 'yyyy-MM-dd'));
  const weeklyCompletionPct = computeCompletionPctForDates(
    habit,
    last7,
    habitChecks,
    globalWorkingDays
  );

  // Monthly completion % (last 30 days up to referenceDateStr)
  const last30 = days120.slice(-30).map((d) => format(d, 'yyyy-MM-dd'));
  const monthlyCompletionPct = computeCompletionPctForDates(
    habit,
    last30,
    habitChecks,
    globalWorkingDays
  );

  const totalCompletions = habitChecks.filter(
    (hc) =>
      hc.habitId === habit.id &&
      hc.status !== 'skipped' &&
      (hc.completed || hc.count >= Math.max(1, habit.targetPerDay || 1))
  ).length;

  // Month calendar view for the month of referenceDateStr
  const mStart = startOfMonth(refDate);
  const mEnd = endOfMonth(refDate);
  const monthCalendar = eachDayOfInterval({ start: mStart, end: mEnd }).map((d) => {
    const dStr = format(d, 'yyyy-MM-dd');
    const check = habitChecks.find((hc) => hc.habitId === habit.id && hc.date === dStr);
    return {
      date: dStr,
      state: getHabitDayState(habit, dStr, referenceDateStr, habitChecks, globalWorkingDays),
      count: check?.count || 0,
    };
  });

  // 90-day heatmap
  const heatmap90Days = days120.slice(-90).map((d) => {
    const dStr = format(d, 'yyyy-MM-dd');
    const check = habitChecks.find((hc) => hc.habitId === habit.id && hc.date === dStr);
    return {
      date: dStr,
      state: getHabitDayState(habit, dStr, referenceDateStr, habitChecks, globalWorkingDays),
      count: check?.count || 0,
    };
  });

  return {
    habitId: habit.id,
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    weeklyCompletionPct,
    monthlyCompletionPct,
    totalCompletions,
    monthCalendar,
    heatmap90Days,
  };
}

export function computeCompletionPctForDates(
  habit: Habit,
  dateStrs: string[],
  habitChecks: HabitCheck[],
  globalWorkingDays: number[]
): number {
  if (habit.frequency === 'times_per_week' && habit.timesPerWeek && habit.timesPerWeek > 0) {
    const doneCount = dateStrs.filter((d) =>
      isHabitCompletedOnDate(habit, d, habitChecks)
    ).length;
    const expected = Math.max(1, Math.round((dateStrs.length / 7) * habit.timesPerWeek));
    return Math.min(100, Math.round((doneCount / expected) * 100));
  }

  let scheduledActiveDays = 0;
  let doneDays = 0;

  for (const dStr of dateStrs) {
    const isDone = isHabitCompletedOnDate(habit, dStr, habitChecks);
    if (isDone) {
      doneDays += 1;
      scheduledActiveDays += 1;
      continue;
    }
    if (isHabitRestDayOnDate(habit, dStr, habitChecks, globalWorkingDays)) {
      // Rest or skipped days don't count against completion %
      continue;
    }
    if (isHabitScheduledOnDate(habit, dStr)) {
      scheduledActiveDays += 1;
    }
  }

  if (scheduledActiveDays === 0) return doneDays > 0 ? 100 : 0;
  return Math.min(100, Math.round((doneDays / scheduledActiveDays) * 100));
}

export function getWeekStartStr(dateStr: string): string {
  return format(startOfWeek(parseISO(dateStr), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}
