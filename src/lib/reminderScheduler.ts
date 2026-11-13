import { format } from 'date-fns';
import { Habit, HabitCheck, NotificationItem, Settings, Task } from '../types';
import { expandTasksForDate } from './recurrenceEngine';
import { isHabitCompletedOnDate, isHabitRestDayOnDate, isHabitScheduledOnDate } from './habitEngine';

export interface SchedulerEvaluationResult {
  dueNotifications: NotificationItem[];
  newFiredKeys: string[];
  isQuietHoursNow: boolean;
}

/**
 * Checks whether a given `HH:mm` time falls inside the configured quiet hours window `[start, end]`.
 * Handles overnight intervals such as 22:30 -> 07:00.
 */
export function isWithinQuietHours(
  currentTimeHHMM: string,
  settings: Pick<Settings, 'quietHoursEnabled' | 'quietHoursStart' | 'quietHoursEnd'>
): boolean {
  if (!settings.quietHoursEnabled) return false;
  const start = settings.quietHoursStart || '22:30';
  const end = settings.quietHoursEnd || '07:00';

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const cur = toMin(currentTimeHHMM);
  const s = toMin(start);
  const e = toMin(end);

  if (s <= e) {
    return cur >= s && cur <= e;
  }
  // Overnight wrap (e.g. 22:30 to 07:00)
  return cur >= s || cur <= e;
}

/**
 * Evaluates all configured reminders (per-task, morning summary, evening review, habit reminders)
 * for `now` against `firedReminderKeys`.
 * - Never fires for Completed or Skipped tasks.
 * - Never fires a key that is already in `firedReminderKeys`.
 * - Marks reminders whose scheduled timestamp was > 5 minutes ago as `missed: true` so the caller
 *   lists them in the notification centre as "Missed" without spamming pop-ups.
 */
