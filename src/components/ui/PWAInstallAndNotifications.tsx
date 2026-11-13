import React, { useEffect, useState } from 'react';
import {
  Bell,
  Download,
  CheckCheck,
  Trash2,
  Play,
  Clock,
  X,
  WifiOff,
  RefreshCw,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';
import { useDayForgeStore } from '../../store/useDayForgeStore';
import { NotificationItem } from '../../types';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAAndReminders() {
  const runReminderTick = useDayForgeStore((s) => s.runReminderTick);
  const requestStartTimer = useDayForgeStore((s) => s.requestStartTimer);
  const snoozeNotification = useDayForgeStore((s) => s.snoozeNotification);
  const notifications = useDayForgeStore((s) => s.notifications);

  const [swStatus, setSwStatus] = useState<'registered' | 'unsupported' | 'skipped'>('skipped');
  const [swNote, setSwNote] = useState<string>(
    'Service worker ready for offline app shell caching.'
  );
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // 1. Register Service Worker safely
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      setSwStatus('unsupported');
      setSwNote('Service workers are not supported in this browser.');
      return;
    }

    let isMounted = true;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        if (!isMounted) return;
        setSwStatus('registered');
        setSwNote('Service worker active — offline app shell cached.');

        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setUpdateAvailable(true);
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setUpdateAvailable(true);
            }
          });
        });
      })
      .catch(() => {
        // Silently skip in restricted preview iframes without console errors
        if (!isMounted) return;
        setSwStatus('skipped');
        setSwNote(
          'Service worker registration skipped in preview iframe (activates automatically on deployed URL).'
        );
      });

    const handleSWMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'DAYFORGE_NOTIFICATION_ACTION') {
        if (data.action === 'start-timer' && data.taskId) {
          requestStartTimer(data.taskId, 'stopwatch');
        } else if (data.action === 'snooze-10' && data.reminderId) {
          const found = notifications.find((n) => n.id === data.reminderId);
          if (found) snoozeNotification(found, 10);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => {
      isMounted = false;
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, [requestStartTimer, snoozeNotification, notifications]);

  // 2. Central Reminder Scheduler: on load, every 30s, and on visibilitychange
  useEffect(() => {
    runReminderTick(new Date());
    const interval = setInterval(() => {
      runReminderTick(new Date());
    }, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        runReminderTick(new Date());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [runReminderTick]);

  // 3. Install prompt & online/offline listeners
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const triggerInstallPrompt = async (): Promise<'accepted' | 'guide'> => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return 'accepted';
      }
    }
    return 'guide';
  };

  const applyServiceWorkerUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    setUpdateAvailable(false);
    window.location.reload();
  };

  return {
    swStatus,
    swNote,
    updateAvailable,
    applyServiceWorkerUpdate,
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isOnline,
    triggerInstallPrompt,
  };
}

