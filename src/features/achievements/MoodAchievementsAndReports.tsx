import React, { useMemo, useState } from 'react';
import {
  addDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import {
  Award,
  Download,
  EyeOff,
  FileSpreadsheet,
  Lock,
  Printer,
  Smile,
  Sparkles,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import {
  evaluateAchievements,
  formatDuration,
  generateCSVWithBOM,
  getDailyMotivationalLine,
} from '../../lib/phase3Engine';
import { expandTasksForDate, expandTasksForRange } from '../../lib/recurrenceEngine';
import { computeDayScore } from '../../lib/analyticsEngine';
import { Task } from '../../types';

export const TodayMotivationAndFocusStrip: React.FC = () => {
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const moodLogs = useDayForgeStore((s) => s.moodLogs);
  const settings = useDayForgeStore((s) => s.settings);
  const updateSettings = useDayForgeStore((s) => s.updateSettings);
  const logMoodAndEnergy = useDayForgeStore((s) => s.logMoodAndEnergy);

  const motivationalLine = useMemo(
    () => getDailyMotivationalLine(selectedDate),
    [selectedDate]
  );

  // Daily focus progress
  const dailyFocusMinutes = useMemo(
    () =>
      timeLogs
        .filter((l) => (l.occurrenceDate || l.startedAt.slice(0, 10)) === selectedDate)
        .reduce((acc, l) => acc + l.durationMinutes, 0),
    [timeLogs, selectedDate]
  );
  const dailyTarget = Math.max(15, settings.dailyFocusTargetMinutes || 240);
  const dailyPct = Math.min(100, Math.round((dailyFocusMinutes / dailyTarget) * 100));

  // Weekly focus progress
  const weekMonday = useMemo(
    () => format(startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    [selectedDate]
  );
  const weekSunday = useMemo(
    () => format(addDays(parseISO(weekMonday), 6), 'yyyy-MM-dd'),
    [weekMonday]
  );
  const weeklyFocusMinutes = useMemo(
    () =>
      timeLogs
        .filter((l) => {
          const d = l.occurrenceDate || l.startedAt.slice(0, 10);
          return d >= weekMonday && d <= weekSunday;
        })
        .reduce((acc, l) => acc + l.durationMinutes, 0),
    [timeLogs, weekMonday, weekSunday]
  );
  const weeklyTarget = Math.max(60, settings.weeklyFocusTargetMinutes || 1440);
  const weeklyPct = Math.min(100, Math.round((weeklyFocusMinutes / weeklyTarget) * 100));

  // Mood & Energy for selectedDate
  const existingMood = useMemo(
    () => moodLogs.find((m) => m.date === selectedDate),
    [moodLogs, selectedDate]
  );

  const [isMoodPopoverOpen, setIsMoodPopoverOpen] = useState(false);
  const [moodVal, setMoodVal] = useState<number>(existingMood?.mood ?? 4);
  const [energyVal, setEnergyVal] = useState<number>(existingMood?.energy ?? 4);
  const [noteVal, setNoteVal] = useState<string>(existingMood?.note ?? '');

  const openCheckIn = () => {
    setMoodVal(existingMood?.mood ?? 4);
    setEnergyVal(existingMood?.energy ?? 4);
    setNoteVal(existingMood?.note ?? '');
    setIsMoodPopoverOpen((v) => !v);
  };

  const handleSaveMood = (e: React.FormEvent) => {
    e.preventDefault();
    logMoodAndEnergy(selectedDate, moodVal, energyVal, noteVal.trim());
    setIsMoodPopoverOpen(false);
  };

  return (
    <div className="px-6 pt-3 pb-1 space-y-2.5 print:hidden">
      {/* Daily Motivational Line */}
      {settings.showDailyMotivation !== false && (
        <div
          className="px-3.5 py-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-3"
          data-testid="daily-motivation-banner"
        >
          <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 italic">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>&quot;{motivationalLine}&quot;</span>
          </div>
          <button
            type="button"
            onClick={() => updateSettings({ showDailyMotivation: false })}
            className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 shrink-0"
            title="Hide daily motivational quote"
          >
            <EyeOff className="w-3 h-3" /> Hide
          </button>
        </div>
      )}

      {/* Focus Targets + Mood/Energy Check-in Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {/* Daily Focus Target */}
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-600 dark:text-slate-400">
                Daily Focus Target
              </span>
              <span className="font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {formatDuration(dailyFocusMinutes)} / {formatDuration(dailyTarget)} ({dailyPct}%)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 mt-1.5 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${dailyPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Weekly Focus Target */}
        <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-600 dark:text-slate-400">
                Weekly Focus Target
              </span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                {formatDuration(weeklyFocusMinutes)} / {formatDuration(weeklyTarget)} ({weeklyPct}%)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 mt-1.5 overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all"
                style={{ width: `${weeklyPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Mood & Energy Check-in */}
        <div className="relative">
          <button
            type="button"
            data-testid="today-mood-checkin-btn"
            onClick={openCheckIn}
            className="w-full h-full p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-blue-400 flex items-center justify-between text-xs transition-colors"
          >
            <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
              <Smile className="w-3.5 h-3.5 text-emerald-500" />
              Mood &amp; Energy ({selectedDate})
            </span>
            {existingMood ? (
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">
                M:{existingMood.mood}/5 · E:{existingMood.energy}/5
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                + Log Check-In
              </span>
            )}
          </button>

          {isMoodPopoverOpen && (
            <form
              onSubmit={handleSaveMood}
              className="absolute right-0 top-full mt-1.5 z-30 w-72 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl space-y-3"
              data-testid="today-mood-popover"
            >
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Check-In for {selectedDate}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Mood (1–5)
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMoodVal(n)}
                      className={`flex-1 py-1 rounded text-xs font-bold border ${
                        moodVal === n
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Energy (1–5)
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setEnergyVal(n)}
                      className={`flex-1 py-1 rounded text-xs font-bold border ${
                        energyVal === n
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={noteVal}
                onChange={(e) => setNoteVal(e.target.value)}
                placeholder="1-line check-in note..."
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsMoodPopoverOpen(false)}
                  className="px-2.5 py-1 text-xs text-slate-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-mood-checkin-btn"
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white"
                >
                  Save
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export const AchievementsWorkspacePage: React.FC = () => {
  const tasks = useDayForgeStore((s) => s.tasks);
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const dayReviews = useDayForgeStore((s) => s.dayReviews);
  const weeklyReviews = useDayForgeStore((s) => s.weeklyReviews);
  const habitChecks = useDayForgeStore((s) => s.habitChecks);
  const settings = useDayForgeStore((s) => s.settings);
  const unlockedAchievements = useDayForgeStore((s) => s.unlockedAchievements);

  const evaluation = useMemo(
    () =>
      evaluateAchievements({
        tasks,
        timeLogs,
        dayReviews,
        weeklyReviews,
        habitChecks,
        settings,
        unlockedAchievements,
      }),
    [tasks, timeLogs, dayReviews, weeklyReviews, habitChecks, settings, unlockedAchievements]
  );

  const unlockedCount = evaluation.evaluated.filter((a) => a.unlocked).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Milestones &amp; Achievements
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Earned strictly from your real completed tasks, focus sessions, habit streaks, and reviews.{' '}
            <strong>Seeded demo data never counts toward achievements.</strong>
          </p>
        </div>

        <div className="px-4 py-2 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-500" />
          <div className="text-xs">
            <span className="font-bold text-amber-900 dark:text-amber-200">
              {unlockedCount} / {evaluation.evaluated.length}
            </span>{' '}
            <span className="text-amber-700 dark:text-amber-300">Unlocked</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {evaluation.evaluated.map((ach) => (
          <div
            key={ach.id}
            data-testid={`achievement-card-${ach.id}`}
            className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
              ach.unlocked
                ? 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-700/80 shadow-xs'
                : 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-85'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                    ach.unlocked
                      ? 'bg-amber-100 dark:bg-amber-950/70'
                      : 'bg-slate-200/70 dark:bg-slate-800'
                  }`}
                >
                  {ach.unlocked ? ach.icon : <Lock className="w-4 h-4 text-slate-400" />}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {ach.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {ach.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-500">
                  Progress: {ach.current} / {ach.target} {ach.unit}
                </span>
                {ach.unlocked ? (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    Unlocked {ach.unlockedAt ? ach.unlockedAt.slice(0, 10) : ''}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-400">
                    {ach.percent}%
                  </span>
                )}
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    ach.unlocked ? 'bg-amber-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${ach.percent}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ReportsAndExportPage: React.FC = () => {
  const tasks = useDayForgeStore((s) => s.tasks);
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const habits = useDayForgeStore((s) => s.habits);
  const habitChecks = useDayForgeStore((s) => s.habitChecks);
  const moodLogs = useDayForgeStore((s) => s.moodLogs);
  const categories = useDayForgeStore((s) => s.categories);
  const settings = useDayForgeStore((s) => s.settings);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);

  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [csvDataset, setCsvDataset] = useState<
    'tasks' | 'timelogs' | 'daily_summaries' | 'habits' | 'mood'
  >('tasks');
  const [csvStartDate, setCsvStartDate] = useState(
    format(subDays(new Date(), 14), 'yyyy-MM-dd')
  );
  const [csvEndDate, setCsvEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [csvCategory, setCsvCategory] = useState('All');

  // Generate CSV Data & Preview
  const csvResult = useMemo(() => {
    if (csvDataset === 'tasks') {
      const expanded = expandTasksForRange(tasks, csvStartDate, csvEndDate).filter((t: Task) =>
        csvCategory === 'All' ? true : t.category === csvCategory
      );
      const headers = [
        'Date',
        'Title',
        'Category',
        'Priority',
        'Status',
        'Start',
        'End',
        'EstimatedMinutes',
        'Tags',
      ];
      const rows = expanded.map((t: Task) => [
        t.date,
        t.title,
        t.category,
        t.priority,
        t.status || 'To Do',
        t.start || '',
        t.end || '',
        t.estimatedMinutes,
        t.tags.join(';'),
      ]);
      return {
        filename: `dayforge-tasks-${csvStartDate}-to-${csvEndDate}.csv`,
        content: generateCSVWithBOM(headers, rows),
        rowCount: rows.length,
      };
    }

    if (csvDataset === 'timelogs') {
      const filtered = timeLogs.filter((l) => {
        const d = l.occurrenceDate || l.startedAt.slice(0, 10);
        return d >= csvStartDate && d <= csvEndDate;
      });
      const headers = ['Date', 'TaskID', 'Type', 'DurationMinutes', 'StartedAt', 'EndedAt'];
      const rows = filtered.map((l) => [
        l.occurrenceDate || l.startedAt.slice(0, 10),
        l.taskId,
        l.type,
        l.durationMinutes,
        l.startedAt,
        l.endedAt,
      ]);
      return {
        filename: `dayforge-timelogs-${csvStartDate}-to-${csvEndDate}.csv`,
        content: generateCSVWithBOM(headers, rows),
        rowCount: rows.length,
      };
    }

    if (csvDataset === 'daily_summaries') {
      const headers = [
        'Date',
        'PlannedTasks',
        'CompletedTasks',
        'CompletionRatePct',
        'PlannedMinutes',
        'ActualMinutes',
        'ProductivityScore',
      ];
      const rows: Array<Array<string | number>> = [];
      let cur = parseISO(csvStartDate);
      const end = parseISO(csvEndDate);
      while (cur <= end) {
        const dStr = format(cur, 'yyyy-MM-dd');
        const dayTasks = expandTasksForDate(tasks, dStr);
        const st = computeDayScore(dStr, dayTasks, timeLogs, settings);
        rows.push([
          dStr,
          st.activePlannedCount,
          st.completedCount,
          st.completionRate,
          st.plannedMinutes,
          st.actualMinutes,
          st.productivityScore ?? 0,
        ]);
        cur = addDays(cur, 1);
      }
      return {
        filename: `dayforge-daily-summaries-${csvStartDate}-to-${csvEndDate}.csv`,
        content: generateCSVWithBOM(headers, rows),
        rowCount: rows.length,
      };
    }

    if (csvDataset === 'habits') {
      const filtered = habitChecks.filter(
        (c) => c.date >= csvStartDate && c.date <= csvEndDate
      );
      const headers = ['Date', 'HabitID', 'HabitTitle', 'Status', 'Count'];
      const rows = filtered.map((c) => {
        const h = habits.find((hb) => hb.id === c.habitId);
        return [
          c.date,
          c.habitId,
          h?.title || 'Habit',
          c.status || (c.completed ? 'done' : 'missed'),
          c.count ?? 1,
        ];
      });
      return {
        filename: `dayforge-habits-${csvStartDate}-to-${csvEndDate}.csv`,
        content: generateCSVWithBOM(headers, rows),
        rowCount: rows.length,
      };
    }

    // mood
    const filtered = moodLogs.filter(
      (m) => m.date >= csvStartDate && m.date <= csvEndDate
    );
    const headers = ['Date', 'Mood', 'Energy', 'Note'];
    const rows = filtered.map((m) => [m.date, m.mood, m.energy, m.note || '']);
    return {
      filename: `dayforge-mood-${csvStartDate}-to-${csvEndDate}.csv`,
      content: generateCSVWithBOM(headers, rows),
      rowCount: rows.length,
    };
  }, [csvDataset, csvStartDate, csvEndDate, csvCategory, tasks, timeLogs, habits, habitChecks, moodLogs, settings]);

  const handleDownloadCSV = () => {
    const blob = new Blob([csvResult.content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Report Range calculation for Print-Friendly Report
  const reportData = useMemo(() => {
    const base = parseISO(selectedDate);
    let rStart = selectedDate;
    let rEnd = selectedDate;
    let title = `Daily Report · ${selectedDate}`;

    if (reportPeriod === 'weekly') {
      const mon = startOfWeek(base, { weekStartsOn: 1 });
      rStart = format(mon, 'yyyy-MM-dd');
      rEnd = format(addDays(mon, 6), 'yyyy-MM-dd');
      title = `Weekly Report · ${rStart} to ${rEnd}`;
    } else if (reportPeriod === 'monthly') {
      rStart = format(startOfMonth(base), 'yyyy-MM-dd');
      rEnd = format(endOfMonth(base), 'yyyy-MM-dd');
      title = `Monthly Report · ${format(base, 'MMMM yyyy')}`;
    }

    const rangeTasks = expandTasksForRange(tasks, rStart, rEnd);
    const completed = rangeTasks.filter((t: Task) => t.status === 'Completed');
    const plannedMinutes = rangeTasks.reduce((a: number, t: Task) => a + t.estimatedMinutes, 0);
    const actualMinutes = timeLogs
      .filter((l) => {
        const d = l.occurrenceDate || l.startedAt.slice(0, 10);
        return d >= rStart && d <= rEnd;
      })
      .reduce((a, l) => a + l.durationMinutes, 0);
    const completionPct =
      rangeTasks.length > 0 ? Math.round((completed.length / rangeTasks.length) * 100) : 0;

    return {
      title,
      rStart,
      rEnd,
      totalTasks: rangeTasks.length,
      completedCount: completed.length,
      completionPct,
      plannedMinutes,
      actualMinutes,
      tasksList: rangeTasks.slice(0, 30),
    };
  }, [selectedDate, reportPeriod, tasks, timeLogs]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 print:p-0 print:max-w-none">
      {/* CSV Export Section (Hidden when printing) */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                CSV Data Export (UTF-8 with BOM)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Export your filtered data with RFC 4180 escaping so Excel and Google Sheets open special characters cleanly.
            </p>
          </div>
          <button
            type="button"
            data-testid="download-csv-btn"
            onClick={handleDownloadCSV}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 self-start sm:self-center"
          >
            <Download className="w-3.5 h-3.5" /> Download .CSV ({csvResult.rowCount} rows)
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Dataset
            </label>
            <select
              aria-label="CSV Dataset"
              value={csvDataset}
              onChange={(e) => setCsvDataset(e.target.value as any)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="tasks">Tasks</option>
              <option value="timelogs">Time Logs</option>
              <option value="daily_summaries">Daily Summaries</option>
              <option value="habits">Habit Check-ins</option>
              <option value="mood">Mood &amp; Energy Logs</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={csvStartDate}
              onChange={(e) => setCsvStartDate(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={csvEndDate}
              onChange={(e) => setCsvEndDate(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Category Filter
            </label>
            <select
              value={csvCategory}
              onChange={(e) => setCsvCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="All">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Inline CSV Preview */}
        <pre
          data-testid="csv-preview-box"
          className="p-3 rounded-xl bg-slate-950 text-slate-200 text-[11px] font-mono overflow-x-auto max-h-40"
        >
          {csvResult.content.slice(1, 900)}
        </pre>
      </div>

      {/* Print-Friendly A4 Report Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setReportPeriod(p)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                  reportPeriod === p
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {p} Report
              </button>
            ))}
          </div>

          <button
            type="button"
            data-testid="print-pdf-report-btn"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
          </button>
        </div>

        {/* Printable A4 Sheet (Forced Light Theme on Print) */}
        <div
          data-testid="printable-a4-report"
          className="p-8 rounded-2xl bg-white dark:bg-slate-900 print:bg-white print:text-slate-900 border border-slate-200 dark:border-slate-800 print:border-none shadow-xs space-y-6"
        >
          <div className="border-b border-slate-200 dark:border-slate-800 print:border-slate-300 pb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
                DayForge Productivity Report
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 print:text-slate-900 mt-0.5">
                {reportData.title}
              </h1>
            </div>
            <div className="text-right text-xs text-slate-500">
              Generated {format(new Date(), 'yyyy-MM-dd HH:mm')}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 print:bg-slate-50 border border-slate-200/70 dark:border-slate-700">
              <div className="text-xs text-slate-500">Tasks Completed</div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100 print:text-slate-900 mt-0.5">
                {reportData.completedCount} / {reportData.totalTasks} ({reportData.completionPct}%)
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 print:bg-slate-50 border border-slate-200/70 dark:border-slate-700">
              <div className="text-xs text-slate-500">Planned Time</div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100 print:text-slate-900 mt-0.5">
                {formatDuration(reportData.plannedMinutes)}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 print:bg-slate-50 border border-slate-200/70 dark:border-slate-700">
              <div className="text-xs text-slate-500">Actual Tracked Time</div>
              <div className="text-xl font-bold text-blue-600 mt-0.5">
                {formatDuration(reportData.actualMinutes)}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Scheduled Tasks Breakdown ({reportData.tasksList.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Task</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {reportData.tasksList.map((t: Task) => (
                    <tr key={`${t.id}-${t.date}`}>
                      <td className="py-2 pr-3 font-mono text-[11px]">{t.date}</td>
                      <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100 print:text-slate-900">
                        {t.title}
                      </td>
                      <td className="py-2 pr-3">{t.category}</td>
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        {t.start}–{t.end} ({t.estimatedMinutes}m)
                      </td>
                      <td className="py-2 font-semibold">{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
