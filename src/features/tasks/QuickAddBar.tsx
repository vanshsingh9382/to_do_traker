import React, { useState, useEffect } from 'react';
import { Plus, Calendar, Clock, Flag, Folder, Sparkles } from 'lucide-react';
import { parseQuickAddInput } from '../../lib/nlpParser';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { Priority } from '../../types';

interface QuickAddBarProps {
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export const QuickAddBar: React.FC<QuickAddBarProps> = ({ inputRef }) => {
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const settings = useDayForgeStore((s) => s.settings);
  const categories = useDayForgeStore((s) => s.categories);
  const addTask = useDayForgeStore((s) => s.addTask);

  const [rawText, setRawText] = useState('');
  const [titleOverride, setTitleOverride] = useState('');
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [startOverride, setStartOverride] = useState<string | null>(null);
  const [endOverride, setEndOverride] = useState<string | null>(null);
  const [durationOverride, setDurationOverride] = useState<number | null>(null);
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
  const [priorityOverride, setPriorityOverride] = useState<Priority | null>(null);

  const parsed = parseQuickAddInput(
    rawText,
    selectedDate,
    settings.defaultTaskDurationMinutes,
    categories.map((c) => c.name)
  );

  // Reset manual overrides when rawText is cleared
  useEffect(() => {
    if (!rawText.trim()) {
      setTitleOverride('');
      setDateOverride(null);
      setStartOverride(null);
      setEndOverride(null);
      setDurationOverride(null);
      setCategoryOverride(null);
      setPriorityOverride(null);
    }
  }, [rawText]);

  const finalTitle = titleOverride || parsed.cleanTitle;
  const finalDate = dateOverride ?? parsed.date;
  const finalStart = startOverride ?? parsed.start ?? '';
  const finalEnd = endOverride ?? parsed.end ?? '';
  const finalDuration = durationOverride ?? parsed.estimatedMinutes;
  const finalCategory = categoryOverride ?? parsed.category;
  const finalPriority = priorityOverride ?? parsed.priority;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) return;

    addTask({
      title: finalTitle.trim() || rawText.trim(),
      description: '',
      category: finalCategory,
      tags: parsed.tags,
      priority: finalPriority,
      important: parsed.important || finalPriority === 'High',
      urgent: parsed.urgent,
      date: finalDate,
      start: finalStart || undefined,
      end: finalEnd || undefined,
      estimatedMinutes: Math.max(5, finalDuration),
      status: 'To Do',
      subtasks: [],
      recurrence: 'none',
      reminders: [10],
    });

    setRawText('');
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs transition-all">
      <form onSubmit={handleSubmit} className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
          <Plus className="w-4 h-4" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder='Quick add task... e.g. "Study DSA tomorrow 6pm-8pm #study !high 2h"'
          aria-label="Quick add task with natural language"
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!rawText.trim()}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Add Task
        </button>
      </form>

      {rawText.trim().length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1 font-medium">
            <Sparkles className="w-3 h-3" /> Parsed preview (editable):
          </span>

          {/* Editable Title */}
          <input
            type="text"
            aria-label="Parsed task title"
            value={finalTitle}
            onChange={(e) => setTitleOverride(e.target.value)}
            className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium border border-transparent focus:border-blue-500 focus:outline-none max-w-48"
          />

          {/* Editable Category */}
          <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <Folder className="w-3 h-3 text-slate-400" />
            <select
              aria-label="Parsed category"
              value={finalCategory}
              onChange={(e) => setCategoryOverride(e.target.value)}
              className="bg-transparent text-xs font-medium focus:outline-none cursor-pointer"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.name} className="bg-white dark:bg-slate-900">
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {/* Editable Priority */}
          <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <Flag className="w-3 h-3 text-slate-400" />
            <select
              aria-label="Parsed priority"
              value={finalPriority}
              onChange={(e) => setPriorityOverride(e.target.value as Priority)}
              className="bg-transparent text-xs font-medium focus:outline-none cursor-pointer"
            >
              <option value="Low" className="bg-white dark:bg-slate-900">Priority: Low</option>
              <option value="Med" className="bg-white dark:bg-slate-900">Priority: Med</option>
              <option value="High" className="bg-white dark:bg-slate-900">Priority: High</option>
            </select>
          </label>

          {/* Editable Date */}
          <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <Calendar className="w-3 h-3 text-slate-400" />
            <input
              type="date"
              aria-label="Parsed date"
              value={finalDate}
              onChange={(e) => setDateOverride(e.target.value)}
              className="bg-transparent text-xs font-mono focus:outline-none cursor-pointer"
            />
          </label>

          {/* Editable Start - End */}
          <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <Clock className="w-3 h-3 text-slate-400" />
            <input
              type="time"
              aria-label="Parsed start time"
              value={finalStart}
              onChange={(e) => setStartOverride(e.target.value)}
              className="bg-transparent text-xs font-mono focus:outline-none w-18"
            />
            <span>–</span>
            <input
              type="time"
              aria-label="Parsed end time"
              value={finalEnd}
              onChange={(e) => setEndOverride(e.target.value)}
              className="bg-transparent text-xs font-mono focus:outline-none w-18"
            />
          </label>

          {/* Editable Duration */}
          <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <input
              type="number"
              min={5}
              max={720}
              step={5}
              aria-label="Parsed estimated minutes"
              value={finalDuration}
              onChange={(e) => setDurationOverride(parseInt(e.target.value, 10) || 30)}
              className="bg-transparent text-xs font-mono w-12 focus:outline-none text-right"
            />
            <span>min</span>
          </label>
        </div>
      )}
    </div>
  );
};
