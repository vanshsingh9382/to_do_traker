import React, { useState, useEffect, useRef, useMemo } from 'react';
import { addDays, format, parseISO, subDays } from 'date-fns';
import {
  Sun,
  Moon,
  Calendar,
  CheckSquare,
  Repeat,
  FileText,
  BarChart3,
  BookOpen,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ChevronLeft,
  ChevronRight,
  Flame,
  Sparkles,
  ArrowRight,
  Trash2,
  Plus,
  List,
  Clock,
  Brain,
  Grid,
  Target,
  Award,
  FileSpreadsheet,
  Search,
  Wand2,
  Pin,
} from 'lucide-react';
import { useDayForgeStore, NavSection } from './store/useDayForgeStore';
import { computeDayScore, computeStreaksAndSummary } from './lib/analyticsEngine';
import { expandTasksForDate } from './lib/recurrenceEngine';
import { QuickAddBar } from './features/tasks/QuickAddBar';
import { TaskListView } from './features/tasks/TaskListView';
import { HourlyTimelineView } from './features/tasks/HourlyTimelineView';
import { TaskDetailModal } from './features/tasks/TaskDetailModal';
import { EisenhowerMatrixPage } from './features/tasks/EisenhowerMatrixPage';
import { AllTasksWorkspacePage } from './features/tasks/AllTasksWorkspacePage';
import {
  SmartLoadHeaderBadge,
  ConflictWarningsBanner,
  ReplanDayModal,
  UndoToastBanner,
} from './features/tasks/SmartPlanningModals';
import {
  DailyWrapUpModal,
  ReviewsWorkspacePage,
} from './features/reviews/ReviewsAndWrapUpSection';
import { GoalsAndTemplatesPage } from './features/goals/GoalsAndTemplatesPage';
import {
  TodayMotivationAndFocusStrip,
  AchievementsWorkspacePage,
  ReportsAndExportPage,
} from './features/achievements/MoodAchievementsAndReports';
import {
  CommandPaletteModal,
  ShortcutsCheatSheetModal,
  useGlobalKeyboardShortcuts,
} from './components/ui/CommandPaletteAndShortcuts';
import { ActiveFocusBar } from './features/timer/ActiveFocusBar';
import { NotesPanel } from './features/notes/NotesPanel';
import { AnalyticsDashboard } from './features/analytics/AnalyticsDashboard';
import { CalendarPage } from './features/calendar/CalendarPage';
import {
  TodayHabitsCard,
  HabitsWorkspaceView,
} from './features/habits/HabitsSection';
import {
  DeepThinkingPlannerModal,
  SettingsWorkspaceView,
} from './features/calendar/CalendarAndSettingsViews';
import {
  usePWAAndReminders,
  PWAInstallButton,
  NotificationCenterBell,
  FloatingAlertsAndBanners,
} from './components/ui/PWAInstallAndNotifications';
import { Task } from './types';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getAvailableWorkMinutes(startStr: string, endStr: string): number {
  const [sh, sm] = (startStr || '08:00').split(':').map(Number);
  const [eh, em] = (endStr || '20:00').split(':').map(Number);
  const diff = eh * 60 + (em || 0) - (sh * 60 + (sm || 0));
  return diff > 0 ? diff : 720;
}

