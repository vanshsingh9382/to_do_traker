import React, { useEffect, useMemo, useState } from 'react';
import { endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import {
  CheckSquare,
  List,
  Columns,
  Search,
  Bookmark,
  Pin,
  Plus,
  Trash2,
  Edit3,
  Tag as TagIcon,
  FileText,
  Repeat,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  Play,
  X,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import {
  expandTasksForDate,
  expandTasksForRange,
  getEffectiveRecurrenceRule,
} from '../../lib/recurrenceEngine';
import { getTaskActualMinutes } from '../../lib/analyticsEngine';
import {
  Priority,
  SavedView,
  SavedViewDateRange,
  SavedViewGroupBy,
  SavedViewSortBy,
  Task,
  TaskStatus,
} from '../../types';

function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, idx) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark
        key={idx}
        className="bg-amber-200 dark:bg-amber-500/40 text-slate-900 dark:text-white rounded-xs px-0.5"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

const KANBAN_COLUMNS: TaskStatus[] = ['To Do', 'In Progress', 'Completed', 'Skipped'];

export const AllTasksWorkspacePage: React.FC<{
  onInspectTask: (task: Task) => void;
  onOpenNewTaskModal: () => void;
}> = ({ onInspectTask, onOpenNewTaskModal }) => {
  const tasks = useDayForgeStore((s) => s.tasks);
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const notes = useDayForgeStore((s) => s.notes);
  const categories = useDayForgeStore((s) => s.categories);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const savedViews = useDayForgeStore((s) => s.savedViews);
  const activeSavedViewId = useDayForgeStore((s) => s.activeSavedViewId);
  const setActiveSavedViewId = useDayForgeStore((s) => s.setActiveSavedViewId);
  const saveCustomView = useDayForgeStore((s) => s.saveCustomView);
  const renameSavedView = useDayForgeStore((s) => s.renameSavedView);
  const deleteSavedView = useDayForgeStore((s) => s.deleteSavedView);
  const togglePinSavedView = useDayForgeStore((s) => s.togglePinSavedView);
  const setTaskStatus = useDayForgeStore((s) => s.setTaskStatus);
  const requestStartTimer = useDayForgeStore((s) => s.requestStartTimer);
  const bulkMutateTasks = useDayForgeStore((s) => s.bulkMutateTasks);
  const renameTag = useDayForgeStore((s) => s.renameTag);
  const mergeTags = useDayForgeStore((s) => s.mergeTags);
  const deleteTag = useDayForgeStore((s) => s.deleteTag);

  // Filter / Sort / Group / View state (defaults to 'This week')
  const [viewType, setViewType] = useState<'list' | 'kanban'>('list');
  const [groupBy, setGroupBy] = useState<SavedViewGroupBy>('date');
  const [sortBy, setSortBy] = useState<SavedViewSortBy>('date');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterTag, setFilterTag] = useState<string>('All');
  const [filterDateRange, setFilterDateRange] = useState<SavedViewDateRange>('week');
  const [customDateFrom, setCustomDateFrom] = useState<string>(selectedDate);
  const [customDateTo, setCustomDateTo] = useState<string>(selectedDate);
  const [filterHasNote, setFilterHasNote] = useState<boolean>(false);
  const [filterRecurring, setFilterRecurring] = useState<boolean>(false);
  const [filterSynced, setFilterSynced] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Saved view creation / editing state
  const [newViewName, setNewViewName] = useState('');
  const [showSaveViewInput, setShowSaveViewInput] = useState(false);
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkDateInput, setBulkDateInput] = useState(selectedDate);
  const [bulkCategoryInput, setBulkCategoryInput] = useState(
    categories[0]?.name || 'Work'
  );
  const [bulkPriorityInput, setBulkPriorityInput] = useState<Priority>('High');
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Tag Manager modal state
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [tagRenameInputs, setTagRenameInputs] = useState<Record<string, string>>({});
  const [mergeSourceTag, setMergeSourceTag] = useState('');
  const [mergeTargetTag, setMergeTargetTag] = useState('');

  // Dragging state for Kanban
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  // Apply selected saved view when `activeSavedViewId` changes
  useEffect(() => {
    if (!activeSavedViewId) return;
    const found = savedViews.find((v) => v.id === activeSavedViewId);
    if (!found) return;
    setViewType(found.viewType);
    setGroupBy(found.groupBy);
    setSortBy(found.sortBy);
    setFilterCategory(found.filterCategory);
    setFilterPriority(found.filterPriority);
    setFilterStatus(found.filterStatus);
    setFilterTag(found.filterTag);
    setFilterDateRange(found.filterDateRange);
    setFilterHasNote(found.filterHasNote);
    setFilterRecurring(found.filterRecurring);
    setFilterSynced(found.filterSynced);
  }, [activeSavedViewId, savedViews]);

  // All distinct tags across tasks and notes
  const allTagsWithCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      for (const tg of t.tags) {
        counts.set(tg, (counts.get(tg) || 0) + 1);
      }
    }
    for (const n of notes) {
      for (const tg of n.tags) {
        counts.set(tg, (counts.get(tg) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [tasks, notes]);

  // Expand tasks for selected date range
  const candidateTasks = useMemo(() => {
    const ref = parseISO(selectedDate);
    if (filterDateRange === 'today') {
      return expandTasksForDate(tasks, selectedDate);
    }
    if (filterDateRange === 'week') {
      const start = format(startOfWeek(ref, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const end = format(endOfWeek(ref, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      return expandTasksForRange(tasks, start, end);
    }
    if (filterDateRange === 'overdue') {
      return tasks.filter(
        (t) =>
          t.date < selectedDate &&
          (t.status === 'To Do' || t.status === 'In Progress')
      );
    }
    if (filterDateRange === 'custom') {
      const from = customDateFrom <= customDateTo ? customDateFrom : customDateTo;
      const to = customDateFrom <= customDateTo ? customDateTo : customDateFrom;
      return expandTasksForRange(tasks, from, to);
    }
    // 'all': return all tasks + today's recurring occurrences
    return tasks;
  }, [tasks, selectedDate, filterDateRange, customDateFrom, customDateTo]);

  const noteTaskIds = useMemo(
    () => new Set(notes.map((n) => n.linkedTaskId).filter(Boolean)),
    [notes]
  );

  // Filter and sort tasks
  const filteredAndSortedTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = candidateTasks.filter((t) => {
      if (filterCategory !== 'All' && t.category !== filterCategory) return false;
      if (filterPriority !== 'All' && t.priority !== filterPriority) return false;
      if (filterStatus === 'Open') {
        if (t.status !== 'To Do' && t.status !== 'In Progress') return false;
      } else if (filterStatus !== 'All' && t.status !== filterStatus) {
        return false;
      }
      if (filterTag !== 'All' && !t.tags.includes(filterTag)) return false;
      if (
        filterHasNote &&
        !t.linkedNoteId &&
        !noteTaskIds.has(t.id) &&
        !(t.masterTaskId && noteTaskIds.has(t.masterTaskId))
      ) {
        return false;
      }
      if (filterRecurring && !getEffectiveRecurrenceRule(t) && !t.isVirtualOccurrence) {
        return false;
      }
      if (filterSynced && !t.googleEventId) return false;
      if (q) {
        const hay = `${t.title} ${t.description} ${t.category} ${t.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const pWeight: Record<Priority, number> = { High: 0, Med: 1, Low: 2 };

    return [...filtered].sort((a, b) => {
      if (sortBy === 'priority') {
        const diff = pWeight[a.priority] - pWeight[b.priority];
        if (diff !== 0) return diff;
      } else if (sortBy === 'estimate') {
        const diff = (b.estimatedMinutes || 0) - (a.estimatedMinutes || 0);
        if (diff !== 0) return diff;
      } else if (sortBy === 'created') {
        return b.createdAt.localeCompare(a.createdAt);
      }
      // Default sort by date + start time
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return (a.start || '99:99').localeCompare(b.start || '99:99');
    });
  }, [
    candidateTasks,
    filterCategory,
    filterPriority,
    filterStatus,
    filterTag,
    filterHasNote,
    filterRecurring,
    filterSynced,
    searchQuery,
    sortBy,
    noteTaskIds,
  ]);

  // Group tasks for List view
  const groupedSections = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: `All Matching Tasks (${filteredAndSortedTasks.length})`, items: filteredAndSortedTasks }];
    }
    const map = new Map<string, Task[]>();
    for (const t of filteredAndSortedTasks) {
      const key =
        groupBy === 'date'
          ? t.date
          : groupBy === 'category'
          ? t.category
          : groupBy === 'priority'
          ? `${t.priority} Priority`
          : t.status;
      const list = map.get(key) || [];
      list.push(t);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: `${key} (${items.length})`,
      items,
    }));
  }, [filteredAndSortedTasks, groupBy]);

  const handleSaveCurrentView = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newViewName.trim()) return;
    saveCustomView({
      name: newViewName.trim(),
      pinnedToSidebar: true,
      viewType,
      groupBy,
      sortBy,
      filterCategory,
      filterPriority,
      filterStatus,
      filterTag,
      filterDateRange,
      customDateFrom,
      customDateTo,
      filterHasNote,
      filterRecurring,
      filterSynced,
    });
    setNewViewName('');
    setShowSaveViewInput(false);
  };

  const toggleSelectTask = (id: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (selectedTaskIds.size === filteredAndSortedTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredAndSortedTasks.map((t) => t.id)));
    }
  };

  const getCategoryColor = (catName: string) =>
    categories.find((c) => c.name === catName)?.color || '#2563EB';

  return (
    <div className="space-y-4">
      {/* Saved Views Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              All Tasks &amp; Kanban Board
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* List vs Kanban Toggle */}
            <div
              role="group"
              aria-label="All Tasks layout toggle"
              className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
            >
              <button
                type="button"
                onClick={() => setViewType('list')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  viewType === 'list'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <List className="w-3.5 h-3.5" /> List
              </button>
              <button
                type="button"
                onClick={() => setViewType('kanban')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  viewType === 'kanban'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Columns className="w-3.5 h-3.5" /> Kanban
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsTagManagerOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
            >
              <TagIcon className="w-3.5 h-3.5 text-blue-600" />
              Tag Manager ({allTagsWithCounts.length})
            </button>

            <button
              type="button"
              onClick={onOpenNewTaskModal}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New Task
            </button>
          </div>
        </div>

        {/* Saved Views Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
            <Bookmark className="w-3 h-3" /> Views:
          </span>
          {savedViews.map((sv: SavedView) => {
            const isActive = activeSavedViewId === sv.id;
            return (
              <div
                key={sv.id}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {renamingViewId === sv.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      renameSavedView(sv.id, renameText);
                      setRenamingViewId(null);
                    }}
                    className="flex items-center gap-1"
                  >
                    <input
                      type="text"
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      className="w-24 px-1 py-0.5 rounded bg-white dark:bg-slate-900 border border-blue-400 text-xs"
                      autoFocus
                    />
                    <button type="submit" className="text-blue-600 font-bold">
                      OK
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveSavedViewId(sv.id)}
                    className="cursor-pointer"
                  >
                    {sv.name}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => togglePinSavedView(sv.id)}
                  aria-label={sv.pinnedToSidebar ? `Unpin ${sv.name} from sidebar` : `Pin ${sv.name} to sidebar`}
                  title={sv.pinnedToSidebar ? 'Pinned to sidebar' : 'Pin to sidebar'}
                  className={`p-0.5 rounded hover:bg-slate-200/60 cursor-pointer ${
                    sv.pinnedToSidebar ? 'text-amber-500' : 'text-slate-400'
                  }`}
                >
                  <Pin className="w-3 h-3" />
                </button>

                {!sv.isBuiltIn && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingViewId(sv.id);
                        setRenameText(sv.name);
                      }}
                      aria-label={`Rename view ${sv.name}`}
                      className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedView(sv.id)}
                      aria-label={`Delete view ${sv.name}`}
                      className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {showSaveViewInput ? (
            <form onSubmit={handleSaveCurrentView} className="inline-flex items-center gap-1">
              <input
                type="text"
                aria-label="New saved view name"
                placeholder="View name..."
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                autoFocus
                className="px-2 py-1 rounded-lg border border-blue-400 bg-white dark:bg-slate-900 text-xs w-32"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowSaveViewInput(false)}
                className="px-1.5 py-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowSaveViewInput(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-500 hover:text-blue-600 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Save current view
            </button>
          )}
        </div>

        {/* Search, Filters, Group By & Sort Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Search Box */}
          <div className="md:col-span-4 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              aria-label="Search tasks"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search titles, descriptions, #tags..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Date Range Filter */}
          <div className="md:col-span-2">
            <select
              aria-label="Filter by date range"
              value={filterDateRange}
              onChange={(e) => {
                setActiveSavedViewId(null);
                setFilterDateRange(e.target.value as SavedViewDateRange);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <option value="week">Date: This Week</option>
              <option value="today">Date: Today ({selectedDate})</option>
              <option value="overdue">Date: Overdue</option>
              <option value="all">Date: All Dates</option>
              <option value="custom">Date: Custom Range</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="md:col-span-2">
            <select
              aria-label="Filter by category"
              value={filterCategory}
              onChange={(e) => {
                setActiveSavedViewId(null);
                setFilterCategory(e.target.value);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <option value="All">Category: All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  Category: {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div className="md:col-span-2">
            <select
              aria-label="Filter by priority"
              value={filterPriority}
              onChange={(e) => {
                setActiveSavedViewId(null);
                setFilterPriority(e.target.value);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <option value="All">Priority: All</option>
              <option value="High">Priority: High</option>
              <option value="Med">Priority: Med</option>
              <option value="Low">Priority: Low</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-2">
            <select
              aria-label="Filter by status"
              value={filterStatus}
              onChange={(e) => {
                setActiveSavedViewId(null);
                setFilterStatus(e.target.value);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <option value="All">Status: All</option>
              <option value="Open">Status: Open (To Do + In Progress)</option>
              <option value="To Do">Status: To Do</option>
              <option value="In Progress">Status: In Progress</option>
              <option value="Completed">Status: Completed</option>
              <option value="Skipped">Status: Skipped</option>
            </select>
          </div>
        </div>

        {/* Custom Date Range Pickers if custom selected */}
        {filterDateRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
            <span className="text-slate-500">From:</span>
            <input
              type="date"
              aria-label="Custom date from"
              value={customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            />
            <span className="text-slate-500">To:</span>
            <input
              type="date"
              aria-label="Custom date to"
              value={customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            />
          </div>
        )}

        {/* Secondary Filter Row: Tag, Group By, Sort By & Attribute Checkboxes */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by tag"
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <option value="All">Tag: All Tags</option>
              {allTagsWithCounts.map(([tg, count]) => (
                <option key={tg} value={tg}>
                  #{tg} ({count})
                </option>
              ))}
            </select>

            <select
              aria-label="Group tasks by"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as SavedViewGroupBy)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <option value="date">Group by: Date</option>
              <option value="none">Group by: None</option>
              <option value="category">Group by: Category</option>
              <option value="priority">Group by: Priority</option>
              <option value="status">Group by: Status</option>
            </select>

            <select
              aria-label="Sort tasks by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SavedViewSortBy)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <option value="date">Sort by: Date &amp; Time</option>
              <option value="priority">Sort by: Priority</option>
              <option value="estimate">Sort by: Estimated Time</option>
              <option value="created">Sort by: Recently Created</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filterHasNote}
                onChange={(e) => setFilterHasNote(e.target.checked)}
                className="rounded border-slate-300"
              />
              Has Note
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filterRecurring}
                onChange={(e) => setFilterRecurring(e.target.checked)}
                className="rounded border-slate-300"
              />
              Recurring
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={filterSynced}
                onChange={(e) => setFilterSynced(e.target.checked)}
                className="rounded border-slate-300"
              />
              Synced to Google
            </label>
          </div>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              aria-label="Select all visible tasks"
              checked={
                filteredAndSortedTasks.length > 0 &&
                selectedTaskIds.size === filteredAndSortedTasks.length
              }
              onChange={toggleSelectAllVisible}
              className="rounded border-slate-300"
            />
            <span>
              {selectedTaskIds.size > 0
                ? `${selectedTaskIds.size} selected`
                : `Select tasks for bulk actions (${filteredAndSortedTasks.length} shown)`}
            </span>
          </label>
        </div>

        {selectedTaskIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                bulkMutateTasks(Array.from(selectedTaskIds), { type: 'complete' });
                setSelectedTaskIds(new Set());
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 cursor-pointer"
            >
              Complete Selected
            </button>

            <div className="inline-flex items-center gap-1">
              <input
                type="date"
                aria-label="Bulk target date"
                value={bulkDateInput}
                onChange={(e) => setBulkDateInput(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px]"
              />
              <button
                type="button"
                onClick={() => {
                  bulkMutateTasks(Array.from(selectedTaskIds), {
                    type: 'date',
                    date: bulkDateInput,
                  });
                  setSelectedTaskIds(new Set());
                }}
                className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-medium cursor-pointer"
              >
                Set Date
              </button>
            </div>

            <div className="inline-flex items-center gap-1">
              <select
                aria-label="Bulk target category"
                value={bulkCategoryInput}
                onChange={(e) => setBulkCategoryInput(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px]"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  bulkMutateTasks(Array.from(selectedTaskIds), {
                    type: 'category',
                    category: bulkCategoryInput,
                  });
                  setSelectedTaskIds(new Set());
                }}
                className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-medium cursor-pointer"
              >
                Set Category
              </button>
            </div>

            <div className="inline-flex items-center gap-1">
              <select
                aria-label="Bulk target priority"
                value={bulkPriorityInput}
                onChange={(e) => setBulkPriorityInput(e.target.value as Priority)}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px]"
              >
                <option value="High">High</option>
                <option value="Med">Med</option>
                <option value="Low">Low</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  bulkMutateTasks(Array.from(selectedTaskIds), {
                    type: 'priority',
                    priority: bulkPriorityInput,
                  });
                  setSelectedTaskIds(new Set());
                }}
                className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-medium cursor-pointer"
              >
                Set Priority
              </button>
            </div>

            <div className="inline-flex items-center gap-1">
              <input
                type="text"
                aria-label="Bulk add tag"
                placeholder="Tag..."
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                className="w-20 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px]"
              />
              <button
                type="button"
                onClick={() => {
                  if (!bulkTagInput.trim()) return;
                  bulkMutateTasks(Array.from(selectedTaskIds), {
                    type: 'tags',
                    tag: bulkTagInput,
                  });
                  setBulkTagInput('');
                  setSelectedTaskIds(new Set());
                }}
                className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-medium cursor-pointer"
              >
                Add Tag
              </button>
            </div>

            {confirmBulkDelete ? (
              <div className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/50 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800">
                <span className="text-rose-700 dark:text-rose-300 font-semibold">
                  Delete {selectedTaskIds.size}?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    bulkMutateTasks(Array.from(selectedTaskIds), { type: 'delete' });
                    setSelectedTaskIds(new Set());
                    setConfirmBulkDelete(false);
                  }}
                  className="px-2 py-0.5 rounded bg-rose-600 text-white font-semibold cursor-pointer"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(false)}
                  className="px-1.5 py-0.5 text-slate-500 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(true)}
                className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-semibold hover:bg-rose-100 cursor-pointer"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Content: Kanban View vs Grouped List View */}
      {viewType === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {KANBAN_COLUMNS.map((colStatus) => {
            const colTasks = filteredAndSortedTasks.filter((t) => t.status === colStatus);
            const colMinutes = colTasks.reduce(
              (sum, t) => sum + (t.estimatedMinutes || 0),
              0
            );

            return (
              <div
                key={colStatus}
                aria-label={`Kanban column ${colStatus}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedTask) {
                    setTaskStatus(
                      draggedTask.id,
                      colStatus,
                      draggedTask.occurrenceDate || draggedTask.date
                    );
                    setDraggedTask(null);
                  }
                }}
                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col min-h-[420px]"
              >
                <div className="px-3.5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {colStatus}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {colTasks.length} · {Math.floor(colMinutes / 60)}h {colMinutes % 60}m
                  </span>
                </div>

                <div className="p-2.5 space-y-2 flex-1 overflow-y-auto">
                  {colTasks.map((task) => {
                    const catColor = getCategoryColor(task.category);
                    const actualMins = getTaskActualMinutes(task, timeLogs, task.date);
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggedTask(task)}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-2 hover:border-blue-400/60 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <label className="inline-flex items-start gap-2 min-w-0 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedTaskIds.has(task.id)}
                              onChange={() => toggleSelectTask(task.id)}
                              className="mt-0.5 rounded border-slate-300"
                            />
                            <button
                              type="button"
                              onClick={() => onInspectTask(task)}
                              className={`text-left text-xs font-semibold hover:text-blue-600 cursor-pointer ${
                                task.status === 'Completed'
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {highlightMatch(task.title, searchQuery)}
                            </button>
                          </label>
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
                            style={{
                              backgroundColor: `${catColor}18`,
                              color: catColor,
                            }}
                          >
                            {task.category}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500">
                          <span className="font-mono">
                            {task.date} {task.start ? `· ${task.start}` : ''}
                          </span>
                          <span className="font-mono">
                            {actualMins}m / {task.estimatedMinutes}m
                          </span>
                        </div>

                        {task.completedAt && task.status === 'Completed' && (
                          <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                            Completed at {task.completedAt.slice(11, 16)}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                          <select
                            aria-label={`Change status for ${task.title}`}
                            value={task.status}
                            onChange={(e) =>
                              setTaskStatus(
                                task.id,
                                e.target.value as TaskStatus,
                                task.occurrenceDate || task.date
                              )
                            }
                            className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium cursor-pointer"
                          >
                            {KANBAN_COLUMNS.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => requestStartTimer(task.id, 'stopwatch')}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 text-[11px] font-semibold cursor-pointer"
                          >
                            <Play className="w-2.5 h-2.5" /> Focus
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {groupedSections.map((group) => (
            <div
              key={group.key}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {group.label}
                </h3>
                <span className="text-[11px] font-mono text-slate-400">
                  {group.items.reduce((s, t) => s + (t.estimatedMinutes || 0), 0)}m planned
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.items.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No tasks match your current filters.
                  </div>
                ) : (
                  group.items.map((task) => {
                    const catColor = getCategoryColor(task.category);
                    const actualMins = getTaskActualMinutes(task, timeLogs, task.date);
                    const isRecurring =
                      task.recurrence !== 'none' || Boolean(task.recurrenceRule);

                    return (
                      <div
                        key={task.id}
                        className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            aria-label={`Select ${task.title}`}
                            checked={selectedTaskIds.has(task.id)}
                            onChange={() => toggleSelectTask(task.id)}
                            className="rounded border-slate-300"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setTaskStatus(
                                task.id,
                                task.status === 'Completed' ? 'To Do' : 'Completed',
                                task.occurrenceDate || task.date
                              )
                            }
                            aria-label={`Toggle completion for ${task.title}`}
                            className="text-slate-400 hover:text-emerald-600 cursor-pointer shrink-0"
                          >
                            {task.status === 'Completed' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onInspectTask(task)}
                                className={`text-left text-xs font-semibold hover:text-blue-600 cursor-pointer truncate ${
                                  task.status === 'Completed'
                                    ? 'line-through text-slate-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {highlightMatch(task.title, searchQuery)}
                              </button>
                              <span
                                className="px-2 py-0.5 rounded text-[10px] font-semibold"
                                style={{
                                  backgroundColor: `${catColor}18`,
                                  color: catColor,
                                }}
                              >
                                {task.category}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                {task.priority}
                              </span>
                              {task.tags.map((tg) => (
                                <span
                                  key={tg}
                                  className="text-[10px] font-mono text-blue-600 dark:text-blue-400"
                                >
                                  #{highlightMatch(tg, searchQuery)}
                                </span>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-0.5 font-mono">
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> {task.date}
                              </span>
                              {task.start && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {task.start}–{task.end}
                                </span>
                              )}
                              <span>
                                {actualMins}m / {task.estimatedMinutes}m
                              </span>
                              {isRecurring && (
                                <span className="inline-flex items-center gap-0.5 text-blue-600">
                                  <Repeat className="w-3 h-3" /> Recurring
                                </span>
                              )}
                              {task.linkedNoteId && (
                                <span className="inline-flex items-center gap-0.5 text-teal-600">
                                  <FileText className="w-3 h-3" /> Note
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          <select
                            aria-label={`Status for ${task.title}`}
                            value={task.status}
                            onChange={(e) =>
                              setTaskStatus(
                                task.id,
                                e.target.value as TaskStatus,
                                task.occurrenceDate || task.date
                              )
                            }
                            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium cursor-pointer"
                          >
                            {KANBAN_COLUMNS.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => requestStartTimer(task.id, 'stopwatch')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-100 cursor-pointer"
                          >
                            <Play className="w-3 h-3" /> Focus
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tag Manager Modal */}
      {isTagManagerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setIsTagManagerOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Tag Manager"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Tag Manager (Rename, Merge &amp; Delete)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTagManagerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Merge Two Tags */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                Merge Tags Across Tasks &amp; Notes
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Source tag to merge"
                  value={mergeSourceTag}
                  onChange={(e) => setMergeSourceTag(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">Select source tag...</option>
                  {allTagsWithCounts.map(([tg]) => (
                    <option key={tg} value={tg}>
                      #{tg}
                    </option>
                  ))}
                </select>
                <span>→</span>
                <select
                  aria-label="Target tag to merge into"
                  value={mergeTargetTag}
                  onChange={(e) => setMergeTargetTag(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">Select destination tag...</option>
                  {allTagsWithCounts.map(([tg]) => (
                    <option key={tg} value={tg}>
                      #{tg}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (mergeSourceTag && mergeTargetTag && mergeSourceTag !== mergeTargetTag) {
                      mergeTags(mergeSourceTag, mergeTargetTag);
                      setMergeSourceTag('');
                      setMergeTargetTag('');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
                >
                  Merge
                </button>
              </div>
            </div>

            {/* Tag List with Rename & Delete */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {allTagsWithCounts.length === 0 ? (
                <p className="py-4 text-center text-slate-400">No tags found.</p>
              ) : (
                allTagsWithCounts.map(([tg, count]) => (
                  <div
                    key={tg}
                    className="py-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                        #{tg}
                      </span>
                      <span className="text-[11px] text-slate-400">({count} items)</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        aria-label={`Rename tag ${tg}`}
                        placeholder="New name..."
                        value={tagRenameInputs[tg] || ''}
                        onChange={(e) =>
                          setTagRenameInputs((prev) => ({
                            ...prev,
                            [tg]: e.target.value,
                          }))
                        }
                        className="w-28 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = tagRenameInputs[tg];
                          if (next && next.trim()) {
                            renameTag(tg, next);
                            setTagRenameInputs((prev) => ({ ...prev, [tg]: '' }));
                          }
                        }}
                        className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-medium cursor-pointer"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTag(tg)}
                        aria-label={`Delete tag ${tg}`}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
