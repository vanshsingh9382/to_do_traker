import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickAddInput } from './nlpParser';
import {
  computeDayScore,
  computeStreaksAndSummary,
  detectOverlappingTaskIds,
} from './analyticsEngine';
import { expandTasksForDate, expandTasksForRange } from './recurrenceEngine';
import { generateRFC5545ICS, parseICSContent } from './icsEngine';
import { computeHabitStats } from './habitEngine';
import { evaluateDueReminders, isWithinQuietHours } from './reminderScheduler';
import { migratePhase1ToPhase2, migrateToPhase3 } from '../store/useDayForgeStore';
import {
  computeGoalProgress,
  computeTimeByQuadrant,
  computeWeeklyReviewStats,
  evaluateAchievements,
  findNearestFreeSlots,
  generateCSVWithBOM,
  getFlagsForQuadrant,
  getQuadrantForTask,
  proposeReplanForDay,
} from './phase3Engine';
import { Goal, GoogleCalendarEvent, Habit, HabitCheck, Task, TimeLog } from '../types';
import { DEFAULT_SETTINGS } from './seedData';

const baseSettings = {
  dailyFocusTargetMinutes: 240,
  goalThresholdScore: 60,
  workingDays: [1, 2, 3, 4, 5, 6], // Mon-Sat; Sunday (0) is rest day
};

test('parseQuickAddInput extracts title, tomorrow, time range, category, priority, and duration', () => {
  const parsed = parseQuickAddInput(
    'Study DSA tomorrow 6pm-8pm #study !high !urgent 2h',
    '2025-05-12',
    45,
    ['Study', 'Coding', 'Work', 'Health', 'Personal']
  );

  assert.equal(parsed.cleanTitle, 'Study DSA');
  assert.equal(parsed.date, '2025-05-13');
  assert.equal(parsed.start, '18:00');
  assert.equal(parsed.end, '20:00');
  assert.equal(parsed.category, 'Study');
  assert.equal(parsed.priority, 'High');
  assert.equal(parsed.important, true);
  assert.equal(parsed.urgent, true);
  assert.equal(parsed.estimatedMinutes, 120);
});

test('computeDayScore returns null productivityScore when nothing is planned or logged', () => {
  const breakdown = computeDayScore('2025-05-12', [], [], baseSettings);
  assert.equal(breakdown.productivityScore, null);
  assert.equal(breakdown.goalMet, false);
});

test('computeDayScore calculates exact 50/30/20 formula when accuracy data exists', () => {
  const tasks: Task[] = [
    {
      id: 't1',
      title: 'Deep Work',
      description: '',
      category: 'Coding',
      tags: [],
      priority: 'High',
      important: true,
      urgent: false,
      date: '2025-05-12',
      estimatedMinutes: 120,
      status: 'Completed',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 0,
      createdAt: '2025-05-12T08:00:00.000Z',
    },
    {
      id: 't2',
      title: 'Skipped Task',
      description: '',
      category: 'Work',
      tags: [],
      priority: 'Low',
      important: false,
      urgent: false,
      date: '2025-05-12',
      estimatedMinutes: 60,
      status: 'Skipped',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 1,
      createdAt: '2025-05-12T08:00:00.000Z',
    },
  ];

  const logs: TimeLog[] = [
    {
      id: 'l1',
      taskId: 't1',
      startedAt: '2025-05-12T09:00:00.000Z',
      endedAt: '2025-05-12T11:00:00.000Z',
      durationMinutes: 120,
      type: 'timer',
    },
  ];

  const b = computeDayScore('2025-05-12', tasks, logs, baseSettings);
  assert.equal(b.activePlannedCount, 1);
  assert.equal(b.completionRate, 100);
  assert.equal(b.focusProgress, 50);
  assert.equal(b.timeAccuracy, 100);
  assert.equal(b.productivityScore, 85);
  assert.equal(b.goalMet, true);
});

