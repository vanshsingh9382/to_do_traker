import React, { useState, useMemo } from 'react';
import { eachDayOfInterval, format, parseISO, subDays } from 'date-fns';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  Info,
  Flame,
  Award,
  CheckCircle2,
  Clock,
  TrendingUp,
  Repeat,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import {
  computeDayScore,
  computeProductiveHours,
  computeStreaksAndSummary,
} from '../../lib/analyticsEngine';
import { expandTasksForRange } from '../../lib/recurrenceEngine';
import { computeCompletionPctForDates, computeHabitStats } from '../../lib/habitEngine';
import {
  computeMoodEnergySeriesAndObservation,
  computeTimeByQuadrant,
} from '../../lib/phase3Engine';

type RangeFilter = 'day' | 'week' | 'month' | 'year';

export const AnalyticsDashboard: React.FC = () => {
  const tasks = useDayForgeStore((s) => s.tasks);
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const moodLogs = useDayForgeStore((s) => s.moodLogs);
  const dayReviews = useDayForgeStore((s) => s.dayReviews);
  const habits = useDayForgeStore((s) => s.habits);
  const habitChecks = useDayForgeStore((s) => s.habitChecks);
  const categories = useDayForgeStore((s) => s.categories);
  const settings = useDayForgeStore((s) => s.settings);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);

  const [range, setRange] = useState<RangeFilter>('month');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [habitFilter, setHabitFilter] = useState<string>('All');
  const [showRulesPopover, setShowRulesPopover] = useState(false);

  const refDate = parseISO(selectedDate);
  const daysCount =
    range === 'day' ? 1 : range === 'week' ? 7 : range === 'month' ? 21 : 90;

  const dateInterval = useMemo(() => {
    const start = subDays(refDate, daysCount - 1);
    return eachDayOfInterval({ start, end: refDate }).map((d) =>
      format(d, 'yyyy-MM-dd')
    );
  }, [selectedDate, daysCount]);

  const dateSet = useMemo(() => new Set(dateInterval), [dateInterval]);

  // Summary streaks & KPIs
  const summary = useMemo(
    () => computeStreaksAndSummary(selectedDate, tasks, timeLogs, settings),
    [selectedDate, tasks, timeLogs, settings]
  );

  // Daily score breakdown across selected range (only dates up to selectedDate count as planned)
  const rangeBreakdowns = useMemo(
    () =>
      dateInterval.map((d) =>
        computeDayScore(d, tasks, timeLogs, settings, categoryFilter, selectedDate)
      ),
    [dateInterval, tasks, timeLogs, settings, categoryFilter, selectedDate]
  );

  // 1. Donut (a): Time by Category (actual logged minutes in range)
  const timeByCategoryData = useMemo(() => {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const totals = new Map<string, number>();

    for (const log of timeLogs) {
      const logDate = log.occurrenceDate || log.startedAt.slice(0, 10);
      if (!dateSet.has(logDate)) continue;
      const task = taskMap.get(log.taskId);
      const cat = task?.category || 'Work';
      if (categoryFilter !== 'All' && cat !== categoryFilter) continue;
      totals.set(cat, (totals.get(cat) || 0) + log.durationMinutes);
    }

    return Array.from(totals.entries())
      .map(([name, minutes]) => {
        const catObj = categories.find((c) => c.name === name);
        return {
          name,
          minutes: Math.round(minutes),
          hours: Number((minutes / 60).toFixed(1)),
          color: catObj?.color || '#2563EB',
        };
      })
      .filter((d) => d.minutes > 0);
  }, [timeLogs, tasks, dateSet, categoryFilter, categories]);

  // 2. Donut (b): Completed vs Pending vs Skipped in range (including recurring occurrences)
  const statusDonutData = useMemo(() => {
    const startStr = dateInterval[0] || selectedDate;
    const endStr = dateInterval[dateInterval.length - 1] || selectedDate;
    const inRangeTasks = expandTasksForRange(tasks, startStr, endStr).filter(
      (t) => categoryFilter === 'All' || t.category === categoryFilter
    );
    const completed = inRangeTasks.filter((t) => t.status === 'Completed').length;
    const skipped = inRangeTasks.filter((t) => t.status === 'Skipped').length;
    const pending = inRangeTasks.filter(
      (t) => t.status === 'To Do' || t.status === 'In Progress'
    ).length;

    return [
      { name: 'Completed', value: completed, color: '#16A34A' },
      { name: 'Pending', value: pending, color: '#2563EB' },
      { name: 'Skipped', value: skipped, color: '#D97706' },
    ].filter((d) => d.value > 0);
  }, [tasks, dateInterval, selectedDate, categoryFilter]);

  // 3. Trend & Planned vs Actual Bar Data
  const dailyChartData = useMemo(
    () =>
      rangeBreakdowns.map((b) => ({
        dateLabel: b.date.slice(5), // MM-DD
        fullDate: b.date,
        score: b.productivityScore,
        plannedHours: Number((b.plannedMinutes / 60).toFixed(1)),
        actualHours: Number((b.actualMinutes / 60).toFixed(1)),
      })),
    [rangeBreakdowns]
  );

  // 4. 90-Day GitHub-style Consistency Heatmap
  const heatmap90Days = useMemo(() => {
    const start90 = subDays(refDate, 89);
    const days90 = eachDayOfInterval({ start: start90, end: refDate });
    return days90.map((d) => {
      const dStr = format(d, 'yyyy-MM-dd');
      const b = computeDayScore(dStr, tasks, timeLogs, settings, categoryFilter, selectedDate);
      return {
        date: dStr,
        score: b.productivityScore,
        goalMet: b.goalMet,
      };
    });
  }, [selectedDate, tasks, timeLogs, settings, categoryFilter]);

  // 5. Productive Hours of the Day (06:00 - 23:00)
  const productiveHoursData = useMemo(() => {
    const filteredLogs = timeLogs.filter((l) =>
      dateSet.has(l.occurrenceDate || l.startedAt.slice(0, 10))
    );
    return computeProductiveHours(filteredLogs);
  }, [timeLogs, dateSet]);

  // 6. Phase 2 Habit Analytics (Independent of Task Productivity Score)
  const activeHabits = useMemo(
    () => habits.filter((h) => !h.archived),
    [habits]
  );

  const filteredHabits = useMemo(
    () =>
      habitFilter === 'All'
        ? activeHabits
        : activeHabits.filter((h) => h.id === habitFilter),
    [activeHabits, habitFilter]
  );

  const perHabitBarsData = useMemo(
    () =>
      filteredHabits.map((h) => {
        const pct = computeCompletionPctForDates(
          h,
          dateInterval,
          habitChecks,
          settings.workingDays
        );
        const st = computeHabitStats(
          h,
          habitChecks,
          selectedDate,
          settings.workingDays
        );
        return {
          name: h.title.length > 22 ? `${h.title.slice(0, 22)}…` : h.title,
          fullTitle: h.title,
          completionPct: pct,
          streak: st.currentStreak,
          color: h.color || '#16A34A',
        };
      }),
    [filteredHabits, dateInterval, habitChecks, settings.workingDays, selectedDate]
  );

  const habitTrendData = useMemo(() => {
    return dateInterval.map((dStr, idx) => {
      const windowDates = dateInterval.slice(Math.max(0, idx - 6), idx + 1);
      if (filteredHabits.length === 0) {
        return { dateLabel: dStr.slice(5), completionPct: 0 };
      }
      const avg =
        filteredHabits.reduce(
          (sum, h) =>
            sum +
            computeCompletionPctForDates(
              h,
              windowDates,
              habitChecks,
              settings.workingDays
            ),
          0
        ) / filteredHabits.length;
      return {
        dateLabel: dStr.slice(5),
        completionPct: Math.round(avg),
      };
    });
  }, [dateInterval, filteredHabits, habitChecks, settings.workingDays]);

  const overallHabitConsistencyPct = useMemo(() => {
    if (perHabitBarsData.length === 0) return 0;
    return Math.round(
      perHabitBarsData.reduce((s, b) => s + b.completionPct, 0) /
        perHabitBarsData.length
    );
  }, [perHabitBarsData]);

  // 7. Phase 3 Donut: Time by Eisenhower Quadrant (from real time logs)
  const timeByQuadrantData = useMemo(() => {
    const startStr = dateInterval[0] || selectedDate;
    const endStr = dateInterval[dateInterval.length - 1] || selectedDate;
    const filteredTasks =
      categoryFilter === 'All'
        ? tasks
        : tasks.filter((t) => t.category === categoryFilter);
    return computeTimeByQuadrant(filteredTasks, timeLogs, startStr, endStr).filter(
      (q) => q.minutes > 0
    );
  }, [tasks, timeLogs, dateInterval, selectedDate, categoryFilter]);

  // 8. Phase 3 Mood & Energy vs Productivity Score (observational insight only when >= 10 logged days)
  const moodEnergyAnalysis = useMemo(
    () =>
      computeMoodEnergySeriesAndObservation(
        moodLogs,
        dayReviews,
        tasks,
        timeLogs,
        settings,
        daysCount,
        selectedDate
      ),
    [moodLogs, dayReviews, tasks, timeLogs, settings, daysCount, selectedDate]
  );

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Productivity &amp; Consistency Analytics
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Calculated strictly from your logged timer sessions, recurring task occurrences, and habit check-ins.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Range Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['day', 'week', 'month', 'year'] as RangeFilter[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                  range === r
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Category Filter */}
          <select
            aria-label="Filter analytics by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200"
          >
            <option value="All">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Calculation Rules Info Popover Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRulesPopover(!showRulesPopover)}
              aria-expanded={showRulesPopover}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-blue-600" />
              Scoring Formula
            </button>

            {showRulesPopover && (
              <div className="absolute right-0 mt-2 z-30 w-80 sm:w-96 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl text-xs space-y-2 text-slate-600 dark:text-slate-300">
                <div className="font-bold text-slate-900 dark:text-white">
                  How DayForge Calculates Your Score
                </div>
                <ul className="list-disc pl-4 space-y-1.5 leading-relaxed">
                  <li>
                    <strong>Completion Rate (50%)</strong>: Completed / (All Planned − Skipped). Recurring occurrences up to today count separately.
                  </li>
                  <li>
                    <strong>Focus Progress (30%)</strong>: Actual logged time / Daily focus target ({settings.dailyFocusTargetMinutes}m), capped at 100%.
                  </li>
                  <li>
                    <strong>Time Accuracy (20%)</strong>: How close actual time was to estimated time on completed tasks (dropped and re-weighted if no accuracy data exists).
                  </li>
                  <li>
                    <strong>Habits Independence</strong>: Habits are tracked as their own consistency stat and never alter your task productivity score.
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6 Stat Cards (5 Task KPIs + Independent Habit Consistency Stat) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Current Streak</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {summary.currentStreak}d
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Rest days protected</div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Longest Streak</span>
            <Award className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {summary.longestStreak}d
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Score ≥ {settings.goalThresholdScore} threshold
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Perfect Days</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {summary.perfectDays}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">100% planned completed</div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Weekly Consistency</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {summary.weeklyConsistency}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Last 7 working days</div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Avg Daily Focus</span>
            <Clock className="w-4 h-4 text-teal-600" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {Math.floor(summary.avgDailyFocusMinutes / 60)}h {summary.avgDailyFocusMinutes % 60}m
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Target: {Math.floor(settings.dailyFocusTargetMinutes / 60)}h{' '}
            {settings.dailyFocusTargetMinutes % 60}m
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Habit Consistency</span>
            <Repeat className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {overallHabitConsistencyPct}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Independent ritual stat</div>
        </div>
      </div>

      {/* Charts Grid Row 1: Productivity Score Trend (Area) + Planned vs Actual Hours (Bar) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Productivity Score Trend (0–100)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Daily composite score across selected period (Goal threshold: {settings.goalThresholdScore})
            </p>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="score"
                  name="Productivity Score"
                  stroke="#2563EB"
                  fill="#2563EB"
                  fillOpacity={0.16}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Planned vs. Actual Hours Per Day
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Comparison of estimated task hours vs real timer &amp; manual logs
            </p>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="plannedHours" name="Planned (h)" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actualHours" name="Actual (h)" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Phase 2 Habit Analytics Section (Weekly Completion % Trend + Per-Habit Completion Bars) */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Habit Completion Analytics (Independent of Task Score)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rolling weekly completion % trend and per-habit completion bars across the selected {range} range.
            </p>
          </div>

          <select
            aria-label="Filter habit analytics by habit"
            value={habitFilter}
            onChange={(e) => setHabitFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200"
          >
            <option value="All">All Habits</option>
            {activeHabits.map((h) => (
              <option key={h.id} value={h.id}>
                {h.icon ? `${h.icon} ` : ''}
                {h.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={habitTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => `${val}%`} />
                <Area
                  type="monotone"
                  dataKey="completionPct"
                  name="Rolling Weekly Habit %"
                  stroke="#16A34A"
                  fill="#16A34A"
                  fillOpacity={0.18}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perHabitBarsData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => `${val}%`} />
                <Bar dataKey="completionPct" name="Completion %" fill="#16A34A" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Grid Row 2: Two Donuts + Most Productive Hours of Day */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donut A: Time by Category */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Focused Time by Category
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Distribution of logged minutes
          </p>
          {timeByCategoryData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400">
              No logged focus sessions in this range yet.
            </div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={timeByCategoryData}
                    dataKey="minutes"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                  >
                    {timeByCategoryData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => `${val} mins`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Donut B: Task Status Breakdown */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Completed vs. Pending vs. Skipped
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Task execution breakdown
          </p>
          {statusDonutData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400">
              No tasks scheduled in this range.
            </div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDonutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                  >
                    {statusDonutData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Bar F: Most Productive Hours of the Day */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Most Productive Hours of the Day
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Total minutes logged by start hour
          </p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productiveHoursData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val: number) => `${val} mins`} />
                <Bar dataKey="minutes" name="Focused Mins" fill="#0D9488" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 90-Day GitHub-style Consistency Heatmap */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              90-Day Consistency Heatmap
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Each square represents a day&apos;s Productivity Score (blank = no activity)
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span>No data</span>
            <span className="w-3 h-3 rounded-xs bg-slate-100 dark:bg-slate-800 inline-block" />
            <span className="w-3 h-3 rounded-xs bg-blue-200 dark:bg-blue-900 inline-block" />
            <span className="w-3 h-3 rounded-xs bg-blue-400 dark:bg-blue-700 inline-block" />
            <span className="w-3 h-3 rounded-xs bg-blue-600 dark:bg-blue-500 inline-block" />
            <span>High Score</span>
          </div>
        </div>

        <div className="grid grid-cols-15 sm:grid-cols-30 gap-1.5">
          {heatmap90Days.map((cell) => {
            const s = cell.score;
            const colorClass =
              s === null
                ? 'bg-slate-100 dark:bg-slate-800/70'
                : s >= 80
                ? 'bg-blue-600 dark:bg-blue-500'
                : s >= 60
                ? 'bg-blue-400 dark:bg-blue-600'
                : s >= 35
                ? 'bg-blue-200 dark:bg-blue-800'
                : 'bg-slate-200 dark:bg-slate-700';

            return (
              <div
                key={cell.date}
                title={`${cell.date}: ${s !== null ? `Score ${s}/100` : 'No activity'}`}
                className={`h-4 rounded-xs ${colorClass} transition-transform hover:scale-125`}
              />
            );
          })}
        </div>
      </div>

      {/* Phase 3 Analytics Row: Time by Quadrant (Donut) + Mood & Energy vs Productivity Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donut C: Time by Eisenhower Quadrant */}
        <div
          className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          data-testid="time-by-quadrant-card"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Time by Quadrant (Eisenhower Matrix)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            Real logged focus minutes by urgency &amp; importance
          </p>
          {timeByQuadrantData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400">
              No logged focus sessions in this range yet.
            </div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={timeByQuadrantData}
                    dataKey="minutes"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                  >
                    {timeByQuadrantData.map((entry) => (
                      <Cell key={entry.id} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => `${val} mins`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Mood & Energy vs Productivity Score */}
        <div
          className="lg:col-span-2 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
          data-testid="mood-energy-analytics-card"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Mood &amp; Energy vs. Productivity Score
              </h3>
              <span className="text-[11px] font-medium text-slate-500">
                {moodEnergyAnalysis.loggedDaysCount} logged check-in day(s) in range
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
              Tracks daily mood (1–5) and energy (1–5) alongside your daily Productivity Score.
            </p>
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={moodEnergyAnalysis.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" domain={[1, 5]} tick={{ fontSize: 10 }} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="mood"
                  name="Mood (1-5)"
                  stroke="#10B981"
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="energy"
                  name="Energy (1-5)"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="productivityScore"
                  name="Score (0-100)"
                  stroke="#2563EB"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            {moodEnergyAnalysis.observation ? (
              <div
                className="text-emerald-700 dark:text-emerald-300 font-medium"
                data-testid="mood-observation-note"
              >
                {moodEnergyAnalysis.observation}
              </div>
            ) : (
              <div
                className="text-slate-500 dark:text-slate-400"
                data-testid="mood-insufficient-days-note"
              >
                Log Mood &amp; Energy on at least 10 days ({moodEnergyAnalysis.loggedDaysCount}/10
                logged in this view) to unlock observational correlation notes.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
