import { format, subDays, getDay } from 'date-fns';
import {
  CategoryConfig,
  DayReview,
  Goal,
  Habit,
  HabitCheck,
  MoodLog,
  Note,
  Settings,
  Task,
  TimeLog,
} from '../types';

export const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: 'cat-study', name: 'Study', color: '#2563EB' },
  { id: 'cat-coding', name: 'Coding', color: '#0D9488' },
  { id: 'cat-work', name: 'Work', color: '#4F46E5' },
  { id: 'cat-health', name: 'Health', color: '#16A34A' },
  { id: 'cat-personal', name: 'Personal', color: '#D97706' },
];

export const DEFAULT_SETTINGS: Settings = {
  name: 'Vansh',
  timezone: 'Asia/Kolkata',
  workDayStart: '08:00',
  workDayEnd: '20:00',
  workingDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
  dailyFocusTargetMinutes: 240, // 4 hours focused work target
  weeklyFocusTargetMinutes: 1440, // 24 hours weekly focused work target
  replanBufferMinutes: 5,
  goalThresholdScore: 60,
  defaultTaskDurationMinutes: 45,
  pomodoroWorkMinutes: 25,
  pomodoroShortBreakMinutes: 5,
  pomodoroLongBreakMinutes: 15,
  pomodoroSessionsBeforeLongBreak: 4,
  theme: 'light',
  accentColor: '#2563EB',
  presetTheme: 'classic-blue',
  shortcutsEnabled: true,
  showDailyMotivation: true,
  selectedGoogleCalendarId: 'primary',
  googleClientId: '',
  autoSyncToGoogle: false,
  defaultReminderMinutes: 10,
  morningSummaryTime: '08:00',
  eveningReviewTime: '21:00',
  quietHoursEnabled: true,
  quietHoursStart: '22:30',
  quietHoursEnd: '07:00',
  soundEnabled: true,
  reminderToggles: {
    taskReminders: true,
    morningSummary: true,
    eveningReview: true,
    habitReminders: true,
    focusSessionEnd: true,
  },
};