test('computeStreaksAndSummary does not break streak on rest days', () => {
  const tasks: Task[] = [
    {
      id: 'sat-task',
      title: 'Sat Work',
      description: '',
      category: 'Study',
      tags: [],
      priority: 'High',
      important: true,
      urgent: false,
      date: '2025-05-10',
      estimatedMinutes: 240,
      status: 'Completed',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 0,
      createdAt: '2025-05-10T08:00:00.000Z',
    },
    {
      id: 'mon-task',
      title: 'Mon Work',
      description: '',
      category: 'Study',
      tags: [],
      priority: 'High',
      important: true,
      urgent: false,
      date: '2025-05-12',
      estimatedMinutes: 240,
      status: 'Completed',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 0,
      createdAt: '2025-05-12T08:00:00.000Z',
    },
  ];

  const logs: TimeLog[] = [
    {
      id: 'sat-log',
      taskId: 'sat-task',
      startedAt: '2025-05-10T09:00:00.000Z',
      endedAt: '2025-05-10T13:00:00.000Z',
      durationMinutes: 240,
      type: 'timer',
    },
    {
      id: 'mon-log',
      taskId: 'mon-task',
      startedAt: '2025-05-12T09:00:00.000Z',
      endedAt: '2025-05-12T13:00:00.000Z',
      durationMinutes: 240,
      type: 'timer',
    },
  ];

  const summary = computeStreaksAndSummary('2025-05-12', tasks, logs, baseSettings);
  assert.equal(summary.currentStreak, 2);
});

test('detectOverlappingTaskIds flags tasks with overlapping time intervals', () => {
  const tasks: Task[] = [
    {
      id: 'a',
      title: 'Task A',
      description: '',
      category: 'Work',
      tags: [],
      priority: 'Med',
      important: false,
      urgent: false,
      date: '2025-05-12',
      start: '09:00',
      end: '10:30',
      estimatedMinutes: 90,
      status: 'To Do',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 0,
      createdAt: '2025-05-12T08:00:00.000Z',
    },
    {
      id: 'b',
      title: 'Task B',
      description: '',
      category: 'Work',
      tags: [],
      priority: 'Med',
      important: false,
      urgent: false,
      date: '2025-05-12',
      start: '10:00',
      end: '11:00',
      estimatedMinutes: 60,
      status: 'To Do',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 1,
      createdAt: '2025-05-12T08:00:00.000Z',
    },
  ];

  const overlaps = detectOverlappingTaskIds(tasks);
  assert.equal(overlaps.has('a'), true);
  assert.equal(overlaps.has('b'), true);
});

test('Phase 1 to Phase 2 migration preserves existing tasks, timeLogs, notes, and settings', () => {
  const phase1Data = {
    schemaVersion: 1,
    tasks: [
      {
        id: 'p1-task',
        title: 'Phase 1 Task',
        description: 'Existing markdown',
        category: 'Coding',
        tags: ['v1'],
        priority: 'High',
        important: true,
        urgent: false,
        date: '2026-11-12',
        estimatedMinutes: 60,
        status: 'Completed',
        subtasks: [],
        recurrence: 'daily',
        reminders: [10],
        order: 0,
        createdAt: '2026-11-12T08:00:00.000Z',
      },
    ],
    timeLogs: [
      {
        id: 'p1-log',
        taskId: 'p1-task',
        startedAt: '2026-11-12T09:00:00.000Z',
        endedAt: '2026-11-12T10:00:00.000Z',
        durationMinutes: 60,
        type: 'timer',
      },
    ],
    notes: [
      {
        id: 'p1-note',
        title: 'My Phase 1 Note',
        markdown: '# Saved note',
        folder: 'General',
        tags: [],
        pinned: true,
        updatedAt: '2026-11-12T09:00:00.000Z',
      },
    ],
    habits: [
      {
        id: 'p1-habit',
        title: 'Read 20 pages',
        category: 'Study',
        frequency: 'daily',
        targetPerDay: 1,
        createdAt: '2026-11-01',
      },
    ],
    habitChecks: [],
    settings: {
      name: 'Vansh Custom',
      timezone: 'Asia/Kolkata',
    },
  };

  const migrated = migratePhase1ToPhase2(phase1Data, 1);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.tasks.length, 1);
  assert.equal(migrated.tasks[0].title, 'Phase 1 Task');
  assert.equal(migrated.tasks[0].recurrenceRule?.frequency, 'daily');
  assert.equal(migrated.timeLogs.length, 1);
  assert.equal(migrated.notes[0].title, 'My Phase 1 Note');
  assert.equal(migrated.settings.name, 'Vansh Custom');
  assert.equal(migrated.habits[0].icon, '🧠');
});

