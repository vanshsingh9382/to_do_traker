import React, { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Play,
  Pause,
  Timer,
  Copy,
  Trash2,
  SkipForward,
  FileText,
  GripVertical,
  SlidersHorizontal,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { getTaskActualMinutes, detectOverlappingTaskIds } from '../../lib/analyticsEngine';
import { buildGoogleCalendarTemplateUrl } from '../../lib/googleCalendar';
import { Task } from '../../types';

interface TaskListViewProps {
  tasks: Task[];
  onInspectTask: (task: Task) => void;
  onOpenNewTaskModal: () => void;
}

export const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  onInspectTask,
  onOpenNewTaskModal,
}) => {
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const categories = useDayForgeStore((s) => s.categories);
  const settings = useDayForgeStore((s) => s.settings);
  const selectedTaskId = useDayForgeStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useDayForgeStore((s) => s.setSelectedTaskId);
  const setTaskStatus = useDayForgeStore((s) => s.setTaskStatus);
  const duplicateTask = useDayForgeStore((s) => s.duplicateTask);
  const deleteTask = useDayForgeStore((s) => s.deleteTask);
  const reorderTasksForDate = useDayForgeStore((s) => s.reorderTasksForDate);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const activeTimer = useDayForgeStore((s) => s.activeTimer);
  const requestStartTimer = useDayForgeStore((s) => s.requestStartTimer);
  const pauseTimer = useDayForgeStore((s) => s.pauseTimer);
  const getOrCreateTaskNote = useDayForgeStore((s) => s.getOrCreateTaskNote);
  const setRightNoteMode = useDayForgeStore((s) => s.setRightNoteMode);
  const isRightPaneOpen = useDayForgeStore((s) => s.isRightPaneOpen);
  const toggleRightPane = useDayForgeStore((s) => s.toggleRightPane);

  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [recentlyCompletedId, setRecentlyCompletedId] = useState<string | null>(null);

  const overlappingIds = detectOverlappingTaskIds(tasks);

  const sortedTasks = [...tasks]
    .filter((t) => categoryFilter === 'All' || t.category === categoryFilter)
    .filter((t) => statusFilter === 'All' || t.status === statusFilter)
    .sort((a, b) => a.order - b.order);

  const handleToggleComplete = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const nextStatus = task.status === 'Completed' ? 'To Do' : 'Completed';
    if (nextStatus === 'Completed') {
      setRecentlyCompletedId(task.id);
      setTimeout(() => setRecentlyCompletedId(null), 700);
    }
    setTaskStatus(task.id, nextStatus, task.date);
  };

  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleDropOnTask = (targetTaskId: string) => {
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;
    const allDayOrdered = [...tasks].sort((a, b) => a.order - b.order).map((t) => t.id);
    const fromIdx = allDayOrdered.indexOf(draggedTaskId);
    const toIdx = allDayOrdered.indexOf(targetTaskId);
    if (fromIdx === -1 || toIdx === -1) return;
    allDayOrdered.splice(fromIdx, 1);
    allDayOrdered.splice(toIdx, 0, draggedTaskId);
    reorderTasksForDate(selectedDate, allDayOrdered);
    setDraggedTaskId(null);
  };

  const handleOpenLinkedNote = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    getOrCreateTaskNote(task.id);
    setSelectedTaskId(task.id);
    setRightNoteMode('task');
    if (!isRightPaneOpen) {
      toggleRightPane();
    }
  };

  return (
    <div className="space-y-3">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-lg">
          <button
            type="button"
            onClick={() => setCategoryFilter('All')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              categoryFilter === 'All'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.name)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                categoryFilter === cat.name
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <select
              aria-label="Filter tasks by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Skipped">Skipped</option>
            </select>
          </div>
          <button
            type="button"
            onClick={onOpenNewTaskModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Task
          </button>
        </div>
      </div>

      {/* Task Rows */}
      {sortedTasks.length === 0 ? (
        <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center bg-white/50 dark:bg-slate-900/40">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No tasks scheduled for this view
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Use the natural language Quick Add bar above (e.g., &ldquo;Study System Design 4pm-6pm #study !high&rdquo;) or click New Task to build your plan.
          </p>
          <button
            type="button"
            onClick={onOpenNewTaskModal}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Create First Task
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/80">
          {sortedTasks.map((task) => {
            const actualMins = getTaskActualMinutes(task.id, timeLogs);
            const isSelected = selectedTaskId === task.id;
            const isRunningThisTask =
              activeTimer?.taskId === task.id && activeTimer.isRunning;
            const isOverlap = overlappingIds.has(task.id);
            const completedSubtasks = task.subtasks.filter((s) => s.completed).length;
            const isCelebrating = recentlyCompletedId === task.id;

            return (
              <div
                key={task.id}
                draggable
                onDragStart={() => handleDragStart(task.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDropOnTask(task.id)}
                onClick={() => {
                  setSelectedTaskId(task.id);
                  onInspectTask(task);
                }}
                className={`group flex items-start justify-between gap-3 px-4 py-3 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/50 dark:bg-blue-950/25'
                    : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
                } ${isCelebrating ? 'scale-[0.995] bg-emerald-50/60 dark:bg-emerald-950/25' : ''}`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className="mt-1 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
                    title="Drag to reorder"
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleToggleComplete(e, task)}
                    aria-label={
                      task.status === 'Completed'
                        ? `Mark "${task.title}" incomplete`
                        : `Complete "${task.title}"`
                    }
                    className="mt-0.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-transform active:scale-125 shrink-0 cursor-pointer"
                  >
                    {task.status === 'Completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-medium leading-snug ${
                          task.status === 'Completed'
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : task.status === 'Skipped'
                            ? 'line-through text-slate-400 dark:text-slate-500 italic'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </span>
                    </div>

                    {/* Zero-pill clean metadata row with subtle · separators */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {task.category}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {task.start && task.end
                          ? `${task.start}–${task.end}`
                          : task.start
                          ? `Starts ${task.start}`
                          : 'Unscheduled'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Est {task.estimatedMinutes}m / Actual {actualMins}m
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          task.priority === 'High'
                            ? 'text-rose-600 dark:text-rose-400 font-medium'
                            : task.priority === 'Med'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500'
                        }
                      >
                        {task.priority} Priority
                      </span>
                      {(task.important || task.urgent) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-600 dark:text-slate-300">
                            {task.important && task.urgent
                              ? 'Important & Urgent'
                              : task.important
                              ? 'Important'
                              : 'Urgent'}
                          </span>
                        </>
                      )}
                      {task.subtasks.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            Subtasks {completedSubtasks}/{task.subtasks.length}
                          </span>
                        </>
                      )}
                      {task.status === 'Skipped' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Skipped
                          </span>
                        </>
                      )}
                      {isOverlap && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">
                            Time Conflict
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons on right */}
                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isRunningThisTask ? (
                    <button
                      type="button"
                      onClick={() => pauseTimer()}
                      aria-label={`Pause timer for ${task.title}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-200 transition-colors cursor-pointer"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      Pause
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => requestStartTimer(task.id, 'stopwatch')}
                      aria-label={`Start timer for ${task.title}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Start stopwatch timer"
                    >
                      <Play className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="hidden sm:inline">Focus</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => requestStartTimer(task.id, 'pomodoro')}
                    aria-label={`Start Pomodoro for ${task.title}`}
                    title="Start 25m Pomodoro"
                    className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Timer className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleOpenLinkedNote(e, task)}
                    aria-label={`Open note for ${task.title}`}
                    title="Open side-by-side task note"
                    className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>

                  {task.status !== 'Skipped' && task.status !== 'Completed' && (
                    <button
                      type="button"
                      onClick={() => setTaskStatus(task.id, 'Skipped')}
                      aria-label={`Skip ${task.title}`}
                      title="Mark as Skipped"
                      className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <a
                    href={buildGoogleCalendarTemplateUrl(task, settings.timezone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Add ${task.title} to Google Calendar`}
                    title="Add to Google Calendar"
                    className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    type="button"
                    onClick={() => duplicateTask(task.id)}
                    aria-label={`Duplicate ${task.title}`}
                    title="Duplicate task"
                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteTask(task.id, 'this', task.date)}
                    aria-label={`Delete ${task.title}`}
                    title="Delete task"
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
