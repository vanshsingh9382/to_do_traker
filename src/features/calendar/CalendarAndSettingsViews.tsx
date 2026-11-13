import React, { useState } from 'react';
import {
  Download,
  Upload,
  Sparkles,
  Brain,
  Bell,
  Smartphone,
  Volume2,
  Moon,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { Priority } from '../../types';
import { PWAInstallButton } from '../../components/ui/PWAInstallAndNotifications';

export const SettingsWorkspaceView: React.FC<{
  swNote?: string;
  isInstalled?: boolean;
  onTriggerInstall?: () => Promise<'accepted' | 'guide'>;
}> = ({ swNote, isInstalled = false, onTriggerInstall }) => {
  const settings = useDayForgeStore((s) => s.settings);
  const updateSettings = useDayForgeStore((s) => s.updateSettings);
  const categories = useDayForgeStore((s) => s.categories);
  const addCategory = useDayForgeStore((s) => s.addCategory);
  const exportBackupJson = useDayForgeStore((s) => s.exportBackupJson);
  const importBackupJson = useDayForgeStore((s) => s.importBackupJson);
  const resetDemoData = useDayForgeStore((s) => s.resetDemoData);
  const triggerTestNotification = useDayForgeStore((s) => s.triggerTestNotification);
  const setShortcutsHelpOpen = useDayForgeStore((s) => s.setShortcutsHelpOpen);
  const setActiveNav = useDayForgeStore((s) => s.setActiveNav);

  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#7C3AED');
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'default'
  );
  const [permFeedback, setPermFeedback] = useState<string | null>(null);

  const handleRequestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermFeedback('Browser notifications are not supported in this environment.');
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setNotifPerm(res);
      if (res === 'granted') {
        setPermFeedback('Browser notifications enabled! Click "Send test notification" to try it.');
      } else if (res === 'denied') {
        setPermFeedback(
          'Notification permission was denied. See the browser instructions below to re-enable.'
        );
      }
    } catch {
      setPermFeedback(
        'Browser blocked the permission prompt inside the preview iframe. Open the deployed app URL in a new tab to grant notification permissions.'
      );
    }
  };

  const handleExport = () => {
    const json = exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dayforge-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupMessage('Backup exported successfully.');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importBackupJson(String(reader.result || ''));
      setBackupMessage(
        result.ok ? 'Backup restored successfully!' : result.error || 'Import failed.'
      );
    };
    reader.readAsText(file);
  };

  const toggleWorkingDay = (dow: number) => {
    const exists = settings.workingDays.includes(dow);
    const next = exists
      ? settings.workingDays.filter((d) => d !== dow)
      : [...settings.workingDays, dow].sort();
    updateSettings({ workingDays: next });
  };

  const toggles = settings.reminderToggles || {
    taskReminders: true,
    morningSummary: true,
    eveningReview: true,
    habitReminders: true,
    focusSessionEnd: true,
  };

  const updateToggle = (key: keyof typeof toggles, val: boolean) => {
    updateSettings({
      reminderToggles: {
        ...toggles,
        [key]: val,
      },
    });
  };

  const presetThemes = [
    { id: 'classic-blue' as const, label: 'Classic Blue', color: '#2563EB' },
    { id: 'emerald-zen' as const, label: 'Emerald Zen', color: '#059669' },
    { id: 'violet-focus' as const, label: 'Violet Focus', color: '#7C3AED' },
    { id: 'amber-craft' as const, label: 'Amber Craft', color: '#D97706' },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* 1. Workspace & Schedule Preferences */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Workspace Settings &amp; Preferences
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">Your Name</span>
            <input
              type="text"
              value={settings.name}
              onChange={(e) => updateSettings({ name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800"
            />
          </label>

          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">Timezone</span>
            <input
              type="text"
              value={settings.timezone}
              onChange={(e) => updateSettings({ timezone: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              Working Hours Start
            </span>
            <input
              type="time"
              value={settings.workDayStart}
              onChange={(e) => updateSettings({ workDayStart: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              Working Hours End
            </span>
            <input
              type="time"
              value={settings.workDayEnd}
              onChange={(e) => updateSettings({ workDayEnd: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              Daily Focus Target (minutes)
            </span>
            <input
              type="number"
              min={30}
              max={720}
              step={15}
              value={settings.dailyFocusTargetMinutes}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10) || 240;
                updateSettings({
                  dailyFocusTargetMinutes: v,
                });
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              Weekly Focus Target (minutes)
            </span>
            <input
              type="number"
              min={60}
              max={4800}
              step={30}
              value={settings.weeklyFocusTargetMinutes ?? 1440}
              onChange={(e) =>
                updateSettings({
                  weeklyFocusTargetMinutes: parseInt(e.target.value, 10) || 1440,
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              Default Task Duration (minutes)
            </span>
            <input
              type="number"
              min={10}
              max={240}
              step={5}
              value={settings.defaultTaskDurationMinutes}
              onChange={(e) =>
                updateSettings({
                  defaultTaskDurationMinutes: parseInt(e.target.value, 10) || 45,
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              Smart Replan Buffer Between Tasks (minutes)
            </span>
            <input
              type="number"
              min={0}
              max={30}
              step={5}
              value={settings.replanBufferMinutes ?? 5}
              onChange={(e) =>
                updateSettings({
                  replanBufferMinutes: Math.max(0, parseInt(e.target.value, 10) || 0),
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              Pomodoro Work (minutes)
            </span>
            <input
              type="number"
              min={5}
              max={90}
              value={settings.pomodoroWorkMinutes}
              onChange={(e) =>
                updateSettings({
                  pomodoroWorkMinutes: parseInt(e.target.value, 10) || 25,
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              Pomodoro Short Break (minutes)
            </span>
            <input
              type="number"
              min={1}
              max={30}
              value={settings.pomodoroShortBreakMinutes}
              onChange={(e) =>
                updateSettings({
                  pomodoroShortBreakMinutes: parseInt(e.target.value, 10) || 5,
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>
        </div>

        {/* Working Days */}
        <div className="space-y-1.5 text-xs pt-2">
          <span className="font-medium text-slate-600 dark:text-slate-400 block">
            Working Days (Unselected days are Rest Days and never break your streak)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, idx) => {
              const active = settings.workingDays.includes(idx);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleWorkingDay(idx)}
                  className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Theme, 4 Preset Color Themes & Accent Color Picker */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-600 dark:text-slate-400">Mode:</span>
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => updateSettings({ theme: t })}
                  className={`px-3 py-1.5 rounded-lg capitalize font-medium cursor-pointer ${
                    settings.theme === t
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-600 dark:text-slate-400">
                Preset Color Themes:
              </span>
              {presetThemes.map((pt) => (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() =>
                    updateSettings({
                      presetTheme: pt.id,
                      accentColor: pt.color,
                    })
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-medium cursor-pointer ${
                    settings.presetTheme === pt.id
                      ? 'border-slate-900 dark:border-white bg-slate-100 dark:bg-slate-800 font-bold'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: pt.color }}
                  />
                  {pt.label}
                </button>
              ))}
              <input
                type="color"
                aria-label="Custom accent color"
                value={settings.accentColor || '#2563EB'}
                onChange={(e) => updateSettings({ accentColor: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer"
                title="Custom accent color picker"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.shortcutsEnabled !== false}
                  onChange={(e) => updateSettings({ shortcutsEnabled: e.target.checked })}
                  className="rounded text-blue-600"
                />
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Enable Single-Key Shortcuts (N, Q, F, P, W, ?, G+T/C/A/H)
                </span>
              </label>

              <button
                type="button"
                onClick={() => setShortcutsHelpOpen(true)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-50 cursor-pointer"
              >
                View Shortcuts (?)
              </button>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showDailyMotivation !== false}
                  onChange={(e) => updateSettings({ showDailyMotivation: e.target.checked })}
                  className="rounded text-blue-600"
                />
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Show Daily Motivational Line on Today
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveNav('goals')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-200 cursor-pointer"
              >
                Manage Templates →
              </button>
              <button
                type="button"
                onClick={() => setActiveNav('tasks')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-200 cursor-pointer"
              >
                Manage Tags →
              </button>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newCatName.trim()) return;
              addCategory(newCatName, newCatColor);
              setNewCatName('');
            }}
            className="flex items-center gap-2 pt-1"
          >
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="New category name..."
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800"
            />
            <input
              type="color"
              aria-label="Category color"
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold cursor-pointer"
            >
              Add Category
            </button>
          </form>
        </div>
      </div>

      {/* 2. Notifications & Reminders Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600" />
              Reminders &amp; Notifications
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Reminders fire while DayForge is open (browser tab or installed app window). Reminders when the app is fully closed need background push, which comes in Phase 4.
            </p>
          </div>

          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono font-semibold text-slate-700 dark:text-slate-300">
            Permission: {notifPerm}
          </span>
        </div>

        {/* Permission explanation & buttons */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <p className="text-slate-600 dark:text-slate-300">
            DayForge never requests browser notification permission on page load. Granting permission allows desktop/mobile system banners with quick <strong>Start timer</strong> and <strong>Snooze 10 min</strong> actions.
          </p>

          {notifPerm === 'denied' && (
            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
              <strong>How to re-enable denied notifications:</strong> Click the lock/tune icon to the left of the address bar in your browser, set <strong>Notifications</strong> to <strong>Allow</strong>, and reload the page. In-app toasts and the Notification Centre bell continue to work even when browser permission is denied.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {notifPerm !== 'granted' && (
              <button
                type="button"
                onClick={handleRequestNotificationPermission}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
              >
                Enable Browser Notifications
              </button>
            )}
            <button
              type="button"
              onClick={triggerTestNotification}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
            >
              Send test notification
            </button>
          </div>

          {permFeedback && (
            <p className="text-blue-600 dark:text-blue-400 font-medium">{permFeedback}</p>
          )}
        </div>

        {/* Schedule & Quiet Hours Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              Default Task Reminder (mins before)
            </span>
            <input
              type="number"
              min={0}
              max={120}
              step={5}
              value={settings.defaultReminderMinutes ?? 10}
              onChange={(e) =>
                updateSettings({
                  defaultReminderMinutes: Math.max(0, parseInt(e.target.value, 10) || 0),
                })
              }
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              Morning Summary Time
            </span>
            <input
              type="time"
              value={settings.morningSummaryTime || '08:00'}
              onChange={(e) => updateSettings({ morningSummaryTime: e.target.value })}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>

          <label className="space-y-1">
            <span className="font-medium text-slate-600 dark:text-slate-400">
              Evening Review Reminder
            </span>
            <input
              type="time"
              value={settings.eveningReviewTime || '21:00'}
              onChange={(e) => updateSettings({ eveningReviewTime: e.target.value })}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </label>
        </div>

        {/* Quiet Hours & Sound Chime */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(settings.quietHoursEnabled)}
                onChange={(e) => updateSettings({ quietHoursEnabled: e.target.checked })}
                className="rounded text-blue-600"
              />
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                Quiet Hours (silent notification centre only):
              </span>
            </label>
            <input
              type="time"
              aria-label="Quiet hours start"
              value={settings.quietHoursStart || '22:30'}
              onChange={(e) => updateSettings({ quietHoursStart: e.target.value })}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
            <span>to</span>
            <input
              type="time"
              aria-label="Quiet hours end"
              value={settings.quietHoursEnd || '07:00'}
              onChange={(e) => updateSettings({ quietHoursEnd: e.target.value })}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
            />
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.soundEnabled !== false}
              onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
              className="rounded text-blue-600"
            />
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5 text-blue-600" />
              Web Audio Chime
            </span>
          </label>
        </div>

        {/* Per-Type Reminder Toggles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
          {[
            { key: 'taskReminders' as const, label: 'Task Start Reminders' },
            { key: 'morningSummary' as const, label: 'Morning Plan Summary' },
            { key: 'eveningReview' as const, label: 'Evening Review Nudge' },
            { key: 'habitReminders' as const, label: 'Habit Check-In Reminders' },
            { key: 'focusSessionEnd' as const, label: 'Focus / Pomodoro Bell' },
          ].map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={toggles[item.key]}
                onChange={(e) => updateToggle(item.key, e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 3. Google Calendar Client ID & PWA Installation */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-blue-600" />
          Google OAuth Client ID &amp; Installable PWA
        </h3>

        <div className="space-y-1">
          <span className="font-medium text-slate-600 dark:text-slate-400 block">
            Google OAuth Client ID (Public Client ID — never enter a client secret)
          </span>
          <input
            type="text"
            aria-label="Settings Google Client ID"
            value={settings.googleClientId || ''}
            onChange={(e) => updateSettings({ googleClientId: e.target.value })}
            placeholder="e.g. 1234567890-abcdefg.apps.googleusercontent.com"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 font-mono"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-0.5">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              Progressive Web App (Offline Shell &amp; Home Screen Install)
            </div>
            <div className="text-slate-500 dark:text-slate-400">
              {swNote || 'Offline app shell caching ready.'}
            </div>
          </div>
          {onTriggerInstall && (
            <PWAInstallButton
              isInstalled={isInstalled}
              onTriggerInstall={onTriggerInstall}
            />
          )}
        </div>
      </div>

      {/* 4. Local-First JSON Backup Export / Import */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Local-First JSON Backup &amp; Restore (Schema v2)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          All data lives in your browser&apos;s versioned localStorage. Export a weekly JSON backup to keep a safe copy anywhere.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON Backup
          </button>

          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Import JSON Backup
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              resetDemoData();
              setBackupMessage('3-week demo dataset restored alongside your entries.');
            }}
            className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer"
          >
            Restore 3-Week Demo Dataset
          </button>
        </div>
        {backupMessage && (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {backupMessage}
          </p>
        )}
      </div>
    </div>
  );
};

interface DeepThinkingPlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeepThinkingPlannerModal: React.FC<DeepThinkingPlannerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const selectedDate = useDayForgeStore((s) => s.selectedDate);
  const tasks = useDayForgeStore((s) => s.tasks);
  const settings = useDayForgeStore((s) => s.settings);
  const addTask = useDayForgeStore((s) => s.addTask);

  const [prompt, setPrompt] = useState(
    'Plan a balanced 6-hour study and coding day for Distributed Systems, 2 LeetCode Graph problems, and a 45m evening workout.'
  );
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [proposals, setProposals] = useState<
    Array<{
      title: string;
      description?: string;
      category?: string;
      priority?: string;
      start?: string;
      end?: string;
      estimatedMinutes?: number;
      selected: boolean;
    }>
  >([]);

  if (!isOpen) return null;

  const handleRunThinking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setIsThinking(true);
    setError(null);
    try {
      const dayTasks = tasks.filter((t) => t.date === selectedDate);
      const summary = dayTasks
        .map((t) => `${t.title} (${t.start || 'unscheduled'}, ${t.estimatedMinutes}m)`)
        .join('; ');

      const res = await fetch('/api/ai/think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          currentDate: selectedDate,
          existingTasksSummary: summary,
          workHours: `${settings.workDayStart} to ${settings.workDayEnd}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Thinking request failed.');
      }
      setAnalysis(data.analysis || null);
      setProposals(
        (data.proposedTasks || []).map((p: Record<string, any>) => ({
          ...p,
          selected: true,
        }))
      );
    } catch (err: any) {
      setError(err?.message || 'Could not reach Gemini thinking endpoint.');
    } finally {
      setIsThinking(false);
    }
  };

  const handleApproveSelected = () => {
    proposals
      .filter((p) => p.selected)
      .forEach((p) => {
        const prio: Priority =
          p.priority === 'High' || p.priority === 'Low' ? p.priority : 'Med';
        addTask({
          title: p.title || 'Planned Task',
          description: p.description || '',
          category: p.category || 'Study',
          tags: ['ai-planned'],
          priority: prio,
          important: prio === 'High',
          urgent: false,
          date: selectedDate,
          start: p.start,
          end: p.end,
          estimatedMinutes: Number(p.estimatedMinutes) || 60,
          status: 'To Do',
          subtasks: [],
          recurrence: 'none',
          reminders: [10],
        });
      });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Deep-Thinking Day Architect"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4 max-h-[88vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Deep-Thinking Schedule Architect (High Thinking Mode)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            Close
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Powered by server-side Gemini (`gemini-4-carbon`, `ThinkingLevel.HIGH`). Proposes a realistic task breakdown and schedule—nothing is added until you approve.
        </p>

        <form onSubmit={handleRunThinking} className="space-y-3">
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 p-3 text-xs text-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={isThinking}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isThinking ? 'Thinking deeply...' : 'Generate Proposed Schedule'}
          </button>
        </form>

        {error && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
            {error}
          </div>
        )}

        {analysis && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {analysis}
          </div>
        )}

        {proposals.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Proposed Tasks (Uncheck any you don&apos;t want to add):
            </div>
            {proposals.map((p, idx) => (
              <label
                key={idx}
                className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={(e) =>
                    setProposals((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, selected: e.target.checked } : item
                      )
                    )
                  }
                  className="mt-0.5 rounded text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {p.title}
                  </div>
                  <div className="text-slate-500 font-mono text-[11px]">
                    {p.category || 'Study'} · {p.start || '09:00'}–{p.end || '10:00'} ·{' '}
                    {p.estimatedMinutes || 60}m
                  </div>
                </div>
              </label>
            ))}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleApproveSelected}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
              >
                Approve &amp; Add Selected Tasks
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