test('Daily recurring task generates occurrences across Week view and per-occurrence completion leaves others open', () => {
  const masterRecurring: Task = {
    id: 'rec-daily-1',
    title: 'Morning LeetCode Warmup',
    description: '1 medium problem',
    category: 'Study',
    tags: [],
    priority: 'High',
    important: true,
    urgent: false,
    date: '2026-11-09',
    start: '08:00',
    end: '08:45',
    estimatedMinutes: 45,
    status: 'To Do',
    subtasks: [],
    recurrence: 'daily',
    recurrenceRule: {
      frequency: 'daily',
      interval: 1,
      endType: 'never',
    },
    occurrenceOverrides: {
      '2026-11-11': {
        date: '2026-11-11',
        status: 'Completed',
        completedAt: '2026-11-11T08:45:00.000Z',
      },
    },
    reminders: [10],
    order: 0,
    createdAt: '2026-11-09T07:00:00.000Z',
  };

  const weekExpanded = expandTasksForRange([masterRecurring], '2026-11-09', '2026-11-15');
  assert.equal(weekExpanded.length, 7);

  const nov11 = expandTasksForDate([masterRecurring], '2026-11-11')[0];
  const nov12 = expandTasksForDate([masterRecurring], '2026-11-12')[0];
  assert.equal(nov11.status, 'Completed');
  assert.equal(nov12.status, 'To Do');

  // Verify analytics counts each occurrence separately
  const scoreNov11 = computeDayScore('2026-11-11', [masterRecurring], [], baseSettings);
  const scoreNov12 = computeDayScore('2026-11-12', [masterRecurring], [], baseSettings);
  assert.equal(scoreNov11.completedCount, 1);
  assert.equal(scoreNov12.completedCount, 0);
  assert.equal(scoreNov12.pendingCount, 1);
});

test('RFC 5545 .ics export and .ics import roundtrip preserves title, time, RRULE, and reminders', () => {
  const sampleTask: Task = {
    id: 'ics-roundtrip-1',
    title: 'System Design Mock Interview',
    description: 'Design URL Shortener & Consistent Hashing',
    category: 'Study',
    tags: [],
    priority: 'High',
    important: true,
    urgent: true,
    date: '2026-11-14',
    start: '15:00',
    end: '16:30',
    estimatedMinutes: 90,
    status: 'To Do',
    subtasks: [],
    recurrence: 'weekly',
    recurrenceRule: {
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [6],
      endType: 'after_count',
      endCount: 4,
    },
    reminders: [10, 30],
    order: 0,
    createdAt: '2026-11-12T08:00:00.000Z',
  };

  const icsText = generateRFC5545ICS([sampleTask], 'Asia/Kolkata');
  assert.ok(icsText.includes('\r\n'));
  assert.ok(icsText.includes('RRULE:FREQ=WEEKLY;BYDAY=SA;COUNT=4'));
  assert.ok(icsText.includes('TRIGGER:-PT10M'));

  const reimported = parseICSContent(icsText, '2026-11-14');
  assert.equal(reimported.length, 1);
  assert.equal(reimported[0].title, 'System Design Mock Interview');
  assert.equal(reimported[0].date, '2026-11-14');
  assert.equal(reimported[0].start, '15:00');
  assert.equal(reimported[0].end, '16:30');
  assert.equal(reimported[0].estimatedMinutes, 90);
  assert.deepEqual(reimported[0].reminders, [10, 30]);
});

