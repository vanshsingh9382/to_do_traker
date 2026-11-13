import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Calendar,
  CheckSquare,
  Command,
  FileText,
  Flame,
  Grid,
  HelpCircle,
  LayoutTemplate,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { NavSection, useDayForgeStore } from '../../store/useDayForgeStore';

function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 dark:bg-amber-500/40 text-slate-900 dark:text-amber-100 rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

interface PaletteItem {
  id: string;
  group: 'Commands' | 'Tasks' | 'Notes' | 'Habits' | 'Goals' | 'Templates';
  title: string;
  subtitle?: string;
  onSelect: () => void;
}

export const CommandPaletteModal: React.FC<{
  onOpenNewTaskModal: () => void;
}> = ({ onOpenNewTaskModal }) => {
  const isOpen = useDayForgeStore((s) => s.isCommandPaletteOpen);
  const setCommandPaletteOpen = useDayForgeStore((s) => s.setCommandPaletteOpen);
  const setActiveNav = useDayForgeStore((s) => s.setActiveNav);
  const setSelectedTaskId = useDayForgeStore((s) => s.setSelectedTaskId);
  const setActiveNoteId = useDayForgeStore((s) => s.setActiveNoteId);
  const setWrapUpModalOpen = useDayForgeStore((s) => s.setWrapUpModalOpen);
  const setReplanModalOpen = useDayForgeStore((s) => s.setReplanModalOpen);
  const setShortcutsHelpOpen = useDayForgeStore((s) => s.setShortcutsHelpOpen);
  const setZenMode = useDayForgeStore((s) => s.setZenMode);
  const isZenMode = useDayForgeStore((s) => s.isZenMode);
  const toggleSidebar = useDayForgeStore((s) => s.toggleSidebar);
  const toggleRightPane = useDayForgeStore((s) => s.toggleRightPane);
  const applyDayTemplateToDate = useDayForgeStore((s) => s.applyDayTemplateToDate);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);

  const tasks = useDayForgeStore((s) => s.tasks);
  const notes = useDayForgeStore((s) => s.notes);
  const habits = useDayForgeStore((s) => s.habits);
  const goals = useDayForgeStore((s) => s.goals);
  const dayTemplates = useDayForgeStore((s) => s.dayTemplates);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const allItems = useMemo<PaletteItem[]>(() => {
    const close = () => setCommandPaletteOpen(false);
    const navTo = (sec: NavSection) => {
      setActiveNav(sec);
      close();
    };

    const commands: PaletteItem[] = [
      {
        id: 'cmd-new-task',
        group: 'Commands',
        title: 'Create New Task (N)',
        subtitle: 'Open full task form',
        onSelect: () => {
          close();
          onOpenNewTaskModal();
        },
      },
      {
        id: 'cmd-wrapup',
        group: 'Commands',
        title: 'Wrap Up Day Ritual (W)',
        subtitle: `Close out ${selectedDate} and plan tomorrow`,
        onSelect: () => {
          close();
          setWrapUpModalOpen(true);
        },
      },
      {
        id: 'cmd-replan',
        group: 'Commands',
        title: 'Smart Replan My Day',
        subtitle: 'Propose conflict-free schedule for remaining tasks',
        onSelect: () => {
          close();
          setReplanModalOpen(true);
        },
      },
      {
        id: 'cmd-zen',
        group: 'Commands',
        title: isZenMode ? 'Exit Focus / Zen Mode (F)' : 'Enter Focus / Zen Mode (F)',
        subtitle: 'Distraction-free timer & task focus',
        onSelect: () => {
          close();
          setZenMode(!isZenMode);
        },
      },
      {
        id: 'cmd-nav-today',
        group: 'Commands',
        title: 'Go to Today Plan (G T)',
        onSelect: () => navTo('today'),
      },
      {
        id: 'cmd-nav-matrix',
        group: 'Commands',
        title: 'Go to Eisenhower Matrix',
        onSelect: () => navTo('matrix'),
      },
      {
        id: 'cmd-nav-tasks',
        group: 'Commands',
        title: 'Go to All Tasks & Kanban',
        onSelect: () => navTo('tasks'),
      },
      {
        id: 'cmd-nav-calendar',
        group: 'Commands',
        title: 'Go to Calendar (G C)',
        onSelect: () => navTo('calendar'),
      },
      {
        id: 'cmd-nav-goals',
        group: 'Commands',
        title: 'Go to Goals & Templates',
        onSelect: () => navTo('goals'),
      },
      {
        id: 'cmd-nav-reviews',
        group: 'Commands',
        title: 'Go to Daily & Weekly Reviews',
        onSelect: () => navTo('reviews'),
      },
      {
        id: 'cmd-nav-analytics',
        group: 'Commands',
        title: 'Go to Analytics (G A)',
        onSelect: () => navTo('analytics'),
      },
      {
        id: 'cmd-nav-achievements',
        group: 'Commands',
        title: 'Go to Achievements',
        onSelect: () => navTo('achievements'),
      },
      {
        id: 'cmd-nav-reports',
        group: 'Commands',
        title: 'Go to Reports & CSV Export',
        onSelect: () => navTo('reports'),
      },
      {
        id: 'cmd-shortcuts',
        group: 'Commands',
        title: 'Keyboard Shortcuts Cheat Sheet (?)',
        onSelect: () => {
          close();
          setShortcutsHelpOpen(true);
        },
      },
      {
        id: 'cmd-toggle-sidebar',
        group: 'Commands',
        title: 'Toggle Left Sidebar ([)',
        onSelect: () => {
          close();
          toggleSidebar();
        },
      },
      {
        id: 'cmd-toggle-notes',
        group: 'Commands',
        title: 'Toggle Right Notes Pane (])',
        onSelect: () => {
          close();
          toggleRightPane();
        },
      },
    ];

    const taskItems: PaletteItem[] = tasks.map((t) => ({
      id: `task-${t.id}`,
      group: 'Tasks',
      title: t.title,
      subtitle: `${t.category} · ${t.date} · ${t.status}`,
      onSelect: () => {
        setSelectedTaskId(t.id);
        setActiveNav('tasks');
        close();
      },
    }));

    const noteItems: PaletteItem[] = notes.map((n) => ({
      id: `note-${n.id}`,
      group: 'Notes',
      title: n.title,
      subtitle: n.markdown.slice(0, 60).replace(/\n/g, ' '),
      onSelect: () => {
        setActiveNoteId(n.id);
        setActiveNav('notes');
        close();
      },
    }));

    const habitItems: PaletteItem[] = habits.map((h) => ({
      id: `habit-${h.id}`,
      group: 'Habits',
      title: `${h.icon || '🔥'} ${h.title}`,
      subtitle: `${h.category} · ${h.frequency}`,
      onSelect: () => navTo('habits'),
    }));

    const goalItems: PaletteItem[] = goals.map((g) => ({
      id: `goal-${g.id}`,
      group: 'Goals',
      title: g.title,
      subtitle: `${g.category} · Target ${g.deadline || 'Ongoing'}`,
      onSelect: () => navTo('goals'),
    }));

    const templateItems: PaletteItem[] = dayTemplates.map((tpl) => ({
      id: `tpl-${tpl.id}`,
      group: 'Templates',
      title: `Apply Template: ${tpl.name}`,
      subtitle: `${tpl.blocks.length} scheduled blocks -> ${selectedDate}`,
      onSelect: () => {
        applyDayTemplateToDate(tpl.id, selectedDate);
        close();
      },
    }));

    return [
      ...commands,
      ...taskItems,
      ...noteItems,
      ...habitItems,
      ...goalItems,
      ...templateItems,
    ];
  }, [
    tasks,
    notes,
    habits,
    goals,
    dayTemplates,
    selectedDate,
    isZenMode,
    setCommandPaletteOpen,
    setActiveNav,
    setSelectedTaskId,
    setActiveNoteId,
    setWrapUpModalOpen,
    setReplanModalOpen,
    setShortcutsHelpOpen,
    setZenMode,
    toggleSidebar,
    toggleRightPane,
    applyDayTemplateToDate,
    onOpenNewTaskModal,
  ]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return allItems.slice(0, 18);
    }
    return allItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
          item.group.toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [allItems, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filteredItems.length > 0
          ? (prev - 1 + filteredItems.length) % filteredItems.length
          : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredItems[activeIndex];
      if (target) target.onSelect();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setCommandPaletteOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 backdrop-blur-xs pt-20 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette and Global Search"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            data-testid="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, tasks, notes, habits, goals, templates..."
            className="w-full text-sm bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(false)}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500"
          >
            ESC
          </button>
        </div>

        <div
          id="command-palette-results"
          role="listbox"
          className="max-h-96 overflow-y-auto p-2 space-y-1"
        >
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No matching commands, tasks, notes, habits, or goals found.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const prevGroup = idx > 0 ? filteredItems[idx - 1].group : null;
              const showGroupHeader = item.group !== prevGroup;
              return (
                <React.Fragment key={item.id}>
                  {showGroupHeader && (
                    <div className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {item.group}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === activeIndex}
                    onClick={item.onSelect}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between gap-2 transition-colors ${
                      idx === activeIndex
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {highlightMatch(item.title, query)}
                      </div>
                      {item.subtitle && (
                        <div
                          className={`text-[11px] truncate ${
                            idx === activeIndex
                              ? 'text-blue-100'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {highlightMatch(item.subtitle, query)}
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        idx === activeIndex
                          ? 'bg-blue-700 text-blue-100'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {item.group}
                    </span>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export const ShortcutsCheatSheetModal: React.FC = () => {
  const isOpen = useDayForgeStore((s) => s.isShortcutsHelpOpen);
  const setShortcutsHelpOpen = useDayForgeStore((s) => s.setShortcutsHelpOpen);

  if (!isOpen) return null;

  const shortcuts = [
    { keys: 'Ctrl / Cmd + K', desc: 'Open Command Palette & Global Search' },
    { keys: '/', desc: 'Open Global Search' },
    { keys: 'N', desc: 'New Task Modal' },
    { keys: 'Q', desc: 'Focus Quick-Add Task Input' },
    { keys: 'F', desc: 'Toggle Focus / Zen Mode' },
    { keys: 'P', desc: 'Pause / Resume Active Timer' },
    { keys: 'W', desc: 'Open Daily Wrap-Up Ritual' },
    { keys: '[', desc: 'Toggle Left Sidebar' },
    { keys: ']', desc: 'Toggle Right Notes Pane' },
    { keys: 'G then T', desc: 'Jump to Today View' },
    { keys: 'G then C', desc: 'Jump to Calendar View' },
    { keys: 'G then A', desc: 'Jump to Analytics View' },
    { keys: 'G then H', desc: 'Jump to Habits View' },
    { keys: '?', desc: 'Show this Keyboard Shortcuts Cheat Sheet' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts Cheat Sheet"
      onClick={() => setShortcutsHelpOpen(false)}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShortcutsHelpOpen(false)}
            className="p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {shortcuts.map((s) => (
            <div key={s.keys} className="py-2 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export function useGlobalKeyboardShortcuts(onOpenNewTaskModal: () => void) {
  const shortcutsEnabled = useDayForgeStore((s) => s.settings.shortcutsEnabled !== false);
  const setCommandPaletteOpen = useDayForgeStore((s) => s.setCommandPaletteOpen);
  const setShortcutsHelpOpen = useDayForgeStore((s) => s.setShortcutsHelpOpen);
  const setWrapUpModalOpen = useDayForgeStore((s) => s.setWrapUpModalOpen);
  const setReplanModalOpen = useDayForgeStore((s) => s.setReplanModalOpen);
  const setZenMode = useDayForgeStore((s) => s.setZenMode);
  const isZenMode = useDayForgeStore((s) => s.isZenMode);
  const toggleSidebar = useDayForgeStore((s) => s.toggleSidebar);
  const toggleRightPane = useDayForgeStore((s) => s.toggleRightPane);
  const setActiveNav = useDayForgeStore((s) => s.setActiveNav);
  const activeTimer = useDayForgeStore((s) => s.activeTimer);
  const pauseTimer = useDayForgeStore((s) => s.pauseTimer);
  const resumeTimer = useDayForgeStore((s) => s.resumeTimer);

  const gChordRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setShortcutsHelpOpen(false);
        setWrapUpModalOpen(false);
        setReplanModalOpen(false);
      }

      // Ctrl/Cmd + K always works unless disabled
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!shortcutsEnabled) return;
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (!shortcutsEnabled) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const now = Date.now();
      const key = e.key;

      // Check G-chord navigation (within 1000ms of pressing G)
      if (now - gChordRef.current < 1000) {
        const lower = key.toLowerCase();
        if (lower === 't') {
          e.preventDefault();
          gChordRef.current = 0;
          setActiveNav('today');
          return;
        }
        if (lower === 'c') {
          e.preventDefault();
          gChordRef.current = 0;
          setActiveNav('calendar');
          return;
        }
        if (lower === 'a') {
          e.preventDefault();
          gChordRef.current = 0;
          setActiveNav('analytics');
          return;
        }
        if (lower === 'h') {
          e.preventDefault();
          gChordRef.current = 0;
          setActiveNav('habits');
          return;
        }
      }

      if (key.toLowerCase() === 'g') {
        gChordRef.current = now;
        return;
      }

      if (key === '/') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (key.toLowerCase() === 'n') {
        e.preventDefault();
        onOpenNewTaskModal();
      } else if (key.toLowerCase() === 'q') {
        e.preventDefault();
        const quickInput = document.querySelector<HTMLInputElement>(
          '[data-testid="quick-add-task-input"]'
        );
        if (quickInput) quickInput.focus();
        else onOpenNewTaskModal();
      } else if (key.toLowerCase() === 'f') {
        e.preventDefault();
        setZenMode(!isZenMode);
      } else if (key.toLowerCase() === 'p') {
        if (activeTimer) {
          e.preventDefault();
          if (activeTimer.isRunning) pauseTimer();
          else resumeTimer();
        }
      } else if (key.toLowerCase() === 'w') {
        e.preventDefault();
        setWrapUpModalOpen(true);
      } else if (key === '[') {
        e.preventDefault();
        toggleSidebar();
      } else if (key === ']') {
        e.preventDefault();
        toggleRightPane();
      } else if (key === '?') {
        e.preventDefault();
        setShortcutsHelpOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    shortcutsEnabled,
    isZenMode,
    activeTimer,
    setCommandPaletteOpen,
    setShortcutsHelpOpen,
    setWrapUpModalOpen,
    setZenMode,
    toggleSidebar,
    toggleRightPane,
    setActiveNav,
    pauseTimer,
    resumeTimer,
    onOpenNewTaskModal,
  ]);
}
