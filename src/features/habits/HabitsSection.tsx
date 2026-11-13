import React, { useState, useMemo } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import {
  Check,
  Plus,
  Flame,
  Archive,
  Trash2,
  Edit3,
  Coffee,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import {
  computeHabitStats,
  getHabitDayState,
  isHabitCompletedOnDate,
  isHabitRestDayOnDate,
  isHabitScheduledOnDate,
} from '../../lib/habitEngine';
import { Habit, HabitFrequency } from '../../types';

/**
 * Compact "Today's Habits" Card with SVG Progress Ring for the Today Dashboard.
 */
export const TodayHabitsCard: React.FC = () => {
  const habits = useDayForgeStore((s) => s.habits);
  const habitChecks = useDayForgeStore((s) => s.habitChecks);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const settings = useDayForgeStore((s) => s.settings);
  const toggleHabitCheck = useDayForgeStore((s) => s.toggleHabitCheck);
  const setHabitCheckCount = useDayForgeStore((s) => s.setHabitCheckCount);
  const toggleHabitSkipRest = useDayForgeStore((s) => s.toggleHabitSkipRest);
  const setActiveNav = useDayForgeStore((s) => s.setActiveNav);

  const activeHabits = useMemo(
    () => habits.filter((h) => !h.archived && isHabitScheduledOnDate(h, selectedDate)),
    [habits, selectedDate]
  );

  const { doneCount, totalActive } = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const h of activeHabits) {
      const isDone = isHabitCompletedOnDate(h, selectedDate, habitChecks);
      const isRest = isHabitRestDayOnDate(h, selectedDate, habitChecks, settings.workingDays);
      if (isDone) {
        done += 1;
        total += 1;
      } else if (!isRest) {
        total += 1;
      }
    }
    return { doneCount: done, totalActive: total };
  }, [activeHabits, selectedDate, habitChecks, settings.workingDays]);

  const pct = totalActive > 0 ? Math.round((doneCount / totalActive) * 100) : 100;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;

  if (activeHabits.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Progress Ring SVG */}
          <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
            <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44">
              <circle
                cx="22"
                cy="22"
                r={radius}
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                className="text-slate-100 dark:text-slate-800"
              />
              <circle
                cx="22"
                cy="22"
                r={radius}
                stroke="#16A34A"
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>
            <span className="absolute text-[10px] font-mono font-bold text-slate-800 dark:text-slate-200">
              {pct}%
            </span>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">
              Today&apos;s Habits ({doneCount}/{totalActive} completed)
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Tracked independently from your task productivity score.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveNav('habits')}
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
        >
          Manage Habits →
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {activeHabits.map((h) => {
          const check = habitChecks.find(
            (hc) => hc.habitId === h.id && hc.date === selectedDate
          );
          const isDone = isHabitCompletedOnDate(h, selectedDate, habitChecks);
          const isSkipped = check?.status === 'skipped';
          const currentCount = check?.count || 0;
          const stats = computeHabitStats(
            h,
            habitChecks,
            selectedDate,
            settings.workingDays
          );

          return (
            <div
              key={h.id}
              className={`p-3 rounded-xl border transition-colors flex flex-col justify-between gap-2 text-xs ${
                isDone
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                  : isSkipped
                  ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-75'
                  : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">{h.icon || '⚡'}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {h.title}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {currentCount}/{h.targetPerDay} {h.unit || 'done'} · 🔥 {stats.currentStreak}d
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => toggleHabitCheck(h.id, selectedDate)}
                  aria-label={`Check in habit ${h.title}`}
                  className={`flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    isDone
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  {isDone ? 'Done' : 'Check In'}
                </button>

                {h.targetPerDay > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setHabitCheckCount(
                        h.id,
                        selectedDate,
                        Math.min(h.targetPerDay, currentCount + 1)
                      )
                    }
                    className="px-2 py-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] hover:bg-slate-300 cursor-pointer"
                    title="Increment count"
                  >
                    +1
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => toggleHabitSkipRest(h.id, selectedDate)}
                  title="Mark as skipped (rest day — never breaks streak)"
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                    isSkipped
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {isSkipped ? 'Rest' : 'Skip'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Full Habits Workspace Page with Create/Edit/Archive/Delete, Past-Day Check-In Editor,
 * Per-Habit Streak & Completion Stats, Month Calendar Grid, and 90-Day Heatmap.
 */
export const HabitsWorkspaceView: React.FC = () => {
  const habits = useDayForgeStore((s) => s.habits);
  const habitChecks = useDayForgeStore((s) => s.habitChecks);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const setSelectedDate = useDayForgeStore((s) => s.setSelectedDate);
  const settings = useDayForgeStore((s) => s.settings);
  const categories = useDayForgeStore((s) => s.categories);
  const toggleHabitCheck = useDayForgeStore((s) => s.toggleHabitCheck);
  const setHabitCheckCount = useDayForgeStore((s) => s.setHabitCheckCount);
  const toggleHabitSkipRest = useDayForgeStore((s) => s.toggleHabitSkipRest);
  const addHabit = useDayForgeStore((s) => s.addHabit);
  const updateHabit = useDayForgeStore((s) => s.updateHabit);
  const deleteHabit = useDayForgeStore((s) => s.deleteHabit);
  const archiveHabit = useDayForgeStore((s) => s.archiveHabit);

  const [showArchived, setShowArchived] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('⚡');
  const [color, setColor] = useState('#2563EB');
  const [category, setCategory] = useState('Study');
  const [frequency, setFrequency] = useState<HabitFrequency>('daily');
  const [customDays, setCustomDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [timesPerWeek, setTimesPerWeek] = useState(3);
  const [intervalDays, setIntervalDays] = useState(2);
  const [targetPerDay, setTargetPerDay] = useState(1);
  const [unit, setUnit] = useState('session');
  const [startDate, setStartDate] = useState(selectedDate);
  const [restDays, setRestDays] = useState<number[]>([0]);
  const [reminderInput, setReminderInput] = useState('09:00');

  const openCreateForm = () => {
    setEditingHabit(null);
    setTitle('');
    setIcon('⚡');
    setColor('#2563EB');
    setCategory('Study');
    setFrequency('daily');
    setCustomDays([1, 2, 3, 4, 5]);
    setTimesPerWeek(3);
    setIntervalDays(2);
    setTargetPerDay(1);
    setUnit('session');
    setStartDate(selectedDate);
    setRestDays([0]);
    setReminderInput('09:00');
    setIsFormOpen(true);
  };

  const openEditForm = (h: Habit) => {
    setEditingHabit(h);
    setTitle(h.title);
    setIcon(h.icon || '⚡');
    setColor(h.color || '#2563EB');
    setCategory(h.category);
    setFrequency(h.frequency);
    setCustomDays(h.customDays || [1, 2, 3, 4, 5]);
    setTimesPerWeek(h.timesPerWeek || 3);
    setIntervalDays(h.intervalDays || 2);
    setTargetPerDay(h.targetPerDay || 1);
    setUnit(h.unit || 'session');
    setStartDate(h.startDate || h.createdAt);
    setRestDays(h.restDays || []);
    setReminderInput((h.reminderTimes && h.reminderTimes.join(', ')) || h.reminderTime || '');
    setIsFormOpen(true);
  };

  const handleSaveHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const reminderTimes = reminderInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d{2}:\d{2}$/.test(s));

    if (editingHabit) {
      updateHabit(editingHabit.id, {
        title: title.trim(),
        icon,
        color,
        category,
        frequency,
        customDays,
        timesPerWeek,
        intervalDays,
        targetPerDay: Math.max(1, targetPerDay),
        unit,
        startDate,
        restDays,
        reminderTime: reminderTimes[0],
        reminderTimes,
      });
    } else {
      addHabit(title.trim(), category, frequency, {
        icon,
        color,
        customDays,
        timesPerWeek,
        intervalDays,
        targetPerDay: Math.max(1, targetPerDay),
        unit,
        startDate,
        restDays,
        reminderTime: reminderTimes[0],
        reminderTimes,
      });
    }
    setIsFormOpen(false);
    setEditingHabit(null);
  };

  const visibleHabits = habits.filter((h) => Boolean(h.archived) === showArchived);

  // Recent 7 days strip for quick past-day editing
  const recent7Days = useMemo(() => {
    const ref = parseISO(selectedDate);
    return Array.from({ length: 7 }, (_, idx) =>
      format(subDays(ref, 6 - idx), 'yyyy-MM-dd')
    );
  }, [selectedDate]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Habits & Consistency Rituals
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Streaks count scheduled days only. Rest days and skipped days never break your streak or lower your completion %.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs">
            <button
              type="button"
              onClick={() =>
                setSelectedDate(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))
              }
              aria-label="Previous check-in day"
              className="p-1 rounded hover:bg-white dark:hover:bg-slate-900 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <input
              type="date"
              aria-label="Check-in date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-mono text-xs px-1.5"
            />
            <button
              type="button"
              onClick={() =>
                setSelectedDate(format(subDays(parseISO(selectedDate), -1), 'yyyy-MM-dd'))
              }
              aria-label="Next check-in day"
              className="p-1 rounded hover:bg-white dark:hover:bg-slate-900 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
          >
            {showArchived ? 'Show Active Habits' : 'Archived'}
          </button>

          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Habit
          </button>
        </div>
      </div>

      {/* Create / Edit Habit Modal Form */}
      {isFormOpen && (
        <form
          onSubmit={handleSaveHabit}
          className="bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 rounded-xl p-5 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {editingHabit ? `Edit Habit: ${editingHabit.title}` : 'Create New Habit'}
            </h3>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium text-slate-600 dark:text-slate-400">Habit Name</span>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Solve 2 LeetCode Problems"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800"
              />
            </label>

            <label className="space-y-1">
              <span className="font-medium text-slate-600 dark:text-slate-400">Emoji / Icon</span>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800"
              />
            </label>

            <label className="space-y-1">
              <span className="font-medium text-slate-600 dark:text-slate-400">Colour & Category</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-9 h-9 rounded cursor-pointer shrink-0"
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="space-y-1">
              <span className="font-medium text-slate-600 dark:text-slate-400">Frequency</span>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800"
              >
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays (Mon–Fri)</option>
                <option value="weekly">Chosen weekdays</option>
                <option value="times_per_week">X times per week</option>
                <option value="every_n_days">Every N days</option>
              </select>
            </label>

            {frequency === 'times_per_week' && (
              <label className="space-y-1">
                <span className="font-medium text-slate-600 dark:text-slate-400">Times per week</span>
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={timesPerWeek}
                  onChange={(e) => setTimesPerWeek(parseInt(e.target.value, 10) || 3)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </label>
            )}

            {frequency === 'every_n_days' && (
              <label className="space-y-1">
                <span className="font-medium text-slate-600 dark:text-slate-400">Every N days</span>
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(parseInt(e.target.value, 10) || 2)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </label>
            )}

            <label className="space-y-1">
              <span className="font-medium text-slate-600 dark:text-slate-400">Daily Target & Unit</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={targetPerDay}
                  onChange={(e) => setTargetPerDay(parseInt(e.target.value, 10) || 1)}
                  className="w-20 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
                />
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="minutes / sessions"
                  className="flex-1 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </label>

            <label className="space-y-1">
              <span className="font-medium text-slate-600 dark:text-slate-400">Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </label>

            <label className="space-y-1">
              <span className="font-medium text-slate-600 dark:text-slate-400">
                Reminder Time(s) (HH:mm, comma-separated)
              </span>
              <input
                type="text"
                value={reminderInput}
                onChange={(e) => setReminderInput(e.target.value)}
                placeholder="09:00, 18:00"
                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </label>
          </div>

          {frequency === 'weekly' && (
            <div className="space-y-1">
              <span className="font-medium text-slate-600 dark:text-slate-400 block">
                Scheduled Weekdays:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dLabel, idx) => {
                  const active = customDays.includes(idx);
                  return (
                    <button
                      key={dLabel}
                      type="button"
                      onClick={() =>
                        setCustomDays(
                          active
                            ? customDays.filter((d) => d !== idx)
                            : [...customDays, idx].sort()
                        )
                      }
                      className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {dLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400 block">
              Habit Rest Weekdays (Never break streak):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dLabel, idx) => {
                const isRest = restDays.includes(idx);
                return (
                  <button
                    key={dLabel}
                    type="button"
                    onClick={() =>
                      setRestDays(
                        isRest ? restDays.filter((d) => d !== idx) : [...restDays, idx].sort()
                      )
                    }
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                      isRest
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    {dLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
            >
              {editingHabit ? 'Save Changes' : 'Create Habit'}
            </button>
          </div>
        </form>
      )}

      {/* Habit Cards with Check-In, Stats, Month Calendar, and 90-Day Heatmap */}
      <div className="space-y-4">
        {visibleHabits.map((h) => {
          const stats = computeHabitStats(h, habitChecks, selectedDate, settings.workingDays);
          const checkOnSelected = habitChecks.find(
            (hc) => hc.habitId === h.id && hc.date === selectedDate
          );
          const isDoneSelected = isHabitCompletedOnDate(h, selectedDate, habitChecks);
          const isSkippedSelected = checkOnSelected?.status === 'skipped';
          const countSelected = checkOnSelected?.count || 0;

          return (
            <div
              key={h.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              {/* Top Row: Title + Check-in Controls for selectedDate */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: `${h.color || '#2563EB'}20` }}
                  >
                    {h.icon || '⚡'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {h.title}
                      </h3>
                      <span className="text-xs text-slate-400">· {h.category}</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                      Target: {h.targetPerDay} {h.unit || 'check-in'} · Frequency: {h.frequency}
                      {h.reminderTimes && h.reminderTimes.length > 0
                        ? ` · Reminder ${h.reminderTimes.join(', ')}`
                        : ''}
                    </div>
                  </div>
                </div>

                {/* Check-in buttons for selectedDate */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {h.targetPerDay > 1 && (
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1 font-mono">
                      <button
                        type="button"
                        onClick={() =>
                          setHabitCheckCount(h.id, selectedDate, Math.max(0, countSelected - 1))
                        }
                        className="px-1.5 font-bold hover:text-blue-600 cursor-pointer"
                      >
                        -
                      </button>
                      <span>
                        {countSelected}/{h.targetPerDay} {h.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setHabitCheckCount(h.id, selectedDate, countSelected + 1)
                        }
                        className="px-1.5 font-bold hover:text-blue-600 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleHabitCheck(h.id, selectedDate)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                      isDoneSelected
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {isDoneSelected ? `Done (${selectedDate})` : `Mark Done (${selectedDate})`}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleHabitSkipRest(h.id, selectedDate)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                      isSkippedSelected
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    <Coffee className="w-3.5 h-3.5" />
                    {isSkippedSelected ? 'Skipped (Rest Day)' : 'Skip (Rest Day)'}
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditForm(h)}
                    aria-label={`Edit ${h.title}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => archiveHabit(h.id, !h.archived)}
                    aria-label={`Archive ${h.title}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 cursor-pointer"
                  >
                    <Archive className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteHabit(h.id)}
                    aria-label={`Delete ${h.title}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 5 Per-Habit Stat Boxes */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-500 flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-amber-500" /> Current Streak
                  </div>
                  <div className="mt-1 text-lg font-bold font-mono text-slate-900 dark:text-white">
                    {stats.currentStreak} days
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-500">Longest Streak</div>
                  <div className="mt-1 text-lg font-bold font-mono text-slate-900 dark:text-white">
                    {stats.longestStreak} days
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-500">Weekly Completion</div>
                  <div className="mt-1 text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {stats.weeklyCompletionPct}%
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-500">Monthly Completion</div>
                  <div className="mt-1 text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
                    {stats.monthlyCompletionPct}%
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-500">Total Completions</div>
                  <div className="mt-1 text-lg font-bold font-mono text-slate-900 dark:text-white">
                    {stats.totalCompletions}
                  </div>
                </div>
              </div>

              {/* Last 7 Days Interactive Check-In Strip (Click any past day to toggle!) */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Last 7 Days Check-In Strip (Click any day to toggle completion):
                </span>
                <div className="grid grid-cols-7 gap-2">
                  {recent7Days.map((dStr) => {
                    const st = getHabitDayState(
                      h,
                      dStr,
                      selectedDate,
                      habitChecks,
                      settings.workingDays
                    );
                    return (
                      <button
                        key={dStr}
                        type="button"
                        onClick={() => toggleHabitCheck(h.id, dStr)}
                        className={`p-2 rounded-lg border text-center transition-colors cursor-pointer ${
                          st === 'done'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : st === 'rest'
                            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                            : st === 'missed'
                            ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
                            : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <div className="text-[10px] font-mono">{dStr.slice(5)}</div>
                        <div className="text-[11px] font-bold capitalize mt-0.5">
                          {st === 'pending_today' ? 'Open' : st}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Month Calendar View + 90-Day Heatmap */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
                      Month Calendar ({selectedDate.slice(0, 7)}) — Click day to edit
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Green=Done · Amber=Rest · Rose=Missed
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {stats.monthCalendar.map((cell) => {
                      const cls =
                        cell.state === 'done'
                          ? 'bg-emerald-600 text-white'
                          : cell.state === 'rest'
                          ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                          : cell.state === 'missed'
                          ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500';
                      return (
                        <button
                          key={cell.date}
                          type="button"
                          onClick={() => toggleHabitCheck(h.id, cell.date)}
                          title={`${cell.date}: ${cell.state}`}
                          className={`h-7 rounded text-[11px] font-mono font-medium flex items-center justify-center cursor-pointer ${cls}`}
                        >
                          {cell.date.slice(8)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      90-Day Habit Heatmap
                    </span>
                    <span className="text-[10px] text-slate-400">90 days up to {selectedDate}</span>
                  </div>
                  <div className="grid grid-cols-15 gap-1">
                    {stats.heatmap90Days.map((cell) => {
                      const cls =
                        cell.state === 'done'
                          ? 'bg-emerald-500'
                          : cell.state === 'rest'
                          ? 'bg-amber-300 dark:bg-amber-800'
                          : cell.state === 'missed'
                          ? 'bg-rose-300 dark:bg-rose-900'
                          : 'bg-slate-200 dark:bg-slate-800';
                      return (
                        <div
                          key={cell.date}
                          title={`${cell.date}: ${cell.state}`}
                          className={`h-3.5 rounded-xs ${cls}`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