test('Reminder scheduler fires once, deduplicates via firedReminderKeys, skips completed tasks, and respects quiet hours', () => {
  const now = new Date(2026, 10, 13, 9, 50, 0); // 2026-11-13 09:50 local
  const taskDueIn10m: Task = {
    id: 'rem-task-1',
    title: '10 AM Deep Work Block',
    description: '',
    category: 'Coding',
    tags: [],
    priority: 'High',
    important: true,
    urgent: false,
    date: '2026-11-13',
    start: '10:00',
    end: '11:00',
    estimatedMinutes: 60,
    status: 'To Do',
    subtasks: [],
    recurrence: 'none',
    reminders: [10],
    order: 0,
    createdAt: '2026-11-13T08:00:00.000Z',
  };

  const settings = {
    ...DEFAULT_SETTINGS,
    reminderToggles: {
      taskReminders: true,
      morningSummary: false,
      eveningReview: false,
      habitReminders: false,
      focusSessionEnd: false,
    },
  };

  const firstRun = evaluateDueReminders(now, [taskDueIn10m], [], [], settings, []);
  assert.equal(firstRun.dueNotifications.length, 1);
  assert.equal(firstRun.dueNotifications[0].missed, false);

  // Second run with firedReminderKeys does NOT fire again
  const secondRun = evaluateDueReminders(
    now,
    [taskDueIn10m],
    [],
    [],
    settings,
    firstRun.newFiredKeys
  );
  assert.equal(secondRun.dueNotifications.length, 0);

  // Completed task never fires
  const completedTask: Task = { ...taskDueIn10m, id: 'rem-task-2', status: 'Completed' };
  const thirdRun = evaluateDueReminders(now, [completedTask], [], [], settings, []);
  assert.equal(thirdRun.dueNotifications.length, 0);

  // Quiet hours check (22:30 -> 07:00)
  assert.equal(isWithinQuietHours('23:15', settings), true);
  assert.equal(isWithinQuietHours('06:30', settings), true);
  assert.equal(isWithinQuietHours('14:00', settings), false);
});

test('Habit streak math counts scheduled days only; rest days do not break streak; missed scheduled day breaks streak', () => {
  const habit: Habit = {
    id: 'h-test-1',
    title: 'Daily Coding Practice',
    category: 'Coding',
    frequency: 'daily',
    targetPerDay: 1,
    startDate: '2026-11-01',
    restDays: [0], // Sunday is rest day
    createdAt: '2026-11-01',
  };

  // Saturday 2026-11-07 (done), Sunday 2026-11-08 (rest day, no check-in), Monday 2026-11-09 (done), Tuesday 2026-11-10 (skipped rest override), Wednesday 2026-11-11 (done)
  const checks: HabitCheck[] = [
    { id: 'c1', habitId: 'h-test-1', date: '2026-11-07', count: 1, completed: true, status: 'done' },
    { id: 'c2', habitId: 'h-test-1', date: '2026-11-09', count: 1, completed: true, status: 'done' },
    { id: 'c3', habitId: 'h-test-1', date: '2026-11-10', count: 0, completed: false, status: 'skipped' },
    { id: 'c4', habitId: 'h-test-1', date: '2026-11-11', count: 1, completed: true, status: 'done' },
  ];

  const stats = computeHabitStats(habit, checks, '2026-11-11', [1, 2, 3, 4, 5, 6]);
  assert.equal(stats.currentStreak, 3); // Sat + Mon + Wed across Sun (rest) and Tue (skipped rest)

  // Now test that missing Thursday 2026-11-12 breaks the streak when evaluated on Friday 2026-11-13
  const statsAfterMiss = computeHabitStats(habit, checks, '2026-11-13', [1, 2, 3, 4, 5, 6]);
  assert.equal(statsAfterMiss.currentStreak, 0);
  assert.equal(statsAfterMiss.longestStreak, 3);
});

