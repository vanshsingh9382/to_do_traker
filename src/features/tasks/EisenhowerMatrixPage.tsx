import React, { useMemo, useState } from 'react';
import { endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import {
  Grid2X2,
  Plus,
  Clock,
  CheckCircle2,
  Repeat,
  MoveRight,
  Lock,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { expandTasksForDate, expandTasksForRange, parseTaskIdentity } from '../../lib/recurrenceEngine';
import {
  getQuadrantForTask,
  MATRIX_QUADRANTS,
  MatrixQuadrantId,
} from '../../lib/phase3Engine';
import { Task } from '../../types';

type MatrixScope = 'today' | 'week' | 'all';

export const EisenhowerMatrixPage: React.FC<{
  onInspectTask: (task: Task) => void;
}> = ({ onInspectTask }) => {
  const tasks = useDayForgeStore((s) => s.tasks);
  const categories = useDayForgeStore((s) => s.categories);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const settings = useDayForgeStore((s) => s.settings);
  const addTask = useDayForgeStore((s) => s.addTask);
  const setTaskStatus = useDayForgeStore((s) => s.setTaskStatus);
  const moveTaskToQuadrant = useDayForgeStore((s) => s.moveTaskToQuadrant);

  const [scope, setScope] = useState<MatrixScope>('week');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [quickAddTitleByQuad, setQuickAddTitleByQuad] = useState<
    Record<MatrixQuadrantId, string>
  >({
    q1: '',
    q2: '',
    q3: '',
    q4: '',
  });
  const [openAddQuad, setOpenAddQuad] = useState<MatrixQuadrantId | null>(null);

  const openTasks = useMemo(() => {
    let source: Task[] = [];
    if (scope === 'today') {
      source = expandTasksForDate(tasks, selectedDate);
    } else if (scope === 'week') {
      const ref = parseISO(selectedDate);
      const startStr = format(startOfWeek(ref, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const endStr = format(endOfWeek(ref, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      // Deduplicate recurring series in Matrix view so flags apply cleanly to the series
      const expanded = expandTasksForRange(tasks, startStr, endStr);
      const seenMasters = new Set<string>();
      source = expanded.filter((t) => {
        const { masterId } = parseTaskIdentity(t);
        if (seenMasters.has(masterId)) return false;
        seenMasters.add(masterId);
        return true;
      });
    } else {
      source = tasks;
    }

    return source.filter((t) => {
      const isOpen = t.status === 'To Do' || t.status === 'In Progress';
      if (!isOpen) return false;
      if (categoryFilter !== 'All' && t.category !== categoryFilter) return false;
      return true;
    });
  }, [tasks, selectedDate, scope, categoryFilter]);

  const tasksByQuadrant = useMemo(() => {
    const map: Record<MatrixQuadrantId, Task[]> = {
      q1: [],
      q2: [],
      q3: [],
      q4: [],
    };
    for (const t of openTasks) {
      map[getQuadrantForTask(t)].push(t);
    }
    return map;
  }, [openTasks]);

  const handleQuickCreateInQuadrant = (quadId: MatrixQuadrantId) => {
    const title = quickAddTitleByQuad[quadId].trim();
    if (!title) return;
    const meta = MATRIX_QUADRANTS.find((q) => q.id === quadId)!;
    addTask({
      title,
      description: '',
      category: categoryFilter !== 'All' ? categoryFilter : categories[0]?.name || 'Work',
      tags: [],
      priority: quadId === 'q1' || quadId === 'q2' ? 'High' : quadId === 'q3' ? 'Med' : 'Low',
      important: meta.important,
      urgent: meta.urgent,
      date: selectedDate,
      estimatedMinutes: settings.defaultTaskDurationMinutes || 45,
      status: 'To Do',
      subtasks: [],
      recurrence: 'none',
      reminders: [settings.defaultReminderMinutes ?? 10],
    });
    setQuickAddTitleByQuad((prev) => ({ ...prev, [quadId]: '' }));
    setOpenAddQuad(null);
  };

  const getCategoryColor = (catName: string) =>
    categories.find((c) => c.name === catName)?.color || '#2563EB';

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Grid2X2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Eisenhower Priority Matrix
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Drag tasks across quadrants or use the Move menu to update Urgent &amp; Important flags. Recurring task flags apply to the entire series.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Scope Selector */}
          <div
            role="group"
            aria-label="Matrix scope selector"
            className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
          >
            {(
              [
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'all', label: 'All Open' },
              ] as Array<{ id: MatrixScope; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setScope(opt.id)}
                className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  scope === opt.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Category Filter */}
          <select
            aria-label="Filter matrix by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium"
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

      {/* 2x2 Quadrants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MATRIX_QUADRANTS.map((quad) => {
          const quadTasks = tasksByQuadrant[quad.id];
          const totalEstMinutes = quadTasks.reduce(
            (sum, t) => sum + (t.estimatedMinutes || 0),
            0
          );

          return (
            <section
              key={quad.id}
              aria-label={`${quad.title} Quadrant`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedTaskId) {
                  moveTaskToQuadrant(draggedTaskId, quad.id);
                  setDraggedTaskId(null);
                }
              }}
              className="flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden min-h-[300px]"
            >
              {/* Quadrant Header */}
              <div
                className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
                style={{ borderTop: `3px solid ${quad.color}` }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: quad.color }}
                    />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {quad.title}
                    </h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                      {quadTasks.length} {quadTasks.length === 1 ? 'task' : 'tasks'} ·{' '}
                      {Math.floor(totalEstMinutes / 60)}h {totalEstMinutes % 60}m
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {quad.subtitle}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setOpenAddQuad((prev) => (prev === quad.id ? null : quad.id))
                  }
                  aria-label={`Add task to ${quad.title}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>

              {/* Inline +Add Form */}
              {openAddQuad === quad.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleQuickCreateInQuadrant(quad.id);
                  }}
                  className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2"
                >
                  <input
                    type="text"
                    aria-label={`New task title for ${quad.title}`}
                    placeholder={`Add task to ${quad.title}...`}
                    value={quickAddTitleByQuad[quad.id]}
                    onChange={(e) =>
                      setQuickAddTitleByQuad((prev) => ({
                        ...prev,
                        [quad.id]: e.target.value,
                      }))
                    }
                    autoFocus
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
                  >
                    Create
                  </button>
                </form>
              )}

              {/* Quadrant Task Cards */}
              <div className="p-3 space-y-2 flex-1 overflow-y-auto">
                {quadTasks.length === 0 ? (
                  <div className="h-36 flex flex-col items-center justify-center text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-4">
                    <span>No open tasks in {quad.title}.</span>
                    <span className="text-[11px] mt-0.5">
                      Drag a task here or click + Add above.
                    </span>
                  </div>
                ) : (
                  quadTasks.map((task) => {
                    const catColor = getCategoryColor(task.category);
                    const isRecurring = task.recurrence !== 'none' || Boolean(task.recurrenceRule);

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggedTaskId(task.id)}
                        className="group rounded-lg border border-slate-200/90 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-blue-400/60 p-3 transition-all flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                setTaskStatus(
                                  task.id,
                                  'Completed',
                                  task.occurrenceDate || task.date
                                )
                              }
                              aria-label={`Complete ${task.title}`}
                              className="mt-0.5 text-slate-400 hover:text-emerald-600 cursor-pointer shrink-0"
                              title="Mark Completed"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onInspectTask(task)}
                              className="text-left text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate cursor-pointer"
                            >
                              {task.title}
                            </button>
                          </div>

                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-semibold shrink-0"
                            style={{
                              backgroundColor: `${catColor}18`,
                              color: catColor,
                            }}
                          >
                            {task.category}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <div className="flex items-center gap-2 font-mono">
                            <span>{task.date}</span>
                            {task.start && <span>{task.start}</span>}
                            <span className="inline-flex items-center gap-0.5">
                              <Clock className="w-3 h-3" /> {task.estimatedMinutes}m
                            </span>
                            {isRecurring && (
                              <span
                                className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400"
                                title="Recurring series"
                              >
                                <Repeat className="w-3 h-3" /> Series
                              </span>
                            )}
                            {task.fixedTime && (
                              <span
                                className="inline-flex items-center gap-0.5 text-amber-600"
                                title="Fixed time"
                              >
                                <Lock className="w-3 h-3" /> Fixed
                              </span>
                            )}
                          </div>

                          {/* Accessible Keyboard & Mobile "Move to..." Selector */}
                          <div className="flex items-center gap-1">
                            <MoveRight className="w-3 h-3 text-slate-400" />
                            <select
                              aria-label={`Move ${task.title} to quadrant`}
                              value={quad.id}
                              onChange={(e) =>
                                moveTaskToQuadrant(
                                  task.id,
                                  e.target.value as MatrixQuadrantId
                                )
                              }
                              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              {MATRIX_QUADRANTS.map((qOpt) => (
                                <option key={qOpt.id} value={qOpt.id}>
                                  Move to: {qOpt.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
