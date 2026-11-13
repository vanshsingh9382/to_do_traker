export type Priority = 'Low' | 'Med' | 'High';

export type TaskStatus = 'To Do' | 'In Progress' | 'Completed' | 'Skipped';

export type RecurrencePattern =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'every_n_days'
  | 'every_n_weeks'
  | 'custom';

export type RecurrenceEndType = 'never' | 'on_date' | 'after_count';

export interface RecurrenceRule {
  frequency: 'daily' | 'weekdays' | 'weekly' | 'every_n_days' | 'every_n_weeks';
  interval?: number; // e.g. every N days or every N weeks (default 1)
  daysOfWeek?: number[]; // 0 = Sun .. 6 = Sat (for weekly on chosen days)
  endType: RecurrenceEndType;
  endDate?: string; // YYYY-MM-DD when endType === 'on_date'
  endCount?: number; // number of occurrences when endType === 'after_count'
}

export interface OccurrenceOverride {
  date: string; // YYYY-MM-DD (original occurrence date)
  status?: TaskStatus;
  completedAt?: string;
  start?: string;
  end?: string;
  estimatedMinutes?: number;
  title?: string;
  description?: string;
  movedToDate?: string; // YYYY-MM-DD if dragged to another day
  deleted?: boolean; // true if only this occurrence was deleted
  googleEventId?: string;
}

export type TimeLogType = 'timer' | 'pomodoro' | 'manual';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface CategoryConfig {
  id: string;
  name: string;
  color: string; // Hex color
}

export type GoogleSyncState = 'synced' | 'pending' | 'error' | 'none';

export interface Task {
  id: string;
  title: string;
  description: string; // markdown
  category: string; // Category name/id e.g. 'Study', 'Coding', 'Work', 'Health', 'Personal'
  tags: string[];
  priority: Priority;
  important: boolean;
  urgent: boolean;
  fixedTime?: boolean; // Phase 3: Protected from automatic Replan moves
  date: string; // YYYY-MM-DD (start date for recurring tasks)
  start?: string; // HH:mm (24h)
  end?: string; // HH:mm (24h)
  estimatedMinutes: number;
  status: TaskStatus;
  subtasks: Subtask[];
  recurrence: RecurrencePattern;
  recurrenceRule?: RecurrenceRule;
  occurrenceOverrides?: Record<string, OccurrenceOverride>; // keyed by original YYYY-MM-DD
  reminders: number[]; // minutes before start, e.g. [0, 5, 10, 30, 60]
  completedAt?: string; // ISO timestamp
  linkedNoteId?: string;
  goalId?: string;
  googleEventId?: string;
  googleCalendarId?: string;
  googleSyncState?: GoogleSyncState;
  googleSyncError?: string;
  order: number;
  isDemo?: boolean;
  createdAt: string;

  // Virtual fields populated on generated recurring occurrences:
  masterTaskId?: string;
  occurrenceDate?: string;
  isVirtualOccurrence?: boolean;
}

export interface TimeLog {
  id: string;
  taskId: string;
  occurrenceDate?: string; // YYYY-MM-DD for recurring task occurrences
  startedAt: string; // ISO timestamp
  endedAt: string; // ISO timestamp
  durationMinutes: number;
  type: TimeLogType;
  isDemo?: boolean;
}

export interface Note {
  id: string;
  title: string;
  markdown: string;
  folder: string;
  tags: string[];
  pinned: boolean;
  linkedTaskId?: string;
  linkedDate?: string; // YYYY-MM-DD for Daily Notes
  updatedAt: string; // ISO timestamp
  isDemo?: boolean;
}

export type HabitFrequency =
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'times_per_week'
  | 'every_n_days'
  | 'custom';