test('Phase 2 to Phase 3 migration preserves existing data and initializes templates, savedViews, moodLogs, and achievements', () => {
  const v2Data = {
    schemaVersion: 2,
    tasks: [
      {
        id: 't-mig-3',
        title: 'Existing V2 Task',
        description: '',
        category: 'Study',
        tags: ['dsa'],
        priority: 'High',
        important: true,
        urgent: true,
        date: '2026-11-12',
        estimatedMinutes: 60,
        status: 'To Do',
        subtasks: [],
        recurrence: 'none',
        reminders: [10],
        order: 0,
        createdAt: '2026-11-12T08:00:00.000Z',
      },
    ],
    dayReviews: [
      {
        date: '2026-11-12',
        dailyGoal: 'Ship V2',
        wentWell: 'Great focus',
        didntFinish: '',
        distractions: '',
        toImprove: '',
        mood: 5,
        energy: 4,
      },
    ],
    goals: [
      {
        id: 'g-1',
        title: 'DSA 60h',
        targetHours: 60,
        category: 'Study',
      },
    ],
  };

  const migrated = migrateToPhase3(v2Data, 2);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.tasks[0].title, 'Existing V2 Task');
  assert.equal(migrated.tasks[0].fixedTime, false);
  assert.equal(migrated.goals[0].measureType, 'hours');
  assert.equal(migrated.moodLogs.length, 1);
  assert.equal(migrated.moodLogs[0].mood, 5);
  assert.equal(migrated.moodLogs[0].energy, 4);
  assert.ok(migrated.savedViews.length >= 6);
  assert.ok(migrated.dayTemplates.length >= 3);
});

test('Eisenhower Matrix quadrant mapping and Time by Quadrant calculation from real TimeLogs', () => {
  assert.equal(getQuadrantForTask({ important: true, urgent: true }), 'q1');
  assert.equal(getQuadrantForTask({ important: true, urgent: false }), 'q2');
  assert.equal(getQuadrantForTask({ important: false, urgent: true }), 'q3');
  assert.equal(getQuadrantForTask({ important: false, urgent: false }), 'q4');
  assert.deepEqual(getFlagsForQuadrant('q2'), { important: true, urgent: false });

  const tasks: Task[] = [
    {
      id: 'q1-t',
      title: 'Urgent Important',
      description: '',
      category: 'Work',
      tags: [],
      priority: 'High',
      important: true,
      urgent: true,
      date: '2026-11-12',
      estimatedMinutes: 60,
      status: 'Completed',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 0,
      createdAt: '2026-11-12T08:00:00.000Z',
    },
    {
      id: 'q2-t',
      title: 'Deep Schedule',
      description: '',
      category: 'Study',
      tags: [],
      priority: 'High',
      important: true,
      urgent: false,
      date: '2026-11-12',
      estimatedMinutes: 120,
      status: 'Completed',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 1,
      createdAt: '2026-11-12T08:00:00.000Z',
    },
  ];
  const logs: TimeLog[] = [
    {
      id: 'l-q1',
      taskId: 'q1-t',
      startedAt: '2026-11-12T09:00:00.000Z',
      endedAt: '2026-11-12T10:00:00.000Z',
      durationMinutes: 60,
      type: 'timer',
    },
    {
      id: 'l-q2',
      taskId: 'q2-t',
      startedAt: '2026-11-12T10:00:00.000Z',
      endedAt: '2026-11-12T12:00:00.000Z',
      durationMinutes: 120,
      type: 'pomodoro',
    },
  ];

  const byQuad = computeTimeByQuadrant(tasks, logs);
  assert.equal(byQuad.find((q) => q.id === 'q1')?.minutes, 60);
  assert.equal(byQuad.find((q) => q.id === 'q2')?.minutes, 120);
  assert.equal(byQuad.find((q) => q.id === 'q3')?.minutes, 0);
});

