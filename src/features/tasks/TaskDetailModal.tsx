import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Clock,
  FileText,
  Calendar,
  ExternalLink,
  CheckSquare,
  Square,
  Play,
  Bell,
  Download,
  Repeat,
  AlertCircle,
  Lock,
  Target,
  Sparkles,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { getTaskActualMinutes } from '../../lib/analyticsEngine';
import {
  expandTasksForDate,
  getEffectiveRecurrenceRule,
  parseTaskIdentity,
} from '../../lib/recurrenceEngine';
import { findNearestFreeSlots } from '../../lib/phase3Engine';
import {
  buildGoogleCalendarTemplateUrl,
  deleteTaskFromGoogleCalendar,
  exportTasksToICS,
  getGoogleAccessToken,
  syncTaskToGoogleCalendar,
} from '../../lib/googleCalendar';
import {
  Priority,
  RecurrenceEndType,
  RecurrencePattern,
  RecurrenceRule,
  Task,
  TaskStatus,
} from '../../types';

interface TaskDetailModalProps {
  task: Task | null;
  onClose: () => void;
}

const PRESET_REMINDERS = [0, 5, 10, 30, 60];

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose }) => {
  const tasks = useDayForgeStore((s) => s.tasks);
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const goals = useDayForgeStore((s) => s.goals);
  const externalEvents = useDayForgeStore((s) => s.externalEvents);
  const googleEvents = useDayForgeStore((s) => s.googleEvents);
  const categories = useDayForgeStore((s) => s.categories);
  const settings = useDayForgeStore((s) => s.settings);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const updateTask = useDayForgeStore((s) => s.updateTask);
  const deleteTask = useDayForgeStore((s) => s.deleteTask);
  const setTaskStatus = useDayForgeStore((s) => s.setTaskStatus);
  const addSubtask = useDayForgeStore((s) => s.addSubtask);
  const toggleSubtask = useDayForgeStore((s) => s.toggleSubtask);
  const deleteSubtask = useDayForgeStore((s) => s.deleteSubtask);
  const addManualTimeLog = useDayForgeStore((s) => s.addManualTimeLog);
  const requestStartTimer = useDayForgeStore((s) => s.requestStartTimer);
  const getOrCreateTaskNote = useDayForgeStore((s) => s.getOrCreateTaskNote);
  const setRightNoteMode = useDayForgeStore((s) => s.setRightNoteMode);
  const isRightPaneOpen = useDayForgeStore((s) => s.isRightPaneOpen);
  const toggleRightPane = useDayForgeStore((s) => s.toggleRightPane);

  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [manualMinutes, setManualMinutes] = useState('25');
  const [customReminderMin, setCustomReminderMin] = useState('');
  const [editScope, setEditScope] = useState<'this' | 'all'>('this');
  const [showDeletePrompt, setShowDeletePrompt] = useState(false);
  const [alsoDeleteFromGoogle, setAlsoDeleteFromGoogle] = useState(false);
  const [gcalSyncStatus, setGcalSyncStatus] = useState<string | null>(null);
  const [gcalError404, setGcalError404] = useState(false);
  const [isSyncingGCal, setIsSyncingGCal] = useState(false);

  if (!task) return null;

  const { masterId, occurrenceDate } = parseTaskIdentity(task);
  const masterTask = tasks.find((t) => t.id === masterId) || task;
  const effOccDate = occurrenceDate || task.date || selectedDate;
  const effectiveRule = getEffectiveRecurrenceRule(masterTask);
  const isRecurring = Boolean(effectiveRule);

  // Merge master task with per-occurrence override if viewing an occurrence
  const ov = isRecurring ? masterTask.occurrenceOverrides?.[effOccDate] : undefined;
  const liveTask: Task = {
    ...masterTask,
    id: task.id,
    date: ov?.movedToDate || (isRecurring ? effOccDate : masterTask.date),
    title: ov?.title ?? masterTask.title,
    description: ov?.description ?? masterTask.description,
    status: ov?.status ?? masterTask.status,
    start: ov?.start ?? masterTask.start,
    end: ov?.end ?? masterTask.end,
    estimatedMinutes: ov?.estimatedMinutes ?? masterTask.estimatedMinutes,
    googleEventId: ov?.googleEventId ?? masterTask.googleEventId,
  };

  const actualMins = getTaskActualMinutes(liveTask, timeLogs, effOccDate);
  const taskLogs = timeLogs.filter(
    (l) =>
      l.taskId === masterId &&
      (!isRecurring || (l.occurrenceDate || l.startedAt.slice(0, 10)) === effOccDate)
  );
  const progressPct =
    liveTask.estimatedMinutes > 0
      ? Math.min(100, Math.round((actualMins / liveTask.estimatedMinutes) * 100))
      : 0;

  const handlePatch = (patch: Partial<Task>) => {
    updateTask(
      liveTask.id,
      patch,
      isRecurring ? editScope : 'all',
      isRecurring ? effOccDate : undefined
    );
  };

  const handleRecurrenceChange = (pattern: RecurrencePattern) => {
    if (pattern === 'none') {
      updateTask(masterId, { recurrence: 'none', recurrenceRule: undefined }, 'all');
      return;
    }
    const nextRule: RecurrenceRule = {
      frequency:
        pattern === 'custom'
          ? 'every_n_days'
          : (pattern as RecurrenceRule['frequency']),
      interval: effectiveRule?.interval || 1,
      daysOfWeek: effectiveRule?.daysOfWeek || [1, 3, 5],
      endType: effectiveRule?.endType || 'never',
      endDate: effectiveRule?.endDate,
      endCount: effectiveRule?.endCount || 10,
    };
    updateTask(masterId, { recurrence: pattern, recurrenceRule: nextRule }, 'all');
  };

  const handleRulePatch = (rulePatch: Partial<RecurrenceRule>) => {
    if (!effectiveRule) return;
    const nextRule: RecurrenceRule = { ...effectiveRule, ...rulePatch };
    updateTask(
      masterId,
      { recurrence: nextRule.frequency, recurrenceRule: nextRule },
      'all'
    );
  };

  const toggleReminderOffset = (mins: number) => {
    const current = Array.isArray(masterTask.reminders) ? masterTask.reminders : [];
    const exists = current.includes(mins);
    const next = exists
      ? current.filter((m) => m !== mins)
      : [...current, mins].sort((a, b) => a - b);
    updateTask(masterId, { reminders: next }, 'all');
  };

  const handleAddCustomReminder = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customReminderMin, 10);
    if (isNaN(val) || val < 0 || val > 1440) return;
    const current = Array.isArray(masterTask.reminders) ? masterTask.reminders : [];
    if (!current.includes(val)) {
      updateTask(
        masterId,
        { reminders: [...current, val].sort((a, b) => a - b) },
        'all'
      );
    }
    setCustomReminderMin('');
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    addSubtask(masterId, newSubtaskTitle);
    setNewSubtaskTitle('');
  };

  const handleManualLog = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = parseInt(manualMinutes, 10);
    if (isNaN(mins) || mins <= 0) return;
    addManualTimeLog(liveTask.id, mins, effOccDate, 'manual');
  };

  const handleSyncToGoogle = async (forceRecreate = false) => {
    setIsSyncingGCal(true);
    setGcalSyncStatus(null);
    setGcalError404(false);
    try {
      const token = await getGoogleAccessToken();
      if (!token) {
        setGcalSyncStatus(
          'Not connected to Google Calendar. Connect in the Calendar tab first, or use the "Add to Google Calendar" link below.'
        );
        return;
      }
      const taskToSync = forceRecreate
        ? { ...liveTask, googleEventId: undefined }
        : liveTask;
      const res = await syncTaskToGoogleCalendar(
        taskToSync,
        settings.selectedGoogleCalendarId || 'primary',
        settings.timezone
      );
      updateTask(masterId, {
        googleEventId: res.eventId,
        googleCalendarId: res.calendarId,
        googleSyncState: 'synced',
        googleSyncError: undefined,
      });
      setGcalSyncStatus('Synced to Google Calendar.');
    } catch (err: any) {
      if (err?.code === '404') {
        setGcalError404(true);
      }
      updateTask(masterId, {
        googleSyncState: 'error',
        googleSyncError: err?.message,
      });
      setGcalSyncStatus(err?.message || 'Google Calendar sync failed.');
    } finally {
      setIsSyncingGCal(false);
    }
  };

  const handleConfirmDelete = async (scope: 'this' | 'all') => {
    if (alsoDeleteFromGoogle && liveTask.googleEventId) {
      try {
        await deleteTaskFromGoogleCalendar(
          liveTask.googleEventId,
          liveTask.googleCalendarId || settings.selectedGoogleCalendarId || 'primary'
        );
      } catch {
        // ignore remote delete error
      }
    }
    deleteTask(liveTask.id, scope, effOccDate);
    onClose();
  };

  const handleExportSingleICS = () => {
    const ics = exportTasksToICS([liveTask], settings.timezone);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dayforge-task-${liveTask.date}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/40 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Task details for ${liveTask.title}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between overflow-y-auto p-6 shadow-xl"
      >
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex-1">
              <input
                type="text"
                aria-label="Task title"
                value={liveTask.title}
                onChange={(e) => handlePatch({ title: e.target.value })}
                className="w-full text-lg font-bold text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/40 rounded px-1 -ml-1"
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                <span>Date: {liveTask.date}</span>
                {liveTask.googleEventId && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                    Synced with Google Calendar
                  </span>
                )}
                {liveTask.googleSyncState === 'error' && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-semibold">
                    Sync Error
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close task detail panel"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Recurring Task Scope Selector ("This occurrence" vs "This and all future") */}
          {isRecurring && (
            <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5 text-blue-600" />
                Apply edits to:
              </span>
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-blue-200 dark:border-blue-800">
                <button
                  type="button"
                  onClick={() => setEditScope('this')}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    editScope === 'this'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  This occurrence ({effOccDate})
                </button>
                <button
                  type="button"
                  onClick={() => setEditScope('all')}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    editScope === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  This and all future
                </button>
              </div>
            </div>
          )}

          {/* Primary Controls Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Status</span>
              <select
                value={liveTask.status}
                onChange={(e) =>
                  setTaskStatus(liveTask.id, e.target.value as TaskStatus, effOccDate)
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 font-medium"
              >
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Skipped">Skipped</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Category</span>
              <select
                value={liveTask.category}
                onChange={(e) => updateTask(masterId, { category: e.target.value }, 'all')}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 font-medium"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Priority</span>
              <select
                value={liveTask.priority}
                onChange={(e) =>
                  updateTask(masterId, { priority: e.target.value as Priority }, 'all')
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 font-medium"
              >
                <option value="Low">Low</option>
                <option value="Med">Med</option>
                <option value="High">High</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Scheduled Date</span>
              <input
                type="date"
                value={liveTask.date}
                onChange={(e) => handlePatch({ date: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Start – End</span>
              <div className="flex items-center gap-1">
                <input
                  type="time"
                  aria-label="Start time"
                  value={liveTask.start || ''}
                  onChange={(e) => handlePatch({ start: e.target.value || undefined })}
                  className="w-full px-1.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 font-mono text-[11px]"
                />
                <input
                  type="time"
                  aria-label="End time"
                  value={liveTask.end || ''}
                  onChange={(e) => handlePatch({ end: e.target.value || undefined })}
                  className="w-full px-1.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 font-mono text-[11px]"
                />
              </div>
            </label>

            <label className="space-y-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Est. Minutes</span>
              <input
                type="number"
                min={5}
                max={720}
                step={5}
                value={liveTask.estimatedMinutes}
                onChange={(e) =>
                  handlePatch({
                    estimatedMinutes: Math.max(5, parseInt(e.target.value, 10) || 30),
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 font-mono"
              />
            </label>
          </div>

          {/* Free-Slot Finder (Up to 3 Nearest Free Slots inside Working Hours) */}
          {(() => {
            const otherDayTasks = expandTasksForDate(tasks, liveTask.date).filter(
              (t) => t.id !== liveTask.id && parseTaskIdentity(t).masterId !== masterId
            );
            const allExt = [...externalEvents, ...googleEvents];
            const freeSlots = findNearestFreeSlots(
              liveTask.date,
              Math.max(15, liveTask.estimatedMinutes || 30),
              otherDayTasks,
              allExt,
              settings,
              liveTask.start || settings.workDayStart || '08:00',
              liveTask.id,
              3
            );
            return (
              <div
                className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 space-y-2 text-xs"
                data-testid="free-slot-finder"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    Nearest Free Slots ({liveTask.estimatedMinutes}m inside working hours)
                  </span>
                </div>
                {freeSlots.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No contiguous {liveTask.estimatedMinutes}m slot free inside working hours on{' '}
                    {liveTask.date}.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {freeSlots.map((slot) => (
                      <button
                        key={`${slot.start}-${slot.end}`}
                        type="button"
                        data-testid={`schedule-free-slot-${slot.start}`}
                        onClick={() =>
                          handlePatch({ start: slot.start, end: slot.end })
                        }
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white font-semibold transition-colors cursor-pointer"
                      >
                        <Clock className="w-3 h-3" />
                        Schedule here: {slot.start}–{slot.end}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Eisenhower Important / Urgent + Fixed Time + Goal Link + Recurrence Rule Builder */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={liveTask.important}
                    onChange={(e) =>
                      updateTask(masterId, { important: e.target.checked }, 'all')
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Important
                  </span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={liveTask.urgent}
                    onChange={(e) =>
                      updateTask(masterId, { urgent: e.target.checked }, 'all')
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-300">Urgent</span>
                </label>

                <label
                  className="inline-flex items-center gap-1.5 cursor-pointer"
                  title="Smart Replan will never move a task marked Fixed time"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(masterTask.fixedTime)}
                    onChange={(e) =>
                      updateTask(masterId, { fixedTime: e.target.checked }, 'all')
                    }
                    className="rounded border-slate-300 text-amber-600"
                  />
                  <Lock className="w-3 h-3 text-amber-600" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Fixed time
                  </span>
                </label>
              </div>

              <label className="inline-flex items-center gap-2">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Repeat:</span>
                <select
                  aria-label="Repeat frequency"
                  value={effectiveRule ? effectiveRule.frequency : 'none'}
                  onChange={(e) =>
                    handleRecurrenceChange(e.target.value as RecurrencePattern)
                  }
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium"
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays (Mon–Fri)</option>
                  <option value="weekly">Weekly on chosen days</option>
                  <option value="every_n_days">Every N days</option>
                  <option value="every_n_weeks">Every N weeks</option>
                </select>
              </label>
            </div>

            {/* Linked Goal Selector */}
            <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700 flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-blue-600" />
                Linked Goal:
              </span>
              <select
                aria-label="Link task to goal"
                value={masterTask.goalId || ''}
                onChange={(e) =>
                  updateTask(
                    masterId,
                    { goalId: e.target.value || undefined },
                    'all'
                  )
                }
                className="flex-1 max-w-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium"
              >
                <option value="">No linked goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title} ({g.category})
                  </option>
                ))}
              </select>
            </div>

            {effectiveRule && (
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700 space-y-2.5">
                {(effectiveRule.frequency === 'every_n_days' ||
                  effectiveRule.frequency === 'every_n_weeks') && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 dark:text-slate-400">Every</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={effectiveRule.interval || 2}
                      onChange={(e) =>
                        handleRulePatch({ interval: Math.max(1, parseInt(e.target.value, 10) || 2) })
                      }
                      className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                    <span className="text-slate-600 dark:text-slate-400">
                      {effectiveRule.frequency === 'every_n_days' ? 'days' : 'weeks'}
                    </span>
                  </div>
                )}

                {(effectiveRule.frequency === 'weekly' ||
                  effectiveRule.frequency === 'every_n_weeks') && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-600 dark:text-slate-400 mr-1">On days:</span>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dLabel, idx) => {
                      const dows = effectiveRule.daysOfWeek || [1];
                      const active = dows.includes(idx);
                      return (
                        <button
                          key={dLabel}
                          type="button"
                          onClick={() =>
                            handleRulePatch({
                              daysOfWeek: active
                                ? dows.filter((d) => d !== idx)
                                : [...dows, idx].sort(),
                            })
                          }
                          className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {dLabel}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-400">Ends:</span>
                  <select
                    value={effectiveRule.endType}
                    onChange={(e) =>
                      handleRulePatch({ endType: e.target.value as RecurrenceEndType })
                    }
                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="never">Never</option>
                    <option value="on_date">On date</option>
                    <option value="after_count">After N occurrences</option>
                  </select>

                  {effectiveRule.endType === 'on_date' && (
                    <input
                      type="date"
                      value={effectiveRule.endDate || ''}
                      onChange={(e) => handleRulePatch({ endDate: e.target.value })}
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                  )}

                  {effectiveRule.endType === 'after_count' && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={effectiveRule.endCount || 10}
                        onChange={(e) =>
                          handleRulePatch({
                            endCount: Math.max(1, parseInt(e.target.value, 10) || 10),
                          })
                        }
                        className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                      <span>times</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Per-Task Reminders (Multiple allowed: 0, 5, 10, 30, 60 + Custom) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-blue-600" />
                Task Reminders (Minutes before start)
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Active:{' '}
                {(masterTask.reminders || []).length > 0
                  ? masterTask.reminders.map((m) => (m === 0 ? 'At start' : `${m}m`)).join(', ')
                  : 'None'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {PRESET_REMINDERS.map((m) => {
                const active = (masterTask.reminders || []).includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleReminderOffset(m)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {m === 0 ? 'At start' : `${m}m before`}
                  </button>
                );
              })}

              <form onSubmit={handleAddCustomReminder} className="flex items-center gap-1 ml-auto">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={customReminderMin}
                  onChange={(e) => setCustomReminderMin(e.target.value)}
                  placeholder="Custom min"
                  className="w-24 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium cursor-pointer"
                >
                  + Add
                </button>
              </form>
            </div>
          </div>

          {/* Planned vs Actual Time & Manual Entry */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                Planned vs. Actual Work Time
              </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {actualMins}m logged / {liveTask.estimatedMinutes}m planned ({progressPct}%)
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  requestStartTimer(liveTask.id, 'stopwatch');
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Start Live Timer
              </button>

              <form onSubmit={handleManualLog} className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                  aria-label="Manual minutes to log"
                  className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-right"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 transition-colors cursor-pointer"
                >
                  + Log Manual Mins
                </button>
              </form>
            </div>

            {taskLogs.length > 0 && (
              <div className="pt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono space-y-0.5">
                {taskLogs.slice(-3).map((l) => (
                  <div key={l.id}>
                    Session ({l.type}): {l.durationMinutes}m on{' '}
                    {l.occurrenceDate || l.startedAt.slice(0, 10)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Markdown Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="task-desc-editor"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Description (Markdown)
              </label>
              <button
                type="button"
                onClick={() => {
                  getOrCreateTaskNote(masterId);
                  setRightNoteMode('task');
                  if (!isRightPaneOpen) toggleRightPane();
                  onClose();
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Open Side-by-Side Note
              </button>
            </div>
            <textarea
              id="task-desc-editor"
              rows={3}
              value={liveTask.description}
              onChange={(e) => handlePatch({ description: e.target.value })}
              placeholder="Add markdown notes, acceptance criteria, or links..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-3 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Subtasks Checklist */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Subtasks ({liveTask.subtasks.filter((s) => s.completed).length}/
              {liveTask.subtasks.length})
            </span>

            <div className="space-y-1.5">
              {liveTask.subtasks.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => toggleSubtask(masterId, sub.id)}
                    className="flex items-center gap-2 text-left flex-1 cursor-pointer"
                  >
                    {sub.completed ? (
                      <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span
                      className={
                        sub.completed
                          ? 'line-through text-slate-400'
                          : 'text-slate-800 dark:text-slate-200'
                      }
                    >
                      {sub.title}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSubtask(masterId, sub.id)}
                    aria-label={`Delete subtask ${sub.title}`}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddSubtask} className="flex items-center gap-2">
              <input
                type="text"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                placeholder="Add a subtask step..."
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </form>
          </div>

          {/* Calendar Sync & No-Setup Calendar Options */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Calendar Integration &amp; Export
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSyncingGCal}
                onClick={() => handleSyncToGoogle(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                {isSyncingGCal
                  ? 'Syncing...'
                  : liveTask.googleEventId
                  ? 'Update Google Calendar Event'
                  : 'Sync to Google Calendar'}
              </button>

              <a
                href={buildGoogleCalendarTemplateUrl(liveTask, settings.timezone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 border border-slate-200 dark:border-slate-800"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                Add to Google Calendar
              </a>

              <button
                type="button"
                onClick={handleExportSingleICS}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export .ICS
              </button>
            </div>

            {gcalError404 && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                  <AlertCircle className="w-4 h-4" />
                  Event was removed in Google Calendar (404/410).
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateTask(masterId, {
                        googleEventId: undefined,
                        googleSyncState: 'none',
                      });
                      setGcalError404(false);
                      setGcalSyncStatus('Unlinked removed Google Calendar event.');
                    }}
                    className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-amber-300 text-amber-900 dark:text-amber-200 font-medium cursor-pointer"
                  >
                    Unlink Event
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSyncToGoogle(true)}
                    className="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold cursor-pointer"
                  >
                    Recreate in Google Calendar
                  </button>
                </div>
              </div>
            )}

            {gcalSyncStatus && (
              <p className="text-xs text-slate-600 dark:text-slate-400">{gcalSyncStatus}</p>
            )}
          </div>
        </div>

        {/* Footer & Delete Prompt */}
        <div className="pt-4 mt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {showDeletePrompt ? (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2.5 text-xs">
              <div className="font-semibold text-rose-900 dark:text-rose-200">
                {isRecurring
                  ? `Delete recurring task "${liveTask.title}"?`
                  : `Delete "${liveTask.title}"?`}
              </div>

              {liveTask.googleEventId && (
                <label className="flex items-center gap-2 text-rose-800 dark:text-rose-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoDeleteFromGoogle}
                    onChange={(e) => setAlsoDeleteFromGoogle(e.target.checked)}
                    className="rounded text-rose-600"
                  />
                  <span>Also delete synced event from Google Calendar (default: keep)</span>
                </label>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {isRecurring ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleConfirmDelete('this')}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 cursor-pointer"
                    >
                      Delete This Occurrence Only
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmDelete('all')}
                      className="px-3 py-1.5 rounded-lg bg-rose-800 text-white font-semibold hover:bg-rose-900 cursor-pointer"
                    >
                      Delete This &amp; All Future
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConfirmDelete('all')}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDeletePrompt(false)}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowDeletePrompt(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Task
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
