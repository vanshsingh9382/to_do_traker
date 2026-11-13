import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Square,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Timer,
  Clock,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { getTaskActualMinutes } from '../../lib/analyticsEngine';

function formatSecondsMMSS(totalSec: number): string {
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
      secs
    ).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ActiveFocusBar: React.FC = () => {
  const activeTimer = useDayForgeStore((s) => s.activeTimer);
  const tasks = useDayForgeStore((s) => s.tasks);
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const settings = useDayForgeStore((s) => s.settings);
  const isZenMode = useDayForgeStore((s) => s.isZenMode);
  const setZenMode = useDayForgeStore((s) => s.setZenMode);
  const pauseTimer = useDayForgeStore((s) => s.pauseTimer);
  const resumeTimer = useDayForgeStore((s) => s.resumeTimer);
  const stopTimerAndLog = useDayForgeStore((s) => s.stopTimerAndLog);
  const checkPomodoroCompletion = useDayForgeStore((s) => s.checkPomodoroCompletion);
  const setTaskStatus = useDayForgeStore((s) => s.setTaskStatus);
  const pendingTimerSwitchTaskId = useDayForgeStore((s) => s.pendingTimerSwitchTaskId);
  const confirmSwitchTimer = useDayForgeStore((s) => s.confirmSwitchTimer);
  const cancelSwitchTimer = useDayForgeStore((s) => s.cancelSwitchTimer);
  const getOrCreateTaskNote = useDayForgeStore((s) => s.getOrCreateTaskNote);
  const updateNote = useDayForgeStore((s) => s.updateNote);
  const notes = useDayForgeStore((s) => s.notes);

  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (!activeTimer) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
      checkPomodoroCompletion();
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimer, checkPomodoroCompletion]);

  const currentTask = activeTimer
    ? tasks.find((t) => t.id === activeTimer.taskId)
    : null;
  const pendingSwitchTask = pendingTimerSwitchTaskId
    ? tasks.find((t) => t.id === pendingTimerSwitchTaskId)
    : null;

  const runningDeltaSec =
    activeTimer && activeTimer.isRunning && activeTimer.startedAtTimestamp
      ? Math.max(0, Math.floor((nowMs - activeTimer.startedAtTimestamp) / 1000))
      : 0;
  const elapsedSeconds = activeTimer
    ? activeTimer.accumulatedSeconds + runningDeltaSec
    : 0;

  const targetPomodoroSec =
    activeTimer?.mode === 'pomodoro'
      ? (activeTimer.pomodoroPhase === 'work'
          ? settings.pomodoroWorkMinutes
          : activeTimer.pomodoroPhase === 'shortBreak'
          ? settings.pomodoroShortBreakMinutes
          : settings.pomodoroLongBreakMinutes) * 60
      : 0;

  const displaySeconds =
    activeTimer?.mode === 'pomodoro'
      ? Math.max(0, targetPomodoroSec - elapsedSeconds)
      : elapsedSeconds;

  const priorLoggedMinutes = currentTask
    ? getTaskActualMinutes(currentTask.id, timeLogs)
    : 0;
  const totalElapsedWithPriorMinutes =
    priorLoggedMinutes + Math.floor(elapsedSeconds / 60);

  // Linked note for Zen mode
  const zenNote = currentTask
    ? notes.find((n) => n.linkedTaskId === currentTask.id) ||
      notes.find((n) => n.linkedDate === currentTask.date)
    : null;

  return (
    <>
      {/* Switch Timer Approval Dialog */}
      {pendingSwitchTask && currentTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div
            role="dialog"
            aria-label="Switch active timer confirmation"
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Switch Active Timer?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              You are currently tracking time on{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {currentTask.title}
              </strong>
              . Would you like to stop and save its session, and start the timer for{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {pendingSwitchTask.title}
              </strong>
              ?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelSwitchTimer}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 cursor-pointer"
              >
                Keep Current Timer
              </button>
              <button
                type="button"
                onClick={confirmSwitchTimer}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
              >
                Save & Switch Timer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Zen Focus Mode */}
      {isZenMode && activeTimer && currentTask && (
        <div
          role="dialog"
          aria-label="Zen Focus Mode"
          className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col justify-between p-6 md:p-10 overflow-y-auto"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold tracking-tight text-white">
                DayForge Zen Focus
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-400">
                {activeTimer.mode === 'pomodoro'
                  ? `Pomodoro (${activeTimer.pomodoroPhase}) · Session #${
                      activeTimer.pomodoroSessionCount + 1
                    }`
                  : 'Deep Work Stopwatch'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setZenMode(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              Exit Zen Mode
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 my-auto py-8 max-w-6xl w-full mx-auto items-center">
            {/* Left: Big Timer & Task Focus */}
            <div className="space-y-6 text-center lg:text-left">
              <div>
                <p className="text-xs font-medium text-blue-400">
                  {currentTask.category} · {currentTask.priority} Priority
                </p>
                <h1 className="text-2xl md:text-3xl font-bold text-white mt-1 text-balance">
                  {currentTask.title}
                </h1>
              </div>

              <div className="py-6 px-8 rounded-2xl bg-slate-900 border border-slate-800 inline-block">
                <div className="text-6xl md:text-7xl font-mono font-bold tracking-tight text-white tabular-nums">
                  {formatSecondsMMSS(displaySeconds)}
                </div>
                <p className="text-xs text-slate-400 mt-2 font-mono tabular-nums">
                  Total focused: {totalElapsedWithPriorMinutes}m / Est.{' '}
                  {currentTask.estimatedMinutes}m
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                {activeTimer.isRunning ? (
                  <button
                    type="button"
                    onClick={pauseTimer}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={resumeTimer}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    Resume
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    stopTimerAndLog();
                    setZenMode(false);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  <Square className="w-4 h-4" />
                  Stop & Save Log
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopTimerAndLog();
                    setTaskStatus(currentTask.id, 'Completed');
                    setZenMode(false);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Complete Task
                </button>
              </div>
            </div>

            {/* Right: Side-by-side Zen Scratchpad Note */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col h-[420px]">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-300">
                  {zenNote ? zenNote.title : `Scratchpad: ${currentTask.title}`}
                </span>
                <span className="text-[11px] text-slate-500">Auto-saved</span>
              </div>
              <textarea
                aria-label="Zen mode notes pad"
                value={zenNote?.markdown || ''}
                onChange={(e) => {
                  const target = zenNote || getOrCreateTaskNote(currentTask.id);
                  updateNote(target.id, { markdown: e.target.value });
                }}
                placeholder="Write thoughts, formulas, or code snippets while you focus..."
                className="flex-1 w-full bg-transparent text-sm text-slate-200 font-mono resize-none focus:outline-none leading-relaxed"
              />
            </div>
          </div>

          <div className="text-center text-xs text-slate-500">
            Timer uses epoch timestamps — safe across tab switches, sleep, and page refreshes.
          </div>
        </div>
      )}

      {/* Floating Active Focus Bar */}
      {activeTimer && currentTask && !isZenMode && (
        <div
          role="region"
          aria-label="Active Focus Timer Bar"
          className="fixed bottom-15 md:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-xl rounded-xl bg-slate-900 text-white border border-slate-700/80 px-3.5 py-2 shadow-xl flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
              {activeTimer.mode === 'pomodoro' ? (
                <Timer className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">
                {currentTask.title}
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums truncate">
                {activeTimer.mode === 'pomodoro'
                  ? `Pomodoro (${activeTimer.pomodoroPhase})`
                  : 'Timer'}{' '}
                · {totalElapsedWithPriorMinutes}m / {currentTask.estimatedMinutes}m
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-sm sm:text-base font-mono font-bold text-white tabular-nums px-1.5">
              {formatSecondsMMSS(displaySeconds)}
            </span>

            {activeTimer.isRunning ? (
              <button
                type="button"
                onClick={pauseTimer}
                aria-label="Pause active timer"
                className="p-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer"
                title="Pause"
              >
                <Pause className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeTimer}
                aria-label="Resume active timer"
                className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer"
                title="Resume"
              >
                <Play className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={stopTimerAndLog}
              aria-label="Stop and save timer session"
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
              title="Stop & Log Time"
            >
              <Square className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setZenMode(true)}
              aria-label="Enter Fullscreen Zen Focus Mode"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              title="Fullscreen Zen Mode"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Zen</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
