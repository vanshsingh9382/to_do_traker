import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { format, parseISO, subDays } from 'date-fns';
import {
  ActiveTimerState,
  CategoryConfig,
  DayReview,
  DayTemplate,
  Goal,
  GoogleCalendarEvent,
  Habit,
  HabitCheck,
  MoodLog,
  Note,
  NotificationItem,
  OccurrenceOverride,
  Priority,
  SavedView,
  Settings,
  Task,
  TaskStatus,
  TaskTemplate,
  TimeLog,
  TimeLogType,
  UndoSnapshot,
  UnlockedAchievement,
  WeeklyReview,
} from '../types';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  generateSeedData,
} from '../lib/seedData';
import { playCompletionChime, playPomodoroBell } from '../lib/sound';
import {
  expandTasksForDate,
  getEffectiveRecurrenceRule,
  parseTaskIdentity,
} from '../lib/recurrenceEngine';
import {
  convertPreviewToExternalEvent,
  convertPreviewToTaskInput,
  ParsedICSEventPreview,
} from '../lib/icsEngine';
import {
  deliverBrowserNotification,
  evaluateDueReminders,
} from '../lib/reminderScheduler';
import {
  BUILT_IN_SAVED_VIEWS,
  evaluateAchievements,
  getFlagsForQuadrant,
  MatrixQuadrantId,
  minutesToHHMM,
  parseHHMMToMinutes,
  STARTER_DAY_TEMPLATES,
  STARTER_TASK_TEMPLATES,
} from '../lib/phase3Engine';

export type NavSection =
  | 'today'
  | 'calendar'
  | 'tasks'
  | 'matrix'
  | 'habits'
  | 'goals'
  | 'notes'
  | 'analytics'
  | 'reviews'
  | 'achievements'
  | 'reports'
  | 'settings';

/**
 * Pure migration function from Phase 1 (version 1) to Phase 2 (version 2).
 * Preserves all Phase 1 tasks, timeLogs, notes, habits, habitChecks, dayReviews, categories, and settings.
 */
export function migratePhase1ToPhase2(persistedState: any, _version?: number): any {
  if (!persistedState || typeof persistedState !== 'object') {
    return persistedState;
  }

  const migratedTasks: Task[] = Array.isArray(persistedState.tasks)
    ? persistedState.tasks.map((t: Task) => {
        const rule = getEffectiveRecurrenceRule(t);
        return {
          ...t,
          recurrenceRule: t.recurrenceRule ?? (rule || undefined),
          occurrenceOverrides: t.occurrenceOverrides || {},
          reminders: Array.isArray(t.reminders) ? t.reminders : [10],
        };
      })
    : [];

  const migratedHabits: Habit[] = Array.isArray(persistedState.habits)
    ? persistedState.habits.map((h: Habit, idx: number) => ({
        ...h,
        icon: h.icon || ['🧠', '🏃', '☀️', '📚', '💧'][idx % 5],
        color: h.color || ['#2563EB', '#16A34A', '#D97706', '#7C3AED', '#0D9488'][idx % 5],
        unit: h.unit || 'check-in',
        startDate: h.startDate || h.createdAt || format(subDays(new Date(), 21), 'yyyy-MM-dd'),
        restDays: Array.isArray(h.restDays) ? h.restDays : [],
        reminderTimes:
          Array.isArray(h.reminderTimes) && h.reminderTimes.length > 0
            ? h.reminderTimes
            : h.reminderTime
            ? [h.reminderTime]
            : [],
        archived: Boolean(h.archived),
      }))
    : [];

  const migratedHabitChecks: HabitCheck[] = Array.isArray(persistedState.habitChecks)
    ? persistedState.habitChecks.map((hc: HabitCheck) => ({
        ...hc,
        status: hc.status || (hc.completed ? 'done' : undefined),
      }))
    : [];

  const mergedSettings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(persistedState.settings || {}),
    reminderToggles: {
      ...DEFAULT_SETTINGS.reminderToggles!,
      ...(persistedState.settings?.reminderToggles || {}),
    },
  };

  return {
    ...persistedState,
    schemaVersion: 2,
    tasks: migratedTasks,
    habits: migratedHabits,
    habitChecks: migratedHabitChecks,
    settings: mergedSettings,
    externalEvents: Array.isArray(persistedState.externalEvents)
      ? persistedState.externalEvents
      : [],
    notifications: Array.isArray(persistedState.notifications)
      ? persistedState.notifications
      : [],
    firedReminderKeys: Array.isArray(persistedState.firedReminderKeys)
      ? persistedState.firedReminderKeys
      : [],
  };
}

/**
 * Pure migration function from Phase 1 or Phase 2 (version <= 2) to Phase 3 (version 3).
 * Preserves all existing tasks, recurring rules, time logs, notes, habits, calendar links, and settings,
 * and safely initializes goals, templates, savedViews, weeklyReviews, moodLogs, and unlockedAchievements.
 */
export function migrateToPhase3(persistedState: any, version = 1): any {
  if (!persistedState || typeof persistedState !== 'object') {
    return persistedState;
  }

  const afterV2 = version < 2 ? migratePhase1ToPhase2(persistedState, version) : persistedState;

  const migratedTasks: Task[] = Array.isArray(afterV2.tasks)
    ? afterV2.tasks.map((t: Task) => ({
        ...t,
        fixedTime: Boolean(t.fixedTime),
      }))
    : [];

  const migratedGoals: Goal[] = Array.isArray(afterV2.goals)
    ? afterV2.goals.map((g: Goal) => ({
        ...g,
        measureType: g.measureType || 'hours',
        status: g.status || 'Active',
        milestones: Array.isArray(g.milestones) ? g.milestones : [],
      }))
    : [];

  // Derive moodLogs from existing dayReviews if moodLogs aren't present yet
  const existingMoodLogs: MoodLog[] = Array.isArray(afterV2.moodLogs)
    ? afterV2.moodLogs
    : Array.isArray(afterV2.dayReviews)
    ? afterV2.dayReviews
        .filter((r: DayReview) => typeof r.mood === 'number' || typeof r.energy === 'number')
        .map((r: DayReview) => ({
          date: r.date,
          mood: r.mood ?? 4,
          energy: r.energy ?? 4,
          note: r.moodNote || '',
          updatedAt: `${r.date}T21:00:00.000Z`,
          isDemo: Boolean(r.isDemo),
        }))
    : [];

  const existingSavedViews: SavedView[] =
    Array.isArray(afterV2.savedViews) && afterV2.savedViews.length > 0
      ? afterV2.savedViews
      : BUILT_IN_SAVED_VIEWS;

  const existingTaskTemplates: TaskTemplate[] =
    Array.isArray(afterV2.taskTemplates) && afterV2.taskTemplates.length > 0
      ? afterV2.taskTemplates
      : STARTER_TASK_TEMPLATES;

  const existingDayTemplates: DayTemplate[] =
    Array.isArray(afterV2.dayTemplates) && afterV2.dayTemplates.length > 0
      ? afterV2.dayTemplates
      : STARTER_DAY_TEMPLATES;

  const mergedSettings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(afterV2.settings || {}),
    weeklyFocusTargetMinutes: afterV2.settings?.weeklyFocusTargetMinutes ?? 1440,
    replanBufferMinutes: afterV2.settings?.replanBufferMinutes ?? 5,
    shortcutsEnabled: afterV2.settings?.shortcutsEnabled ?? true,
    showDailyMotivation: afterV2.settings?.showDailyMotivation ?? true,
    presetTheme: afterV2.settings?.presetTheme || 'classic-blue',
  };

  return {
    ...afterV2,
    schemaVersion: 3,
    tasks: migratedTasks,
    goals: migratedGoals,
    moodLogs: existingMoodLogs,
    savedViews: existingSavedViews,
    taskTemplates: existingTaskTemplates,
    dayTemplates: existingDayTemplates,
    weeklyReviews: Array.isArray(afterV2.weeklyReviews) ? afterV2.weeklyReviews : [],
    unlockedAchievements: Array.isArray(afterV2.unlockedAchievements)
      ? afterV2.unlockedAchievements
      : [],
    settings: mergedSettings,
  };
}

interface DayForgeState {
  schemaVersion: number;
  tasks: Task[];
  timeLogs: TimeLog[];
  notes: Note[];
  habits: Habit[];
  habitChecks: HabitCheck[];
  goals: Goal[];
  dayReviews: DayReview[];
  weeklyReviews: WeeklyReview[];
  moodLogs: MoodLog[];
  taskTemplates: TaskTemplate[];
  dayTemplates: DayTemplate[];
  savedViews: SavedView[];
  unlockedAchievements: UnlockedAchievement[];
  categories: CategoryConfig[];
  settings: Settings;
  activeTimer: ActiveTimerState | null;
  externalEvents: GoogleCalendarEvent[];
  notifications: NotificationItem[];
  firedReminderKeys: string[];
  activeToast: NotificationItem | null;
  lastUndoSnapshot: UndoSnapshot | null;

