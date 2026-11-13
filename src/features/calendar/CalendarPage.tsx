import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Copy,
  Check,
  AlertTriangle,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { expandTasksForDate, expandTasksForRange } from '../../lib/recurrenceEngine';
import { detectOverlappingTaskIds } from '../../lib/analyticsEngine';
import {
  buildGoogleCalendarTemplateUrl,
  disconnectGoogleCalendar,
  exportTasksToICS,
  fetchGoogleCalendarEventsForRange,
  fetchUserCalendars,
  getConfiguredGoogleClientId,
  hasGoogleClientIdConfigured,
  initGoogleCalendarAuth,
  signInWithGoogleCalendar,
  syncTaskToGoogleCalendar,
} from '../../lib/googleCalendar';
import { parseICSContent, ParsedICSEventPreview } from '../../lib/icsEngine';
import { GoogleCalendarListEntry, Task } from '../../types';
import { SmartLoadHeaderBadge } from '../tasks/SmartPlanningModals';

type CalendarViewMode = 'day' | 'week' | 'month';
type ICSExportScope = 'day' | 'week' | 'upcoming' | 'single';

const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_HEIGHT_PX = 60; // 60px per hour => 1px per minute!

function timeToMinutesFrom6AM(timeStr: string): number {
  const [h, m] = (timeStr || '09:00').split(':').map(Number);
  return (h - START_HOUR) * 60 + (m || 0);
}