export function generateSeedData(referenceDate = new Date()): {
  tasks: Task[];
  timeLogs: TimeLog[];
  notes: Note[];
  habits: Habit[];
  habitChecks: HabitCheck[];
  goals: Goal[];
  dayReviews: DayReview[];
  moodLogs: MoodLog[];
} {
  const todayStr = format(referenceDate, 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(referenceDate, 1), 'yyyy-MM-dd');

  const tasks: Task[] = [];
  const timeLogs: TimeLog[] = [];
  const notes: Note[] = [];
  const dayReviews: DayReview[] = [];
  const moodLogs: MoodLog[] = [];

  const historicalBlueprints = [
    {
      title: 'Graphs & Shortest Path (Dijkstra / Bellman-Ford)',
      category: 'Study',
      priority: 'High' as const,
      start: '08:30',
      end: '10:30',
      est: 120,
      actualDelta: -5,
    },
    {
      title: 'Build DayForge Timeline & Analytics Engine',
      category: 'Coding',
      priority: 'High' as const,
      start: '11:00',
      end: '13:00',
      est: 120,
      actualDelta: 10,
    },
    {
      title: 'API Architecture Review & Sprint Sync',
      category: 'Work',
      priority: 'Med' as const,
      start: '14:30',
      end: '15:30',
      est: 60,
      actualDelta: 0,
    },
    {
      title: 'Strength Training & Mobility Session',
      category: 'Health',
      priority: 'Med' as const,
      start: '17:30',
      end: '18:15',
      est: 45,
      actualDelta: 0,
    },
    {
      title: 'Read System Design Interview Ch. 6 & Journal',
      category: 'Personal',
      priority: 'Low' as const,
      start: '20:30',
      end: '21:15',
      est: 45,
      actualDelta: -5,
    },
  ];

  // Seed past 21 days (from 21 days ago up to 2 days ago)
  for (let offset = 21; offset >= 2; offset--) {
    const dayDate = subDays(referenceDate, offset);
    const dateStr = format(dayDate, 'yyyy-MM-dd');
    const dow = getDay(dayDate);

    // Sunday is light rest day
    if (dow === 0) {
      const restTaskId = `demo-task-${dateStr}-rest`;
      tasks.push({
        id: restTaskId,
        title: 'Weekly Reset & Reading Session',
        description: 'Review upcoming week priorities and tidy workspace.',
        category: 'Personal',
        tags: ['review', 'reading'],
        priority: 'Low',
        important: true,
        urgent: false,
        date: dateStr,
        start: '10:00',
        end: '11:00',
        estimatedMinutes: 60,
        status: 'Completed',
        subtasks: [
          { id: `${restTaskId}-s1`, title: 'Clear desk & digital inbox', completed: true },
          { id: `${restTaskId}-s2`, title: 'Outline top 3 weekly objectives', completed: true },
        ],
        recurrence: 'none',
        reminders: [],
        completedAt: `${dateStr}T11:00:00.000Z`,
        order: 0,
        isDemo: true,
        createdAt: `${dateStr}T08:00:00.000Z`,
      });
      timeLogs.push({
        id: `demo-log-${dateStr}-rest`,
        taskId: restTaskId,
        startedAt: `${dateStr}T10:00:00.000Z`,
        endedAt: `${dateStr}T10:55:00.000Z`,
        durationMinutes: 55,
        type: 'timer',
        isDemo: true,
      });
      continue;
    }

    const countForDay = offset % 5 === 0 ? 4 : 5;
    const completedThreshold = offset % 7 === 4 ? countForDay - 1 : countForDay;

    for (let i = 0; i < countForDay; i++) {
      const bp = historicalBlueprints[i];
      const taskId = `demo-task-${dateStr}-${i}`;
      const isCompleted = i < completedThreshold;
      const isSkipped = !isCompleted && offset % 6 === 0;
      const status = isCompleted ? 'Completed' : isSkipped ? 'Skipped' : 'To Do';

      tasks.push({
        id: taskId,
        title: bp.title,
        description: `Focused block on **${bp.title}**.\n- Review core concepts\n- Document key takeaways in side note`,
        category: bp.category,
        tags: [bp.category.toLowerCase()],
        priority: bp.priority,
        important: bp.priority === 'High',
        urgent: i === 0,
        date: dateStr,
        start: bp.start,
        end: bp.end,
        estimatedMinutes: bp.est,
        status,
        subtasks: [
          { id: `${taskId}-sub1`, title: 'Prepare environment & notes', completed: isCompleted },
          { id: `${taskId}-sub2`, title: 'Complete core deliverable', completed: isCompleted },
        ],
        recurrence: 'none',
        reminders: [10],
        completedAt: isCompleted ? `${dateStr}T${bp.end}:00.000Z` : undefined,
        order: i,
        isDemo: true,
        createdAt: `${dateStr}T07:30:00.000Z`,
      });

      if (isCompleted) {
        const actualMins = Math.max(20, bp.est + bp.actualDelta + ((offset + i) % 3) * 5 - 5);
        timeLogs.push({
          id: `demo-log-${dateStr}-${i}`,
          taskId,
          startedAt: `${dateStr}T${bp.start}:00.000Z`,
          endedAt: `${dateStr}T${bp.end}:00.000Z`,
          durationMinutes: actualMins,
          type: i % 2 === 0 ? 'pomodoro' : 'timer',
          isDemo: true,
        });
      }
    }

    const mVal = 3 + ((offset + 1) % 3); // 3, 4, or 5
    const eVal = offset % 4 === 0 ? 3 : 4 + (offset % 2); // 3, 4, or 5
    dayReviews.push({
      date: dateStr,
      dailyGoal: 'Complete DSA practice and ship core UI module',
      wentWell: 'Protected morning deep work window with zero phone interruptions.',
      didntFinish: '',
      distractions: 'Afternoon Slack notifications after 3pm.',
      toImprove: 'Batch messages into a single 30m window at 16:30.',
      mood: mVal,
      energy: eVal,
      isDemo: true,
    });
    moodLogs.push({
      date: dateStr,
      mood: mVal,
      energy: eVal,
      note: eVal >= 4 ? 'Strong morning focus after 7.5h sleep' : 'Slightly lower afternoon energy',
      updatedAt: `${dateStr}T21:00:00.000Z`,
      isDemo: true,
    });
  }

  // Seed Yesterday's tasks (including 1 unfinished task so the user can test "Carry forward"!)
  tasks.push(
    {
      id: `demo-task-${yesterdayStr}-1`,
      title: 'Dynamic Programming: Knapsack & Subset Sum Variations',
      description: 'Solved 4 medium/hard DP problems on LeetCode with space-optimized tabulation.',
      category: 'Study',
      tags: ['dsa', 'dp'],
      priority: 'High',
      important: true,
      urgent: true,
      date: yesterdayStr,
      start: '09:00',
      end: '11:00',
      estimatedMinutes: 120,
      status: 'Completed',
      subtasks: [
        { id: 'y-sub-1', title: '0/1 Knapsack bottom-up', completed: true },
        { id: 'y-sub-2', title: 'Partition Equal Subset Sum', completed: true },
      ],
      recurrence: 'none',
      reminders: [10],
      completedAt: `${yesterdayStr}T11:05:00.000Z`,
      order: 0,
      isDemo: true,
      createdAt: `${yesterdayStr}T08:00:00.000Z`,
    },
    {
      id: `demo-task-${yesterdayStr}-2`,
      title: 'Refactor LocalStorage Persistence & Backup Schema',
      description: 'Implemented versioned storage adapter and JSON validator.',
      category: 'Coding',
      tags: ['architecture', 'storage'],
      priority: 'High',
      important: true,
      urgent: false,
      date: yesterdayStr,
      start: '11:30',
      end: '13:30',
      estimatedMinutes: 120,
      status: 'Completed',
      subtasks: [{ id: 'y-sub-3', title: 'Write schema migration unit tests', completed: true }],
      recurrence: 'none',
      reminders: [],
      completedAt: `${yesterdayStr}T13:25:00.000Z`,
      order: 1,
      isDemo: true,
      createdAt: `${yesterdayStr}T08:00:00.000Z`,
    },
    {
      id: `demo-task-${yesterdayStr}-3`,
      title: 'Write Performance Benchmarks for Query Indexer',
      description: 'Unfinished from yesterday — ready to carry forward to today with your approval.',
      category: 'Work',
      tags: ['benchmarks', 'backend'],
      priority: 'Med',
      important: true,
      urgent: false,
      date: yesterdayStr,
      start: '16:00',
      end: '17:00',
      estimatedMinutes: 60,
      status: 'To Do',
      subtasks: [
        { id: 'y-sub-4', title: 'Capture p95 latency baseline', completed: false },
        { id: 'y-sub-5', title: 'Compare B-tree vs composite index', completed: false },
      ],
      recurrence: 'none',
      reminders: [],
      order: 2,
      isDemo: true,
      createdAt: `${yesterdayStr}T08:00:00.000Z`,
    }
  );

  timeLogs.push(
    {
      id: `demo-log-${yesterdayStr}-1`,
      taskId: `demo-task-${yesterdayStr}-1`,
      startedAt: `${yesterdayStr}T09:00:00.000Z`,
      endedAt: `${yesterdayStr}T11:05:00.000Z`,
      durationMinutes: 125,
      type: 'pomodoro',
      isDemo: true,
    },
    {
      id: `demo-log-${yesterdayStr}-2`,
      taskId: `demo-task-${yesterdayStr}-2`,
      startedAt: `${yesterdayStr}T11:30:00.000Z`,
      endedAt: `${yesterdayStr}T13:25:00.000Z`,
      durationMinutes: 115,
      type: 'timer',
      isDemo: true,
    }
  );

  const todayTask1Id = `demo-task-${todayStr}-1`;
  const todayTask2Id = `demo-task-${todayStr}-2`;
  const todayTask3Id = `demo-task-${todayStr}-3`;
  const todayTask4Id = `demo-task-${todayStr}-4`;
  const todayTask5Id = `demo-task-${todayStr}-5`;
  const taskNote1Id = `demo-note-task-1`;

  tasks.push(
    {
      id: todayTask1Id,
      title: 'System Design: Distributed Rate Limiter & Token Bucket',
      description:
        'Deep-dive into sliding window counter vs token bucket algorithms in Redis.\n\n- Compare memory footprint per user key\n- Handle race conditions with Lua scripts',
      category: 'Study',
      tags: ['system-design', 'redis', 'dsa'],
      priority: 'High',
      important: true,
      urgent: true,
      date: todayStr,
      start: '09:00',
      end: '10:30',
      estimatedMinutes: 90,
      status: 'Completed',
      subtasks: [
        { id: 't1-s1', title: 'Sketch token bucket architecture diagram', completed: true },
        { id: 't1-s2', title: 'Write Redis atomic Lua script notes', completed: true },
        { id: 't1-s3', title: 'Summarize failure modes when Redis cluster partitions', completed: true },
      ],
      recurrence: 'none',
      reminders: [10],
      completedAt: `${todayStr}T10:28:00.000Z`,
      linkedNoteId: taskNote1Id,
      order: 0,
      isDemo: true,
      createdAt: `${todayStr}T07:30:00.000Z`,
    },
    {
      id: todayTask2Id,
      title: 'Implement DayForge Side-by-Side Markdown Editor & Slash Menu',
      description:
        'Build the Notion-inspired markdown workspace with live checklist toggling and "Make this a task" selection action.',
      category: 'Coding',
      tags: ['frontend', 'react', 'typescript'],
      priority: 'High',
      important: true,
      urgent: true,
      date: todayStr,
      start: '11:00',
      end: '13:00',
      estimatedMinutes: 120,
      status: 'In Progress',
      subtasks: [
        { id: 't2-s1', title: 'Toolbar formatting actions (H1, H2, Bold, Code, Checklist)', completed: true },
        { id: 't2-s2', title: 'Interactive preview mode with clickable checkboxes', completed: true },
        { id: 't2-s3', title: 'Convert selected line into a scheduled task', completed: false },
      ],
      recurrence: 'none',
      reminders: [5],
      order: 1,
      isDemo: true,
      createdAt: `${todayStr}T07:35:00.000Z`,
    },
    {
      id: todayTask3Id,
      title: 'Product Sync & Q4 Engineering Roadmap Review',
      description: 'Align on Q4 deliverables, latency SLAs, and release milestones.',
      category: 'Work',
      tags: ['roadmap', 'sync'],
      priority: 'Med',
      important: false,
      urgent: true,
      date: todayStr,
      start: '14:30',
      end: '15:30',
      estimatedMinutes: 60,
      status: 'To Do',
      subtasks: [
        { id: 't3-s1', title: 'Prepare metrics deck from last sprint', completed: true },
        { id: 't3-s2', title: 'Confirm API freeze date', completed: false },
      ],
      recurrence: 'none',
      reminders: [10],
      order: 2,
      isDemo: true,
      createdAt: `${todayStr}T07:40:00.000Z`,
    },
    {
      id: todayTask4Id,
      title: 'Evening 5K Tempo Run & Core Conditioning',
      description: 'Keep heart rate in Zone 3 for the middle 3 kilometers.',
      category: 'Health',
      tags: ['running', 'fitness'],
      priority: 'Med',
      important: true,
      urgent: false,
      date: todayStr,
      start: '17:30',
      end: '18:15',
      estimatedMinutes: 45,
      status: 'To Do',
      subtasks: [
        { id: 't4-s1', title: '10 min dynamic warm-up', completed: false },
        { id: 't4-s2', title: '5km run + post-run stretching', completed: false },
      ],
      recurrence: 'daily',
      reminders: [15],
      order: 3,
      isDemo: true,
      createdAt: `${todayStr}T07:45:00.000Z`,
    },
    {
      id: todayTask5Id,
      title: 'Review Tree Traversal & Trie Implementation Problems',
      description: 'Practice Word Search II and Prefix Tree autocomplete.',
      category: 'Study',
      tags: ['dsa', 'tries'],
      priority: 'High',
      important: true,
      urgent: false,
      date: todayStr,
      start: '19:30',
      end: '21:00',
      estimatedMinutes: 90,
      status: 'To Do',
      subtasks: [
        { id: 't5-s1', title: 'Implement Trie insert/search/startsWith', completed: false },
        { id: 't5-s2', title: 'Solve Word Search II with pruning', completed: false },
      ],
      recurrence: 'none',
      reminders: [10],
      order: 4,
      isDemo: true,
      createdAt: `${todayStr}T07:50:00.000Z`,
    }
  );

  timeLogs.push(
    {
      id: `demo-log-${todayStr}-1`,
      taskId: todayTask1Id,
      startedAt: `${todayStr}T09:00:00.000Z`,
      endedAt: `${todayStr}T10:28:00.000Z`,
      durationMinutes: 88,
      type: 'pomodoro',
      isDemo: true,
    },
    {
      id: `demo-log-${todayStr}-2`,
      taskId: todayTask2Id,
      startedAt: `${todayStr}T11:00:00.000Z`,
      endedAt: `${todayStr}T11:50:00.000Z`,
      durationMinutes: 50,
      type: 'timer',
      isDemo: true,
    }
  );

  notes.push(
    {
      id: `demo-note-daily-${todayStr}`,
      title: `Daily Note — ${todayStr}`,
      markdown: `# Daily Plan & Brain Dump (${todayStr})\n\n## Top Focus Today\n1. Finish **Distributed Rate Limiter** architecture notes\n2. Ship **DayForge** core daily workflow & time tracking\n3. Protect evening study session for Trie problems\n\n## Quick Action Checklist\n- [x] Morning hydration & 10m sunlight walk\n- [x] Plan time blocks on the hourly timeline\n- [ ] Export weekly JSON backup before Friday\n- [ ] Follow up on benchmark PR latency numbers\n\n## Scratchpad\n> Tip: Highlight any line in this note and click **"Make this a task"** in the toolbar to turn it directly into a scheduled task!`,
      folder: 'Daily Journal',
      tags: ['daily', 'planning'],
      pinned: true,
      linkedDate: todayStr,
      updatedAt: `${todayStr}T09:15:00.000Z`,
      isDemo: true,
    },
    {
      id: taskNote1Id,
      title: 'Notes: Distributed Rate Limiter & Token Bucket',
      markdown: `# Distributed Rate Limiter Design\n\n## Algorithm Comparison\n- **Token Bucket**: Great for bursty traffic; requires 2 keys per user (\`tokens\`, \`last_refill_ts\`).\n- **Sliding Window Log**: Exact accuracy, but high memory overhead in Redis sorted sets.\n\n## Atomic Redis Lua Snippet\n\`\`\`lua\nlocal tokens = tonumber(redis.call("get", KEYS[1]))\n-- Refill based on elapsed time and deduct 1 token atomically\n\`\`\`\n\n## Next Steps\n- [x] Verify atomic execution under 10k RPS\n- [ ] Add local in-memory cache fallback if Redis times out`,
      folder: 'Study Notes',
      tags: ['system-design', 'redis'],
      pinned: true,
      linkedTaskId: todayTask1Id,
      updatedAt: `${todayStr}T10:25:00.000Z`,
      isDemo: true,
    },
    {
      id: 'demo-note-dsa-patterns',
      title: 'DSA Sliding Window & Two Pointer Templates',
      markdown: `# Core Algorithm Templates\n\n## Monotonic Queue / Sliding Window\nUse when tracking max/min inside a fixed-size subarray of length $k$ in $O(n)$ time.\n\n- [x] Longest Substring Without Repeating Characters\n- [ ] Minimum Window Substring\n- [ ] Sliding Window Maximum`,
      folder: 'Study Notes',
      tags: ['dsa', 'algorithms'],
      pinned: false,
      updatedAt: `${yesterdayStr}T18:00:00.000Z`,
      isDemo: true,
    }
  );

  dayReviews.push({
    date: todayStr,
    dailyGoal: 'Master Distributed Rate Limiters & ship DayForge Phase 1',
    wentWell: '',
    didntFinish: '',
    distractions: '',
    toImprove: '',
    mood: 5,
    energy: 5,
    isDemo: true,
  });

  const habits: Habit[] = [
    {
      id: 'demo-habit-1',
      title: 'Solve 2 LeetCode / DSA Problems',
      icon: '🧠',
      color: '#2563EB',
      category: 'Study',
      frequency: 'daily',
      targetPerDay: 2,
      unit: 'problems',
      startDate: format(subDays(referenceDate, 21), 'yyyy-MM-dd'),
      reminderTime: '09:00',
      reminderTimes: ['09:00'],
      restDays: [0],
      createdAt: format(subDays(referenceDate, 21), 'yyyy-MM-dd'),
      isDemo: true,
    },
    {
      id: 'demo-habit-2',
      title: '45m Exercise / Mobility',
      icon: '🏃',
      color: '#16A34A',
      category: 'Health',
      frequency: 'weekdays',
      targetPerDay: 45,
      unit: 'minutes',
      startDate: format(subDays(referenceDate, 21), 'yyyy-MM-dd'),
      reminderTime: '17:30',
      reminderTimes: ['17:30'],
      restDays: [0, 6],
      createdAt: format(subDays(referenceDate, 21), 'yyyy-MM-dd'),
      isDemo: true,
    },
    {
      id: 'demo-habit-3',
      title: 'No Phone First 60 Mins of Morning',
      icon: '☀️',
      color: '#D97706',
      category: 'Personal',
      frequency: 'daily',
      targetPerDay: 1,
      unit: 'session',
      startDate: format(subDays(referenceDate, 21), 'yyyy-MM-dd'),
      reminderTime: '07:30',
      reminderTimes: ['07:30'],
      restDays: [],
      createdAt: format(subDays(referenceDate, 21), 'yyyy-MM-dd'),
      isDemo: true,
    },
  ];

  const habitChecks: HabitCheck[] = [];
  for (let offset = 21; offset >= 0; offset--) {
    const dObj = subDays(referenceDate, offset);
    const dStr = format(dObj, 'yyyy-MM-dd');
    const dow = getDay(dObj);
    habits.forEach((h, idx) => {
      if (h.restDays?.includes(dow)) return;
      const done = offset === 0 ? idx !== 1 : (offset + idx) % 5 !== 0;
      if (done) {
        habitChecks.push({
          id: `demo-hc-${h.id}-${dStr}`,
          habitId: h.id,
          date: dStr,
          count: h.targetPerDay,
          completed: true,
          status: 'done',
          isDemo: true,
        });
      }
    });
  }

  moodLogs.push({
    date: todayStr,
    mood: 5,
    energy: 5,
    note: 'Energized and locked in for deep system design & coding.',
    updatedAt: `${todayStr}T09:00:00.000Z`,
    isDemo: true,
  });

  const goals: Goal[] = [
    {
      id: 'demo-goal-1',
      title: 'Complete 60 Hours of System Design & DSA Prep',
      description: 'Master distributed systems, graph algorithms, and dynamic programming patterns.',
      measureType: 'hours',
      targetHours: 60,
      deadline: format(subDays(referenceDate, -30), 'yyyy-MM-dd'),
      category: 'Study',
      status: 'Active',
      milestones: [
        { id: 'm1', title: 'Finish Graphs & Shortest Path module', completed: true },
        { id: 'm2', title: 'Complete Distributed Rate Limiter & Caching notes', completed: true },
        { id: 'm3', title: 'Solve 30 Hard DP & Trie problems', completed: false },
      ],
      createdAt: format(subDays(referenceDate, 21), 'yyyy-MM-dd'),
      isDemo: true,
    },
    {
      id: 'demo-goal-2',
      title: 'Ship DayForge Productivity Suite',
      description: 'Deliver local-first planning, calendar sync, habits, and analytics workspace.',
      measureType: 'tasks',
      targetHours: 40,
      targetTasks: 20,
      deadline: format(subDays(referenceDate, -14), 'yyyy-MM-dd'),
      category: 'Coding',
      status: 'Active',
      milestones: [
        { id: 'm4', title: 'Phase 1 Core Tasks, Timer & Notes', completed: true },
        { id: 'm5', title: 'Phase 2 Calendar, Recurring & Habits', completed: true },
        { id: 'm6', title: 'Phase 3 Matrix, Smart Replan & Rituals', completed: false },
      ],
      createdAt: format(subDays(referenceDate, 21), 'yyyy-MM-dd'),
      isDemo: true,
    },
  ];

  // Link demo Study tasks to demo-goal-1 and Coding tasks to demo-goal-2
  for (const t of tasks) {
    if (t.category === 'Study' && !t.goalId) {
      t.goalId = 'demo-goal-1';
    } else if (t.category === 'Coding' && !t.goalId) {
      t.goalId = 'demo-goal-2';
    }
  }

  return {
    tasks,
    timeLogs,
    notes,
    habits,
    habitChecks,
    goals,
    dayReviews,
    moodLogs,
  };
}