  // UI state
  selectedDate: string; // YYYY-MM-DD
  selectedTaskId: string | null;
  activeNoteId: string | null;
  activeNav: NavSection;
  activeSavedViewId: string | null;
  centerViewMode: 'list' | 'timeline';
  rightNoteMode: 'task' | 'daily';
  isSidebarCollapsed: boolean;
  isRightPaneOpen: boolean;
  rightPaneWidth: number;
  isZenMode: boolean;
  isWrapUpModalOpen: boolean;
  isReplanModalOpen: boolean;
  isCommandPaletteOpen: boolean;
  isShortcutsHelpOpen: boolean;
  googleEvents: GoogleCalendarEvent[];
  lastGoogleSyncAt: string | null;
  pendingTimerSwitchTaskId: string | null;

  // Navigation & UI actions
  setSelectedDate: (date: string) => void;
  setSelectedTaskId: (taskId: string | null) => void;
  setActiveNoteId: (noteId: string | null) => void;
  setActiveNav: (nav: NavSection) => void;
  setActiveSavedViewId: (viewId: string | null) => void;
  setCenterViewMode: (mode: 'list' | 'timeline') => void;
  setRightNoteMode: (mode: 'task' | 'daily') => void;
  toggleSidebar: () => void;
  toggleRightPane: () => void;
  setRightPaneWidth: (width: number) => void;
  setZenMode: (zen: boolean) => void;
  setWrapUpModalOpen: (open: boolean) => void;
  setReplanModalOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setShortcutsHelpOpen: (open: boolean) => void;
  setGoogleEvents: (events: GoogleCalendarEvent[]) => void;
  setLastGoogleSyncAt: (iso: string | null) => void;

  // Undo Snapshot
  saveUndoSnapshot: (label: string) => void;
  undoLastTaskMutation: () => void;
  dismissUndoSnapshot: () => void;

  // Task CRUD (including recurring task occurrence overrides)
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'order'>) => Task;
  updateTask: (
    id: string,
    patch: Partial<Task>,
    scope?: 'this' | 'all',
    occurrenceDate?: string
  ) => void;
  deleteTask: (id: string, scope?: 'this' | 'all', occurrenceDate?: string) => void;
  duplicateTask: (id: string) => void;
  setTaskStatus: (id: string, status: TaskStatus, occurrenceDate?: string) => void;
  moveTaskToQuadrant: (id: string, quadrant: MatrixQuadrantId) => void;
  moveOrResizeTaskOnCalendar: (
    taskOrId: Task | string,
    targetDate: string,
    start: string,
    end: string,
    estimatedMinutes: number
  ) => void;
  reorderTasksForDate: (date: string, orderedIds: string[]) => void;
  carryForwardTasks: (taskIds: string[], targetDate: string) => void;
  bulkMutateTasks: (
    taskIds: string[],
    mutation:
      | { type: 'complete' }
      | { type: 'date'; date: string }
      | { type: 'category'; category: string }
      | { type: 'tags'; tag: string }
      | { type: 'priority'; priority: Priority }
      | { type: 'delete' }
  ) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;

  // Categories & Tags Manager
  addCategory: (name: string, color: string) => void;
  renameTag: (oldTag: string, newTag: string) => void;
  mergeTags: (sourceTag: string, targetTag: string) => void;
  deleteTag: (tag: string) => void;

  // Saved Views
  saveCustomView: (view: Omit<SavedView, 'id'>) => SavedView;
  renameSavedView: (id: string, name: string) => void;
  deleteSavedView: (id: string) => void;
  togglePinSavedView: (id: string) => void;

  // Smart Replan & Daily Wrap-Up & Weekly Review
  applyReplanProposal: (params: {
    dateStr: string;
    tomorrowStr: string;
    moves: Array<{ taskId: string; newStart: string; newEnd: string }>;
    moveToTomorrowTaskIds: string[];
  }) => void;
  completeDailyWrapUp: (params: {
    date: string;
    mostImportantTask: string;
    wentWell: string;
    didntFinish: string;
    distractions: string;
    toImprove: string;
    appendToDailyNote: boolean;
    mood?: number;
    energy?: number;
    moodNote?: string;
    unfinishedDecisions: Array<{
      taskId: string;
      action: 'tomorrow' | 'date' | 'skip' | 'leave';
      targetDate?: string;
    }>;
    topThreeTomorrow: string[];
    applyDayTemplateId?: string;
    tomorrowDate: string;
  }) => void;
  saveWeeklyReview: (
    weekStart: string,
    patch: { wins: string; lessons: string; nextWeekFocus: string }
  ) => void;

  // Goals & Templates
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt'>) => Goal;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  toggleGoalMilestone: (goalId: string, milestoneId: string) => void;
  addTaskTemplate: (tpl: Omit<TaskTemplate, 'id'>) => TaskTemplate;
  updateTaskTemplate: (id: string, patch: Partial<TaskTemplate>) => void;
  deleteTaskTemplate: (id: string) => void;
  duplicateTaskTemplate: (id: string) => void;
  applyTaskTemplateToDate: (tplId: string, date: string, start?: string) => Task | null;
  saveDateAsDayTemplate: (date: string, name: string, description?: string) => DayTemplate;
  addDayTemplate: (tpl: Omit<DayTemplate, 'id'>) => DayTemplate;
  updateDayTemplate: (id: string, patch: Partial<DayTemplate>) => void;
  deleteDayTemplate: (id: string) => void;
  duplicateDayTemplate: (id: string) => void;
  applyDayTemplateToDate: (tplId: string, date: string) => number;

  // Mood, Energy & Achievements
  logMoodAndEnergy: (date: string, mood: number, energy: number, note?: string) => void;
  checkAndUnlockAchievements: () => void;

  // Timer & Time Tracking
  requestStartTimer: (taskId: string, mode?: 'stopwatch' | 'pomodoro') => void;
  confirmSwitchTimer: () => void;
  cancelSwitchTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimerAndLog: () => void;
  checkPomodoroCompletion: () => void;
  addManualTimeLog: (
    taskId: string,
    durationMinutes: number,
    dateStr?: string,
    type?: TimeLogType
  ) => void;

  // Notes
  createNote: (partial?: Partial<Note>) => Note;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  togglePinNote: (id: string) => void;
  getOrCreateDailyNote: (date: string) => Note;
  getOrCreateTaskNote: (taskId: string) => Note;
  createTaskFromNoteLine: (lineText: string, date: string) => Task;

  // Daily Goal / Review
  setDailyGoal: (date: string, dailyGoal: string) => void;
  updateDayReview: (date: string, patch: Partial<DayReview>) => void;

  // Habits
  toggleHabitCheck: (habitId: string, date: string) => void;
  setHabitCheckCount: (habitId: string, date: string, count: number) => void;
  toggleHabitSkipRest: (habitId: string, date: string) => void;
  addHabit: (
    title: string,
    category: string,
    frequency: Habit['frequency'],
    extra?: Partial<Habit>
  ) => Habit;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  archiveHabit: (id: string, archived: boolean) => void;

  // Reminders & Notifications
  runReminderTick: (now?: Date) => void;
  triggerTestNotification: () => void;
  snoozeNotification: (notif: NotificationItem, minutes?: number) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  dismissActiveToast: () => void;

  // .ICS Import
  importICSEvents: (
    previews: ParsedICSEventPreview[],
    mode: 'tasks' | 'external'
  ) => number;
  removeExternalEvent: (id: string) => void;

  // Settings, Demo & Backup
  updateSettings: (patch: Partial<Settings>) => void;
  clearDemoData: () => void;
  resetDemoData: () => void;
  exportBackupJson: () => string;
  importBackupJson: (rawJson: string) => { ok: boolean; error?: string };
}

const initialSeed = generateSeedData(new Date());
const todayDefault = format(new Date(), 'yyyy-MM-dd');

