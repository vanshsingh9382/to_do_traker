import React, { useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO, startOfWeek, subWeeks } from 'date-fns';
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  X,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { expandTasksForDate } from '../../lib/recurrenceEngine';
import { computeDayScore } from '../../lib/analyticsEngine';
import {
  computeDayCapacityAndLoad,
  computeGoalProgress,
  computeWeeklyReviewStats,
  formatDuration,
} from '../../lib/phase3Engine';

export const DailyWrapUpModal: React.FC = () => {
  const isOpen = useDayForgeStore((s) => s.isWrapUpModalOpen);
  const setWrapUpModalOpen = useDayForgeStore((s) => s.setWrapUpModalOpen);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const tasks = useDayForgeStore((s) => s.tasks);
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const habits = useDayForgeStore((s) => s.habits);
  const habitChecks = useDayForgeStore((s) => s.habitChecks);
  const dayReviews = useDayForgeStore((s) => s.dayReviews);
  const moodLogs = useDayForgeStore((s) => s.moodLogs);
  const dayTemplates = useDayForgeStore((s) => s.dayTemplates);
  const settings = useDayForgeStore((s) => s.settings);
  const externalEvents = useDayForgeStore((s) => s.externalEvents);
  const googleEvents = useDayForgeStore((s) => s.googleEvents);
  const completeDailyWrapUp = useDayForgeStore((s) => s.completeDailyWrapUp);

  const tomorrowDate = useMemo(
    () => format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'),
    [selectedDate]
  );

  const existingReview = useMemo(
    () => dayReviews.find((r) => r.date === selectedDate),
    [dayReviews, selectedDate]
  );
  const existingMood = useMemo(
    () => moodLogs.find((m) => m.date === selectedDate),
    [moodLogs, selectedDate]
  );

  const dayTasks = useMemo(
    () => expandTasksForDate(tasks, selectedDate),
    [tasks, selectedDate]
  );
  const completedTasks = useMemo(
    () => dayTasks.filter((t) => t.status === 'Completed'),
    [dayTasks]
  );
  const unfinishedTasks = useMemo(
    () => dayTasks.filter((t) => t.status === 'To Do' || t.status === 'In Progress'),
    [dayTasks]
  );

  const dayStats = useMemo(
    () => computeDayScore(selectedDate, dayTasks, timeLogs, settings),
    [selectedDate, dayTasks, timeLogs, settings]
  );

  const habitsDoneCount = useMemo(() => {
    const activeHabits = habits.filter((h) => !h.archived);
    let done = 0;
    for (const h of activeHabits) {
      const chk = habitChecks.find((c) => c.habitId === h.id && c.date === selectedDate);
      if (chk && (chk.status === 'done' || chk.completed)) done++;
    }
    return { done, total: activeHabits.length };
  }, [habits, habitChecks, selectedDate]);

  const allExternalEvents = useMemo(
    () => [...externalEvents, ...googleEvents],
    [externalEvents, googleEvents]
  );

  const tomorrowTasks = useMemo(
    () => expandTasksForDate(tasks, tomorrowDate),
    [tasks, tomorrowDate]
  );
  const tomorrowExternal = useMemo(
    () => allExternalEvents.filter((e) => e.date === tomorrowDate),
    [allExternalEvents, tomorrowDate]
  );
  const tomorrowLoad = useMemo(
    () => computeDayCapacityAndLoad(tomorrowDate, tomorrowTasks, allExternalEvents, settings),
    [tomorrowDate, tomorrowTasks, allExternalEvents, settings]
  );

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [mostImportantTask, setMostImportantTask] = useState('');
  const [wentWell, setWentWell] = useState('');
  const [didntFinish, setDidntFinish] = useState('');
  const [distractions, setDistractions] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [appendToDailyNote, setAppendToDailyNote] = useState(true);
  const [mood, setMood] = useState<number>(4);
  const [energy, setEnergy] = useState<number>(4);
  const [moodNote, setMoodNote] = useState('');

  const [unfinishedMap, setUnfinishedMap] = useState<
    Record<
      string,
      { action: 'tomorrow' | 'date' | 'skip' | 'leave'; targetDate: string }
    >
  >({});

  const [topThreeTomorrow, setTopThreeTomorrow] = useState<[string, string, string]>([
    '',
    '',
    '',
  ]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setMostImportantTask(
      existingReview?.mostImportantTask ||
        completedTasks[0]?.title ||
        existingReview?.dailyGoal ||
        ''
    );
    setWentWell(existingReview?.wentWell || '');
    setDidntFinish(existingReview?.didntFinish || '');
    setDistractions(existingReview?.distractions || '');
    setToImprove(existingReview?.toImprove || '');
    setMood(existingMood?.mood ?? existingReview?.mood ?? 4);
    setEnergy(existingMood?.energy ?? existingReview?.energy ?? 4);
    setMoodNote(existingMood?.note ?? existingReview?.moodNote ?? '');

    const initMap: Record<
      string,
      { action: 'tomorrow' | 'date' | 'skip' | 'leave'; targetDate: string }
    > = {};
    for (const t of unfinishedTasks) {
      initMap[t.id] = {
        action: 'tomorrow',
        targetDate: tomorrowDate,
      };
    }
    setUnfinishedMap(initMap);

    const existingTop = existingReview?.topThreeTomorrow || [];
    setTopThreeTomorrow([
      existingTop[0] || tomorrowTasks[0]?.title || '',
      existingTop[1] || tomorrowTasks[1]?.title || '',
      existingTop[2] || tomorrowTasks[2]?.title || '',
    ]);
    setSelectedTemplateId('');
  }, [isOpen, selectedDate]);

  if (!isOpen) return null;

  const handleFinishAndApply = () => {
    const decisions = Object.entries(unfinishedMap).map(([taskId, cfg]) => ({
      taskId,
      action: cfg.action,
      targetDate: cfg.targetDate,
    }));

    completeDailyWrapUp({
      date: selectedDate,
      mostImportantTask: mostImportantTask.trim(),
      wentWell: wentWell.trim(),
      didntFinish: didntFinish.trim(),
      distractions: distractions.trim(),
      toImprove: toImprove.trim(),
      appendToDailyNote,
      mood,
      energy,
      moodNote: moodNote.trim(),
      unfinishedDecisions: decisions,
      topThreeTomorrow: topThreeTomorrow.map((s) => s.trim()).filter(Boolean),
      applyDayTemplateId: selectedTemplateId || undefined,
      tomorrowDate,
    });

    setWrapUpModalOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Daily Wrap-Up Ritual"
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Daily Wrap-Up Ritual · {selectedDate}
              </h2>
              {existingReview?.closed && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Closed (Editable)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Step {step} of 4 — Every step can be skipped or customized before applying.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWrapUpModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close Daily Wrap-Up"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-2.5 bg-slate-100/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 grid grid-cols-4 gap-2">
          {[
            { id: 1, label: '1. Summary' },
            { id: 2, label: '2. Reflection' },
            { id: 3, label: `3. Unfinished (${unfinishedTasks.length})` },
            { id: 4, label: '4. Plan Tomorrow' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id as 1 | 2 | 3 | 4)}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors text-center ${
                step === s.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Step Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {step === 1 && (
            <div className="space-y-5" data-testid="wrapup-step-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70">
                  <div className="text-[11px] font-medium text-slate-500">Tasks Completed</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                    {dayStats.completedCount} / {dayStats.activePlannedCount}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    {dayStats.completionRate}% completion rate
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70">
                  <div className="text-[11px] font-medium text-slate-500">Planned vs Actual</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                    {formatDuration(dayStats.actualMinutes)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    of {formatDuration(dayStats.plannedMinutes)} planned
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70">
                  <div className="text-[11px] font-medium text-slate-500">Day Score &amp; Habits</div>
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5 tabular-nums">
                    {dayStats.productivityScore ?? 0} pts
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Habits: {habitsDoneCount.done}/{habitsDoneCount.total} done
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Most important thing I did today
                </label>
                {completedTasks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {completedTasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setMostImportantTask(t.title)}
                        className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                          mostImportantTask === t.title
                            ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        ✓ {t.title}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={mostImportantTask}
                  onChange={(e) => setMostImportantTask(e.target.value)}
                  placeholder="Pick a completed task above or type your highlight..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="wrapup-step-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    What went well today?
                  </label>
                  <textarea
                    rows={2}
                    value={wentWell}
                    onChange={(e) => setWentWell(e.target.value)}
                    placeholder="Key wins, flow states, habits kept..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    What didn&apos;t I finish (and why)?
                  </label>
                  <textarea
                    rows={2}
                    value={didntFinish}
                    onChange={(e) => setDidntFinish(e.target.value)}
                    placeholder="Scope creep, overbooked afternoon..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    What distracted me?
                  </label>
                  <textarea
                    rows={2}
                    value={distractions}
                    onChange={(e) => setDistractions(e.target.value)}
                    placeholder="Context switching, notifications, fatigue..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    What to improve tomorrow?
                  </label>
                  <textarea
                    rows={2}
                    value={toImprove}
                    onChange={(e) => setToImprove(e.target.value)}
                    placeholder="Start with 90m deep work before checking messages..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Mood & Energy Check-in */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Mood (1–5)
                    </label>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setMood(val)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            mood === val
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Energy (1–5)
                    </label>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setEnergy(val)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            energy === val
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <input
                  type="text"
                  value={moodNote}
                  onChange={(e) => setMoodNote(e.target.value)}
                  placeholder="Optional 1-line check-in note..."
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={appendToDailyNote}
                  onChange={(e) => setAppendToDailyNote(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Append this reflection to today&apos;s Daily Note ({selectedDate})
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3" data-testid="wrapup-step-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Choose how to handle each unfinished task. Nothing changes until you click{' '}
                <strong>Finish &amp; Close Day</strong> on Step 4.
              </p>
              {unfinishedTasks.length === 0 ? (
                <div className="p-6 text-center rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto mb-1.5" />
                  <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                    All planned tasks for {selectedDate} are finished!
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {unfinishedTasks.map((t) => {
                    const current = unfinishedMap[t.id] || {
                      action: 'tomorrow',
                      targetDate: tomorrowDate,
                    };
                    return (
                      <div
                        key={t.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {t.title}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {t.category} · {t.start}–{t.end} ({t.estimatedMinutes}m)
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            aria-label={`Action for ${t.title}`}
                            value={current.action}
                            onChange={(e) =>
                              setUnfinishedMap((prev) => ({
                                ...prev,
                                [t.id]: {
                                  ...current,
                                  action: e.target.value as
                                    | 'tomorrow'
                                    | 'date'
                                    | 'skip'
                                    | 'leave',
                                },
                              }))
                            }
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                          >
                            <option value="tomorrow">Carry to tomorrow ({tomorrowDate})</option>
                            <option value="date">Pick another date...</option>
                            <option value="skip">Mark Skipped</option>
                            <option value="leave">Leave on {selectedDate}</option>
                          </select>
                          {current.action === 'date' && (
                            <input
                              type="date"
                              value={current.targetDate}
                              onChange={(e) =>
                                setUnfinishedMap((prev) => ({
                                  ...prev,
                                  [t.id]: { ...current, targetDate: e.target.value },
                                }))
                              }
                              className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4" data-testid="wrapup-step-4">
              {/* Tomorrow capacity & external calendar summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Tomorrow ({tomorrowDate}) Load vs Available Capacity
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {formatDuration(tomorrowLoad.plannedMinutes)} planned /{' '}
                    {formatDuration(tomorrowLoad.availableMinutes)} available ·{' '}
                    {tomorrowExternal.length} calendar event(s)
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    tomorrowLoad.loadState === 'overbooked'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      : tomorrowLoad.loadState === 'nearly_full'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  }`}
                >
                  {tomorrowLoad.loadPercent}% load
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Top 3 Priorities for Tomorrow ({tomorrowDate})
                </label>
                <div className="space-y-2">
                  {[0, 1, 2].map((idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={topThreeTomorrow[idx]}
                      onChange={(e) => {
                        const copy: [string, string, string] = [...topThreeTomorrow] as [
                          string,
                          string,
                          string,
                        ];
                        copy[idx] = e.target.value;
                        setTopThreeTomorrow(copy);
                      }}
                      placeholder={`Priority #${idx + 1} for tomorrow...`}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Optionally Apply a Day Template to Tomorrow
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                >
                  <option value="">No template — keep tomorrow&apos;s schedule as-is</option>
                  {dayTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.blocks.length} blocks)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setWrapUpModalOpen(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Back
              </button>
            )}
            {step < 4 ? (
              <>
                <button
                  type="button"
                  onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Skip step
                </button>
                <button
                  type="button"
                  onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="wrapup-finish-apply-btn"
                onClick={handleFinishAndApply}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              >
                Finish &amp; Close Day
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ReviewsWorkspacePage: React.FC = () => {
  const tasks = useDayForgeStore((s) => s.tasks);
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const habits = useDayForgeStore((s) => s.habits);
  const habitChecks = useDayForgeStore((s) => s.habitChecks);
  const moodLogs = useDayForgeStore((s) => s.moodLogs);
  const goals = useDayForgeStore((s) => s.goals);
  const dayReviews = useDayForgeStore((s) => s.dayReviews);
  const weeklyReviews = useDayForgeStore((s) => s.weeklyReviews);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const setSelectedDate = useDayForgeStore((s) => s.setSelectedDate);
  const setWrapUpModalOpen = useDayForgeStore((s) => s.setWrapUpModalOpen);
  const saveWeeklyReview = useDayForgeStore((s) => s.saveWeeklyReview);
  const settings = useDayForgeStore((s) => s.settings);

  const [activeTab, setActiveTab] = useState<'weekly' | 'daily'>('weekly');

  const currentMonday = useMemo(
    () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    []
  );
  const lastFullWeekMonday = useMemo(
    () => format(subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1), 'yyyy-MM-dd'),
    []
  );

  const [weekStart, setWeekStart] = useState<string>(currentMonday);

  const weeklyStats = useMemo(
    () =>
      computeWeeklyReviewStats(
        weekStart,
        tasks,
        timeLogs,
        habits,
        habitChecks,
        moodLogs,
        dayReviews,
        settings,
        format(new Date(), 'yyyy-MM-dd')
      ),
    [weekStart, tasks, timeLogs, habits, habitChecks, moodLogs, dayReviews, settings]
  );

  const savedWeekly = useMemo(
    () => weeklyReviews.find((w) => w.weekStart === weekStart),
    [weeklyReviews, weekStart]
  );

  const [wins, setWins] = useState('');
  const [lessons, setLessons] = useState('');
  const [nextWeekFocus, setNextWeekFocus] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setWins(savedWeekly?.wins || '');
    setLessons(savedWeekly?.lessons || '');
    setNextWeekFocus(savedWeekly?.nextWeekFocus || '');
    setSavedNotice(false);
  }, [weekStart, savedWeekly]);

  const handleSaveWeeklyReflection = (e: React.FormEvent) => {
    e.preventDefault();
    saveWeeklyReview(weekStart, {
      wins: wins.trim(),
      lessons: lessons.trim(),
      nextWeekFocus: nextWeekFocus.trim(),
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const closedDailyReviews = useMemo(
    () =>
      [...dayReviews]
        .filter((r) => r.closed || r.wentWell || r.mostImportantTask || r.toImprove)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [dayReviews]
  );

  const weeklyFocusTarget = settings.weeklyFocusTargetMinutes ?? 1440;
  const weeklyFocusPct = Math.min(
    100,
    Math.round((weeklyStats.focusMinutes / Math.max(1, weeklyFocusTarget)) * 100)
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Rituals &amp; Reviews
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Close out your day with intention and inspect weekly progress calculated directly from your logs.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('weekly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'weekly'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Weekly Review
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('daily')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'daily'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Daily Wrap-Ups ({closedDailyReviews.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setWrapUpModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" /> Wrap Up {selectedDate}
          </button>
        </div>
      </div>

      {activeTab === 'weekly' ? (
        <div className="space-y-6" data-testid="weekly-review-panel">
          {/* Week Selector Bar */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Week Range:
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                {weeklyStats.weekStart} to {weeklyStats.weekEnd}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setWeekStart(currentMonday)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  weekStart === currentMonday
                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                This week so far
              </button>
              <button
                type="button"
                onClick={() => setWeekStart(lastFullWeekMonday)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  weekStart === lastFullWeekMonday
                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                Last full week
              </button>
              <input
                type="date"
                aria-label="Custom week start date"
                value={weekStart}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const mon = format(
                    startOfWeek(parseISO(e.target.value), { weekStartsOn: 1 }),
                    'yyyy-MM-dd'
                  );
                  setWeekStart(mon);
                }}
                className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          {/* KPI Grid with Previous Week Comparison Arrows */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500">Tasks Completed</div>
              <div
                className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums"
                data-testid="weekly-completed-ratio"
              >
                {weeklyStats.completedTasks} / {weeklyStats.plannedTasks}
              </div>
              <div className="flex items-center gap-1 mt-1 text-xs font-medium">
                <span className="text-slate-700 dark:text-slate-300">
                  {weeklyStats.completionRate}% rate
                </span>
                <span
                  className={`inline-flex items-center ${
                    weeklyStats.prevWeekComparison.completionRateDiff >= 0
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}
                >
                  {weeklyStats.prevWeekComparison.completionRateDiff >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {Math.abs(weeklyStats.prevWeekComparison.completionRateDiff)}% vs prev week
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500">Focus Hours</div>
              <div
                className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums"
                data-testid="weekly-focus-duration"
              >
                {formatDuration(weeklyStats.focusMinutes)}
              </div>
              <div className="flex items-center gap-1 mt-1 text-xs font-medium">
                <span
                  className={`inline-flex items-center ${
                    weeklyStats.prevWeekComparison.focusMinutesDiff >= 0
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}
                >
                  {weeklyStats.prevWeekComparison.focusMinutesDiff >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {formatDuration(Math.abs(weeklyStats.prevWeekComparison.focusMinutesDiff))} vs
                  prev week
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500">Average Productivity Score</div>
              <div
                className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1 tabular-nums"
                data-testid="weekly-average-score"
              >
                {weeklyStats.avgScore ?? 0} pts
              </div>
              <div className="flex items-center gap-1 mt-1 text-xs font-medium">
                <span
                  className={`inline-flex items-center ${
                    (weeklyStats.prevWeekComparison.avgScoreDiff ?? 0) >= 0
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}
                >
                  {(weeklyStats.prevWeekComparison.avgScoreDiff ?? 0) >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {Math.abs(weeklyStats.prevWeekComparison.avgScoreDiff ?? 0)} pts vs prev week
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500">
                Habits &amp; Mood / Energy
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {weeklyStats.habitConsistencyRate}% habits
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Mood: {weeklyStats.avgMood ?? '—'}/5 · Energy:{' '}
                {weeklyStats.avgEnergy ?? '—'}/5
              </div>
            </div>
          </div>

          {/* Weekly Focus Target Progress Bar */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Weekly Focus Target ({formatDuration(weeklyStats.focusMinutes)} /{' '}
                {formatDuration(weeklyFocusTarget)})
              </span>
              <span className="font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {weeklyFocusPct}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${weeklyFocusPct}%` }}
              />
            </div>
          </div>

          {/* Highlights & Plain-Language Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Weekly Highlights Breakdown
              </h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-slate-500">Best Day</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {weeklyStats.bestDay
                      ? `${weeklyStats.bestDay.label} (${weeklyStats.bestDay.score} pts)`
                      : 'No active day yet'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-slate-500">Weakest Day</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {weeklyStats.weakestDay
                      ? `${weeklyStats.weakestDay.label} (${weeklyStats.weakestDay.score} pts)`
                      : 'No active day yet'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-slate-500">Top Category by Time</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {weeklyStats.bestCategoryByTime
                      ? `${weeklyStats.bestCategoryByTime.category} (${formatDuration(
                          weeklyStats.bestCategoryByTime.minutes
                        )})`
                      : 'None logged'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="text-slate-500">Top Category by Completion</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {weeklyStats.bestCategoryByCompletion
                      ? `${weeklyStats.bestCategoryByCompletion.category} (${weeklyStats.bestCategoryByCompletion.rate}%)`
                      : 'None completed'}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Data-Backed Weekly Insights
                </h2>
                <span className="text-[11px] text-slate-500">
                  {weeklyStats.activeDaysCount} active day(s)
                </span>
              </div>
              {weeklyStats.hasEnoughDataForInsights ? (
                <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                  {weeklyStats.insights.map((ins, i) => (
                    <li
                      key={i}
                      className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40"
                    >
                      • {ins}
                    </li>
                  ))}
                </ul>
              ) : (
                <div
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500"
                  data-testid="weekly-not-enough-data"
                >
                  There isn&apos;t enough data yet for this week ({weeklyStats.activeDaysCount}/3
                  active days). Log tasks or focus sessions on at least 3 days to generate
                  plain-language insights.
                </div>
              )}
            </div>
          </div>

          {/* Goal Progress Snapshot */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Active Goals Progress
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {goals
                .filter((g) => g.status !== 'Paused')
                .map((g) => {
                  const prog = computeGoalProgress(g, tasks, timeLogs);
                  return (
                    <div
                      key={g.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {g.title}
                        </span>
                        <span className="font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                          {prog.percent}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${prog.percent}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {prog.completedLinkedTasksCount}/{prog.linkedTasksCount} tasks ·{' '}
                        {formatDuration(prog.loggedMinutes)} logged
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Weekly Reflection Form */}
          <form
            onSubmit={handleSaveWeeklyReflection}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Weekly Reflection ({weeklyStats.weekStart})
              </h2>
              {savedNotice && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  ✓ Saved to local storage
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Biggest Wins This Week
                </label>
                <textarea
                  rows={3}
                  value={wins}
                  onChange={(e) => setWins(e.target.value)}
                  placeholder="Shipped milestones, kept streaks..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Key Lessons Learned
                </label>
                <textarea
                  rows={3}
                  value={lessons}
                  onChange={(e) => setLessons(e.target.value)}
                  placeholder="Where estimates slipped or energy dipped..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Focus for Next Week
                </label>
                <textarea
                  rows={3}
                  value={nextWeekFocus}
                  onChange={(e) => setNextWeekFocus(e.target.value)}
                  placeholder="Top 1-2 outcomes for next Monday..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
              >
                Save Weekly Reflection
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-3" data-testid="daily-reviews-list">
          {closedDailyReviews.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No daily wrap-ups saved yet.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Click &quot;Wrap Up {selectedDate}&quot; above to complete your first evening ritual.
              </p>
            </div>
          ) : (
            closedDailyReviews.map((rev) => (
              <div
                key={rev.date}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {rev.date}
                    </span>
                    {rev.closed && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        Closed
                      </span>
                    )}
                    {typeof rev.mood === 'number' && (
                      <span className="text-xs text-slate-500">
                        Mood {rev.mood}/5 · Energy {rev.energy ?? 4}/5
                      </span>
                    )}
                  </div>
                  {rev.mostImportantTask && (
                    <div className="text-xs text-slate-700 dark:text-slate-300">
                      <strong>Highlight:</strong> {rev.mostImportantTask}
                    </div>
                  )}
                  {(rev.wentWell || rev.toImprove) && (
                    <div className="text-xs text-slate-500 line-clamp-2">
                      {rev.wentWell || rev.toImprove}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(rev.date);
                    setWrapUpModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 self-start sm:self-center"
                >
                  View / Edit Ritual
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