export const PWAInstallButton: React.FC<{
  compact?: boolean;
  onTriggerInstall: () => Promise<'accepted' | 'guide'>;
  isInstalled: boolean;
}> = ({ compact, onTriggerInstall, isInstalled }) => {
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return compact ? null : (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        App Installed (Standalone Mode)
      </span>
    );
  }

  const handleClick = async () => {
    const res = await onTriggerInstall();
    if (res === 'guide') {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          compact
            ? 'w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer'
            : 'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer'
        }
        title="Install DayForge as a standalone app"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Install App</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            role="dialog"
            aria-label="Install DayForge App Instructions"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Install DayForge on Your Device
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="font-semibold text-slate-900 dark:text-white mb-1">
                  Desktop Chrome / Edge / Brave
                </div>
                <p>
                  Open DayForge in its own top-level browser tab (outside the preview iframe) and click the{' '}
                  <strong>Install DayForge</strong> icon in the address bar, or click <strong>Install App</strong> here when prompted.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="font-semibold text-slate-900 dark:text-white mb-1">
                  iPhone / iPad (iOS Safari)
                </div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>
                    Tap the <strong>Share</strong> button (square with arrow pointing up) in Safari&apos;s toolbar.
                  </li>
                  <li>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong>Add</strong> in the top-right corner to launch DayForge full-screen offline.
                  </li>
                </ol>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const NotificationCenterBell: React.FC = () => {
  const notifications = useDayForgeStore((s) => s.notifications);
  const markNotificationRead = useDayForgeStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useDayForgeStore((s) => s.markAllNotificationsRead);
  const clearNotifications = useDayForgeStore((s) => s.clearNotifications);
  const requestStartTimer = useDayForgeStore((s) => s.requestStartTimer);
  const snoozeNotification = useDayForgeStore((s) => s.snoozeNotification);

  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Open Notification Centre"
        aria-expanded={open}
        className="relative inline-flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notification Centre"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-40 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Notifications
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                ({unreadCount} unread)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={markAllNotificationsRead}
                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Mark all read
                  </button>
                  <button
                    type="button"
                    onClick={clearNotifications}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No notifications yet. Upcoming task reminders, habit nudges, and daily summaries appear here.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => markNotificationRead(item.id)}
                  className={`p-3.5 text-xs space-y-1.5 transition-colors cursor-pointer ${
                    item.read
                      ? 'bg-white dark:bg-slate-900 opacity-75'
                      : 'bg-blue-50/40 dark:bg-blue-950/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.missed && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-semibold">
                          Missed
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-400">
                        {item.createdAt.slice(11, 16)}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-snug">
                    {item.body}
                  </p>
                  {item.taskId && (
                    <div
                      className="flex items-center gap-2 pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          requestStartTimer(item.taskId!, 'stopwatch');
                          markNotificationRead(item.id);
                          setOpen(false);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 cursor-pointer"
                      >
                        <Play className="w-3 h-3" /> Start timer
                      </button>
                      <button
                        type="button"
                        onClick={() => snoozeNotification(item, 10)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium hover:bg-slate-200 cursor-pointer"
                      >
                        <Clock className="w-3 h-3" /> Snooze 10 min
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const FloatingAlertsAndBanners: React.FC<{
  isOnline: boolean;
  updateAvailable: boolean;
  onApplyUpdate: () => void;
}> = ({ isOnline, updateAvailable, onApplyUpdate }) => {
  const activeToast = useDayForgeStore((s) => s.activeToast);
  const dismissActiveToast = useDayForgeStore((s) => s.dismissActiveToast);
  const requestStartTimer = useDayForgeStore((s) => s.requestStartTimer);
  const snoozeNotification = useDayForgeStore((s) => s.snoozeNotification);

  return (
    <>
      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed bottom-16 md:bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Offline Mode — Local tasks & notes work normally; Google sync paused.</span>
        </div>
      )}

      {/* Service Worker Update Available Toast */}
      {updateAvailable && (
        <div className="fixed bottom-16 md:bottom-4 right-4 z-40 flex items-center gap-3 rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-xs font-medium text-white dark:text-slate-900 shadow-xl">
          <span>Update available</span>
          <button
            type="button"
            onClick={onApplyUpdate}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      )}

      {/* Active Reminder Toast */}
      {activeToast && (
        <div
          role="alert"
          className="fixed top-16 right-4 z-50 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 shadow-xl p-4 space-y-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {activeToast.title}
              </span>
            </div>
            <button
              type="button"
              onClick={dismissActiveToast}
              aria-label="Dismiss reminder toast"
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">{activeToast.body}</p>
          <div className="flex items-center gap-2 pt-1">
            {activeToast.taskId && (
              <button
                type="button"
                onClick={() => {
                  requestStartTimer(activeToast.taskId!, 'stopwatch');
                  dismissActiveToast();
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" /> Start timer
              </button>
            )}
            <button
              type="button"
              onClick={() => snoozeNotification(activeToast, 10)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-200 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" /> Snooze 10 min
            </button>
          </div>
        </div>
      )}
    </>
  );
};