test('Smart Replan respects current time, fixedTime tasks, external events, and working hours, and lists overflow tasks', () => {
  const dateStr = '2026-11-13';
  const extEvents: GoogleCalendarEvent[] = [
    {
      id: 'ext-1',
      summary: 'Team Standup (External)',
      start: '2026-11-13T14:00:00Z',
      end: '2026-11-13T15:00:00Z',
      startTime: '14:00',
      endTime: '15:00',
      date: dateStr,
      calendarId: 'primary',
      isAllDay: false,
      source: 'google',
    },
  ];

  const dayTasks: Task[] = [
    {
      id: 'fixed-1',
      title: 'Fixed Client Call',
      description: '',
      category: 'Work',
      tags: [],
      priority: 'High',
      important: true,
      urgent: true,
      fixedTime: true,
      date: dateStr,
      start: '15:30',
      end: '16:30',
      estimatedMinutes: 60,
      status: 'To Do',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 0,
      createdAt: '2026-11-13T08:00:00Z',
    },
    {
      id: 'movable-high',
      title: 'Urgent & Important Deep Task',
      description: '',
      category: 'Coding',
      tags: [],
      priority: 'High',
      important: true,
      urgent: true,
      date: dateStr,
      start: '09:00', // in the past relative to 13:00!
      end: '10:30',
      estimatedMinutes: 90,
      status: 'To Do',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 1,
      createdAt: '2026-11-13T08:00:00Z',
    },
    {
      id: 'movable-huge',
      title: 'Huge 5-Hour Task That Cannot Fit Before 20:00',
      description: '',
      category: 'Study',
      tags: [],
      priority: 'Low',
      important: false,
      urgent: false,
      date: dateStr,
      estimatedMinutes: 300,
      status: 'To Do',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 2,
      createdAt: '2026-11-13T08:00:00Z',
    },
  ];

  // Current time is 13:00; workday is 08:00..20:00 with 5m buffer
  const proposal = proposeReplanForDay(dateStr, '13:00', dayTasks, extEvents, {
    workDayStart: '08:00',
    workDayEnd: '20:00',
    replanBufferMinutes: 5,
  });

  // Fixed task is never in `moves`
  assert.equal(proposal.moves.some((m) => m.taskId === 'fixed-1'), false);
  // Movable 90m task cannot fit in 13:00..14:00 (only 60m before External Event at 14:00) or 15:00..15:30, so it is placed at 16:35..18:05 after Fixed Call!
  const movedHigh = proposal.moves.find((m) => m.taskId === 'movable-high');
  assert.ok(movedHigh);
  assert.equal(movedHigh.newStart, '16:35');
  assert.equal(movedHigh.newEnd, '18:05');

  // Huge 300m task cannot fit in remaining hours before 20:00 -> goes to overflowTasks
  assert.equal(proposal.overflowTasks.length, 1);
  assert.equal(proposal.overflowTasks[0].taskId, 'movable-huge');

  // Free slot finder for 45m starting from 13:00 finds 13:00..13:45 (before 14:00 external event)
  const freeSlots = findNearestFreeSlots(
    dateStr,
    45,
    dayTasks,
    extEvents,
    { workDayStart: '08:00', workDayEnd: '20:00' },
    '13:00'
  );
  assert.ok(freeSlots.length >= 1);
  assert.equal(freeSlots[0].start, '13:00');
  assert.equal(freeSlots[0].end, '13:45');
});

test('Weekly Review numbers match Analytics and require >= 3 active days for insights', () => {
  const tasks: Task[] = [
    {
      id: 'w-t1',
      title: 'Mon Task',
      description: '',
      category: 'Study',
      tags: [],
      priority: 'High',
      important: true,
      urgent: false,
      date: '2026-11-09',
      estimatedMinutes: 60,
      status: 'Completed',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 0,
      createdAt: '2026-11-09T08:00:00Z',
    },
  ];
  // Only 1 active day in the week -> hasEnoughDataForInsights must be false
  const stats1Day = computeWeeklyReviewStats(
    '2026-11-09',
    tasks,
    [],
    [],
    [],
    [],
    [],
    DEFAULT_SETTINGS
  );
  assert.equal(stats1Day.activeDaysCount, 1);
  assert.equal(stats1Day.hasEnoughDataForInsights, false);
  assert.ok(stats1Day.insights[0].includes("isn't enough data"));

  // Add tasks on Tue and Wed -> 3 active days -> hasEnoughDataForInsights is true
  const tasks3Days: Task[] = [
    ...tasks,
    { ...tasks[0], id: 'w-t2', date: '2026-11-10' },
    { ...tasks[0], id: 'w-t3', date: '2026-11-11' },
  ];
  const stats3Days = computeWeeklyReviewStats(
    '2026-11-09',
    tasks3Days,
    [],
    [],
    [],
    [],
    [],
    DEFAULT_SETTINGS
  );
  assert.equal(stats3Days.activeDaysCount, 3);
  assert.equal(stats3Days.plannedTasks, 3);
  assert.equal(stats3Days.completedTasks, 3);
  assert.equal(stats3Days.completionRate, 100);
  assert.equal(stats3Days.hasEnoughDataForInsights, true);
});

