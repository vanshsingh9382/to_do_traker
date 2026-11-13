import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Copy,
  Edit3,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { DayTemplate, Goal, GoalMeasureType, GoalStatus, Priority } from '../../types';
import {
  computeGoalProgress,
  detectScheduleConflicts,
  formatDuration,
} from '../../lib/phase3Engine';
import { expandTasksForDate } from '../../lib/recurrenceEngine';

export const GoalsAndTemplatesPage: React.FC = () => {
  const goals = useDayForgeStore((s) => s.goals);
  const tasks = useDayForgeStore((s) => s.tasks);
  const timeLogs = useDayForgeStore((s) => s.timeLogs);
  const categories = useDayForgeStore((s) => s.categories);
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const settings = useDayForgeStore((s) => s.settings);
  const externalEvents = useDayForgeStore((s) => s.externalEvents);
  const googleEvents = useDayForgeStore((s) => s.googleEvents);

  const addGoal = useDayForgeStore((s) => s.addGoal);
  const updateGoal = useDayForgeStore((s) => s.updateGoal);
  const deleteGoal = useDayForgeStore((s) => s.deleteGoal);
  const toggleGoalMilestone = useDayForgeStore((s) => s.toggleGoalMilestone);
  const updateTask = useDayForgeStore((s) => s.updateTask);

  const taskTemplates = useDayForgeStore((s) => s.taskTemplates);
  const dayTemplates = useDayForgeStore((s) => s.dayTemplates);
  const addTaskTemplate = useDayForgeStore((s) => s.addTaskTemplate);
  const deleteTaskTemplate = useDayForgeStore((s) => s.deleteTaskTemplate);
  const duplicateTaskTemplate = useDayForgeStore((s) => s.duplicateTaskTemplate);
  const applyTaskTemplateToDate = useDayForgeStore((s) => s.applyTaskTemplateToDate);

  const saveDateAsDayTemplate = useDayForgeStore((s) => s.saveDateAsDayTemplate);
  const deleteDayTemplate = useDayForgeStore((s) => s.deleteDayTemplate);
  const duplicateDayTemplate = useDayForgeStore((s) => s.duplicateDayTemplate);
  const applyDayTemplateToDate = useDayForgeStore((s) => s.applyDayTemplateToDate);

  const [activeTab, setActiveTab] = useState<'goals' | 'templates'>('goals');
  const [statusFilter, setStatusFilter] = useState<'All' | GoalStatus>('All');

  // Goal Create/Edit Modal state
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalCategory, setGoalCategory] = useState(categories[0]?.name || 'Work');
  const [goalDeadline, setGoalDeadline] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [goalMeasureType, setGoalMeasureType] = useState<GoalMeasureType>('hours');
  const [goalTargetHours, setGoalTargetHours] = useState(20);
  const [goalTargetTasks, setGoalTargetTasks] = useState(10);
  const [goalManualProgress, setGoalManualProgress] = useState(0);
  const [goalStatus, setGoalStatus] = useState<GoalStatus>('Active');
  const [milestoneInputs, setMilestoneInputs] = useState<string[]>([]);
  const [newMilestoneText, setNewMilestoneText] = useState('');

  // Save Today as Day Template state
  const [saveTodayName, setSaveTodayName] = useState('');
  const [saveTodayDesc, setSaveTodayDesc] = useState('');
  const [savedTemplateFeedback, setSavedTemplateFeedback] = useState('');

  // Preview & Apply Day Template Modal state
  const [previewDayTemplate, setPreviewDayTemplate] = useState<DayTemplate | null>(null);
  const [previewTargetDate, setPreviewTargetDate] = useState<string>(selectedDate);

  // Task Template creation state
  const [newTaskTplTitle, setNewTaskTplTitle] = useState('');
  const [newTaskTplCategory, setNewTaskTplCategory] = useState(categories[0]?.name || 'Work');
  const [newTaskTplMinutes, setNewTaskTplMinutes] = useState(45);
  const [newTaskTplPriority, setNewTaskTplPriority] = useState<Priority>('Med');

  const openNewGoalModal = () => {
    setEditingGoalId(null);
    setGoalTitle('');
    setGoalDesc('');
    setGoalCategory(categories[0]?.name || 'Work');
    setGoalDeadline(format(new Date(), 'yyyy-MM-dd'));
    setGoalMeasureType('hours');
    setGoalTargetHours(20);
    setGoalTargetTasks(10);
    setGoalManualProgress(0);
    setGoalStatus('Active');
    setMilestoneInputs(['Define scope & architecture', 'Complete core milestones']);
    setIsGoalModalOpen(true);
  };

  const openEditGoalModal = (g: Goal) => {
    setEditingGoalId(g.id);
    setGoalTitle(g.title);
    setGoalDesc(g.description || '');
    setGoalCategory(g.category);
    setGoalDeadline(g.deadline || format(new Date(), 'yyyy-MM-dd'));
    setGoalMeasureType(g.measureType || 'hours');
    setGoalTargetHours(g.targetHours || 20);
    setGoalTargetTasks(g.targetTasks || 10);
    setGoalManualProgress(g.manualProgress || 0);
    setGoalStatus(g.status || 'Active');
    setMilestoneInputs((g.milestones || []).map((m) => m.title));
    setIsGoalModalOpen(true);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;

    const existing = editingGoalId ? goals.find((g) => g.id === editingGoalId) : null;
    const milestones = milestoneInputs
      .filter((t) => t.trim())
      .map((title, idx) => {
        const prev = existing?.milestones?.find((m) => m.title === title);
        return {
          id: prev?.id || `ms-${Date.now()}-${idx}`,
          title: title.trim(),
          completed: prev?.completed || false,
        };
      });

    if (editingGoalId) {
      updateGoal(editingGoalId, {
        title: goalTitle.trim(),
        description: goalDesc.trim(),
        category: goalCategory,
        deadline: goalDeadline,
        measureType: goalMeasureType,
        targetHours: Number(goalTargetHours) || 10,
        targetTasks: Number(goalTargetTasks) || 5,
        manualProgress: Number(goalManualProgress) || 0,
        status: goalStatus,
        milestones,
      });
    } else {
      addGoal({
        title: goalTitle.trim(),
        description: goalDesc.trim(),
        category: goalCategory,
        deadline: goalDeadline,
        measureType: goalMeasureType,
        targetHours: Number(goalTargetHours) || 10,
        targetTasks: Number(goalTargetTasks) || 5,
        manualProgress: Number(goalManualProgress) || 0,
        status: goalStatus,
        milestones,
      });
    }
    setIsGoalModalOpen(false);
  };

  const filteredGoals = useMemo(
    () =>
      goals.filter((g) => (statusFilter === 'All' ? true : (g.status || 'Active') === statusFilter)),
    [goals, statusFilter]
  );

  const previewConflicts = useMemo(() => {
    if (!previewDayTemplate) return [];
    const existingTasksOnDate = expandTasksForDate(tasks, previewTargetDate);
    const allExt = [...externalEvents, ...googleEvents];
    const simulatedTasks = [
      ...existingTasksOnDate,
      ...previewDayTemplate.blocks.map((b, i) => ({
        id: `sim-tpl-${i}`,
        title: b.title,
        description: b.description,
        date: previewTargetDate,
        start: b.start,
        end: b.end,
        estimatedMinutes: b.estimatedMinutes,
        category: b.category,
        tags: b.tags,
        priority: b.priority,
        important: b.important,
        urgent: b.urgent,
        status: 'To Do' as const,
        subtasks: [],
        recurrence: 'none' as const,
        reminders: [10],
        order: i,
        createdAt: new Date().toISOString(),
      })),
    ];
    return detectScheduleConflicts(simulatedTasks, allExt, previewTargetDate, settings);
  }, [previewDayTemplate, previewTargetDate, tasks, externalEvents, googleEvents, settings]);

  const handleSaveTodayTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const tpl = saveDateAsDayTemplate(
      selectedDate,
      saveTodayName.trim() || `Template from ${selectedDate}`,
      saveTodayDesc.trim()
    );
    setSaveTodayName('');
    setSaveTodayDesc('');
    setSavedTemplateFeedback(`Saved "${tpl.name}" with ${tpl.blocks.length} block(s)!`);
    setTimeout(() => setSavedTemplateFeedback(''), 3000);
  };

  const handleCreateTaskTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTplTitle.trim()) return;
    addTaskTemplate({
      title: newTaskTplTitle.trim(),
      description: '',
      estimatedMinutes: Number(newTaskTplMinutes) || 30,
      category: newTaskTplCategory,
      tags: ['template'],
      priority: newTaskTplPriority,
      important: newTaskTplPriority === 'High',
      urgent: false,
      subtasks: [],
      reminders: [10],
    });
    setNewTaskTplTitle('');
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Goals &amp; Reusable Templates
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track long-term outcomes linked to your daily tasks and apply structured day or task templates with conflict previews.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('goals')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'goals'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Goals ({goals.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'templates'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Templates ({dayTemplates.length + taskTemplates.length})
            </button>
          </div>

          {activeTab === 'goals' && (
            <button
              type="button"
              data-testid="new-goal-btn"
              onClick={openNewGoalModal}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> New Goal
            </button>
          )}
        </div>
      </div>

      {activeTab === 'goals' ? (
        <div className="space-y-4">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            {(['All', 'Active', 'Paused', 'Completed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Goals List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filteredGoals.map((goal) => {
              const prog = computeGoalProgress(goal, tasks, timeLogs, new Date());
              const linkedTasks = tasks.filter((t) => t.goalId === goal.id);
              const unlinkedCandidates = tasks
                .filter((t) => t.goalId !== goal.id)
                .slice(0, 15);

              return (
                <div
                  key={goal.id}
                  data-testid={`goal-card-${goal.id}`}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                            {goal.category}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                              goal.status === 'Completed'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : goal.status === 'Paused'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {goal.status || 'Active'}
                          </span>
                          {goal.deadline && (
                            <span className="text-[11px] text-slate-400">
                              Target: {goal.deadline}
                            </span>
                          )}
                        </div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
                          {goal.title}
                        </h2>
                        {goal.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {goal.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditGoalModal(goal)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Edit goal"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteGoal(goal.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title="Delete goal"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400 font-medium">
                          {goal.measureType === 'tasks'
                            ? `${prog.currentValue} / ${prog.targetValue} tasks completed`
                            : goal.measureType === 'manual'
                            ? `Manual progress (${prog.currentValue}%)`
                            : `${prog.currentValue}h / ${prog.targetValue}h focus logged`}
                        </span>
                        <span className="font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                          {prog.percent}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{ width: `${prog.percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Milestones */}
                    {goal.milestones && goal.milestones.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Milestones
                        </div>
                        <div className="space-y-1">
                          {goal.milestones.map((ms) => (
                            <label
                              key={ms.id}
                              className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={ms.completed}
                                onChange={() => toggleGoalMilestone(goal.id, ms.id)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className={ms.completed ? 'line-through text-slate-400' : ''}>
                                {ms.title}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4-Week Contribution Chart */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                        <span className="font-semibold uppercase tracking-wider">
                          4-Week Contribution
                        </span>
                        <span>{formatDuration(prog.loggedMinutes)} total time</span>
                      </div>
                      <div className="h-24 w-full bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={prog.weeklyContributions}>
                            <XAxis
                              dataKey="weekLabel"
                              tick={{ fontSize: 10, fill: '#64748B' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis hide />
                            <Tooltip
                              formatter={(value: any) => [`${value}h`, 'Logged']}
                              contentStyle={{
                                fontSize: '11px',
                                borderRadius: '8px',
                              }}
                            />
                            <Bar dataKey="hours" fill="#2563EB" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Linked Tasks & Quick Linker */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">
                          Linked Tasks ({linkedTasks.length})
                        </span>
                        <select
                          aria-label={`Link task to ${goal.title}`}
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            updateTask(e.target.value, { goalId: goal.id });
                          }}
                          className="max-w-[200px] truncate px-2 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        >
                          <option value="">+ Link existing task...</option>
                          {unlinkedCandidates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title} ({t.date})
                            </option>
                          ))}
                        </select>
                      </div>
                      {linkedTasks.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {linkedTasks.slice(0, 6).map((t) => (
                            <span
                              key={t.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                            >
                              {t.status === 'Completed' ? '✓' : '○'} {t.title}
                              <button
                                type="button"
                                onClick={() => updateTask(t.id, { goalId: undefined })}
                                className="text-slate-400 hover:text-rose-500 ml-0.5"
                                title="Unlink task"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-8" data-testid="templates-workspace">
          {/* Save Today as a Day Template */}
          <form
            onSubmit={handleSaveTodayTemplate}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-end justify-between gap-3"
          >
            <div className="flex-1 space-y-1">
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Save Selected Day ({selectedDate}) as a Day Template
              </div>
              <p className="text-xs text-slate-500">
                Captures all scheduled tasks on {selectedDate} so you can apply this exact structure to any future date.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <input
                  type="text"
                  value={saveTodayName}
                  onChange={(e) => setSaveTodayName(e.target.value)}
                  placeholder={`e.g. Focused Sprint (${selectedDate})`}
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  value={saveTodayDesc}
                  onChange={(e) => setSaveTodayDesc(e.target.value)}
                  placeholder="Optional description..."
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {savedTemplateFeedback && (
                <span className="text-xs font-semibold text-emerald-600">
                  {savedTemplateFeedback}
                </span>
              )}
              <button
                type="submit"
                data-testid="save-today-as-template-btn"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
              >
                Save Today as Template
              </button>
            </div>
          </form>

          {/* Day Templates Grid */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Day Templates ({dayTemplates.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {dayTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  data-testid={`day-template-${tpl.id}`}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {tpl.name}
                      </h3>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => duplicateDayTemplate(tpl.id)}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          title="Duplicate template"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteDayTemplate(tpl.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600"
                          title="Delete template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{tpl.description}</p>
                    )}
                    <div className="mt-3 space-y-1.5">
                      {tpl.blocks.map((b, idx) => (
                        <div
                          key={idx}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs flex items-center justify-between"
                        >
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {b.title}
                          </span>
                          <span className="text-[11px] text-slate-500 tabular-nums ml-2">
                            {b.start}–{b.end}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid={`preview-apply-day-tpl-${tpl.id}`}
                    onClick={() => {
                      setPreviewDayTemplate(tpl);
                      setPreviewTargetDate(selectedDate);
                    }}
                    className="w-full py-2 rounded-xl text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 dark:text-blue-300"
                  >
                    Preview &amp; Apply to Date...
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Task Templates Section */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Single Task Templates ({taskTemplates.length})
            </h2>

            <form
              onSubmit={handleCreateTaskTemplate}
              className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                value={newTaskTplTitle}
                onChange={(e) => setNewTaskTplTitle(e.target.value)}
                placeholder="New task template title..."
                className="flex-1 min-w-[180px] px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
              <select
                value={newTaskTplCategory}
                onChange={(e) => setNewTaskTplCategory(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={10}
                max={360}
                step={5}
                value={newTaskTplMinutes}
                onChange={(e) => setNewTaskTplMinutes(Number(e.target.value))}
                className="w-20 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              >
                + Add Task Template
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {taskTemplates.map((tt) => (
                <div
                  key={tt.id}
                  className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {tt.title}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {tt.category} · {tt.estimatedMinutes}m · {tt.priority}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => applyTaskTemplateToDate(tt.id, selectedDate)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                    >
                      + {selectedDate}
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateTaskTemplate(tt.id)}
                      className="p-1 text-slate-400 hover:text-slate-700"
                      title="Duplicate"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTaskTemplate(tt.id)}
                      className="p-1 text-slate-400 hover:text-rose-600"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Goal Create/Edit Modal */}
      {isGoalModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Goal Editor"
        >
          <form
            onSubmit={handleSaveGoal}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingGoalId ? 'Edit Goal' : 'Create New Goal'}
              </h2>
              <button
                type="button"
                onClick={() => setIsGoalModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Goal Title
                </label>
                <input
                  type="text"
                  required
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="e.g. Ship DayForge v3 Production Architecture"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={goalDesc}
                  onChange={(e) => setGoalDesc(e.target.value)}
                  placeholder="Why this goal matters..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={goalCategory}
                    onChange={(e) => setGoalCategory(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={goalDeadline}
                    onChange={(e) => setGoalDeadline(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={goalStatus}
                    onChange={(e) => setGoalStatus(e.target.value as GoalStatus)}
                    className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="Active">Active</option>
                    <option value="Paused">Paused</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Measure Progress By
                  </label>
                  <select
                    value={goalMeasureType}
                    onChange={(e) => setGoalMeasureType(e.target.value as GoalMeasureType)}
                    className="w-full px-2.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="hours">Focus Hours Logged</option>
                    <option value="tasks">Linked Tasks Completed</option>
                    <option value="manual">Manual Percentage (%)</option>
                  </select>
                </div>

                <div>
                  {goalMeasureType === 'hours' && (
                    <>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Target Hours
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={goalTargetHours}
                        onChange={(e) => setGoalTargetHours(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </>
                  )}
                  {goalMeasureType === 'tasks' && (
                    <>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Target Completed Tasks
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={goalTargetTasks}
                        onChange={(e) => setGoalTargetTasks(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </>
                  )}
                  {goalMeasureType === 'manual' && (
                    <>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Manual Completion % (0–100)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={goalManualProgress}
                        onChange={(e) => setGoalManualProgress(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Milestones editor */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Milestones
                </label>
                <div className="flex gap-1.5 mb-2">
                  <input
                    type="text"
                    value={newMilestoneText}
                    onChange={(e) => setNewMilestoneText(e.target.value)}
                    placeholder="Add a milestone..."
                    className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newMilestoneText.trim()) return;
                      setMilestoneInputs((prev) => [...prev, newMilestoneText.trim()]);
                      setNewMilestoneText('');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800"
                  >
                    Add
                  </button>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {milestoneInputs.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-2.5 py-1 rounded bg-slate-50 dark:bg-slate-800 text-xs"
                    >
                      <span>{m}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setMilestoneInputs((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-slate-400 hover:text-rose-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsGoalModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="save-goal-submit-btn"
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
              >
                Save Goal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Day Template Preview & Conflict Check Modal */}
      {previewDayTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Preview Day Template"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Preview Template: {previewDayTemplate.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Review proposed time blocks and conflict warnings before applying.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDayTemplate(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={previewTargetDate}
                onChange={(e) => setPreviewTargetDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {previewDayTemplate.blocks.map((b, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {b.title}
                    </div>
                    <div className="text-[11px] text-slate-500">{b.category}</div>
                  </div>
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                    {b.start}–{b.end}
                  </span>
                </div>
              ))}
            </div>

            {previewConflicts.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4" />
                  {previewConflicts.length} Potential Overlap(s) on {previewTargetDate}
                </div>
                <ul className="text-[11px] text-amber-700 dark:text-amber-300 space-y-0.5">
                  {previewConflicts.slice(0, 3).map((c) => (
                    <li key={c.id}>
                      • &quot;{c.taskTitle}&quot; ({c.taskStart}–{c.taskEnd}) overlaps with &quot;
                      {c.conflictsWithTitle}&quot;
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPreviewDayTemplate(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-apply-day-template-btn"
                onClick={() => {
                  applyDayTemplateToDate(previewDayTemplate.id, previewTargetDate);
                  setPreviewDayTemplate(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
              >
                Apply {previewDayTemplate.blocks.length} Tasks to {previewTargetDate}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