export interface Habit {
  id: string;
  title: string;
  icon?: string; // Emoji or icon label
  color?: string; // Hex color
  category: string;
  frequency: HabitFrequency;
  customDays?: number[]; // 0 = Sun .. 6 = Sat (chosen weekdays)
  timesPerWeek?: number; // X times per week
  intervalDays?: number; // Every N days
  targetPerDay: number; // Numeric target (default 1)
  unit?: string; // e.g. 'minutes', 'sessions', 'pages'
  startDate?: string; // YYYY-MM-DD
  restDays?: number[]; // 0 = Sun .. 6 = Sat per-habit rest weekdays
  reminderTime?: string; // HH:mm (legacy single)
  reminderTimes?: string[]; // Multiple HH:mm reminder times
  archived?: boolean;
  createdAt: string;
  isDemo?: boolean;
}

export interface HabitCheck {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  count: number;
  completed: boolean;
  status?: 'done' | 'skipped'; // 'skipped' = rest day override
  isDemo?: boolean;
}

export type GoalMeasureType = 'tasks' | 'hours' | 'manual';
export type GoalStatus = 'Active' | 'Paused' | 'Completed';

export interface GoalMilestone {
  id: string;
  title: string;
  completed: boolean;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  category: string;
  deadline?: string; // YYYY-MM-DD optional target date
  measureType?: GoalMeasureType; // default 'hours'
  targetHours: number; // used when measureType === 'hours'
  targetTasks?: number; // used when measureType === 'tasks'
  manualProgress?: number; // 0-100 used when measureType === 'manual'
  milestones?: GoalMilestone[];
  status?: GoalStatus;
  createdAt?: string;
  isDemo?: boolean;
}

export interface DayReview {
  date: string; // YYYY-MM-DD
  dailyGoal: string;
  wentWell: string;
  didntFinish: string;
  distractions: string;
  toImprove: string;
  mostImportantTask?: string; // Phase 3 Wrap-up step 1
  topThreeTomorrow?: string[]; // Phase 3 Wrap-up step 4
  closed?: boolean; // Phase 3 Wrap-up completed
  closedAt?: string; // ISO timestamp
  mood?: number; // 1-5
  energy?: number; // 1-5
  moodNote?: string;
  isDemo?: boolean;
}