export function evaluateDueReminders(
  now: Date,
  allTasks: Task[],
  habits: Habit[],
  habitChecks: HabitCheck[],
  settings: Settings,
  firedReminderKeys: string[]
): SchedulerEvaluationResult {
  const todayStr = format(now, 'yyyy-MM-dd');
  const currentHHMM = format(now, 'HH:mm');
  const nowMs = now.getTime();
  const firedSet = new Set(firedReminderKeys);

  const toggles = settings.reminderToggles || {
    taskReminders: true,
    morningSummary: true,
    eveningReview: true,
    habitReminders: true,
    focusSessionEnd: true,
  };

  const isQuietHoursNow = isWithinQuietHours(currentHHMM, settings);
  const dueNotifications: NotificationItem[] = [];
  const newFiredKeys: string[] = [];

  const todayTasks = expandTasksForDate(allTasks, todayStr);

  // 1. Per-Task Reminders
  if (toggles.taskReminders) {
    for (const t of todayTasks) {
      if (t.status === 'Completed' || t.status === 'Skipped') continue;
      if (!t.start) continue;

      const [sh, sm] = t.start.split(':').map(Number);
      const taskStartMs = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        sh || 0,
        sm || 0,
        0,
        0
      ).getTime();

      const offsets =
        Array.isArray(t.reminders) && t.reminders.length > 0
          ? t.reminders
          : settings.defaultReminderMinutes !== undefined
          ? [settings.defaultReminderMinutes]
          : [];

      for (const offsetMin of offsets) {
        const triggerMs = taskStartMs - offsetMin * 60 * 1000;
        const key = `task:${t.id}:${todayStr}:${t.start}:offset-${offsetMin}`;
        if (firedSet.has(key)) continue;

        if (nowMs >= triggerMs) {
          const diffMs = nowMs - triggerMs;
          // If it was due earlier today (> 5 minutes ago), record as "Missed"
          const isMissed = diffMs > 5 * 60 * 1000;
          const label =
            offsetMin === 0
              ? `Starting now (${t.start})`
              : `Starts in ${offsetMin} min (${t.start})`;

          dueNotifications.push({
            id: `notif-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
            key,
            title: isMissed ? `Missed Reminder: ${t.title}` : `Upcoming Task: ${t.title}`,
            body: `${label} · ${t.category} (${t.estimatedMinutes}m planned)`,
            type: 'task',
            taskId: t.id,
            createdAt: now.toISOString(),
            scheduledFor: new Date(triggerMs).toISOString(),
            read: false,
            missed: isMissed,
          });
          newFiredKeys.push(key);
          firedSet.add(key);
        }
      }
    }
  }

  // 2. Morning Summary Reminder (default 08:00)
  if (toggles.morningSummary && settings.morningSummaryTime) {
    const [mh, mm] = settings.morningSummaryTime.split(':').map(Number);
    const triggerMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      mh || 8,
      mm || 0,
      0,
      0
    ).getTime();
    const key = `morning:${todayStr}:${settings.morningSummaryTime}`;

    if (!firedSet.has(key) && nowMs >= triggerMs) {
      const isMissed = nowMs - triggerMs > 15 * 60 * 1000;
      const activeTasks = todayTasks.filter((t) => t.status !== 'Skipped');
      const totalMins = activeTasks.reduce((s, t) => s + (t.estimatedMinutes || 0), 0);
      const firstTask = [...activeTasks]
        .filter((t) => t.start)
        .sort((a, b) => (a.start! < b.start! ? -1 : 1))[0];

      dueNotifications.push({
        id: `notif-${nowMs}-morning`,
        key,
        title: isMissed ? 'Morning Plan Summary (Missed)' : 'Good Morning — Today’s Plan',
        body: `${activeTasks.length} tasks planned (${(totalMins / 60).toFixed(1)}h). ${
          firstTask ? `First up: "${firstTask.title}" at ${firstTask.start}.` : 'Ready to start your day!'
        }`,
        type: 'morning',
        createdAt: now.toISOString(),
        scheduledFor: new Date(triggerMs).toISOString(),
        read: false,
        missed: isMissed,
      });
      newFiredKeys.push(key);
      firedSet.add(key);
    }
  }

  // 3. Evening Review Reminder (default 21:00)
  if (toggles.eveningReview && settings.eveningReviewTime) {
    const [eh, em] = settings.eveningReviewTime.split(':').map(Number);
    const triggerMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      eh || 21,
      em || 0,
      0,
      0
    ).getTime();
    const key = `evening:${todayStr}:${settings.eveningReviewTime}`;

    if (!firedSet.has(key) && nowMs >= triggerMs) {
      const isMissed = nowMs - triggerMs > 15 * 60 * 1000;
      const completed = todayTasks.filter((t) => t.status === 'Completed').length;
      dueNotifications.push({
        id: `notif-${nowMs}-evening`,
        key,
        title: isMissed ? 'Evening Wrap-Up Reminder (Missed)' : 'Evening Reflection & Wrap-Up',
        body: `You completed ${completed} of ${todayTasks.length} tasks today. Take 2 minutes to log your daily review.`,
        type: 'evening',
        createdAt: now.toISOString(),
        scheduledFor: new Date(triggerMs).toISOString(),
        read: false,
        missed: isMissed,
      });
      newFiredKeys.push(key);
      firedSet.add(key);
    }
  }

  // 4. Per-Habit Reminders
  if (toggles.habitReminders) {
    for (const h of habits) {
      if (h.archived) continue;
      if (!isHabitScheduledOnDate(h, todayStr)) continue;
      if (isHabitRestDayOnDate(h, todayStr, habitChecks, settings.workingDays)) continue;
      if (isHabitCompletedOnDate(h, todayStr, habitChecks)) continue;

      const times =
        h.reminderTimes && h.reminderTimes.length > 0
          ? h.reminderTimes
          : h.reminderTime
          ? [h.reminderTime]
          : [];

      for (const rTime of times) {
        const [hh, hm] = rTime.split(':').map(Number);
        const triggerMs = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          hh || 9,
          hm || 0,
          0,
          0
        ).getTime();
        const key = `habit:${h.id}:${todayStr}:${rTime}`;
        if (firedSet.has(key)) continue;

        if (nowMs >= triggerMs) {
          const isMissed = nowMs - triggerMs > 10 * 60 * 1000;
          dueNotifications.push({
            id: `notif-${nowMs}-${h.id}-${rTime}`,
            key,
            title: isMissed ? `Missed Habit Reminder: ${h.title}` : `Habit Check-In: ${h.title}`,
            body: `Scheduled for ${rTime} · Target: ${h.targetPerDay} ${h.unit || 'check-in'}`,
            type: 'habit',
            habitId: h.id,
            createdAt: now.toISOString(),
            scheduledFor: new Date(triggerMs).toISOString(),
            read: false,
            missed: isMissed,
          });
          newFiredKeys.push(key);
          firedSet.add(key);
        }
      }
    }
  }

  return {
    dueNotifications,
    newFiredKeys,
    isQuietHoursNow,
  };
}

/**
 * Triggers a browser notification via Service Worker registration (with action buttons where supported)
 * or falls back to `new Notification()`. Never throws even if blocked in an iframe.
 */
export async function deliverBrowserNotification(item: NotificationItem): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        const options: NotificationOptions & { actions?: Array<{ action: string; title: string }> } = {
          body: item.body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: item.key,
          data: {
            taskId: item.taskId,
            habitId: item.habitId,
            reminderId: item.id,
          },
        };
        if (item.taskId) {
          options.actions = [
            { action: 'start-timer', title: 'Start timer' },
            { action: 'snooze-10', title: 'Snooze 10 min' },
          ];
        }
        await reg.showNotification(item.title, options);
        return true;
      }
    }
    new Notification(item.title, {
      body: item.body,
      icon: '/pwa-192x192.png',
      tag: item.key,
    });
    return true;
  } catch {
    return false;
  }
}
