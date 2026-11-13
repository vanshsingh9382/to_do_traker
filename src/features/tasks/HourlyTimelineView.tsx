import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Play, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { detectOverlappingTaskIds, getTaskActualMinutes } from '../../lib/analyticsEngine';
import { Task } from '../../types';

interface HourlyTimelineViewProps {
  tasks: Task[];
  onInspectTask: (task: Task) => void;
}

const START_HOUR = 6;
const END_HOUR = 23;
const HOUR_HEIGHT_PX = 64; // 64px per hour

function timeToMinutesFromStart(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h - START_HOUR) * 60 + (m || 0);
}

export const HourlyTimelineView: React.FC<HourlyTimelineViewProps> = ({
  tasks,
  onInspectTask,
}) => {
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const categories = useDayForgeStore((s) => s.categories);
  const googleEvents = useDayForgeStore((s) => s.googleEvents);
  const externalEvents = useDayForgeStore((s) => s.externalEvents);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const updateTask = useDayForgeStore((s) => s.updateTask);
  const requestStartTimer = useDayForgeStore((s) => s.requestStartTimer);

  const [now, setNow] = useState(new Date());
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Scroll to 08:30 by default so 09:00-17:00 tasks are immediately visible
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 2.5 * HOUR_HEIGHT_PX;
    }
  }, []);

  const isToday = format(now, 'yyyy-MM-dd') === selectedDate;
  const currentMinutesFrom6AM = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
  const showCurrentLine =
    isToday && now.getHours() >= START_HOUR && now.getHours() <= END_HOUR;
  const currentLineTopPx = Math.max(0, (currentMinutesFrom6AM / 60) * HOUR_HEIGHT_PX);

  const overlappingIds = detectOverlappingTaskIds(tasks);

  const scheduledTasks = tasks.filter((t) => t.start && t.status !== 'Skipped');
  const unscheduledTasks = tasks.filter((t) => !t.start && t.status !== 'Skipped');
  const dayGoogleEvents = [...googleEvents, ...externalEvents].filter(
    (e) => e.date === selectedDate && !e.isAllDay && e.startTime
  );

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  const assignQuickSlot = (task: Task, hour: number) => {
    const start = `${String(hour).padStart(2, '0')}:00`;
    const endHour = Math.min(23, hour + Math.max(1, Math.round(task.estimatedMinutes / 60)));
    const end = `${String(endHour).padStart(2, '0')}:00`;
    updateTask(task.id, { start, end });
  };

  return (
    <div className="space-y-4">
      {/* Unscheduled tasks tray */}
      {unscheduledTasks.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Unscheduled Tasks ({unscheduledTasks.length}) — click to assign a time slot
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unscheduledTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <button
                  type="button"
                  onClick={() => onInspectTask(t)}
                  className="font-medium text-slate-800 dark:text-slate-200 hover:underline cursor-pointer"
                >
                  {t.title}
                </button>
                <span className="text-slate-400">·</span>
                <button
                  type="button"
                  onClick={() => assignQuickSlot(t, Math.max(8, Math.min(20, now.getHours() + 1)))}
                  className="text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer"
                >
                  Schedule next hour
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overlap alert banner if any */}
      {overlappingIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>
              <strong>{overlappingIds.size} tasks overlap</strong> on your timeline today. Click any highlighted block to adjust its start or end time.
            </span>
          </div>
        </div>
      )}

      {/* Hourly Grid 06:00 - 23:00 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Hourly Schedule (06:00 – 23:00)
          </span>
          <span className="tabular-nums">
            {scheduledTasks.length} scheduled tasks
            {dayGoogleEvents.length > 0 ? ` · ${dayGoogleEvents.length} Google Calendar events` : ''}
          </span>
        </div>

        <div ref={scrollContainerRef} className="overflow-y-auto max-h-[540px]">
          <div
            className="relative select-none"
            style={{ height: `${hours.length * HOUR_HEIGHT_PX}px` }}
          >
          {/* Hour horizontal grid lines */}
          {hours.map((hour, idx) => (
            <div
              key={hour}
              className="absolute left-0 right-0 flex items-start border-b border-slate-100 dark:border-slate-800/60"
              style={{
                top: `${idx * HOUR_HEIGHT_PX}px`,
                height: `${HOUR_HEIGHT_PX}px`,
              }}
            >
              <div className="w-16 pr-3 pt-1.5 text-right text-[11px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                {`${String(hour).padStart(2, '0')}:00`}
              </div>
              <div className="flex-1 h-full border-l border-slate-100 dark:border-slate-800/70" />
            </div>
          ))}

          {/* Live red current-time line */}
          {showCurrentLine && (
            <div
              className="absolute left-14 right-0 z-20 flex items-center pointer-events-none"
              style={{ top: `${currentLineTopPx}px` }}
            >
              <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-mono font-semibold shadow-xs">
                {format(now, 'HH:mm')}
              </span>
              <div className="flex-1 h-[2px] bg-rose-600" />
            </div>
          )}

          {/* Task Blocks */}
          {scheduledTasks.map((task) => {
            const startMin = Math.max(0, timeToMinutesFromStart(task.start!));
            const endMin = task.end
              ? Math.max(startMin + 25, timeToMinutesFromStart(task.end))
              : startMin + Math.max(25, task.estimatedMinutes || 45);

            const topPx = (startMin / 60) * HOUR_HEIGHT_PX;
            const heightPx = Math.max(34, ((endMin - startMin) / 60) * HOUR_HEIGHT_PX - 2);
            const isOverlap = overlappingIds.has(task.id);
            const actualMins = getTaskActualMinutes(task.id, timeLogs);
            const catObj = categories.find((c) => c.name === task.category);
            const colorHex = catObj?.color || '#2563EB';

            return (
              <div
                key={task.id}
                onClick={() => onInspectTask(task)}
                style={{
                  top: `${topPx}px`,
                  height: `${heightPx}px`,
                  left: isOverlap ? '76px' : '68px',
                  right: dayGoogleEvents.length > 0 ? '35%' : '16px',
                  borderColor: isOverlap ? '#E11D48' : `${colorHex}55`,
                  backgroundColor: isOverlap ? 'rgba(225, 29, 72, 0.08)' : `${colorHex}14`,
                }}
                className="absolute z-10 rounded-lg border px-3 py-1.5 flex items-center justify-between gap-2 overflow-hidden cursor-pointer hover:shadow-sm transition-shadow"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {task.status === 'Completed' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                    {isOverlap && (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    <span
                      className={`text-xs font-semibold truncate ${
                        task.status === 'Completed'
                          ? 'line-through text-slate-500 dark:text-slate-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono truncate">
                    {task.start}–{task.end || ''} · {task.category} · Est {task.estimatedMinutes}m / Actual {actualMins}m
                    {isOverlap ? ' · OVERLAP' : ''}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestStartTimer(task.id, 'stopwatch');
                  }}
                  aria-label={`Start timer for ${task.title}`}
                  className="p-1.5 rounded-md bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 hover:bg-white shrink-0 cursor-pointer"
                >
                  <Play className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* Synced Google Calendar Events (visually distinct right column) */}
          {dayGoogleEvents.map((ev) => {
            const startMin = Math.max(0, timeToMinutesFromStart(ev.startTime!));
            const endMin = ev.endTime
              ? Math.max(startMin + 25, timeToMinutesFromStart(ev.endTime))
              : startMin + 45;
            const topPx = (startMin / 60) * HOUR_HEIGHT_PX;
            const heightPx = Math.max(32, ((endMin - startMin) / 60) * HOUR_HEIGHT_PX - 2);

            return (
              <div
                key={ev.id}
                style={{
                  top: `${topPx}px`,
                  height: `${heightPx}px`,
                  left: '66%',
                  right: '12px',
                }}
                className="absolute z-10 rounded-lg border border-indigo-300 dark:border-indigo-800 bg-indigo-50/90 dark:bg-indigo-950/50 px-2.5 py-1 overflow-hidden"
              >
                <div className="flex items-center gap-1 text-xs font-medium text-indigo-950 dark:text-indigo-200 truncate">
                  <CalendarIcon className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span className="truncate">{ev.summary}</span>
                </div>
                <div className="text-[10px] font-mono text-indigo-700 dark:text-indigo-300 truncate">
                  {ev.startTime}–{ev.endTime} · Google Calendar
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
};