function minutesFrom6AMToTimeStr(minsFrom6AM: number): string {
  const snapped = Math.round(minsFrom6AM / 15) * 15;
  const totalMins = Math.max(START_HOUR * 60, Math.min(23 * 60 + 45, START_HOUR * 60 + snapped));
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const CalendarPage: React.FC<{
  onInspectTask: (task: Task) => void;
}> = ({ onInspectTask }) => {
  const tasks = useDayForgeStore((s) => s.tasks);
  const categories = useDayForgeStore((s) => s.categories);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const setSelectedDate = useDayForgeStore((s) => s.setSelectedDate);
  const settings = useDayForgeStore((s) => s.settings);
  const updateSettings = useDayForgeStore((s) => s.updateSettings);
  const googleEvents = useDayForgeStore((s) => s.googleEvents);
  const setGoogleEvents = useDayForgeStore((s) => s.setGoogleEvents);
  const externalEvents = useDayForgeStore((s) => s.externalEvents);
  const lastGoogleSyncAt = useDayForgeStore((s) => s.lastGoogleSyncAt);
  const setLastGoogleSyncAt = useDayForgeStore((s) => s.setLastGoogleSyncAt);
  const addTask = useDayForgeStore((s) => s.addTask);
  const updateTask = useDayForgeStore((s) => s.updateTask);
  const setTaskStatus = useDayForgeStore((s) => s.setTaskStatus);
  const moveOrResizeTaskOnCalendar = useDayForgeStore((s) => s.moveOrResizeTaskOnCalendar);
  const importICSEvents = useDayForgeStore((s) => s.importICSEvents);

  const [viewMode, setViewMode] = useState<CalendarViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'
  );
  const [now, setNow] = useState(new Date());

  // Google Calendar state
  const [isConnected, setIsConnected] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isLoadingGCal, setIsLoadingGCal] = useState(false);
  const [clientIdInput, setClientIdInput] = useState(settings.googleClientId || '');
  const [copiedOrigin, setCopiedOrigin] = useState(false);

  // .ICS Export & Import state
  const [exportScope, setExportScope] = useState<ICSExportScope>('week');
  const [icsPreviews, setIcsPreviews] = useState<ParsedICSEventPreview[]>([]);
  const [showIcsModal, setShowIcsModal] = useState(false);
  const [rawIcsText, setRawIcsText] = useState('');

  // Drag & Resize state
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [resizingState, setResizingState] = useState<{
    task: Task;
    startY: number;
    origEndMin: number;
    startMin: number;
  } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode((prev) => (prev === 'week' ? 'day' : prev));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 2 * HOUR_HEIGHT_PX; // scroll to 08:00
    }
  }, [viewMode]);

  useEffect(() => {
    const unsub = initGoogleCalendarAuth(
      (user) => {
        setIsConnected(true);
        setUserEmail(user.email || user.displayName || 'Connected Account');
      },
      () => {
        setIsConnected(false);
        setUserEmail(null);
      }
    );
    return () => unsub();
  }, []);

  // Compute visible date range based on viewMode
  const { rangeStartStr, rangeEndStr, visibleDays } = useMemo(() => {
    const ref = parseISO(selectedDate);
    if (viewMode === 'day') {
      return {
        rangeStartStr: selectedDate,
        rangeEndStr: selectedDate,
        visibleDays: [selectedDate],
      };
    }
    if (viewMode === 'week') {
      const start = startOfWeek(ref, { weekStartsOn: 1 }); // Mon-Sun
      const end = endOfWeek(ref, { weekStartsOn: 1 });
      const days = eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'));
      return {
        rangeStartStr: days[0],
        rangeEndStr: days[days.length - 1],
        visibleDays: days,
      };
    }
    const mStart = startOfWeek(startOfMonth(ref), { weekStartsOn: 1 });
    const mEnd = endOfWeek(endOfMonth(ref), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: mStart, end: mEnd }).map((d) =>
      format(d, 'yyyy-MM-dd')
    );
    return {
      rangeStartStr: days[0],
      rangeEndStr: days[days.length - 1],
      visibleDays: days,
    };
  }, [selectedDate, viewMode]);

  // All combined external events (Google + .ics imported) excluding duplicates created by DayForge
  const allExternalEvents = useMemo(() => {
    const taskGoogleIds = new Set(tasks.map((t) => t.googleEventId).filter(Boolean));
    const taskMasterIds = new Set(tasks.map((t) => t.id));
    const filteredGoogle = googleEvents.filter(
      (ev) =>
        !taskGoogleIds.has(ev.id) &&
        (!ev.dayforgeTaskId || !taskMasterIds.has(ev.dayforgeTaskId))
    );
    return [...filteredGoogle, ...externalEvents];
  }, [googleEvents, externalEvents, tasks]);

  const handleNavigate = (dir: 'prev' | 'next' | 'today') => {
    if (dir === 'today') {
      setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
      return;
    }
    const ref = parseISO(selectedDate);
    const delta = dir === 'next' ? 1 : -1;
    if (viewMode === 'day') {
      setSelectedDate(format(delta > 0 ? addDays(ref, 1) : subDays(ref, 1), 'yyyy-MM-dd'));
    } else if (viewMode === 'week') {
      setSelectedDate(format(delta > 0 ? addWeeks(ref, 1) : subWeeks(ref, 1), 'yyyy-MM-dd'));
    } else {
      setSelectedDate(format(delta > 0 ? addMonths(ref, 1) : subMonths(ref, 1), 'yyyy-MM-dd'));
    }
  };

  // Bottom-edge resize mouse move listener
  useEffect(() => {
    if (!resizingState) return;
    const onMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizingState.startY;
      const newEndMin = Math.max(
        resizingState.startMin + 15,
        Math.round((resizingState.origEndMin + deltaY) / 15) * 15
      );
      const newEndStr = minutesFrom6AMToTimeStr(newEndMin);
      const newDuration = Math.max(15, newEndMin - resizingState.startMin);
      moveOrResizeTaskOnCalendar(
        resizingState.task,
        resizingState.task.date,
        resizingState.task.start || '09:00',
        newEndStr,
        newDuration
      );
    };
    const onMouseUp = () => {
      setResizingState(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [resizingState, moveOrResizeTaskOnCalendar]);

  const handleDropOnSlot = async (targetDateStr: string, offsetMinutesFrom6AM: number) => {
    if (!draggedTask) return;
    const duration = Math.max(15, draggedTask.estimatedMinutes || 45);
    const newStartStr = minutesFrom6AMToTimeStr(offsetMinutesFrom6AM);
    const [sh, sm] = newStartStr.split(':').map(Number);
    const startTotal = sh * 60 + sm;
    const endTotal = Math.min(23 * 60 + 59, startTotal + duration);
    const newEndStr = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(
      endTotal % 60
    ).padStart(2, '0')}`;

    moveOrResizeTaskOnCalendar(draggedTask, targetDateStr, newStartStr, newEndStr, duration);
    const updatedTask: Task = {
      ...draggedTask,
      date: targetDateStr,
      start: newStartStr,
      end: newEndStr,
      estimatedMinutes: duration,
    };
    setDraggedTask(null);

    if (isConnected && (updatedTask.googleEventId || settings.autoSyncToGoogle)) {
      try {
        const res = await syncTaskToGoogleCalendar(
          updatedTask,
          settings.selectedGoogleCalendarId || 'primary',
          settings.timezone
        );
        updateTask(updatedTask.id, {
          googleEventId: res.eventId,
          googleCalendarId: res.calendarId,
          googleSyncState: 'synced',
        });
      } catch (err: any) {
        updateTask(updatedTask.id, {
          googleSyncState: 'error',
          googleSyncError: err?.message,
        });
      }
    }
  };

  const handleEmptySlotClick = async (dateStr: string, hour: number) => {
    const start = `${String(hour).padStart(2, '0')}:00`;
    const dur = settings.defaultTaskDurationMinutes || 45;
    const totalEnd = hour * 60 + dur;
    const end = `${String(Math.min(23, Math.floor(totalEnd / 60))).padStart(2, '0')}:${String(
      totalEnd % 60
    ).padStart(2, '0')}`;

    const created = addTask({
      title: `Planned Block (${start})`,
      description: '',
      category: 'Work',
      tags: [],
      priority: 'Med',
      important: false,
      urgent: false,
      date: dateStr,
      start,
      end,
      estimatedMinutes: dur,
      status: 'To Do',
      subtasks: [],
      recurrence: 'none',
      reminders: [settings.defaultReminderMinutes ?? 10],
    });

    if (isConnected && settings.autoSyncToGoogle) {
      try {
        const res = await syncTaskToGoogleCalendar(
          created,
          settings.selectedGoogleCalendarId || 'primary',
          settings.timezone
        );
        updateTask(created.id, {
          googleEventId: res.eventId,
          googleCalendarId: res.calendarId,
          googleSyncState: 'synced',
        });
      } catch {
        // ignore auto-sync failure
      }
    }

    onInspectTask(created);
  };

  // Google Calendar actions
  const handleConnectGoogle = async (overrideClientId?: string) => {
    setIsLoadingGCal(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const effectiveId = overrideClientId || getConfiguredGoogleClientId(settings);
      const res = await signInWithGoogleCalendar(effectiveId || undefined);
      if (res) {
        setIsConnected(true);
        setUserEmail(res.user.email || res.user.displayName || 'Connected Account');
        const cals = await fetchUserCalendars();
        setCalendars(cals);
        const evs = await fetchGoogleCalendarEventsForRange(
          rangeStartStr,
          rangeEndStr,
          settings.selectedGoogleCalendarId || 'primary'
        );
        setGoogleEvents(evs);
        const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastGoogleSyncAt(stamp);
        setSyncMessage(`Synced ${evs.length} events (${rangeStartStr} to ${rangeEndStr}).`);
      }
    } catch (err: any) {
      setSyncError(err?.message || 'Google Calendar connection failed.');
    } finally {
      setIsLoadingGCal(false);
    }
  };

  const handleSyncVisibleRange = async () => {
    setIsLoadingGCal(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const evs = await fetchGoogleCalendarEventsForRange(
        rangeStartStr,
        rangeEndStr,
        settings.selectedGoogleCalendarId || 'primary'
      );
      setGoogleEvents(evs);
      const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastGoogleSyncAt(stamp);
      setSyncMessage(`Synced ${evs.length} events (${rangeStartStr} to ${rangeEndStr}).`);
    } catch (err: any) {
      setSyncError(err?.message || 'Failed to sync Google Calendar events.');
    } finally {
      setIsLoadingGCal(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    await disconnectGoogleCalendar();
    setIsConnected(false);
    setUserEmail(null);
    setGoogleEvents([]);
    setLastGoogleSyncAt(null);
    setSyncMessage('Disconnected and revoked Google Calendar session.');
  };

  // .ICS Export & Import handlers
  const getExportTasks = (): Task[] => {
    if (exportScope === 'day') {
      return expandTasksForDate(tasks, selectedDate);
    }
    if (exportScope === 'week') {
      const start = format(
        startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 }),
        'yyyy-MM-dd'
      );
      const end = format(endOfWeek(parseISO(selectedDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      return expandTasksForRange(tasks, start, end);
    }
    if (exportScope === 'single') {
      const dayList = expandTasksForDate(tasks, selectedDate);
      return dayList.length > 0 ? [dayList[0]] : tasks.slice(0, 1);
    }
    // all upcoming tasks (next 30 days)
    const end30 = format(addDays(parseISO(selectedDate), 30), 'yyyy-MM-dd');
    return expandTasksForRange(tasks, selectedDate, end30);
  };

  const handleDownloadICS = () => {
    const toExport = getExportTasks();
    const icsContent = exportTasksToICS(toExport, settings.timezone);
    setRawIcsText(icsContent);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dayforge-${exportScope}-${selectedDate}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setSyncMessage(`Exported ${toExport.length} task(s) to RFC 5545 .ics file.`);
  };

  const handleIcsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setRawIcsText(text);
      const parsed = parseICSContent(text, selectedDate);
      setIcsPreviews(parsed);
      setShowIcsModal(true);
    };
    reader.readAsText(file);
  };

  const handleOpenIcsPasteModal = () => {
    // Pre-fill with current exported .ics if empty so the user can test round-trip immediately!
    const text = rawIcsText || exportTasksToICS(expandTasksForDate(tasks, selectedDate), settings.timezone);
    setRawIcsText(text);
    setIcsPreviews(parseICSContent(text, selectedDate));
    setShowIcsModal(true);
  };

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const currentMinutesFrom6AM = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
  const showCurrentLine = now.getHours() >= START_HOUR && now.getHours() <= END_HOUR;
  const currentLineTopPx = Math.max(0, (currentMinutesFrom6AM / 60) * HOUR_HEIGHT_PX);

  const clientConfigured = hasGoogleClientIdConfigured(settings);
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div
      className="space-y-5"
      onTouchStart={(e) => {
        touchStartXRef.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartXRef.current === null) return;
        const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
        const deltaX = endX - touchStartXRef.current;
        touchStartXRef.current = null;
        if (Math.abs(deltaX) > 65) {
          handleNavigate(deltaX < 0 ? 'next' : 'prev');
        }
      }}
    >
      {/* Top Calendar Controls Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => handleNavigate('prev')}
              aria-label="Previous period"
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('today')}
              className="px-3 py-1 font-semibold text-slate-800 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 rounded-md cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('next')}
              aria-label="Next period"
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-base font-bold text-slate-900 dark:text-white font-mono">
            {viewMode === 'day'
              ? format(parseISO(selectedDate), 'EEE, MMM d, yyyy')
              : viewMode === 'week'
              ? `${rangeStartStr} → ${rangeEndStr}`
              : format(parseISO(selectedDate), 'MMMM yyyy')}
          </h2>

          <SmartLoadHeaderBadge dateStr={selectedDate} />
        </div>

        {/* View Switcher (Day / Week / Month) + .ICS Export/Import */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['day', 'week', 'month'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-md font-semibold capitalize transition-colors cursor-pointer ${
                  viewMode === mode
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* .ICS Export Scope & Download */}
          <div className="flex items-center gap-1">
            <select
              aria-label="ICS Export Scope"
              value={exportScope}
              onChange={(e) => setExportScope(e.target.value as ICSExportScope)}
              className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            >
              <option value="single">Export Single Task</option>
              <option value="day">Export Day (.ics)</option>
              <option value="week">Export Week (.ics)</option>
              <option value="upcoming">Export Upcoming (.ics)</option>
            </select>
            <button
              type="button"
              onClick={handleDownloadICS}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export .ICS
            </button>
          </div>

          <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Import .ICS
            <input
              type="file"
              accept=".ics,text/calendar"
              onChange={handleIcsFileUpload}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleOpenIcsPasteModal}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 font-medium cursor-pointer"
          >
            Preview / Re-Import .ICS
          </button>
        </div>
      </div>

      {/* MAIN CALENDAR GRID: DAY / WEEK / MONTH */}
      {viewMode === 'month' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-center text-xs font-semibold text-slate-500 py-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800">
            {visibleDays.map((dStr) => {
              const dayTasks = expandTasksForDate(tasks, dStr).filter(
                (t) => t.status !== 'Skipped'
              );
              const dayExt = allExternalEvents.filter((e) => e.date === dStr);
              const isCurrentMonth = isSameMonth(parseISO(dStr), parseISO(selectedDate));
              const isSelected = dStr === selectedDate;

              return (
                <div
                  key={dStr}
                  onClick={() => {
                    setSelectedDate(dStr);
                    setViewMode('day');
                  }}
                  className={`min-h-28 p-2 transition-colors cursor-pointer ${
                    !isCurrentMonth
                      ? 'bg-slate-50/50 dark:bg-slate-950/40 text-slate-400'
                      : 'bg-white dark:bg-slate-900 hover:bg-blue-50/20 dark:hover:bg-slate-800/40'
                  } ${isSelected ? 'ring-2 ring-inset ring-blue-600' : ''}`}
                >
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <span
                      className={`font-bold ${
                        isSelected ? 'text-blue-600 dark:text-blue-400' : ''
                      }`}
                    >
                      {dStr.slice(8)}
                    </span>
                    {dayTasks.length + dayExt.length > 0 && (
                      <span className="text-[10px] text-slate-400">
                        {dayTasks.length}t{dayExt.length > 0 ? ` · ${dayExt.length}e` : ''}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {dayTasks.slice(0, 3).map((t) => {
                      const cat = categories.find((c) => c.name === t.category);
                      return (
                        <div
                          key={t.id}
                          style={{
                            borderLeftColor: cat?.color || '#2563EB',
                          }}
                          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border-l-2 text-[10px] truncate text-slate-800 dark:text-slate-200"
                        >
                          {t.start ? `${t.start} ` : ''}
                          <span className={t.status === 'Completed' ? 'line-through opacity-60' : ''}>
                            {t.title}
                          </span>
                        </div>
                      );
                    })}
                    {dayExt.slice(0, 1).map((ev) => (
                      <div
                        key={ev.id}
                        className="px-1.5 py-0.5 rounded border border-dashed border-indigo-400 text-[10px] truncate text-indigo-700 dark:text-indigo-300"
                      >
                        ext: {ev.summary}
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 pl-1">
                        +{dayTasks.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* DAY AND WEEK HOURLY GRID (06:00 - 23:00) */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {/* Column Day Headers */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <div className="w-16 shrink-0 p-2 text-[10px] font-mono text-slate-400 text-right border-r border-slate-200 dark:border-slate-800">
              {settings.timezone.split('/')[1] || 'Local'}
            </div>
            <div
              className="flex-1 grid divide-x divide-slate-200 dark:divide-slate-800"
              style={{
                gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr))`,
              }}
            >
              {visibleDays.map((dStr) => {
                const isSelected = dStr === selectedDate;
                const dObj = parseISO(dStr);
                return (
                  <div
                    key={dStr}
                    onClick={() => setSelectedDate(dStr)}
                    className={`p-2 text-center cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {format(dObj, 'EEE')}
                    </div>
                    <div
                      className={`text-sm font-mono font-bold ${
                        isSelected
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {format(dObj, 'MMM d')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scrollable 06:00-23:00 Container */}
          <div ref={scrollContainerRef} className="overflow-y-auto max-h-[560px]">
            <div
              className="relative flex select-none"
              style={{ height: `${hours.length * HOUR_HEIGHT_PX}px` }}
            >
              {/* Left Hour Labels */}
              <div className="w-16 shrink-0 border-r border-slate-100 dark:border-slate-800 relative">
                {hours.map((hour, idx) => (
                  <div
                    key={hour}
                    style={{
                      top: `${idx * HOUR_HEIGHT_PX}px`,
                      height: `${HOUR_HEIGHT_PX}px`,
                    }}
                    className="absolute left-0 right-0 pr-2 pt-1 text-right text-[11px] font-mono text-slate-400"
                  >
                    {`${String(hour).padStart(2, '0')}:00`}
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              <div
                className="flex-1 grid divide-x divide-slate-100 dark:divide-slate-800 relative"
                style={{
                  gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr))`,
                }}
              >
                {visibleDays.map((dStr) => {
                  const dayTasks = expandTasksForDate(tasks, dStr).filter(
                    (t) => t.start && t.status !== 'Skipped'
                  );
                  const overlaps = detectOverlappingTaskIds(dayTasks);
                  const dayExt = allExternalEvents.filter(
                    (e) => e.date === dStr && !e.isAllDay && e.startTime
                  );
                  const isTodayCol = format(now, 'yyyy-MM-dd') === dStr;

                  return (
                    <div
                      key={dStr}
                      data-calendar-day={dStr}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const offsetY = Math.max(0, e.clientY - rect.top);
                        const minsFrom6AM = (offsetY / HOUR_HEIGHT_PX) * 60;
                        handleDropOnSlot(dStr, minsFrom6AM);
                      }}
                      className="relative h-full"
                    >
                      {/* Hour Slots (Clickable to create task at that hour!) */}
                      {hours.map((hour, idx) => (
                        <div
                          key={hour}
                          onClick={() => handleEmptySlotClick(dStr, hour)}
                          title={`Click to add task on ${dStr} at ${String(hour).padStart(2, '0')}:00`}
                          style={{
                            top: `${idx * HOUR_HEIGHT_PX}px`,
                            height: `${HOUR_HEIGHT_PX}px`,
                          }}
                          className="absolute left-0 right-0 border-b border-slate-100 dark:border-slate-800/60 hover:bg-blue-50/30 dark:hover:bg-blue-950/15 transition-colors cursor-pointer"
                        />
                      ))}

                      {/* Live Red Current-Time Line */}
                      {isTodayCol && showCurrentLine && (
                        <div
                          style={{ top: `${currentLineTopPx}px` }}
                          className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                        >
                          <span className="w-2 h-2 rounded-full bg-rose-600 -ml-1" />
                          <div className="flex-1 h-[2px] bg-rose-600" />
                        </div>
                      )}

                      {/* DayForge Task Blocks (Draggable + Resizable Bottom Edge) */}
                      {dayTasks.map((task) => {
                        const startMin = Math.max(0, timeToMinutesFrom6AM(task.start!));
                        const endMin = task.end
                          ? Math.max(startMin + 15, timeToMinutesFrom6AM(task.end))
                          : startMin + Math.max(15, task.estimatedMinutes || 45);
                        const topPx = (startMin / 60) * HOUR_HEIGHT_PX;
                        const heightPx = Math.max(
                          26,
                          ((endMin - startMin) / 60) * HOUR_HEIGHT_PX - 2
                        );
                        const isOverlap = overlaps.has(task.id);
                        const catObj = categories.find((c) => c.name === task.category);
                        const colorHex = catObj?.color || '#2563EB';

                        return (
                          <div
                            key={task.id}
                            data-task-id={task.id}
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setDraggedTask(task);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectTask(task);
                            }}
                            style={{
                              top: `${topPx}px`,
                              height: `${heightPx}px`,
                              left: isOverlap ? '8px' : '3px',
                              right: '3px',
                              borderColor: isOverlap ? '#E11D48' : colorHex,
                              backgroundColor: isOverlap
                                ? 'rgba(225, 29, 72, 0.14)'
                                : `${colorHex}1C`,
                            }}
                            className="absolute z-10 rounded-lg border-l-4 border px-2 py-1 flex flex-col justify-between overflow-hidden cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={`text-[11px] font-bold truncate ${
                                    task.status === 'Completed'
                                      ? 'line-through text-slate-400'
                                      : 'text-slate-900 dark:text-white'
                                  }`}
                                >
                                  {task.title}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTaskStatus(
                                      task.id,
                                      task.status === 'Completed' ? 'To Do' : 'Completed',
                                      dStr
                                    );
                                  }}
                                  aria-label={`Toggle completion for ${task.title} on ${dStr}`}
                                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${
                                    task.status === 'Completed'
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'border-slate-400 hover:border-blue-600'
                                  }`}
                                >
                                  {task.status === 'Completed' && (
                                    <Check className="w-2.5 h-2.5" />
                                  )}
                                </button>
                              </div>
                              <div className="text-[10px] font-mono text-slate-600 dark:text-slate-300 truncate">
                                {task.start}–{task.end}
                                {task.googleEventId ? ' · Synced' : ''}
                                {isOverlap ? ' · OVERLAP' : ''}
                              </div>
                            </div>

                            {/* Bottom Edge Resize Handle */}
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setResizingState({
                                  task,
                                  startY: e.clientY,
                                  origEndMin: endMin,
                                  startMin,
                                });
                              }}
                              title="Drag bottom edge to resize duration (15m snap)"
                              className="h-1.5 -mx-2 -mb-1 cursor-ns-resize bg-black/5 dark:bg-white/10 hover:bg-blue-500/50"
                            />
                          </div>
                        );
                      })}

                      {/* External Events (Read-only, Outlined / Striped, Never Counted in Stats) */}
                      {dayExt.map((ev) => {
                        const startMin = Math.max(0, timeToMinutesFrom6AM(ev.startTime!));
                        const endMin = ev.endTime
                          ? Math.max(startMin + 20, timeToMinutesFrom6AM(ev.endTime))
                          : startMin + 45;
                        const topPx = (startMin / 60) * HOUR_HEIGHT_PX;
                        const heightPx = Math.max(
                          24,
                          ((endMin - startMin) / 60) * HOUR_HEIGHT_PX - 2
                        );

                        return (
                          <div
                            key={ev.id}
                            title={`Read-only external event (${ev.source || 'google'}): ${
                              ev.summary
                            }`}
                            style={{
                              top: `${topPx}px`,
                              height: `${heightPx}px`,
                              left: '10px',
                              right: '4px',
                              backgroundImage:
                                'repeating-linear-gradient(135deg, rgba(99,102,241,0.08) 0px, rgba(99,102,241,0.08) 6px, transparent 6px, transparent 12px)',
                            }}
                            className="absolute z-10 rounded-lg border border-dashed border-indigo-400 dark:border-indigo-700 bg-white/90 dark:bg-slate-900/90 px-2 py-0.5 overflow-hidden"
                          >
                            <div className="flex items-center justify-between gap-1 text-[10px] font-semibold text-indigo-900 dark:text-indigo-200 truncate">
                              <span className="truncate">{ev.summary}</span>
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase px-1 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0">
                                <Lock className="w-2.5 h-2.5" />
                                {ev.source === 'ics' ? 'ICS' : 'GCal'}
                              </span>
                            </div>
                            <div className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400 truncate">
                              {ev.startTime}–{ev.endTime} · Read-only
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE CALENDAR TWO-WAY INTEGRATION & SETUP REQUIRED PANEL */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-blue-600" />
              Google Calendar Two-Way Sync
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              External events are read-only and never affect your productivity score. Tasks you sync are tagged with{' '}
              <code className="font-mono">dayforgeTaskId</code> so duplicates are never created.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(settings.autoSyncToGoogle)}
              onChange={(e) => updateSettings({ autoSyncToGoogle: e.target.checked })}
              className="rounded text-blue-600"
            />
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Auto-sync tasks I schedule
            </span>
          </label>
        </div>

        {/* If not connected and no Client ID configured: show honest "Setup required" panel */}
        {!isConnected && !clientConfigured && (
          <div
            data-testid="google-setup-required-panel"
            className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/60 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Setup Required — Configure Google OAuth Client ID
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-semibold text-[11px]">
                Not Connected
              </span>
            </div>

            <ol className="list-decimal pl-5 space-y-1.5 text-amber-900 dark:text-amber-200/90 leading-relaxed">
              <li>
                Open the <strong>Google Cloud Console → APIs &amp; Services → Credentials</strong> and enable the <strong>Google Calendar API</strong>.
              </li>
              <li>
                Create an <strong>OAuth 2.0 Web Client ID</strong> and add your current app origin below to <strong>Authorized JavaScript origins</strong>:
                <div className="mt-1 flex items-center gap-2">
                  <code className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                    {currentOrigin}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(currentOrigin);
                      setCopiedOrigin(true);
                      setTimeout(() => setCopiedOrigin(false), 1800);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 font-semibold text-slate-800 dark:text-slate-200 hover:bg-amber-100 cursor-pointer"
                  >
                    {copiedOrigin ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy Origin
                      </>
                    )}
                  </button>
                </div>
              </li>
              <li>
                Paste your public <strong>Google Client ID</strong> below (or set <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> in <code className="font-mono">.env</code>). Never enter a client secret.
              </li>
            </ol>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="text"
                aria-label="Google Client ID"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                placeholder="1234567890-abcdefg.apps.googleusercontent.com"
                className="flex-1 min-w-64 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => {
                  updateSettings({ googleClientId: clientIdInput.trim() });
                  setSyncMessage('Google Client ID saved locally in Settings.');
                }}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
              >
                Save Client ID
              </button>
              <button
                type="button"
                disabled={isLoadingGCal}
                onClick={() => handleConnectGoogle('provisioned-firebase-oauth')}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold hover:bg-slate-50 cursor-pointer"
              >
                {isLoadingGCal ? 'Connecting...' : 'Connect with Provisioned Cloud Project'}
              </button>
            </div>
          </div>
        )}

        {/* If Client ID exists but not connected yet */}
        {!isConnected && clientConfigured && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs">
            <div className="space-y-0.5">
              <div className="font-semibold text-slate-900 dark:text-white">
                Google Client ID Configured
              </div>
              <div className="text-slate-500 font-mono text-[11px]">
                {getConfiguredGoogleClientId(settings).slice(0, 32)}...
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isLoadingGCal}
                onClick={() => handleConnectGoogle()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                {isLoadingGCal ? 'Connecting...' : 'Connect Google Calendar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setClientIdInput('');
                  updateSettings({ googleClientId: '' });
                }}
                className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Change Client ID
              </button>
            </div>
          </div>
        )}

        {/* Connected Status Line */}
        {isConnected && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-900 dark:text-white">
                Connected as {userEmail}
              </span>
              {lastGoogleSyncAt && (
                <span className="text-slate-500 font-mono">
                  · Last synced {lastGoogleSyncAt}
                </span>
              )}
              {calendars.length > 0 && (
                <select
                  aria-label="Select target Google Calendar"
                  value={settings.selectedGoogleCalendarId || 'primary'}
                  onChange={(e) =>
                    updateSettings({ selectedGoogleCalendarId: e.target.value })
                  }
                  className="ml-2 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.summary}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isLoadingGCal}
                onClick={handleSyncVisibleRange}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sync now
              </button>
              <button
                type="button"
                onClick={handleDisconnectGoogle}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          </div>
        )}

        {syncError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-2 text-xs text-rose-800 dark:text-rose-200">
            <span>{syncError}</span>
            <button
              type="button"
              onClick={() => handleConnectGoogle('provisioned-firebase-oauth')}
              className="px-2.5 py-1 rounded bg-rose-600 text-white font-semibold cursor-pointer"
            >
              Reconnect
            </button>
          </div>
        )}

        {syncMessage && (
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
            {syncMessage}
          </p>
        )}

        {/* Quick "Add to Google Calendar" Zero-Setup Links for Today's Tasks */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Zero-Setup Direct Google Calendar Links ({selectedDate}):
          </div>
          <div className="flex flex-wrap gap-2">
            {expandTasksForDate(tasks, selectedDate).map((t) => (
              <a
                key={t.id}
                href={buildGoogleCalendarTemplateUrl(t, settings.timezone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-700 dark:text-slate-300 hover:border-blue-500"
              >
                <ExternalLink className="w-3 h-3 text-blue-600" />
                <span>Add &ldquo;{t.title.slice(0, 26)}&rdquo; to Google Calendar</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* .ICS IMPORT PREVIEW MODAL */}
      {showIcsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setShowIcsModal(false)}
        >
          <div
            role="dialog"
            aria-label="ICS Calendar Import Preview"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4 max-h-[88vh] overflow-y-auto text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                .ICS Calendar File Preview &amp; Import
              </h3>
              <button
                type="button"
                onClick={() => setShowIcsModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-600 dark:text-slate-400 block">
                Raw RFC 5545 .ICS Content (Paste or edit to re-parse):
              </label>
              <textarea
                rows={4}
                aria-label="Raw ICS content"
                value={rawIcsText}
                onChange={(e) => {
                  setRawIcsText(e.target.value);
                  setIcsPreviews(parseICSContent(e.target.value, selectedDate));
                }}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-2.5 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                Parsed Events ({icsPreviews.filter((p) => p.selected).length} of {icsPreviews.length} selected):
              </div>
              {icsPreviews.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-center">
                  No valid VEVENT blocks found in .ics content.
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto space-y-1.5">
                  {icsPreviews.map((item, idx) => (
                    <label
                      key={item.uid + idx}
                      className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) =>
                          setIcsPreviews((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, selected: e.target.checked } : p
                            )
                          )
                        }
                        className="mt-0.5 rounded text-blue-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {item.date} · {item.isAllDay ? 'All Day' : `${item.start}–${item.end}`} ·{' '}
                          {item.category}
                          {item.rrule ? ` · RRULE:${item.rrule}` : ''}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const count = importICSEvents(icsPreviews, 'external');
                  setSyncMessage(
                    `Imported ${count} event(s) as read-only external calendar events.`
                  );
                  setShowIcsModal(false);
                }}
                className="px-3.5 py-2 rounded-lg border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold hover:bg-indigo-50 cursor-pointer"
              >
                Import as Read-Only External Events
              </button>
              <button
                type="button"
                onClick={() => {
                  const count = importICSEvents(icsPreviews, 'tasks');
                  setSyncMessage(`Imported ${count} event(s) as DayForge Tasks.`);
                  setShowIcsModal(false);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
              >
                Import as DayForge Tasks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