export const useDayForgeStore = create<DayForgeState>()(
  persist(
    (set, get) => ({
      schemaVersion: 3,
      tasks: initialSeed.tasks,
      timeLogs: initialSeed.timeLogs,
      notes: initialSeed.notes,
      habits: initialSeed.habits,
      habitChecks: initialSeed.habitChecks,
      goals: initialSeed.goals,
      dayReviews: initialSeed.dayReviews,
      weeklyReviews: [],
      moodLogs: initialSeed.moodLogs,
      taskTemplates: STARTER_TASK_TEMPLATES,
      dayTemplates: STARTER_DAY_TEMPLATES,
      savedViews: BUILT_IN_SAVED_VIEWS,
      unlockedAchievements: [],
      categories: DEFAULT_CATEGORIES,
      settings: DEFAULT_SETTINGS,
      activeTimer: null,
      externalEvents: [],
      notifications: [],
      firedReminderKeys: [],
      activeToast: null,
      lastUndoSnapshot: null,

      selectedDate: todayDefault,
      selectedTaskId: initialSeed.tasks.find((t) => t.date === todayDefault)?.id || null,
      activeNoteId:
        initialSeed.notes.find((n) => n.linkedDate === todayDefault)?.id ||
        initialSeed.notes[0]?.id ||
        null,
      activeNav: 'today',
      activeSavedViewId: 'view-this-week',
      centerViewMode: 'list',
      rightNoteMode: 'daily',
      isSidebarCollapsed: false,
      isRightPaneOpen: true,
      rightPaneWidth: 380,
      isZenMode: false,
      isWrapUpModalOpen: false,
      isReplanModalOpen: false,
      isCommandPaletteOpen: false,
      isShortcutsHelpOpen: false,
      googleEvents: [],
      lastGoogleSyncAt: null,
      pendingTimerSwitchTaskId: null,

      setSelectedDate: (date) => set({ selectedDate: date }),
      setSelectedTaskId: (taskId) => {
        set({ selectedTaskId: taskId });
        if (taskId) {
          const { masterId } = parseTaskIdentity(taskId);
          const existingNote = get().notes.find(
            (n) => n.linkedTaskId === taskId || n.linkedTaskId === masterId
          );
          if (existingNote) {
            set({ activeNoteId: existingNote.id, rightNoteMode: 'task' });
          }
        }
      },
      setActiveNoteId: (noteId) => set({ activeNoteId: noteId }),
      setActiveNav: (nav) => set({ activeNav: nav }),
      setActiveSavedViewId: (viewId) => set({ activeSavedViewId: viewId }),
      setCenterViewMode: (mode) => set({ centerViewMode: mode }),
      setRightNoteMode: (mode) => set({ rightNoteMode: mode }),
      toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
      toggleRightPane: () => set((s) => ({ isRightPaneOpen: !s.isRightPaneOpen })),
      setRightPaneWidth: (width) => set({ rightPaneWidth: Math.max(280, Math.min(620, width)) }),
      setZenMode: (zen) => set({ isZenMode: zen }),
      setWrapUpModalOpen: (open) => set({ isWrapUpModalOpen: open }),
      setReplanModalOpen: (open) => set({ isReplanModalOpen: open }),
      setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
      setShortcutsHelpOpen: (open) => set({ isShortcutsHelpOpen: open }),
      setGoogleEvents: (events) => set({ googleEvents: events }),
      setLastGoogleSyncAt: (iso) => set({ lastGoogleSyncAt: iso }),

      saveUndoSnapshot: (label) => {
        const cloned = JSON.parse(JSON.stringify(get().tasks)) as Task[];
        set({
          lastUndoSnapshot: {
            id: `undo-${Date.now()}`,
            label,
            tasks: cloned,
            createdAt: Date.now(),
          },
        });
      },

      undoLastTaskMutation: () => {
        const snap = get().lastUndoSnapshot;
        if (!snap) return;
        set({
          tasks: snap.tasks,
          lastUndoSnapshot: null,
        });
      },

      dismissUndoSnapshot: () => set({ lastUndoSnapshot: null }),

      addTask: (taskInput) => {
        const state = get();
        const sameDayTasks = state.tasks.filter((t) => t.date === taskInput.date);
        const newTask: Task = {
          ...taskInput,
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          occurrenceOverrides: taskInput.occurrenceOverrides || {},
          order: sameDayTasks.length,
          createdAt: new Date().toISOString(),
          isDemo: false,
        };
        set((s) => ({
          tasks: [...s.tasks, newTask],
          selectedTaskId: newTask.id,
        }));
        return newTask;
      },

      updateTask: (id, patch, scope = 'all', explicitOccurrenceDate) => {
        const { masterId, occurrenceDate: parsedOccDate } = parseTaskIdentity(id);
        const occDate = explicitOccurrenceDate || parsedOccDate;

        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== masterId) return t;
            const isRecurring = Boolean(getEffectiveRecurrenceRule(t));

            if (isRecurring && scope === 'this' && occDate) {
              const prevOv: OccurrenceOverride = t.occurrenceOverrides?.[occDate] || {
                date: occDate,
              };
              const nextOv: OccurrenceOverride = {
                ...prevOv,
                ...(patch.title !== undefined ? { title: patch.title } : {}),
                ...(patch.description !== undefined ? { description: patch.description } : {}),
                ...(patch.status !== undefined ? { status: patch.status } : {}),
                ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
                ...(patch.start !== undefined ? { start: patch.start } : {}),
                ...(patch.end !== undefined ? { end: patch.end } : {}),
                ...(patch.estimatedMinutes !== undefined
                  ? { estimatedMinutes: patch.estimatedMinutes }
                  : {}),
                ...(patch.date !== undefined && patch.date !== occDate
                  ? { movedToDate: patch.date }
                  : {}),
                ...(patch.googleEventId !== undefined
                  ? { googleEventId: patch.googleEventId }
                  : {}),
              };
              return {
                ...t,
                occurrenceOverrides: {
                  ...(t.occurrenceOverrides || {}),
                  [occDate]: nextOv,
                },
              };
            }

            return { ...t, ...patch };
          }),
        }));
      },

      deleteTask: (id, scope = 'all', explicitOccurrenceDate) => {
        const { masterId, occurrenceDate: parsedOccDate } = parseTaskIdentity(id);
        const occDate = explicitOccurrenceDate || parsedOccDate;

        set((s) => {
          const target = s.tasks.find((t) => t.id === masterId);
          if (!target) return s;

          const rule = getEffectiveRecurrenceRule(target);
          if (rule && scope === 'this' && occDate) {
            const prevOv = target.occurrenceOverrides?.[occDate] || { date: occDate };
            return {
              tasks: s.tasks.map((t) =>
                t.id === masterId
                  ? {
                      ...t,
                      occurrenceOverrides: {
                        ...(t.occurrenceOverrides || {}),
                        [occDate]: { ...prevOv, deleted: true },
                      },
                    }
                  : t
              ),
              selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
            };
          }

          if (rule && scope === 'all' && occDate && occDate > target.date) {
            const dayBefore = format(subDays(parseISO(occDate), 1), 'yyyy-MM-dd');
            return {
              tasks: s.tasks.map((t) =>
                t.id === masterId
                  ? {
                      ...t,
                      recurrenceRule: {
                        ...rule,
                        endType: 'on_date',
                        endDate: dayBefore,
                      },
                    }
                  : t
              ),
              selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
            };
          }

          return {
            tasks: s.tasks.filter((t) => t.id !== masterId),
            selectedTaskId:
              s.selectedTaskId === id || s.selectedTaskId === masterId
                ? null
                : s.selectedTaskId,
            activeTimer:
              s.activeTimer?.taskId === id || s.activeTimer?.taskId === masterId
                ? null
                : s.activeTimer,
          };
        });
      },

      duplicateTask: (id) => {
        const { masterId } = parseTaskIdentity(id);
        const orig = get().tasks.find((t) => t.id === masterId);
        if (!orig) return;
        const copy: Task = {
          ...orig,
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: `${orig.title} (Copy)`,
          status: 'To Do',
          completedAt: undefined,
          googleEventId: undefined,
          occurrenceOverrides: {},
          order: get().tasks.filter((t) => t.date === orig.date).length,
          createdAt: new Date().toISOString(),
          isDemo: false,
        };
        set((s) => ({ tasks: [...s.tasks, copy], selectedTaskId: copy.id }));
      },

      setTaskStatus: (id, status, explicitOccurrenceDate) => {
        const { masterId, occurrenceDate: parsedOccDate } = parseTaskIdentity(id);
        const master = get().tasks.find((t) => t.id === masterId);
        if (!master) return;

        const isRecurring = Boolean(getEffectiveRecurrenceRule(master));
        const occDate =
          explicitOccurrenceDate || parsedOccDate || (isRecurring ? get().selectedDate : null);

        if (status === 'Completed' && get().settings.soundEnabled !== false) {
          playCompletionChime();
        }

        const completedAtIso = status === 'Completed' ? new Date().toISOString() : undefined;

        if (isRecurring && occDate) {
          set((s) => ({
            tasks: s.tasks.map((t) => {
              if (t.id !== masterId) return t;
              const prevOv = t.occurrenceOverrides?.[occDate] || { date: occDate };
              return {
                ...t,
                occurrenceOverrides: {
                  ...(t.occurrenceOverrides || {}),
                  [occDate]: {
                    ...prevOv,
                    status,
                    completedAt: completedAtIso,
                  },
                },
              };
            }),
          }));
          get().checkAndUnlockAchievements();
          return;
        }

        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === masterId
              ? {
                  ...t,
                  status,
                  completedAt: completedAtIso,
                }
              : t
          ),
        }));
        get().checkAndUnlockAchievements();
      },

      moveTaskToQuadrant: (id, quadrant) => {
        const { masterId } = parseTaskIdentity(id);
        const flags = getFlagsForQuadrant(quadrant);
        // For recurring tasks, flags apply to the whole series
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === masterId ? { ...t, important: flags.important, urgent: flags.urgent } : t
          ),
        }));
      },

      moveOrResizeTaskOnCalendar: (
        taskOrId,
        targetDate,
        start,
        end,
        estimatedMinutes
      ) => {
        const { masterId, occurrenceDate } = parseTaskIdentity(taskOrId);
        const master = get().tasks.find((t) => t.id === masterId);
        if (!master) return;

        const isRecurring = Boolean(getEffectiveRecurrenceRule(master));
        if (isRecurring && occurrenceDate) {
          get().updateTask(
            masterId,
            {
              date: targetDate,
              start,
              end,
              estimatedMinutes,
            },
            'this',
            occurrenceDate
          );
        } else {
          get().updateTask(masterId, {
            date: targetDate,
            start,
            end,
            estimatedMinutes,
          });
        }
      },

      reorderTasksForDate: (date, orderedIds) =>
        set((s) => {
          const orderMap = new Map(
            orderedIds.map((id, idx) => [parseTaskIdentity(id).masterId, idx])
          );
          return {
            tasks: s.tasks.map((t) =>
              t.date === date && orderMap.has(t.id)
                ? { ...t, order: orderMap.get(t.id)! }
                : t
            ),
          };
        }),

      carryForwardTasks: (taskIds, targetDate) => {
        get().saveUndoSnapshot(`Carried forward ${taskIds.length} task(s) to ${targetDate}`);
        set((s) => {
          const idSet = new Set(taskIds.map((id) => parseTaskIdentity(id).masterId));
          return {
            tasks: s.tasks.map((t) =>
              idSet.has(t.id) ? { ...t, date: targetDate } : t
            ),
          };
        });
      },

      bulkMutateTasks: (taskIds, mutation) => {
        if (taskIds.length === 0) return;
        const labelMap: Record<typeof mutation.type, string> = {
          complete: `Completed ${taskIds.length} task(s)`,
          date: `Changed date on ${taskIds.length} task(s)`,
          category: `Updated category on ${taskIds.length} task(s)`,
          tags: `Added tag to ${taskIds.length} task(s)`,
          priority: `Updated priority on ${taskIds.length} task(s)`,
          delete: `Deleted ${taskIds.length} task(s)`,
        };
        get().saveUndoSnapshot(labelMap[mutation.type]);

        if (mutation.type === 'complete') {
          for (const id of taskIds) {
            const { occurrenceDate } = parseTaskIdentity(id);
            get().setTaskStatus(id, 'Completed', occurrenceDate || undefined);
          }
          return;
        }

        if (mutation.type === 'delete') {
          for (const id of taskIds) {
            const { occurrenceDate } = parseTaskIdentity(id);
            get().deleteTask(id, occurrenceDate ? 'this' : 'all', occurrenceDate || undefined);
          }
          return;
        }

        const masterSet = new Set(taskIds.map((id) => parseTaskIdentity(id).masterId));
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (!masterSet.has(t.id)) return t;
            if (mutation.type === 'date') {
              return { ...t, date: mutation.date };
            }
            if (mutation.type === 'category') {
              return { ...t, category: mutation.category };
            }
            if (mutation.type === 'priority') {
              return { ...t, priority: mutation.priority };
            }
            if (mutation.type === 'tags') {
              const clean = mutation.tag.trim().toLowerCase();
              if (!clean || t.tags.includes(clean)) return t;
              return { ...t, tags: [...t.tags, clean] };
            }
            return t;
          }),
        }));
      },

      addSubtask: (taskId, title) => {
        if (!title.trim()) return;
        const { masterId } = parseTaskIdentity(taskId);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === masterId
              ? {
                  ...t,
                  subtasks: [
                    ...t.subtasks,
                    {
                      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      title: title.trim(),
                      completed: false,
                    },
                  ],
                }
              : t
          ),
        }));
      },

      toggleSubtask: (taskId, subtaskId) => {
        const { masterId } = parseTaskIdentity(taskId);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === masterId
              ? {
                  ...t,
                  subtasks: t.subtasks.map((sub) =>
                    sub.id === subtaskId ? { ...sub, completed: !sub.completed } : sub
                  ),
                }
              : t
          ),
        }));
      },

      deleteSubtask: (taskId, subtaskId) => {
        const { masterId } = parseTaskIdentity(taskId);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === masterId
              ? {
                  ...t,
                  subtasks: t.subtasks.filter((sub) => sub.id !== subtaskId),
                }
              : t
          ),
        }));
      },

      addCategory: (name, color) => {
        const clean = name.trim();
        if (!clean) return;
        set((s) => {
          if (s.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
            return s;
          }
          return {
            categories: [
              ...s.categories,
              { id: `cat-${Date.now()}`, name: clean, color },
            ],
          };
        });
      },

      renameTag: (oldTag, newTag) => {
        const cleanOld = oldTag.trim();
        const cleanNew = newTag.trim().toLowerCase();
        if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.tags.includes(cleanOld)
              ? {
                  ...t,
                  tags: Array.from(
                    new Set(t.tags.map((tg) => (tg === cleanOld ? cleanNew : tg)))
                  ),
                }
              : t
          ),
          notes: s.notes.map((n) =>
            n.tags.includes(cleanOld)
              ? {
                  ...n,
                  tags: Array.from(
                    new Set(n.tags.map((tg) => (tg === cleanOld ? cleanNew : tg)))
                  ),
                }
              : n
          ),
        }));
      },

      mergeTags: (sourceTag, targetTag) => {
        get().renameTag(sourceTag, targetTag);
      },

      deleteTag: (tag) => {
        const clean = tag.trim();
        if (!clean) return;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.tags.includes(clean)
              ? { ...t, tags: t.tags.filter((tg) => tg !== clean) }
              : t
          ),
          notes: s.notes.map((n) =>
            n.tags.includes(clean)
              ? { ...n, tags: n.tags.filter((tg) => tg !== clean) }
              : n
          ),
        }));
      },

      saveCustomView: (viewInput) => {
        const created: SavedView = {
          ...viewInput,
          id: `view-custom-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          isBuiltIn: false,
        };
        set((s) => ({
          savedViews: [...s.savedViews, created],
          activeSavedViewId: created.id,
        }));
        return created;
      },

      renameSavedView: (id, name) => {
        const clean = name.trim();
        if (!clean) return;
        set((s) => ({
          savedViews: s.savedViews.map((v) =>
            v.id === id && !v.isBuiltIn ? { ...v, name: clean } : v
          ),
        }));
      },

      deleteSavedView: (id) =>
        set((s) => ({
          savedViews: s.savedViews.filter((v) => v.id !== id || v.isBuiltIn),
          activeSavedViewId:
            s.activeSavedViewId === id ? 'view-this-week' : s.activeSavedViewId,
        })),

      togglePinSavedView: (id) =>
        set((s) => ({
          savedViews: s.savedViews.map((v) =>
            v.id === id ? { ...v, pinnedToSidebar: !v.pinnedToSidebar } : v
          ),
        })),

      applyReplanProposal: ({ dateStr, tomorrowStr, moves, moveToTomorrowTaskIds }) => {
        get().saveUndoSnapshot(
          `Replanned ${moves.length + moveToTomorrowTaskIds.length} task(s) on ${dateStr}`
        );

        for (const mv of moves) {
          const { masterId, occurrenceDate } = parseTaskIdentity(mv.taskId);
          const dur = Math.max(
            15,
            parseHHMMToMinutes(mv.newEnd) - parseHHMMToMinutes(mv.newStart)
          );
          if (occurrenceDate) {
            get().updateTask(
              masterId,
              { start: mv.newStart, end: mv.newEnd, estimatedMinutes: dur },
              'this',
              occurrenceDate
            );
          } else {
            get().updateTask(masterId, {
              start: mv.newStart,
              end: mv.newEnd,
              estimatedMinutes: dur,
            });
          }
        }

        for (const tid of moveToTomorrowTaskIds) {
          const { masterId, occurrenceDate } = parseTaskIdentity(tid);
          if (occurrenceDate) {
            get().updateTask(masterId, { date: tomorrowStr }, 'this', occurrenceDate);
          } else {
            get().updateTask(masterId, { date: tomorrowStr });
          }
        }
      },

      completeDailyWrapUp: ({
        date,
        mostImportantTask,
        wentWell,
        didntFinish,
        distractions,
        toImprove,
        appendToDailyNote,
        mood,
        energy,
        moodNote,
        unfinishedDecisions,
        topThreeTomorrow,
        applyDayTemplateId,
        tomorrowDate,
      }) => {
        get().saveUndoSnapshot(`Daily Wrap-Up applied for ${date}`);

        // 1. Apply unfinished task decisions
        for (const dec of unfinishedDecisions) {
          if (dec.action === 'leave') continue;
          const { masterId, occurrenceDate } = parseTaskIdentity(dec.taskId);
          if (dec.action === 'skip') {
            get().setTaskStatus(dec.taskId, 'Skipped', occurrenceDate || date);
          } else if (dec.action === 'tomorrow') {
            if (occurrenceDate) {
              get().updateTask(masterId, { date: tomorrowDate }, 'this', occurrenceDate);
            } else {
              get().updateTask(masterId, { date: tomorrowDate });
            }
          } else if (dec.action === 'date' && dec.targetDate) {
            if (occurrenceDate) {
              get().updateTask(masterId, { date: dec.targetDate }, 'this', occurrenceDate);
            } else {
              get().updateTask(masterId, { date: dec.targetDate });
            }
          }
        }

        // 2. Optionally apply day template to tomorrow
        if (applyDayTemplateId) {
          get().applyDayTemplateToDate(applyDayTemplateId, tomorrowDate);
        }

        // 3. Save DayReview marked closed (updating in place if already exists, never duplicating)
        const nowIso = new Date().toISOString();
        get().updateDayReview(date, {
          mostImportantTask,
          wentWell,
          didntFinish,
          distractions,
          toImprove,
          topThreeTomorrow,
          mood,
          energy,
          moodNote,
          closed: true,
          closedAt: nowIso,
          isDemo: false,
        });

        // 4. Log mood & energy if provided
        if (typeof mood === 'number' && typeof energy === 'number') {
          get().logMoodAndEnergy(date, mood, energy, moodNote);
        }

        // 5. Append reflection to Daily Note if requested
        if (appendToDailyNote) {
          const note = get().getOrCreateDailyNote(date);
          const wrapBlock = `\n\n## Evening Wrap-Up (${date})\n- **Highlight**: ${
            mostImportantTask || 'Completed daily ritual'
          }\n- **What went well**: ${wentWell || '—'}\n- **Unfinished / Carried**: ${
            didntFinish || '—'
          }\n- **Distractions**: ${distractions || '—'}\n- **Tomorrow's improvement**: ${
            toImprove || '—'
          }\n`;
          if (!note.markdown.includes(`## Evening Wrap-Up (${date})`)) {
            get().updateNote(note.id, {
              markdown: note.markdown.trimEnd() + wrapBlock,
            });
          }
        }

        get().checkAndUnlockAchievements();
      },

      saveWeeklyReview: (weekStart, patch) => {
        const nowIso = new Date().toISOString();
        set((s) => {
          const exists = s.weeklyReviews.some((w) => w.weekStart === weekStart);
          if (exists) {
            return {
              weeklyReviews: s.weeklyReviews.map((w) =>
                w.weekStart === weekStart
                  ? { ...w, ...patch, updatedAt: nowIso, isDemo: false }
                  : w
              ),
            };
          }
          return {
            weeklyReviews: [
              ...s.weeklyReviews,
              {
                weekStart,
                wins: patch.wins,
                lessons: patch.lessons,
                nextWeekFocus: patch.nextWeekFocus,
                updatedAt: nowIso,
                isDemo: false,
              },
            ],
          };
        });
        get().checkAndUnlockAchievements();
      },

      addGoal: (goalInput) => {
        const newGoal: Goal = {
          ...goalInput,
          id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          measureType: goalInput.measureType || 'hours',
          status: goalInput.status || 'Active',
          milestones: goalInput.milestones || [],
          createdAt: format(new Date(), 'yyyy-MM-dd'),
          isDemo: false,
        };
        set((s) => ({ goals: [...s.goals, newGoal] }));
        return newGoal;
      },

      updateGoal: (id, patch) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch, isDemo: false } : g)),
        })),

      deleteGoal: (id) =>
        set((s) => ({
          goals: s.goals.filter((g) => g.id !== id),
          tasks: s.tasks.map((t) => (t.goalId === id ? { ...t, goalId: undefined } : t)),
        })),

      toggleGoalMilestone: (goalId, milestoneId) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  milestones: (g.milestones || []).map((m) =>
                    m.id === milestoneId ? { ...m, completed: !m.completed } : m
                  ),
                }
              : g
          ),
        })),

      addTaskTemplate: (tpl) => {
        const created: TaskTemplate = {
          ...tpl,
          id: `tpl-task-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        };
        set((s) => ({ taskTemplates: [...s.taskTemplates, created] }));
        return created;
      },

      updateTaskTemplate: (id, patch) =>
        set((s) => ({
          taskTemplates: s.taskTemplates.map((t) =>
            t.id === id ? { ...t, ...patch } : t
          ),
        })),

      deleteTaskTemplate: (id) =>
        set((s) => ({
          taskTemplates: s.taskTemplates.filter((t) => t.id !== id),
        })),

      duplicateTaskTemplate: (id) => {
        const orig = get().taskTemplates.find((t) => t.id === id);
        if (!orig) return;
        get().addTaskTemplate({
          ...orig,
          title: `${orig.title} (Copy)`,
        });
      },

      applyTaskTemplateToDate: (tplId, date, start) => {
        const tpl = get().taskTemplates.find((t) => t.id === tplId);
        if (!tpl) return null;
        const startStr = start || '09:00';
        const endStr = minutesToHHMM(
          parseHHMMToMinutes(startStr) + (tpl.estimatedMinutes || 45)
        );
        return get().addTask({
          title: tpl.title,
          description: tpl.description,
          category: tpl.category,
          tags: [...tpl.tags],
          priority: tpl.priority,
          important: tpl.important,
          urgent: tpl.urgent,
          date,
          start: startStr,
          end: endStr,
          estimatedMinutes: tpl.estimatedMinutes,
          status: 'To Do',
          subtasks: tpl.subtasks.map((st, idx) => ({
            id: `sub-${Date.now()}-${idx}`,
            title: st,
            completed: false,
          })),
          recurrence: 'none',
          reminders: [...tpl.reminders],
        });
      },

      saveDateAsDayTemplate: (date, name, description = '') => {
        const dayTasks = expandTasksForDate(get().tasks, date).filter(
          (t) => t.status !== 'Skipped'
        );
        const created: DayTemplate = {
          id: `tpl-day-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          name: name.trim() || `Template from ${date}`,
          description: description || `Saved from ${date} (${dayTasks.length} blocks)`,
          blocks: dayTasks.map((t, idx) => ({
            id: `blk-${Date.now()}-${idx}`,
            title: t.title,
            description: t.description,
            category: t.category,
            priority: t.priority,
            important: t.important,
            urgent: t.urgent,
            start: t.start || '09:00',
            end: t.end || '10:00',
            estimatedMinutes: t.estimatedMinutes || 60,
            tags: [...t.tags],
          })),
        };
        set((s) => ({ dayTemplates: [...s.dayTemplates, created] }));
        return created;
      },

      addDayTemplate: (tpl) => {
        const created: DayTemplate = {
          ...tpl,
          id: `tpl-day-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        };
        set((s) => ({ dayTemplates: [...s.dayTemplates, created] }));
        return created;
      },

      updateDayTemplate: (id, patch) =>
        set((s) => ({
          dayTemplates: s.dayTemplates.map((d) =>
            d.id === id ? { ...d, ...patch } : d
          ),
        })),

      deleteDayTemplate: (id) =>
        set((s) => ({
          dayTemplates: s.dayTemplates.filter((d) => d.id !== id),
        })),

      duplicateDayTemplate: (id) => {
        const orig = get().dayTemplates.find((d) => d.id === id);
        if (!orig) return;
        get().addDayTemplate({
          name: `${orig.name} (Copy)`,
          description: orig.description,
          blocks: orig.blocks.map((b, i) => ({ ...b, id: `blk-copy-${Date.now()}-${i}` })),
        });
      },

      applyDayTemplateToDate: (tplId, date) => {
        const tpl = get().dayTemplates.find((d) => d.id === tplId);
        if (!tpl) return 0;
        get().saveUndoSnapshot(`Applied "${tpl.name}" template to ${date}`);
        for (const blk of tpl.blocks) {
          get().addTask({
            title: blk.title,
            description: blk.description,
            category: blk.category,
            tags: [...blk.tags],
            priority: blk.priority,
            important: blk.important,
            urgent: blk.urgent,
            date,
            start: blk.start,
            end: blk.end,
            estimatedMinutes: blk.estimatedMinutes,
            status: 'To Do',
            subtasks: [],
            recurrence: 'none',
            reminders: [get().settings.defaultReminderMinutes ?? 10],
          });
        }
        return tpl.blocks.length;
      },

      logMoodAndEnergy: (date, mood, energy, note) => {
        const clampedMood = Math.max(1, Math.min(5, Math.round(mood)));
        const clampedEnergy = Math.max(1, Math.min(5, Math.round(energy)));
        const nowIso = new Date().toISOString();

        set((s) => {
          const exists = s.moodLogs.some((m) => m.date === date);
          const nextMoodLogs = exists
            ? s.moodLogs.map((m) =>
                m.date === date
                  ? {
                      ...m,
                      mood: clampedMood,
                      energy: clampedEnergy,
                      note: note !== undefined ? note : m.note,
                      updatedAt: nowIso,
                      isDemo: false,
                    }
                  : m
              )
            : [
                ...s.moodLogs,
                {
                  date,
                  mood: clampedMood,
                  energy: clampedEnergy,
                  note: note || '',
                  updatedAt: nowIso,
                  isDemo: false,
                },
              ];

          return { moodLogs: nextMoodLogs };
        });

        get().updateDayReview(date, {
          mood: clampedMood,
          energy: clampedEnergy,
          ...(note !== undefined ? { moodNote: note } : {}),
        });
      },

      checkAndUnlockAchievements: () => {
        const state = get();
        const { evaluated, newlyUnlocked } = evaluateAchievements({
          tasks: state.tasks,
          timeLogs: state.timeLogs,
          dayReviews: state.dayReviews,
          weeklyReviews: state.weeklyReviews,
          habitChecks: state.habitChecks,
          settings: state.settings,
          unlockedAchievements: state.unlockedAchievements,
          referenceDateStr: state.selectedDate,
        });

        if (newlyUnlocked.length === 0) return;

        const firstNew = newlyUnlocked[0];
        const def = evaluated.find((e) => e.id === firstNew.id);
        const toastItem: NotificationItem = {
          id: `notif-ach-${firstNew.id}-${Date.now()}`,
          key: `achievement:${firstNew.id}`,
          title: `Achievement Unlocked: ${def?.icon || '🏆'} ${def?.title || firstNew.id}`,
          body: def?.description || 'You unlocked a new milestone in DayForge!',
          type: 'achievement',
          createdAt: firstNew.unlockedAt,
          scheduledFor: firstNew.unlockedAt,
          read: false,
          missed: false,
        };

        set((s) => ({
          unlockedAchievements: [...s.unlockedAchievements, ...newlyUnlocked],
          notifications: [toastItem, ...s.notifications],
          activeToast: toastItem,
        }));
      },

      requestStartTimer: (taskId, mode = 'stopwatch') => {
        const current = get().activeTimer;
        if (current && current.taskId !== taskId) {
          set({ pendingTimerSwitchTaskId: taskId });
          return;
        }
        if (current && current.taskId === taskId) {
          if (!current.isRunning) {
            get().resumeTimer();
          }
          return;
        }
        const { masterId, occurrenceDate } = parseTaskIdentity(taskId);
        const targetTask = get().tasks.find((t) => t.id === masterId);
        if (targetTask && targetTask.status === 'To Do') {
          get().setTaskStatus(taskId, 'In Progress', occurrenceDate || undefined);
        }
        set({
          activeTimer: {
            taskId,
            mode,
            pomodoroPhase: 'work',
            pomodoroSessionCount: 0,
            isRunning: true,
            startedAtTimestamp: Date.now(),
            accumulatedSeconds: 0,
          },
          selectedTaskId: taskId,
          pendingTimerSwitchTaskId: null,
        });
      },

      confirmSwitchTimer: () => {
        const nextTaskId = get().pendingTimerSwitchTaskId;
        if (!nextTaskId) return;
        get().stopTimerAndLog();
        set({ pendingTimerSwitchTaskId: null });
        get().requestStartTimer(nextTaskId, 'stopwatch');
      },

      cancelSwitchTimer: () => set({ pendingTimerSwitchTaskId: null }),

      pauseTimer: () => {
        const current = get().activeTimer;
        if (!current || !current.isRunning || !current.startedAtTimestamp) return;
        const deltaSec = Math.max(
          0,
          Math.floor((Date.now() - current.startedAtTimestamp) / 1000)
        );
        set({
          activeTimer: {
            ...current,
            isRunning: false,
            startedAtTimestamp: null,
            accumulatedSeconds: current.accumulatedSeconds + deltaSec,
          },
        });
      },

      resumeTimer: () => {
        const current = get().activeTimer;
        if (!current || current.isRunning) return;
        set({
          activeTimer: {
            ...current,
            isRunning: true,
            startedAtTimestamp: Date.now(),
          },
        });
      },

      stopTimerAndLog: () => {
        const current = get().activeTimer;
        if (!current) return;
        const extraSec =
          current.isRunning && current.startedAtTimestamp
            ? Math.max(0, Math.floor((Date.now() - current.startedAtTimestamp) / 1000))
            : 0;
        const totalSeconds = current.accumulatedSeconds + extraSec;
        const durationMinutes = Math.max(1, Math.round(totalSeconds / 60));

        if (totalSeconds >= 5) {
          const endedAt = new Date();
          const startedAt = new Date(endedAt.getTime() - totalSeconds * 1000);
          const { masterId, occurrenceDate } = parseTaskIdentity(current.taskId);
          const newLog: TimeLog = {
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            taskId: masterId,
            occurrenceDate: occurrenceDate || undefined,
            startedAt: startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
            durationMinutes,
            type: current.mode === 'pomodoro' ? 'pomodoro' : 'timer',
            isDemo: false,
          };
          set((s) => ({
            timeLogs: [...s.timeLogs, newLog],
            activeTimer: null,
          }));
          get().checkAndUnlockAchievements();
        } else {
          set({ activeTimer: null });
        }
      },

      checkPomodoroCompletion: () => {
        const state = get();
        const timer = state.activeTimer;
        if (
          !timer ||
          timer.mode !== 'pomodoro' ||
          !timer.isRunning ||
          !timer.startedAtTimestamp
        ) {
          return;
        }
        const elapsedSec =
          timer.accumulatedSeconds +
          Math.max(0, Math.floor((Date.now() - timer.startedAtTimestamp) / 1000));

        const targetMinutes =
          timer.pomodoroPhase === 'work'
            ? state.settings.pomodoroWorkMinutes
            : timer.pomodoroPhase === 'shortBreak'
            ? state.settings.pomodoroShortBreakMinutes
            : state.settings.pomodoroLongBreakMinutes;

        if (elapsedSec >= targetMinutes * 60) {
          if (state.settings.soundEnabled !== false) {
            playPomodoroBell();
          }
          const { masterId, occurrenceDate } = parseTaskIdentity(timer.taskId);
          const taskObj = state.tasks.find((t) => t.id === masterId);

          if (state.settings.reminderToggles?.focusSessionEnd !== false) {
            const focusNotif: NotificationItem = {
              id: `notif-focus-${Date.now()}`,
              key: `focus:${Date.now()}`,
              title:
                timer.pomodoroPhase === 'work'
                  ? 'Focus Session Complete!'
                  : 'Break Finished — Ready to Focus',
              body:
                timer.pomodoroPhase === 'work'
                  ? `Logged ${targetMinutes}m on "${taskObj?.title || 'Task'}". Time for a break.`
                  : 'Your break is over. Start your next Pomodoro when ready.',
              type: 'focus',
              taskId: timer.taskId,
              createdAt: new Date().toISOString(),
              scheduledFor: new Date().toISOString(),
              read: false,
              missed: false,
            };
            deliverBrowserNotification(focusNotif);
            set((s) => ({
              notifications: [focusNotif, ...s.notifications],
              activeToast: focusNotif,
            }));
          }

          if (timer.pomodoroPhase === 'work') {
            const endedAt = new Date();
            const startedAt = new Date(endedAt.getTime() - targetMinutes * 60 * 1000);
            const newLog: TimeLog = {
              id: `log-${Date.now()}-pomo`,
              taskId: masterId,
              occurrenceDate: occurrenceDate || undefined,
              startedAt: startedAt.toISOString(),
              endedAt: endedAt.toISOString(),
              durationMinutes: targetMinutes,
              type: 'pomodoro',
              isDemo: false,
            };
            const nextCount = timer.pomodoroSessionCount + 1;
            const nextPhase =
              nextCount % state.settings.pomodoroSessionsBeforeLongBreak === 0
                ? 'longBreak'
                : 'shortBreak';
            set((s) => ({
              timeLogs: [...s.timeLogs, newLog],
              activeTimer: {
                ...timer,
                pomodoroPhase: nextPhase,
                pomodoroSessionCount: nextCount,
                isRunning: false,
                startedAtTimestamp: null,
                accumulatedSeconds: 0,
              },
            }));
            get().checkAndUnlockAchievements();
          } else {
            set({
              activeTimer: {
                ...timer,
                pomodoroPhase: 'work',
                isRunning: false,
                startedAtTimestamp: null,
                accumulatedSeconds: 0,
              },
            });
          }
        }
      },

      addManualTimeLog: (taskId, durationMinutes, dateStr, type = 'manual') => {
        if (durationMinutes <= 0) return;
        const { masterId, occurrenceDate } = parseTaskIdentity(taskId);
        const task = get().tasks.find((t) => t.id === masterId);
        const effectiveDate = dateStr || occurrenceDate || task?.date || get().selectedDate;
        const startIso = `${effectiveDate}T12:00:00.000Z`;
        const endIso = new Date(
          new Date(startIso).getTime() + durationMinutes * 60000
        ).toISOString();
        const newLog: TimeLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          taskId: masterId,
          occurrenceDate: effectiveDate,
          startedAt: startIso,
          endedAt: endIso,
          durationMinutes: Math.round(durationMinutes),
          type,
          isDemo: false,
        };
        set((s) => ({ timeLogs: [...s.timeLogs, newLog] }));
        get().checkAndUnlockAchievements();
      },

      createNote: (partial = {}) => {
        const newNote: Note = {
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: partial.title || 'Untitled Note',
          markdown: partial.markdown ?? '# Untitled Note\n\nStart writing here...',
          folder: partial.folder || 'General',
          tags: partial.tags || [],
          pinned: partial.pinned ?? false,
          linkedTaskId: partial.linkedTaskId,
          linkedDate: partial.linkedDate,
          updatedAt: new Date().toISOString(),
          isDemo: false,
        };
        set((s) => ({
          notes: [newNote, ...s.notes],
          activeNoteId: newNote.id,
        }));
        return newNote;
      },

      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n
          ),
        })),

      deleteNote: (id) =>
        set((s) => ({
          notes: s.notes.filter((n) => n.id !== id),
          activeNoteId:
            s.activeNoteId === id
              ? s.notes.find((n) => n.id !== id)?.id || null
              : s.activeNoteId,
        })),

      togglePinNote: (id) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id
              ? { ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() }
              : n
          ),
        })),

      getOrCreateDailyNote: (date) => {
        const existing = get().notes.find((n) => n.linkedDate === date);
        if (existing) return existing;
        return get().createNote({
          title: `Daily Note — ${date}`,
          markdown: `# Daily Note (${date})\n\n## Brain Dump & Focus\n- [ ] Top priority for today\n\n## Notes & Ideas\n`,
          folder: 'Daily Journal',
          tags: ['daily'],
          linkedDate: date,
        });
      },

      getOrCreateTaskNote: (taskId) => {
        const { masterId } = parseTaskIdentity(taskId);
        const existing = get().notes.find(
          (n) => n.linkedTaskId === taskId || n.linkedTaskId === masterId
        );
        if (existing) return existing;
        const task = get().tasks.find((t) => t.id === masterId);
        const created = get().createNote({
          title: task ? `Notes: ${task.title}` : 'Task Note',
          markdown: `# ${task ? task.title : 'Task Note'}\n\n## Key Steps & Scratchpad\n- [ ] Initial setup\n\n## Reference Notes\n`,
          folder: task?.category ? `${task.category} Notes` : 'Task Notes',
          tags: task?.tags || [],
          linkedTaskId: masterId,
        });
        if (task) {
          get().updateTask(masterId, { linkedNoteId: created.id });
        }
        return created;
      },

      createTaskFromNoteLine: (lineText, date) => {
        const cleaned = lineText
          .replace(/^[-*+]\s*(\[[ xX]\])?\s*/, '')
          .replace(/^#+\s*/, '')
          .trim();
        return get().addTask({
          title: cleaned || 'Task from Note',
          description: `Created from note on ${date}`,
          category: 'Work',
          tags: ['from-note'],
          priority: 'Med',
          important: false,
          urgent: false,
          date,
          estimatedMinutes: get().settings.defaultTaskDurationMinutes,
          status: 'To Do',
          subtasks: [],
          recurrence: 'none',
          reminders: [get().settings.defaultReminderMinutes ?? 10],
        });
      },

      setDailyGoal: (date, dailyGoal) =>
        set((s) => {
          const exists = s.dayReviews.some((r) => r.date === date);
          if (exists) {
            return {
              dayReviews: s.dayReviews.map((r) =>
                r.date === date ? { ...r, dailyGoal, isDemo: false } : r
              ),
            };
          }
          return {
            dayReviews: [
              ...s.dayReviews,
              {
                date,
                dailyGoal,
                wentWell: '',
                didntFinish: '',
                distractions: '',
                toImprove: '',
                isDemo: false,
              },
            ],
          };
        }),

      updateDayReview: (date, patch) =>
        set((s) => {
          const exists = s.dayReviews.some((r) => r.date === date);
          if (exists) {
            return {
              dayReviews: s.dayReviews.map((r) =>
                r.date === date ? { ...r, ...patch, isDemo: false } : r
              ),
            };
          }
          return {
            dayReviews: [
              ...s.dayReviews,
              {
                date,
                dailyGoal: '',
                wentWell: '',
                didntFinish: '',
                distractions: '',
                toImprove: '',
                ...patch,
                isDemo: false,
              },
            ],
          };
        }),

      toggleHabitCheck: (habitId, date) => {
        set((s) => {
          const habit = s.habits.find((h) => h.id === habitId);
          const target = Math.max(1, habit?.targetPerDay || 1);
          const existing = s.habitChecks.find(
            (hc) => hc.habitId === habitId && hc.date === date
          );
          if (existing && existing.completed && existing.status !== 'skipped') {
            return {
              habitChecks: s.habitChecks.filter((hc) => hc.id !== existing.id),
            };
          }
          if (existing) {
            return {
              habitChecks: s.habitChecks.map((hc) =>
                hc.id === existing.id
                  ? {
                      ...hc,
                      count: target,
                      completed: true,
                      status: 'done',
                      isDemo: false,
                    }
                  : hc
              ),
            };
          }
          return {
            habitChecks: [
              ...s.habitChecks,
              {
                id: `hc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                habitId,
                date,
                count: target,
                completed: true,
                status: 'done',
                isDemo: false,
              },
            ],
          };
        });
        get().checkAndUnlockAchievements();
      },

      setHabitCheckCount: (habitId, date, count) => {
        set((s) => {
          const habit = s.habits.find((h) => h.id === habitId);
          const target = Math.max(1, habit?.targetPerDay || 1);
          const cleanCount = Math.max(0, count);
          const isDone = cleanCount >= target;
          const existing = s.habitChecks.find(
            (hc) => hc.habitId === habitId && hc.date === date
          );
          if (cleanCount === 0 && existing) {
            return {
              habitChecks: s.habitChecks.filter((hc) => hc.id !== existing.id),
            };
          }
          if (existing) {
            return {
              habitChecks: s.habitChecks.map((hc) =>
                hc.id === existing.id
                  ? {
                      ...hc,
                      count: cleanCount,
                      completed: isDone,
                      status: 'done',
                      isDemo: false,
                    }
                  : hc
              ),
            };
          }
          return {
            habitChecks: [
              ...s.habitChecks,
              {
                id: `hc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                habitId,
                date,
                count: cleanCount,
                completed: isDone,
                status: 'done',
                isDemo: false,
              },
            ],
          };
        });
        get().checkAndUnlockAchievements();
      },

      toggleHabitSkipRest: (habitId, date) =>
        set((s) => {
          const existing = s.habitChecks.find(
            (hc) => hc.habitId === habitId && hc.date === date
          );
          if (existing?.status === 'skipped') {
            return {
              habitChecks: s.habitChecks.filter((hc) => hc.id !== existing.id),
            };
          }
          if (existing) {
            return {
              habitChecks: s.habitChecks.map((hc) =>
                hc.id === existing.id
                  ? {
                      ...hc,
                      count: 0,
                      completed: false,
                      status: 'skipped',
                      isDemo: false,
                    }
                  : hc
              ),
            };
          }
          return {
            habitChecks: [
              ...s.habitChecks,
              {
                id: `hc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                habitId,
                date,
                count: 0,
                completed: false,
                status: 'skipped',
                isDemo: false,
              },
            ],
          };
        }),

      addHabit: (title, category, frequency, extra = {}) => {
        const newHabit: Habit = {
          id: `habit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: title.trim(),
          icon: extra.icon || '⚡',
          color: extra.color || '#2563EB',
          category,
          frequency,
          customDays: extra.customDays,
          timesPerWeek: extra.timesPerWeek,
          intervalDays: extra.intervalDays,
          targetPerDay: extra.targetPerDay ?? 1,
          unit: extra.unit || 'check-in',
          startDate: extra.startDate || format(new Date(), 'yyyy-MM-dd'),
          restDays: extra.restDays || [],
          reminderTime: extra.reminderTime || extra.reminderTimes?.[0],
          reminderTimes: extra.reminderTimes || (extra.reminderTime ? [extra.reminderTime] : []),
          archived: false,
          createdAt: format(new Date(), 'yyyy-MM-dd'),
          isDemo: false,
        };
        set((s) => ({
          habits: [...s.habits, newHabit],
        }));
        return newHabit;
      },

      updateHabit: (id, patch) =>
        set((s) => ({
          habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch, isDemo: false } : h)),
        })),

      deleteHabit: (id) =>
        set((s) => ({
          habits: s.habits.filter((h) => h.id !== id),
          habitChecks: s.habitChecks.filter((hc) => hc.habitId !== id),
        })),

      archiveHabit: (id, archived) =>
        set((s) => ({
          habits: s.habits.map((h) => (h.id === id ? { ...h, archived } : h)),
        })),

      runReminderTick: (now = new Date()) => {
        const state = get();
        const evalResult = evaluateDueReminders(
          now,
          state.tasks,
          state.habits,
          state.habitChecks,
          state.settings,
          state.firedReminderKeys
        );

        if (evalResult.dueNotifications.length === 0) return;

        const nonMissed = evalResult.dueNotifications.filter((n) => !n.missed);
        let latestToast: NotificationItem | null = state.activeToast;

        if (!evalResult.isQuietHoursNow && nonMissed.length > 0) {
          latestToast = nonMissed[nonMissed.length - 1];
          if (state.settings.soundEnabled !== false) {
            playCompletionChime();
          }
          for (const item of nonMissed) {
            deliverBrowserNotification(item);
          }
        }

        set((s) => ({
          notifications: [...evalResult.dueNotifications.reverse(), ...s.notifications].slice(
            0,
            100
          ),
          firedReminderKeys: [...s.firedReminderKeys, ...evalResult.newFiredKeys].slice(-500),
          activeToast: latestToast,
        }));
      },

      triggerTestNotification: () => {
        const state = get();
        const item: NotificationItem = {
          id: `notif-test-${Date.now()}`,
          key: `test:${Date.now()}`,
          title: 'DayForge Test Notification',
          body: 'Notifications and Web Audio chime are configured and working properly.',
          type: 'system',
          createdAt: new Date().toISOString(),
          scheduledFor: new Date().toISOString(),
          read: false,
          missed: false,
        };
        if (state.settings.soundEnabled !== false) {
          playCompletionChime();
        }
        deliverBrowserNotification(item);
        set((s) => ({
          notifications: [item, ...s.notifications],
          activeToast: item,
        }));
      },

      snoozeNotification: (notif, minutes = 10) => {
        set((s) => ({
          activeToast: s.activeToast?.id === notif.id ? null : s.activeToast,
          notifications: s.notifications.map((n) =>
            n.id === notif.id ? { ...n, read: true } : n
          ),
        }));
        setTimeout(() => {
          const snoozed: NotificationItem = {
            ...notif,
            id: `notif-snooze-${Date.now()}`,
            key: `${notif.key}:snoozed-${Date.now()}`,
            title: `Snoozed Reminder: ${notif.title.replace(/^Upcoming Task:\s*/, '')}`,
            createdAt: new Date().toISOString(),
            read: false,
            missed: false,
          };
          if (get().settings.soundEnabled !== false) {
            playCompletionChime();
          }
          deliverBrowserNotification(snoozed);
          set((s) => ({
            notifications: [snoozed, ...s.notifications],
            activeToast: snoozed,
          }));
        }, Math.max(1, minutes) * 60 * 1000);
      },

      markNotificationRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),

      markAllNotificationsRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),

      clearNotifications: () => set({ notifications: [], activeToast: null }),

      dismissActiveToast: () => set({ activeToast: null }),

      importICSEvents: (previews, mode) => {
        const selected = previews.filter((p) => p.selected);
        if (selected.length === 0) return 0;

        if (mode === 'tasks') {
          selected.forEach((p) => {
            get().addTask(convertPreviewToTaskInput(p));
          });
          return selected.length;
        }

        const extEvents = selected.map((p) => convertPreviewToExternalEvent(p));
        set((s) => ({
          externalEvents: [...s.externalEvents, ...extEvents],
        }));
        return extEvents.length;
      },

      removeExternalEvent: (id) =>
        set((s) => ({
          externalEvents: s.externalEvents.filter((e) => e.id !== id),
        })),

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      clearDemoData: () =>
        set((s) => ({
          tasks: s.tasks.filter((t) => !t.isDemo),
          timeLogs: s.timeLogs.filter((l) => !l.isDemo),
          notes: s.notes.filter((n) => !n.isDemo),
          habits: s.habits.filter((h) => !h.isDemo),
          habitChecks: s.habitChecks.filter((hc) => !hc.isDemo),
          goals: s.goals.filter((g) => !g.isDemo),
          dayReviews: s.dayReviews.filter((r) => !r.isDemo),
          moodLogs: s.moodLogs.filter((m) => !m.isDemo),
          selectedTaskId: null,
        })),

      resetDemoData: () => {
        const fresh = generateSeedData(new Date());
        set((s) => ({
          tasks: [...s.tasks.filter((t) => !t.isDemo), ...fresh.tasks],
          timeLogs: [...s.timeLogs.filter((l) => !l.isDemo), ...fresh.timeLogs],
          notes: [...s.notes.filter((n) => !n.isDemo), ...fresh.notes],
          habits: [...s.habits.filter((h) => !h.isDemo), ...fresh.habits],
          habitChecks: [...s.habitChecks.filter((hc) => !hc.isDemo), ...fresh.habitChecks],
          goals: [...s.goals.filter((g) => !g.isDemo), ...fresh.goals],
          dayReviews: [...s.dayReviews.filter((r) => !r.isDemo), ...fresh.dayReviews],
          moodLogs: [...s.moodLogs.filter((m) => !m.isDemo), ...fresh.moodLogs],
        }));
      },

      exportBackupJson: () => {
        const s = get();
        const payload = {
          schemaVersion: s.schemaVersion,
          exportedAt: new Date().toISOString(),
          tasks: s.tasks,
          timeLogs: s.timeLogs,
          notes: s.notes,
          habits: s.habits,
          habitChecks: s.habitChecks,
          goals: s.goals,
          dayReviews: s.dayReviews,
          weeklyReviews: s.weeklyReviews,
          moodLogs: s.moodLogs,
          taskTemplates: s.taskTemplates,
          dayTemplates: s.dayTemplates,
          savedViews: s.savedViews,
          unlockedAchievements: s.unlockedAchievements,
          categories: s.categories,
          externalEvents: s.externalEvents,
          settings: {
            ...s.settings,
            lastBackupExportAt: new Date().toISOString(),
          },
        };
        set((curr) => ({
          settings: { ...curr.settings, lastBackupExportAt: new Date().toISOString() },
        }));
        return JSON.stringify(payload, null, 2);
      },

      importBackupJson: (rawJson) => {
        try {
          const parsed = JSON.parse(rawJson);
          if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) {
            return {
              ok: false,
              error: 'Invalid DayForge backup file: missing tasks array.',
            };
          }
          const migrated = migrateToPhase3(parsed, parsed.schemaVersion || 1);
          set((s) => ({
            schemaVersion: 3,
            tasks: migrated.tasks || [],
            timeLogs: Array.isArray(migrated.timeLogs) ? migrated.timeLogs : [],
            notes: Array.isArray(migrated.notes) ? migrated.notes : [],
            habits: Array.isArray(migrated.habits) ? migrated.habits : s.habits,
            habitChecks: Array.isArray(migrated.habitChecks)
              ? migrated.habitChecks
              : s.habitChecks,
            goals: Array.isArray(migrated.goals) ? migrated.goals : s.goals,
            dayReviews: Array.isArray(migrated.dayReviews) ? migrated.dayReviews : s.dayReviews,
            weeklyReviews: Array.isArray(migrated.weeklyReviews)
              ? migrated.weeklyReviews
              : s.weeklyReviews,
            moodLogs: Array.isArray(migrated.moodLogs) ? migrated.moodLogs : s.moodLogs,
            taskTemplates: Array.isArray(migrated.taskTemplates)
              ? migrated.taskTemplates
              : s.taskTemplates,
            dayTemplates: Array.isArray(migrated.dayTemplates)
              ? migrated.dayTemplates
              : s.dayTemplates,
            savedViews: Array.isArray(migrated.savedViews)
              ? migrated.savedViews
              : s.savedViews,
            unlockedAchievements: Array.isArray(migrated.unlockedAchievements)
              ? migrated.unlockedAchievements
              : s.unlockedAchievements,
            categories: Array.isArray(migrated.categories) ? migrated.categories : s.categories,
            externalEvents: Array.isArray(migrated.externalEvents)
              ? migrated.externalEvents
              : s.externalEvents,
            settings: migrated.settings ? { ...s.settings, ...migrated.settings } : s.settings,
          }));
          return { ok: true };
        } catch (err: any) {
          return { ok: false, error: err?.message || 'Failed to parse JSON backup.' };
        }
      },
    }),
    {
      name: 'dayforge-storage-v1',
      version: 3,
      migrate: (persistedState, version) => migrateToPhase3(persistedState, version),
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        tasks: state.tasks,
        timeLogs: state.timeLogs,
        notes: state.notes,
        habits: state.habits,
        habitChecks: state.habitChecks,
        goals: state.goals,
        dayReviews: state.dayReviews,
        weeklyReviews: state.weeklyReviews,
        moodLogs: state.moodLogs,
        taskTemplates: state.taskTemplates,
        dayTemplates: state.dayTemplates,
        savedViews: state.savedViews,
        unlockedAchievements: state.unlockedAchievements,
        categories: state.categories,
        settings: state.settings,
        activeTimer: state.activeTimer,
        externalEvents: state.externalEvents,
        notifications: state.notifications,
        firedReminderKeys: state.firedReminderKeys,
        selectedDate: state.selectedDate,
        activeSavedViewId: state.activeSavedViewId,
        centerViewMode: state.centerViewMode,
        rightNoteMode: state.rightNoteMode,
        isRightPaneOpen: state.isRightPaneOpen,
        rightPaneWidth: state.rightPaneWidth,
      }),
    }
  )
);
