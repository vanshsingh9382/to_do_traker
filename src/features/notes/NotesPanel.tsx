import React, { useState, useRef, useEffect } from 'react';
import {
  Heading1,
  Heading2,
  Bold,
  Italic,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Highlighter,
  Pin,
  Search,
  Plus,
  Eye,
  Edit3,
  Check,
  Sparkles,
  Folder,
  Trash2,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';

export const NotesPanel: React.FC = () => {
  const notes = useDayForgeStore((s) => s.notes);
  const tasks = useDayForgeStore((s) => s.tasks);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const selectedTaskId = useDayForgeStore((s) => s.selectedTaskId);
  const activeNoteId = useDayForgeStore((s) => s.activeNoteId);
  const rightNoteMode = useDayForgeStore((s) => s.rightNoteMode);
  const setRightNoteMode = useDayForgeStore((s) => s.setRightNoteMode);
  const setActiveNoteId = useDayForgeStore((s) => s.setActiveNoteId);
  const createNote = useDayForgeStore((s) => s.createNote);
  const updateNote = useDayForgeStore((s) => s.updateNote);
  const deleteNote = useDayForgeStore((s) => s.deleteNote);
  const togglePinNote = useDayForgeStore((s) => s.togglePinNote);
  const getOrCreateDailyNote = useDayForgeStore((s) => s.getOrCreateDailyNote);
  const getOrCreateTaskNote = useDayForgeStore((s) => s.getOrCreateTaskNote);
  const createTaskFromNoteLine = useDayForgeStore((s) => s.createTaskFromNoteLine);

  const [viewTab, setViewTab] = useState<'write' | 'preview'>('write');
  const [searchQuery, setSearchQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState('All');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'Saved' | 'Saving...'>('Saved');
  const [taskCreatedFeedback, setTaskCreatedFeedback] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Resolve current note based on rightNoteMode ('daily' vs 'task') or activeNoteId
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  useEffect(() => {
    if (rightNoteMode === 'daily') {
      const daily = notes.find((n) => n.linkedDate === selectedDate);
      if (daily) {
        setActiveNoteId(daily.id);
      } else {
        const created = getOrCreateDailyNote(selectedDate);
        setActiveNoteId(created.id);
      }
    } else if (rightNoteMode === 'task' && selectedTaskId) {
      const taskNote = notes.find((n) => n.linkedTaskId === selectedTaskId);
      if (taskNote) {
        setActiveNoteId(taskNote.id);
      } else {
        const created = getOrCreateTaskNote(selectedTaskId);
        setActiveNoteId(created.id);
      }
    }
  }, [rightNoteMode, selectedDate, selectedTaskId]);

  const currentNote =
    notes.find((n) => n.id === activeNoteId) ||
    notes.find((n) => n.linkedDate === selectedDate) ||
    notes[0];

  const folders = Array.from(new Set(notes.map((n) => n.folder || 'General')));

  const filteredNotes = notes
    .filter((n) => folderFilter === 'All' || n.folder === folderFilter)
    .filter(
      (n) =>
        !searchQuery.trim() ||
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.markdown.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => (a.pinned === b.pinned ? b.updatedAt.localeCompare(a.updatedAt) : a.pinned ? -1 : 1));

  const applyFormat = (syntaxType: string) => {
    if (!currentNote) return;
    const el = textareaRef.current;
    const text = currentNote.markdown;
    const start = el ? el.selectionStart : text.length;
    const end = el ? el.selectionEnd : text.length;
    const selected = text.slice(start, end);

    let replacement = '';
    switch (syntaxType) {
      case 'h1':
        replacement = `\n# ${selected || 'Heading 1'}\n`;
        break;
      case 'h2':
        replacement = `\n## ${selected || 'Heading 2'}\n`;
        break;
      case 'bold':
        replacement = `**${selected || 'bold text'}**`;
        break;
      case 'italic':
        replacement = `*${selected || 'italic text'}*`;
        break;
      case 'bullet':
        replacement = `\n- ${selected || 'List item'}`;
        break;
      case 'numbered':
        replacement = `\n1. ${selected || 'Numbered item'}`;
        break;
      case 'checklist':
        replacement = `\n- [ ] ${selected || 'Action item'}`;
        break;
      case 'code':
        replacement = `\n\`\`\`ts\n${selected || '// code snippet'}\n\`\`\`\n`;
        break;
      case 'highlight':
        replacement = `==${selected || 'highlighted'}==`;
        break;
      default:
        return;
    }

    const updated = text.slice(0, start) + replacement + text.slice(end);
    handleMarkdownChange(updated);
    setShowSlashMenu(false);
  };

  const handleMarkdownChange = (val: string) => {
    if (!currentNote) return;
    setSaveStatus('Saving...');
    updateNote(currentNote.id, { markdown: val });
    if (val.endsWith('/')) {
      setShowSlashMenu(true);
    } else if (showSlashMenu) {
      setShowSlashMenu(false);
    }
    setTimeout(() => setSaveStatus('Saved'), 250);
  };

  const handleMakeLineATask = () => {
    if (!currentNote) return;
    const el = textareaRef.current;
    let candidateLine = '';

    if (el && el.selectionStart !== el.selectionEnd) {
      candidateLine = currentNote.markdown.slice(el.selectionStart, el.selectionEnd);
    } else if (el) {
      // Find the line where the cursor sits
      const before = currentNote.markdown.slice(0, el.selectionStart);
      const lineIdx = before.split('\n').length - 1;
      const allLines = currentNote.markdown.split('\n');
      candidateLine = allLines[lineIdx] || '';
    } else {
      const firstBullet = currentNote.markdown
        .split('\n')
        .find((l) => l.trim().startsWith('- ') || l.trim().length > 0);
      candidateLine = firstBullet || currentNote.title;
    }

    const created = createTaskFromNoteLine(candidateLine || currentNote.title, selectedDate);
    setTaskCreatedFeedback(`Added task: "${created.title}"`);
    setTimeout(() => setTaskCreatedFeedback(null), 3000);
  };

  const toggleChecklistLineInPreview = (lineIndex: number) => {
    if (!currentNote) return;
    const lines = currentNote.markdown.split('\n');
    const line = lines[lineIndex];
    if (!line) return;
    if (/^\s*[-*]\s*\[ \]/.test(line)) {
      lines[lineIndex] = line.replace('[ ]', '[x]');
    } else if (/^\s*[-*]\s*\[[xX]\]/.test(line)) {
      lines[lineIndex] = line.replace(/\[[xX]\]/, '[ ]');
    }
    handleMarkdownChange(lines.join('\n'));
  };

  return (
    <aside
      aria-label="Side-by-side Notes Workspace"
      className="h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 select-text"
    >
      {/* Mode Switcher: Daily Note vs Task Note */}
      <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setRightNoteMode('daily')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              rightNoteMode === 'daily'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Daily Note
          </button>
          <button
            type="button"
            onClick={() => setRightNoteMode('task')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              rightNoteMode === 'task'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Task Note
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <Check className="w-3 h-3 text-emerald-500" />
            {saveStatus}
          </span>
          <button
            type="button"
            onClick={() =>
              createNote({
                title: 'New Scratchpad Note',
                folder: 'General',
              })
            }
            aria-label="Create new note"
            title="New Note"
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search & Note Selector Strip */}
      <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 space-y-2 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              aria-label="Search notes"
              className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter notes by folder"
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300"
          >
            <option value="All">All Folders</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        {/* Compact Note Switcher */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {filteredNotes.slice(0, 6).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setActiveNoteId(n.id)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium truncate max-w-36 shrink-0 transition-colors cursor-pointer ${
                currentNote?.id === n.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700'
              }`}
            >
              {n.pinned ? '★ ' : ''}
              {n.title}
            </button>
          ))}
        </div>
      </div>

      {/* Note Title & Metadata Header */}
      {currentNote && (
        <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              aria-label="Note title"
              value={currentNote.title}
              onChange={(e) => updateNote(currentNote.id, { title: e.target.value })}
              className="flex-1 text-sm font-bold text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => togglePinNote(currentNote.id)}
                aria-label={currentNote.pinned ? 'Unpin note' : 'Pin note'}
                title={currentNote.pinned ? 'Unpin note' : 'Pin note'}
                className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${
                  currentNote.pinned ? 'text-amber-500' : 'text-slate-400'
                }`}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              {notes.length > 1 && (
                <button
                  type="button"
                  onClick={() => deleteNote(currentNote.id)}
                  aria-label="Delete current note"
                  title="Delete note"
                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1 truncate">
              <Folder className="w-3 h-3" />
              {currentNote.folder}
              {selectedTask && rightNoteMode === 'task'
                ? ` · Linked: ${selectedTask.title.slice(0, 22)}`
                : ''}
            </span>
          </div>
        </div>
      )}

      {/* Markdown Formatting Toolbar + "Make this a task" */}
      <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1 bg-slate-50/80 dark:bg-slate-800/40">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => applyFormat('h1')}
            aria-label="Heading 1"
            title="Heading 1"
            className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <Heading1 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('h2')}
            aria-label="Heading 2"
            title="Heading 2"
            className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('bold')}
            aria-label="Bold"
            title="Bold"
            className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('italic')}
            aria-label="Italic"
            title="Italic"
            className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('bullet')}
            aria-label="Bullet list"
            title="Bullet List"
            className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('numbered')}
            aria-label="Numbered list"
            title="Numbered List"
            className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('checklist')}
            aria-label="Checklist item"
            title="Checklist"
            className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('code')}
            aria-label="Code block"
            title="Code Block"
            className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyFormat('highlight')}
            aria-label="Highlight text"
            title="Highlight"
            className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleMakeLineATask}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors cursor-pointer"
            title="Convert selected text or current line into a task"
          >
            <Sparkles className="w-3 h-3" />
            Make this a task
          </button>

          <button
            type="button"
            onClick={() => setViewTab(viewTab === 'write' ? 'preview' : 'write')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            {viewTab === 'write' ? (
              <>
                <Eye className="w-3 h-3" /> Preview
              </>
            ) : (
              <>
                <Edit3 className="w-3 h-3" /> Edit
              </>
            )}
          </button>
        </div>
      </div>

      {taskCreatedFeedback && (
        <div className="px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 border-b border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-200">
          {taskCreatedFeedback}
        </div>
      )}

      {/* Editor or Rendered Interactive Preview */}
      <div className="relative flex-1 overflow-y-auto p-3.5">
        {showSlashMenu && (
          <div className="absolute left-4 top-10 z-30 w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-1.5 text-xs space-y-0.5">
            <div className="px-2 py-1 text-[10px] font-semibold text-slate-400">
              Slash Commands
            </div>
            {[
              { id: 'h1', label: 'Heading 1' },
              { id: 'h2', label: 'Heading 2' },
              { id: 'checklist', label: 'To-do Checklist' },
              { id: 'bullet', label: 'Bullet List' },
              { id: 'code', label: 'Code Block' },
            ].map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => applyFormat(cmd.id)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {cmd.label}
              </button>
            ))}
          </div>
        )}

        {viewTab === 'write' ? (
          <textarea
            ref={textareaRef}
            aria-label="Note markdown editor"
            value={currentNote?.markdown || ''}
            onChange={(e) => handleMarkdownChange(e.target.value)}
            placeholder="Type '/' for commands, or write markdown notes beside your tasks..."
            className="w-full h-full min-h-[360px] bg-transparent text-xs md:text-sm text-slate-800 dark:text-slate-200 font-mono leading-relaxed resize-none focus:outline-none"
          />
        ) : (
          <div className="space-y-2 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
            {(currentNote?.markdown || '').split('\n').map((line, idx) => {
              if (line.startsWith('# ')) {
                return (
                  <h1 key={idx} className="text-lg font-bold text-slate-900 dark:text-white pt-2">
                    {line.slice(2)}
                  </h1>
                );
              }
              if (line.startsWith('## ')) {
                return (
                  <h2
                    key={idx}
                    className="text-base font-semibold text-slate-900 dark:text-slate-100 pt-1.5"
                  >
                    {line.slice(3)}
                  </h2>
                );
              }
              const uncheckedMatch = line.match(/^\s*[-*]\s*\[ \]\s*(.*)/);
              if (uncheckedMatch) {
                return (
                  <label
                    key={idx}
                    className="flex items-center gap-2 text-xs py-0.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => toggleChecklistLineInPreview(idx)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>{uncheckedMatch[1]}</span>
                  </label>
                );
              }
              const checkedMatch = line.match(/^\s*[-*]\s*\[[xX]\]\s*(.*)/);
              if (checkedMatch) {
                return (
                  <label
                    key={idx}
                    className="flex items-center gap-2 text-xs py-0.5 cursor-pointer text-slate-400 line-through"
                  >
                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => toggleChecklistLineInPreview(idx)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>{checkedMatch[1]}</span>
                  </label>
                );
              }
              if (line.startsWith('- ')) {
                return (
                  <div key={idx} className="text-xs pl-3 flex items-start gap-2">
                    <span className="text-slate-400">•</span>
                    <span>{line.slice(2)}</span>
                  </div>
                );
              }
              if (line.startsWith('> ')) {
                return (
                  <blockquote
                    key={idx}
                    className="text-xs italic text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg"
                  >
                    {line.slice(2)}
                  </blockquote>
                );
              }
              if (!line.trim()) {
                return <div key={idx} className="h-2" />;
              }
              return (
                <p key={idx} className="text-xs leading-relaxed">
                  {line}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