export default function App() {
  const tasks = useDayForgeStore((s) => s.tasks);
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const categories = useDayForgeStore((s) => s.categories);
  const dayReviews = useDayForgeStore((s) => s.dayReviews);
  const savedViews = useDayForgeStore((s) => s.savedViews);
  const activeSavedViewId = useDayForgeStore((s) => s.activeSavedViewId);
  const setActiveSavedViewId = useDayForgeStore((s) => s.setActiveSavedViewId);
  const settings = useDayForgeStore((s) => s.settings);
  const updateSettings = useDayForgeStore((s) => s.updateSettings);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const setSelectedDate = useDayForgeStore((s) => s.setSelectedDate);
  const activeNav = useDayForgeStore((s) => s.activeNav);
  const setActiveNav = useDayForgeStore((s) => s.setActiveNav);
  const centerViewMode = useDayForgeStore((s) => s.centerViewMode);
  const setCenterViewMode = useDayForgeStore((s) => s.setCenterViewMode);
  const isSidebarCollapsed = useDayForgeStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useDayForgeStore((s) => s.toggleSidebar);
  const isRightPaneOpen = useDayForgeStore((s) => s.isRightPaneOpen);
  const toggleRightPane = useDayForgeStore((s) => s.toggleRightPane);
  const rightPaneWidth = useDayForgeStore((s) => s.rightPaneWidth);
  const setRightPaneWidth = useDayForgeStore((s) => s.setRightPaneWidth);
  const setWrapUpModalOpen = useDayForgeStore((s) => s.setWrapUpModalOpen);
  const setReplanModalOpen = useDayForgeStore((s) => s.setReplanModalOpen);
  const setCommandPaletteOpen = useDayForgeStore((s) => s.setCommandPaletteOpen);
  const clearDemoData = useDayForgeStore((s) => s.clearDemoData);
  const carryForwardTasks = useDayForgeStore((s) => s.carryForwardTasks);
  const setDailyGoal = useDayForgeStore((s) => s.setDailyGoal);
  const addTask = useDayForgeStore((s) => s.addTask);

  const {
    swNote,
    updateAvailable,
    applyServiceWorkerUpdate,
    isInstalled,
    isOnline,
    triggerInstallPrompt,
  } = usePWAAndReminders();

  const [inspectedTask, setInspectedTask] = useState<Task | null>(null);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [dismissedCarryForward, setDismissedCarryForward] = useState(false);
  const quickAddInputRef = useRef<HTMLInputElement | null>(null);
  const isResizingRightPane = useRef(false);

  const handleOpenNewTaskModal = () => {
    const created = addTask({
      title: 'New Task',
      description: '',
      category: 'Work',
      tags: [],
      priority: 'Med',
      important: false,
      urgent: false,
      date: selectedDate,
      start: '10:00',
      end: '10:45',
      estimatedMinutes: settings.defaultTaskDurationMinutes,
      status: 'To Do',
      subtasks: [],
      recurrence: 'none',
      reminders: [10],
    });
    setInspectedTask(created);
  };

  // Register global keyboard shortcuts (disabled inside inputs/editors)
  useGlobalKeyboardShortcuts(handleOpenNewTaskModal);

  const isDarkMode = useMemo(() => {
    if (settings.theme === 'dark') return true;
    if (settings.theme === 'light') return false;
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  }, [settings.theme]);

  // Sync theme with <html class="dark">
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Handle draggable right divider
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRightPane.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setRightPaneWidth(newWidth);
    };
    const handleMouseUp = () => {
      isResizingRightPane.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setRightPaneWidth]);

  const hasDemoItems = useMemo(() => tasks.some((t) => t.isDemo), [tasks]);

  // Expand recurring tasks on the fly for the selected date
  const dayTasks = useMemo(
    () => expandTasksForDate(tasks, selectedDate),
    [tasks, selectedDate]
  );

  // Yesterday's unfinished tasks for Carry Forward approval banner
  const yesterdayStr = useMemo(
    () => format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'),
    [selectedDate]
  );

  const yesterdayUnfinished = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.date === yesterdayStr &&
          (t.status === 'To Do' || t.status === 'In Progress')
      ),
    [tasks, yesterdayStr]
  );

  const dayBreakdown = useMemo(
    () => computeDayScore(selectedDate, tasks, timeLogs, settings),
    [selectedDate, tasks, timeLogs, settings]
  );

  const streakSummary = useMemo(
    () => computeStreaksAndSummary(selectedDate, tasks, timeLogs, settings),
    [selectedDate, tasks, timeLogs, settings]
  );

  const availableWorkMinutes = getAvailableWorkMinutes(
    settings.workDayStart,
    settings.workDayEnd
  );
  const unallocatedMinutes = Math.max(
    0,
    availableWorkMinutes - dayBreakdown.plannedMinutes
  );
  const timeLeftPct = Math.min(
    100,
    Math.round((unallocatedMinutes / availableWorkMinutes) * 100)
  );

  const currentReview = dayReviews.find((r) => r.date === selectedDate);
  const pinnedViews = useMemo(
    () => savedViews.filter((v) => v.pinnedToSidebar),
    [savedViews]
  );

  const navItems: Array<{ id: NavSection; label: string; icon: React.ReactNode }> = [
    { id: 'today', label: 'Today', icon: <Sun className="w-4 h-4" /> },
    { id: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" /> },
    { id: 'tasks', label: 'All Tasks', icon: <CheckSquare className="w-4 h-4" /> },
    { id: 'matrix', label: 'Eisenhower Matrix', icon: <Grid className="w-4 h-4" /> },
    { id: 'habits', label: 'Habits', icon: <Repeat className="w-4 h-4" /> },
    { id: 'goals', label: 'Goals & Templates', icon: <Target className="w-4 h-4" /> },
    { id: 'notes', label: 'Notes', icon: <FileText className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'reviews', label: 'Reviews', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'achievements', label: 'Achievements', icon: <Award className="w-4 h-4" /> },
    { id: 'reports', label: 'Reports & CSV', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden print:h-auto print:overflow-visible">
      {/* Main 3-Pane Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden print:block print:overflow-visible">
        {/* Pane 1: Collapsible Left Sidebar (Desktop/Tablet) */}
        <aside
          aria-label="Primary Sidebar Navigation"
          className={`hidden md:flex print:hidden flex-col justify-between bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all shrink-0 ${
            isSidebarCollapsed ? 'w-16' : 'w-60'
          }`}
        >
          <div className="p-3 space-y-4 overflow-y-auto">
            {/* Brand Header */}
            <div className="flex items-center justify-between px-1.5 py-1">
              {!isSidebarCollapsed && (
                <div>
                  <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                    DayForge
                  </span>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Own Your Time.
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Navigation Links */}
            <nav aria-label="Main sections" className="space-y-0.5">
              {navItems.map((item) => {
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`nav-${item.id}`}
                    onClick={() => setActiveNav(item.id)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                    title={item.label}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {!isSidebarCollapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Pinned Saved Views */}
            {!isSidebarCollapsed && pinnedViews.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
                <div className="px-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                  Pinned Views
                </div>
                {pinnedViews.map((pv) => (
                  <button
                    key={pv.id}
                    type="button"
                    data-testid={`sidebar-pinned-view-${pv.id}`}
                    onClick={() => {
                      setActiveSavedViewId(pv.id);
                      setActiveNav('tasks');
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      activeNav === 'tasks' && activeSavedViewId === pv.id
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Pin className="w-3 h-3 shrink-0 text-blue-500" />
                    <span className="truncate">{pv.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Category Tags List */}
            {!isSidebarCollapsed && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <div className="px-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                  Categories
                </div>
                {categories.map((cat) => {
                  const catTaskCount = dayTasks.filter(
                    (t) => t.category === cat.name && t.status !== 'Skipped'
                  ).length;
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-xs shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span>{cat.name}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        {catTaskCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Score, Streak & Install App Widget */}
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            {isSidebarCollapsed ? (
              <div className="flex flex-col items-center gap-1 text-xs font-mono font-bold text-blue-600">
                <span>{dayBreakdown.productivityScore ?? '—'}</span>
                <span className="text-amber-500">{streakSummary.currentStreak}d</span>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">
                      Today&apos;s Score
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                      {dayBreakdown.productivityScore !== null
                        ? `${dayBreakdown.productivityScore}/100`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-amber-500" /> Streak
                    </span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                      {streakSummary.currentStreak} days
                    </span>
                  </div>
                </div>
                <PWAInstallButton
                  compact
                  onTriggerInstall={triggerInstallPrompt}
                  isInstalled={isInstalled}
                />
              </>
            )}
          </div>
        </aside>

        {/* Pane 2: Center Main Workspace */}
        <main className="flex-1 min-w-0 flex flex-col overflow-y-auto pb-20 md:pb-8 print:overflow-visible print:pb-0">
          {/* Demo Data Banner */}
          {hasDemoItems && (
            <div className="bg-blue-50/90 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900/60 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs print:hidden">
              <div className="flex items-center gap-2 text-blue-950 dark:text-blue-200">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>
                  <strong>Demo Data Active:</strong> 3 weeks of sample tasks, focus sessions, and notes are loaded so you can explore charts immediately. Clearing demo data keeps your own entries untouched.
                </span>
              </div>
              <button
                type="button"
                onClick={clearDemoData}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Clear demo data
              </button>
            </div>
          )}

          {/* Top Contextual Header */}
          <header className="px-4 md:px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 print:hidden">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {getGreeting()}, {settings.name}
                </h1>
                <SmartLoadHeaderBadge dateStr={selectedDate} compact />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')} · Timezone{' '}
                {settings.timezone}
              </p>
            </div>

            {/* Date Switcher + Command Palette + Wrap Up + Replan + AI Architect + Notification Bell + Dark Mode + Notes Toggle */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="open-command-palette-btn"
                onClick={() => setCommandPaletteOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                title="Command Palette & Global Search (Ctrl/Cmd + K)"
              >
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="px-1 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  ⌘K
                </kbd>
              </button>

              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDate(
                      format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd')
                    )
                  }
                  aria-label="Previous day"
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                  className="px-2.5 py-1 font-medium text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 rounded-md cursor-pointer"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDate(
                      format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd')
                    )
                  }
                  aria-label="Next day"
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                data-testid="replan-day-btn"
                onClick={() => setReplanModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/70 hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5 text-amber-600" />
                Replan my day
              </button>

              <button
                type="button"
                data-testid="wrap-up-day-btn"
                onClick={() => setWrapUpModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Wrap up day
              </button>

              <button
                type="button"
                onClick={() => setIsAIModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Brain className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden xl:inline">AI Schedule Architect</span>
              </button>

              {/* Notification Centre Bell */}
              <NotificationCenterBell />

              {/* Dark Mode Toggle Switch in Navbar */}
              <button
                type="button"
                role="switch"
                aria-checked={isDarkMode}
                aria-label="Toggle dark mode"
                onClick={() =>
                  updateSettings({ theme: isDarkMode ? 'light' : 'dark' })
                }
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkMode ? (
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span className="hidden sm:inline">
                  {isDarkMode ? 'Dark' : 'Light'}
                </span>
                <span
                  className={`w-7 h-4 flex items-center rounded-full p-0.5 transition-colors ${
                    isDarkMode ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`bg-white w-3 h-3 rounded-full shadow-2xs transform transition-transform ${
                      isDarkMode ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>

              <button
                type="button"
                onClick={toggleRightPane}
                aria-label={isRightPaneOpen ? 'Hide Notes Panel' : 'Show Notes Panel'}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isRightPaneOpen ? (
                  <>
                    <PanelRightClose className="w-3.5 h-3.5" /> Hide Notes
                  </>
                ) : (
                  <>
                    <PanelRightOpen className="w-3.5 h-3.5" /> Show Notes
                  </>
                )}
              </button>
            </div>
          </header>

          {/* Daily Motivation, Focus Target Bars & Mood/Energy Check-in Strip on Today */}
          {activeNav === 'today' && <TodayMotivationAndFocusStrip />}

          {/* Main Content Body */}
          <div className="p-4 md:p-6 space-y-5 max-w-6xl w-full mx-auto">
            {activeNav === 'today' && (
              <>
                {/* Schedule Conflict Warnings Banner with 1-Click Free-Slot Fix */}
                <ConflictWarningsBanner dateStr={selectedDate} />

                {/* Daily Goal Bar */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                    Daily Goal:
                  </span>
                  <input
                    type="text"
                    aria-label="Daily goal for selected date"
                    value={currentReview?.dailyGoal || ''}
                    onChange={(e) => setDailyGoal(selectedDate, e.target.value)}
                    placeholder="Set your #1 outcome for today..."
                    className="flex-1 bg-transparent text-xs md:text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>

                {/* Today KPI Strip + Time Left Today Bar */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Tasks Execution
                    </div>
                    <div className="mt-1 text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                      {dayBreakdown.completedCount}/{dayBreakdown.activePlannedCount}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                      {dayBreakdown.pendingCount} pending · {dayBreakdown.completionRate}% done
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Focused vs. Planned
                    </div>
                    <div className="mt-1 text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                      {Math.floor(dayBreakdown.actualMinutes / 60)}h{' '}
                      {dayBreakdown.actualMinutes % 60}m
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                      of {Math.floor(dayBreakdown.plannedMinutes / 60)}h{' '}
                      {dayBreakdown.plannedMinutes % 60}m planned work
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Productivity Score
                    </div>
                    <div className="mt-1 text-xl font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums">
                      {dayBreakdown.productivityScore !== null
                        ? `${dayBreakdown.productivityScore}/100`
                        : '—'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                      {dayBreakdown.goalMet
                        ? 'Daily goal threshold met'
                        : `Target ≥ ${settings.goalThresholdScore}`}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Unallocated Time Left</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                        {Math.floor(unallocatedMinutes / 60)}h {unallocatedMinutes % 60}m
                      </span>
                    </div>
                    <div className="mt-2.5 w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-teal-600 transition-all"
                        style={{ width: `${timeLeftPct}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                      Workday {settings.workDayStart}–{settings.workDayEnd} ({Math.round(availableWorkMinutes / 60)}h capacity)
                    </div>
                  </div>
                </div>

                {/* Today's Habits Card with SVG Progress Ring */}
                <TodayHabitsCard />

                {/* Carry-Forward Approval Banner for Yesterday's Unfinished Tasks */}
                {!dismissedCarryForward && yesterdayUnfinished.length > 0 && (
                  <div className="bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-amber-950 dark:text-amber-200">
                        {yesterdayUnfinished.length} unfinished task
                        {yesterdayUnfinished.length > 1 ? 's' : ''} from yesterday (
                        {yesterdayStr})
                      </div>
                      <div className="text-amber-800 dark:text-amber-300/90">
                        {yesterdayUnfinished.map((t) => t.title).join(' · ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          carryForwardTasks(
                            yesterdayUnfinished.map((t) => t.id),
                            selectedDate
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors cursor-pointer"
                      >
                        Carry Forward to Today
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedCarryForward(true)}
                        className="px-2.5 py-1.5 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer"
                      >
                        Keep on Yesterday
                      </button>
                    </div>
                  </div>
                )}

                {/* Natural Language Quick Add Bar */}
                <QuickAddBar inputRef={quickAddInputRef} />

                {/* View Mode Switcher: List vs Hourly Timeline */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setCenterViewMode('list')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        centerViewMode === 'list'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      List View
                    </button>
                    <button
                      type="button"
                      onClick={() => setCenterViewMode('timeline')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        centerViewMode === 'timeline'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Hourly Timeline (06:00–23:00)
                    </button>
                  </div>

                  <span className="text-xs text-slate-400 hidden sm:inline">
                    Shortcuts: Q Quick-Add · Ctrl/Cmd+K Palette · ? Help
                  </span>
                </div>

                {/* Task Engine View */}
                {centerViewMode === 'list' ? (
                  <TaskListView
                    tasks={dayTasks}
                    onInspectTask={(t) => setInspectedTask(t)}
                    onOpenNewTaskModal={handleOpenNewTaskModal}
                  />
                ) : (
                  <HourlyTimelineView
                    tasks={dayTasks}
                    onInspectTask={(t) => setInspectedTask(t)}
                  />
                )}
              </>
            )}

            {activeNav === 'tasks' && (
              <AllTasksWorkspacePage
                onInspectTask={(t) => setInspectedTask(t)}
                onOpenNewTaskModal={handleOpenNewTaskModal}
              />
            )}

            {activeNav === 'matrix' && (
              <EisenhowerMatrixPage onInspectTask={(t) => setInspectedTask(t)} />
            )}

            {activeNav === 'goals' && <GoalsAndTemplatesPage />}

            {activeNav === 'analytics' && <AnalyticsDashboard />}

            {activeNav === 'calendar' && (
              <CalendarPage onInspectTask={(t) => setInspectedTask(t)} />
            )}

            {activeNav === 'habits' && <HabitsWorkspaceView />}

            {activeNav === 'reviews' && <ReviewsWorkspacePage />}

            {activeNav === 'achievements' && <AchievementsWorkspacePage />}

            {activeNav === 'reports' && <ReportsAndExportPage />}

            {activeNav === 'settings' && (
              <SettingsWorkspaceView
                swNote={swNote}
                isInstalled={isInstalled}
                onTriggerInstall={triggerInstallPrompt}
              />
            )}

            {activeNav === 'notes' && (
              <div className="h-[680px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <NotesPanel />
              </div>
            )}
          </div>
        </main>

        {/* Pane 3: Resizable Side-by-Side Notes Panel (Desktop) */}
        {isRightPaneOpen && activeNav !== 'notes' && activeNav !== 'reports' && (
          <div
            className="hidden lg:flex print:hidden h-full shrink-0 relative"
            style={{ width: `${rightPaneWidth}px` }}
          >
            {/* Draggable vertical resize handle */}
            <div
              onMouseDown={() => {
                isResizingRightPane.current = true;
              }}
              title="Drag to resize notes panel"
              className="w-1.5 h-full cursor-col-resize bg-transparent hover:bg-blue-500/40 transition-colors z-20"
            />
            <div className="flex-1 h-full min-w-0">
              <NotesPanel />
            </div>
          </div>
        )}
      </div>

      {/* Mobile Floating Quick Add Button + Bottom Tab Bar */}
      <button
        type="button"
        onClick={handleOpenNewTaskModal}
        aria-label="Quick Add Task"
        className="md:hidden print:hidden fixed bottom-16 right-4 z-30 w-11 h-11 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center cursor-pointer"
      >
        <Plus className="w-5 h-5" />
      </button>

      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden print:hidden fixed bottom-0 left-0 right-0 h-14 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around z-30 px-2"
      >
        {[
          { id: 'today' as NavSection, label: 'Today', icon: <Sun className="w-4 h-4" /> },
          {
            id: 'tasks' as NavSection,
            label: 'Tasks',
            icon: <CheckSquare className="w-4 h-4" />,
          },
          {
            id: 'matrix' as NavSection,
            label: 'Matrix',
            icon: <Grid className="w-4 h-4" />,
          },
          {
            id: 'calendar' as NavSection,
            label: 'Calendar',
            icon: <Calendar className="w-4 h-4" />,
          },
          {
            id: 'analytics' as NavSection,
            label: 'Stats',
            icon: <BarChart3 className="w-4 h-4" />,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveNav(tab.id)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[11px] font-medium cursor-pointer ${
              activeNav === tab.id
                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {tab.icon}
            <span className="mt-0.5">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Active Timer Floating Bar & Zen Mode */}
      <ActiveFocusBar />

      {/* Task Detail Drawer / Modal */}
      <TaskDetailModal task={inspectedTask} onClose={() => setInspectedTask(null)} />

      {/* Daily Wrap-Up 4-Step Sunsama-style Ritual Modal */}
      <DailyWrapUpModal />

      {/* Smart Replan Preview & Approval Modal */}
      <ReplanDayModal />

      {/* Command Palette & Global Search Modal */}
      <CommandPaletteModal onOpenNewTaskModal={handleOpenNewTaskModal} />

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      <ShortcutsCheatSheetModal />

      {/* Undo Toast Banner for Bulk / Replan / Wrap-Up Mutations */}
      <UndoToastBanner />

      {/* Deep-Thinking AI Schedule Architect Modal */}
      <DeepThinkingPlannerModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
      />

      {/* Offline Banner, SW Update Toast & Active Reminder Toasts */}
      <FloatingAlertsAndBanners
        isOnline={isOnline}
        updateAvailable={updateAvailable}
        onApplyUpdate={applyServiceWorkerUpdate}
      />
    </div>
  );
}
