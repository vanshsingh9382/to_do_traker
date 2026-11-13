import React, { useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import {
  Wand2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  ArrowRight,
  RotateCcw,
  X,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { expandTasksForDate, parseTaskIdentity } from '../../lib/recurrenceEngine';
import {
  computeDayCapacityAndLoad,
  detectScheduleConflicts,
  proposeReplanForDay,
  ReplanOverflowItem,
  ReplanProposedMove,
} from '../../lib/phase3Engine';

export const SmartLoadHeaderBadge: React.FC<{
  dateStr: string;
  compact?: boolean;
}> = ({ dateStr, compact }) => {
  const tasks = useDayForgeStore((s) => s.tasks);
  const googleEvents = useDayForgeStore((s) => s.googleEvents);
  const externalEvents = useDayForgeStore((s) => s.externalEvents);
  const settings = useDayForgeStore((s) => s.settings);
  const setReplanModalOpen = useDayForgeStore((s) => s.setReplanModalOpen);

  const dayTasks = useMemo(
    () => expandTasksForDate(tasks, dateStr),
    [tasks, dateStr]
  );

  const allExt = useMemo(
    () => [...googleEvents, ...externalEvents],
    [googleEvents, externalEvents]
  );

  const loadInfo = useMemo(
    () => computeDayCapacityAndLoad(dateStr, dayTasks, allExt, settings),
    [dateStr, dayTasks, allExt, settings]
  );

  const badgeStyle =
    loadInfo.loadState === 'overbooked'
      ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
      : loadInfo.loadState === 'nearly_full'
      ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
      : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300';

  const stateLabel =
    loadInfo.loadState === 'overbooked'
      ? 'Overbooked'
      : loadInfo.loadState === 'nearly_full'
      ? 'Nearly Full'
      : 'Load OK';

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${badgeStyle}`}
        title={`Planned: ${loadInfo.plannedMinutes}m / Available: ${loadInfo.availableMinutes}m (Workday ${loadInfo.workdayMinutes}m minus ${loadInfo.externalEventMinutes}m external events)`}
      >
        {loadInfo.loadState === 'ok' ? (
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="font-semibold">{stateLabel}</span>
        <span className="font-mono text-[11px] opacity-90">
          {Math.floor(loadInfo.plannedMinutes / 60)}h {loadInfo.plannedMinutes % 60}m /{' '}
          {Math.floor(loadInfo.availableMinutes / 60)}h {loadInfo.availableMinutes % 60}m (
          {loadInfo.loadPercent}%)
        </span>
      </div>

      {!compact && (
        <button
          type="button"
          onClick={() => setReplanModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/80 hover:bg-blue-100 transition-colors cursor-pointer"
        >
          <Wand2 className="w-3.5 h-3.5" />
          Replan my day
        </button>
      )}
    </div>
  );
};

export const ConflictWarningsBanner: React.FC<{ dateStr: string }> = ({ dateStr }) => {
  const tasks = useDayForgeStore((s) => s.tasks);
  const googleEvents = useDayForgeStore((s) => s.googleEvents);
  const externalEvents = useDayForgeStore((s) => s.externalEvents);
  const settings = useDayForgeStore((s) => s.settings);
  const moveOrResizeTaskOnCalendar = useDayForgeStore(
    (s) => s.moveOrResizeTaskOnCalendar
  );
  const saveUndoSnapshot = useDayForgeStore((s) => s.saveUndoSnapshot);
  const setReplanModalOpen = useDayForgeStore((s) => s.setReplanModalOpen);

  const dayTasks = useMemo(
    () => expandTasksForDate(tasks, dateStr),
    [tasks, dateStr]
  );

  const allExt = useMemo(
    () => [...googleEvents, ...externalEvents],
    [googleEvents, externalEvents]
  );

  const conflicts = useMemo(
    () => detectScheduleConflicts(dayTasks, allExt, dateStr, settings),
    [dayTasks, allExt, dateStr, settings]
  );

  if (conflicts.length === 0) return null;

  return (
    <div className="rounded-xl bg-rose-50/90 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 p-3.5 space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-rose-900 dark:text-rose-200">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>
            {conflicts.length} Schedule Conflict{conflicts.length > 1 ? 's' : ''} Detected on{' '}
            {dateStr}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setReplanModalOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 cursor-pointer"
        >
          <Wand2 className="w-3 h-3" /> Open Smart Replan
        </button>
      </div>

      <div className="space-y-1.5">
        {conflicts.slice(0, 4).map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 bg-white/80 dark:bg-slate-900/80 rounded-lg px-3 py-2 border border-rose-200/70 dark:border-rose-800/60"
          >
            <div className="text-slate-700 dark:text-slate-200">
              <strong>{c.taskTitle}</strong> ({c.taskStart}–{c.taskEnd}) overlaps with{' '}
              {c.conflictsWithType === 'external' ? 'external event ' : ''}
              <strong>“{c.conflictsWithTitle}”</strong>
            </div>

            {c.suggestedSlot ? (
              <button
                type="button"
                onClick={() => {
                  saveUndoSnapshot(`Fixed overlap for "${c.taskTitle}"`);
                  moveOrResizeTaskOnCalendar(
                    c.taskId,
                    dateStr,
                    c.suggestedSlot!.start,
                    c.suggestedSlot!.end,
                    c.durationMinutes
                  );
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer shrink-0"
              >
                Fix: Move to {c.suggestedSlot.start}–{c.suggestedSlot.end}
              </button>
            ) : (
              <span className="text-[11px] text-slate-500">
                No free slot left in workday
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export const ReplanDayModal: React.FC = () => {
  const isOpen = useDayForgeStore((s) => s.isReplanModalOpen);
  const setReplanModalOpen = useDayForgeStore((s) => s.setReplanModalOpen);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const tasks = useDayForgeStore((s) => s.tasks);
  const googleEvents = useDayForgeStore((s) => s.googleEvents);
  const externalEvents = useDayForgeStore((s) => s.externalEvents);
  const settings = useDayForgeStore((s) => s.settings);
  const updateSettings = useDayForgeStore((s) => s.updateSettings);
  const applyReplanProposal = useDayForgeStore((s) => s.applyReplanProposal);

  const [bufferMinutes, setBufferMinutes] = useState<number>(
    settings.replanBufferMinutes ?? 5
  );
  const [startFromTime, setStartFromTime] = useState<string>(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    if (selectedDate === todayStr) {
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}` > settings.workDayStart
        ? `${hh}:${mm}`
        : settings.workDayStart;
    }
    return settings.workDayStart;
  });

  const [movesState, setMovesState] = useState<ReplanProposedMove[]>([]);
  const [overflowState, setOverflowState] = useState<ReplanOverflowItem[]>([]);

  const dayTasks = useMemo(
    () => expandTasksForDate(tasks, selectedDate),
    [tasks, selectedDate]
  );

  const allExt = useMemo(
    () => [...googleEvents, ...externalEvents],
    [googleEvents, externalEvents]
  );

  const proposal = useMemo(() => {
    if (!isOpen) return null;
    return proposeReplanForDay(selectedDate, startFromTime, dayTasks, allExt, {
      workDayStart: settings.workDayStart,
      workDayEnd: settings.workDayEnd,
      replanBufferMinutes: bufferMinutes,
    });
  }, [
    isOpen,
    selectedDate,
    startFromTime,
    dayTasks,
    allExt,
    settings.workDayStart,
    settings.workDayEnd,
    bufferMinutes,
  ]);

  useEffect(() => {
    if (proposal) {
      setMovesState(proposal.moves);
      setOverflowState(proposal.overflowTasks);
    }
  }, [proposal]);

  if (!isOpen || !proposal) return null;

  const tomorrowStr = format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd');

  const handleApply = (applyAll: boolean) => {
    updateSettings({ replanBufferMinutes: bufferMinutes });
    const chosenMoves = (applyAll
      ? movesState
      : movesState.filter((m) => m.selected)
    ).map((m) => ({
      taskId: m.taskId,
      newStart: m.newStart,
      newEnd: m.newEnd,
    }));

    const moveToTomorrowTaskIds = overflowState
      .filter((o) => o.choice === 'tomorrow')
      .map((o) => o.taskId);

    applyReplanProposal({
      dateStr: selectedDate,
      tomorrowStr,
      moves: chosenMoves,
      moveToTomorrowTaskIds,
    });
    setReplanModalOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      onClick={() => setReplanModalOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Replan My Day Preview"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Replan My Day ({selectedDate})
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Rule-based smart scheduler: orders unfinished tasks by Urgent+Important → Priority → Duration, never moves Fixed-time tasks or external events, and stays inside working hours ({settings.workDayStart}–{settings.workDayEnd}).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReplanModalOpen(false)}
            aria-label="Close Replan modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Configuration Bar */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>Start scheduling from:</span>
              <input
                type="time"
                aria-label="Replan start time"
                value={startFromTime}
                onChange={(e) => setStartFromTime(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
              />
            </label>

            <label className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
              <span>Buffer between tasks (min):</span>
              <input
                type="number"
                aria-label="Replan buffer minutes"
                min={0}
                max={30}
                step={5}
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Math.max(0, Number(e.target.value)))}
                className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
              />
            </label>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100/80 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-medium">
              <Lock className="w-3 h-3" /> {proposal.fixedCount} Fixed Protected
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
              <CalendarIcon className="w-3 h-3" /> {proposal.externalCount} External Protected
            </span>
          </div>
        </div>

        {/* Body: Proposed Moves & Overflow Tasks */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          <div className="space-y-2">
            <h4 className="font-bold text-slate-800 dark:text-slate-200">
              Before → After Schedule Preview ({movesState.length} task
              {movesState.length === 1 ? '' : 's'} fit today)
            </h4>

            {movesState.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-slate-400">
                No unfinished movable tasks fit into remaining working hours today.
              </div>
            ) : (
              <div className="space-y-2">
                {movesState.map((mv, idx) => (
                  <label
                    key={mv.taskId}
                    className="flex items-start justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer"
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={mv.selected}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setMovesState((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, selected: checked } : item
                            )
                          );
                        }}
                        className="mt-0.5 rounded border-slate-300"
                      />
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {mv.title}{' '}
                          <span className="font-mono text-[11px] text-slate-400">
                            ({mv.estimatedMinutes}m)
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {mv.reason}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono text-[11px] shrink-0">
                      <span className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 line-through">
                        {mv.oldStart ? `${mv.oldStart}–${mv.oldEnd}` : 'Unscheduled'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                      <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold">
                        {mv.newStart}–{mv.newEnd}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Overflow Tasks ("Can't fit today: move to tomorrow?") */}
          {overflowState.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>
                  Can&apos;t fit today ({overflowState.length}): Move to tomorrow ({tomorrowStr})?
                </span>
              </div>

              <div className="space-y-2">
                {overflowState.map((ov, idx) => (
                  <div
                    key={ov.taskId}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {ov.title} ({ov.estimatedMinutes}m)
                      </div>
                      <div className="text-[11px] text-amber-800 dark:text-amber-300/90">
                        {ov.reason}
                      </div>
                    </div>

                    <select
                      aria-label={`Overflow action for ${ov.title}`}
                      value={ov.choice}
                      onChange={(e) => {
                        const val = e.target.value as 'tomorrow' | 'keep';
                        setOverflowState((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, choice: val } : item
                          )
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 font-semibold text-slate-800 dark:text-slate-200"
                    >
                      <option value="tomorrow">Move to tomorrow ({tomorrowStr})</option>
                      <option value="keep">Keep on today ({selectedDate})</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions: Apply All / Apply Selected / Cancel */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[11px] text-slate-500">
            Nothing changes until you click Apply. You can Undo immediately after applying.
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReplanModalOpen(false)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleApply(false)}
              className="px-3.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100 cursor-pointer"
            >
              Apply Selected ({movesState.filter((m) => m.selected).length})
            </button>
            <button
              type="button"
              onClick={() => handleApply(true)}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
            >
              Apply All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const UndoToastBanner: React.FC = () => {
  const lastUndoSnapshot = useDayForgeStore((s) => s.lastUndoSnapshot);
  const undoLastTaskMutation = useDayForgeStore((s) => s.undoLastTaskMutation);
  const dismissUndoSnapshot = useDayForgeStore((s) => s.dismissUndoSnapshot);

  if (!lastUndoSnapshot) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-16 md:bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2.5 text-xs font-medium shadow-2xl border border-slate-700 dark:border-slate-300"
    >
      <span>{lastUndoSnapshot.label}</span>
      <button
        type="button"
        onClick={undoLastTaskMutation}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Undo
      </button>
      <button
        type="button"
        onClick={dismissUndoSnapshot}
        aria-label="Dismiss undo notice"
        className="text-slate-400 hover:text-white dark:hover:text-slate-700 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