export interface WeeklyReview {
  weekStart: string; // YYYY-MM-DD (Monday of week)
  wins: string;
  lessons: string;
  nextWeekFocus: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface MoodLog {
  date: string; // YYYY-MM-DD
  mood: number; // 1-5
  energy: number; // 1-5
  note?: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  important: boolean;
  urgent: boolean;
  estimatedMinutes: number;
  subtasks: string[];
  reminders: number[];
  tags: string[];
}

export interface DayTemplateBlock {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  important: boolean;
  urgent: boolean;
  start: string; // HH:mm
  end: string; // HH:mm
  estimatedMinutes: number;
  tags: string[];
}

export interface DayTemplate {
  id: string;
  name: string;
  description: string;
  blocks: DayTemplateBlock[];
  isStarter?: boolean;
}

export type SavedViewDateRange = 'today' | 'week' | 'overdue' | 'all' | 'custom';
export type SavedViewGroupBy = 'none' | 'date' | 'category' | 'priority' | 'status';
export type SavedViewSortBy = 'date' | 'priority' | 'estimate' | 'created';

export interface SavedView {
  id: string;
  name: string;
  isBuiltIn?: boolean;
  pinnedToSidebar?: boolean;
  viewType: 'list' | 'kanban';
  groupBy: SavedViewGroupBy;
  sortBy: SavedViewSortBy;
  filterCategory: string; // 'All' or category name
  filterPriority: string; // 'All' | 'High' | 'Med' | 'Low'
  filterStatus: string; // 'All' | 'Open' | TaskStatus
  filterTag: string; // 'All' or tag
  filterDateRange: SavedViewDateRange;
  customDateFrom?: string;
  customDateTo?: string;
  filterHasNote: boolean;
  filterRecurring: boolean;
  filterSynced: boolean;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: string; // ISO date
}

export interface UndoSnapshot {
  id: string;
  label: string;
  tasks: Task[];
  createdAt: number;
}

export interface ActiveTimerState {
  taskId: string;
  mode: 'stopwatch' | 'pomodoro';
  pomodoroPhase: 'work' | 'shortBreak' | 'longBreak';
  pomodoroSessionCount: number;
  isRunning: boolean;
  startedAtTimestamp: number | null; // epoch ms when current running segment started
  accumulatedSeconds: number; // seconds accumulated before current running segment
}

export interface ReminderToggles {
  taskReminders: boolean;
  morningSummary: boolean;
  eveningReview: boolean;
  habitReminders: boolean;
  focusSessionEnd: boolean;
}

export type PresetColorTheme = 'classic-blue' | 'emerald-zen' | 'amber-craft' | 'violet-focus';

export interface Settings {
  name: string;
  timezone: string;
  workDayStart: string; // HH:mm e.g. "08:00"
  workDayEnd: string; // HH:mm e.g. "20:00"
  workingDays: number[]; // [1, 2, 3, 4, 5, 6] (0=Sun..6=Sat)
  dailyFocusTargetMinutes: number; // default 240 (4h)
  weeklyFocusTargetMinutes?: number; // default 1440 (24h)
  replanBufferMinutes?: number; // default 5
  goalThresholdScore: number; // default 60
  defaultTaskDurationMinutes: number; // default 45
  pomodoroWorkMinutes: number; // default 25
  pomodoroShortBreakMinutes: number; // default 5
  pomodoroLongBreakMinutes: number; // default 15
  pomodoroSessionsBeforeLongBreak: number; // default 4
  theme: 'light' | 'dark' | 'system';
  accentColor: string; // hex e.g. '#2563EB'
  presetTheme?: PresetColorTheme;
  shortcutsEnabled?: boolean; // default true
  showDailyMotivation?: boolean; // default true
  selectedGoogleCalendarId: string;
  googleClientId?: string; // Custom Google OAuth Client ID if configured in Settings
  autoSyncToGoogle?: boolean; // OFF by default
  defaultReminderMinutes?: number; // default 10
  morningSummaryTime?: string; // default "08:00"
  eveningReviewTime?: string; // default "21:00"
  quietHoursEnabled?: boolean;
  quietHoursStart?: string; // default "22:30"
  quietHoursEnd?: string; // default "07:00"
  soundEnabled?: boolean; // default true
  reminderToggles?: ReminderToggles;
  lastBackupExportAt?: string; // ISO date
  backupReminderDismissedAt?: string; // ISO date
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string; // ISO or YYYY-MM-DD
  end: string;
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  date: string; // YYYY-MM-DD
  htmlLink?: string;
  calendarId: string;
  isAllDay: boolean;
  source?: 'google' | 'ics';
  dayforgeTaskId?: string;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
}

export interface NotificationItem {
  id: string;
  key: string; // Unique deduplication key
  title: string;
  body: string;
  type: 'task' | 'morning' | 'evening' | 'habit' | 'focus' | 'system' | 'achievement';
  taskId?: string;
  habitId?: string;
  createdAt: string; // ISO timestamp
  scheduledFor: string; // ISO timestamp
  read: boolean;
  missed?: boolean; // true if fired while app was closed
}

export interface ParsedQuickAdd {
  cleanTitle: string;
  date: string; // YYYY-MM-DD
  start?: string; // HH:mm
  end?: string; // HH:mm
  estimatedMinutes: number;
  category: string;
  tags: string[];
  priority: Priority;
  important: boolean;
  urgent: boolean;
}

export interface DayScoreBreakdown {
  date: string;
  plannedCount: number;
  completedCount: number;
  skippedCount: number;
  pendingCount: number;
  activePlannedCount: number; // plannedCount - skippedCount
  completionRate: number; // 0-100
  plannedMinutes: number;
  actualMinutes: number;
  focusProgress: number; // 0-100
  timeAccuracy: number | null; // 0-100 or null if no completed tasks with both est & actual
  productivityScore: number | null; // 0-100 or null if nothing planned or logged
  goalMet: boolean;
  isWorkingDay: boolean;
}