test('Demo data never unlocks achievements; real non-demo data unlocks achievements with no duplicates', () => {
  const demoTask: Task = {
    id: 'demo-t1',
    title: 'Demo Completed Task',
    description: '',
    category: 'Study',
    tags: [],
    priority: 'High',
    important: true,
    urgent: true,
    date: '2026-11-13',
    estimatedMinutes: 60,
    status: 'Completed',
    subtasks: [],
    recurrence: 'none',
    reminders: [],
    order: 0,
    isDemo: true,
    createdAt: '2026-11-13T08:00:00Z',
  };

  const evalWithDemoOnly = evaluateAchievements({
    tasks: [demoTask],
    timeLogs: [],
    dayReviews: [],
    weeklyReviews: [],
    habitChecks: [],
    settings: DEFAULT_SETTINGS,
    unlockedAchievements: [],
  });
  assert.equal(evalWithDemoOnly.newlyUnlocked.length, 0);
  assert.equal(
    evalWithDemoOnly.evaluated.find((a) => a.id === 'first-task')?.unlocked,
    false
  );

  // Real non-demo completed task unlocks 'first-task'
  const realTask: Task = { ...demoTask, id: 'real-t1', isDemo: false };
  const evalWithReal = evaluateAchievements({
    tasks: [demoTask, realTask],
    timeLogs: [],
    dayReviews: [],
    weeklyReviews: [],
    habitChecks: [],
    settings: DEFAULT_SETTINGS,
    unlockedAchievements: [],
  });
  assert.equal(evalWithReal.newlyUnlocked.length, 1);
  assert.equal(evalWithReal.newlyUnlocked[0].id, 'first-task');

  // Re-evaluating with already unlocked achievement produces 0 duplicate unlocks
  const evalSecondPass = evaluateAchievements({
    tasks: [demoTask, realTask],
    timeLogs: [],
    dayReviews: [],
    weeklyReviews: [],
    habitChecks: [],
    settings: DEFAULT_SETTINGS,
    unlockedAchievements: evalWithReal.newlyUnlocked,
  });
  assert.equal(evalSecondPass.newlyUnlocked.length, 0);
});

test('Goal progress and CSV export with UTF-8 BOM and quote/comma escaping work accurately', () => {
  const goal: Goal = {
    id: 'g-tasks',
    title: 'Solve 4 Tasks',
    category: 'Study',
    measureType: 'tasks',
    targetHours: 10,
    targetTasks: 4,
  };
  const linkedTasks: Task[] = [
    {
      id: 'gt-1',
      title: 'Task 1, "Quoted"',
      description: '',
      category: 'Study',
      tags: [],
      priority: 'High',
      important: true,
      urgent: false,
      date: '2026-11-12',
      estimatedMinutes: 60,
      status: 'Completed',
      goalId: 'g-tasks',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 0,
      createdAt: '2026-11-12T08:00:00Z',
    },
    {
      id: 'gt-2',
      title: 'Task 2',
      description: '',
      category: 'Study',
      tags: [],
      priority: 'Med',
      important: false,
      urgent: false,
      date: '2026-11-12',
      estimatedMinutes: 60,
      status: 'To Do',
      goalId: 'g-tasks',
      subtasks: [],
      recurrence: 'none',
      reminders: [],
      order: 1,
      createdAt: '2026-11-12T08:00:00Z',
    },
  ];

  const prog = computeGoalProgress(goal, linkedTasks, []);
  assert.equal(prog.linkedTasksCount, 2);
  assert.equal(prog.completedLinkedTasksCount, 1);
  assert.equal(prog.percent, 25);

  const csv = generateCSVWithBOM(
    ['Title', 'Category', 'Minutes'],
    [['Task 1, "Quoted"', 'Study', 60]]
  );
  assert.equal(csv.startsWith('\uFEFF'), true);
  assert.ok(csv.includes('"Task 1, ""Quoted""",Study,60'));
});

