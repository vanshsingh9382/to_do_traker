import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { GoogleCalendarEvent, GoogleCalendarListEntry, Settings, Task } from '../types';
import { buildRRULEString } from './recurrenceEngine';
import { generateRFC5545ICS } from './icsEngine';

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

// In-memory token cache ONLY (never stored in localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedUserEmail: string | null = null;
let tokenExpiresAtMs: number | null = null;

/**
 * Resolves the configured Google OAuth Client ID from env var or Settings.
 */
export function getConfiguredGoogleClientId(settings?: Pick<Settings, 'googleClientId'>): string {
  const envId =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID
      ? String(import.meta.env.VITE_GOOGLE_CLIENT_ID).trim()
      : '';
  const settingsId = settings?.googleClientId?.trim() || '';
  return settingsId || envId;
}

export function hasGoogleClientIdConfigured(settings?: Pick<Settings, 'googleClientId'>): boolean {
  return getConfiguredGoogleClientId(settings).length > 0;
}

/**
 * Translates HTTP status codes or network errors from Google Calendar API into plain language.
 */
export function formatGoogleCalendarError(status: number | null, rawMessage: string): {
  code: '401' | '403' | '404' | '429' | 'offline' | 'unknown';
  userMessage: string;
} {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      code: 'offline',
      userMessage: 'You are currently offline. Google Calendar sync will resume when reconnected.',
    };
  }
  if (status === 401) {
    cachedAccessToken = null;
    return {
      code: '401',
      userMessage: 'Your Google Calendar session expired (401). Please click Reconnect.',
    };
  }
  if (status === 403) {
    return {
      code: '403',
      userMessage:
        'Google Calendar permission denied or API quota exceeded (403). Verify calendar.events scope is granted.',
    };
  }
  if (status === 404 || status === 410) {
    return {
      code: '404',
      userMessage:
        'This event was removed in Google Calendar (404/410). You can unlink it or recreate the event.',
    };
  }
  if (status === 429 || (status && status >= 500)) {
    return {
      code: '429',
      userMessage: `Google Calendar is temporarily busy (${status}). Retrying with exponential back-off...`,
    };
  }
  return {
    code: 'unknown',
    userMessage: rawMessage || 'Google Calendar request failed.',
  };
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  backoffMs = 500
): Promise<Response> {
  const res = await fetch(url, options);
  if ((res.status === 429 || res.status >= 500) && retries > 0) {
    await new Promise((r) => setTimeout(r, backoffMs));
    return fetchWithRetry(url, options, retries - 1, backoffMs * 2);
  }
  return res;
}

export const initGoogleCalendarAuth = (
  onAuthSuccess?: (user: { email: string | null; displayName: string | null }, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      cachedUserEmail = user.email || user.displayName || 'Connected Account';
      if (onAuthSuccess) {
        onAuthSuccess({ email: user.email, displayName: user.displayName }, cachedAccessToken);
      }
    } else if (!isSigningIn) {
      if (!cachedAccessToken) {
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

/**
 * Loads Google Identity Services (accounts.google.com/gsi/client) dynamically if a raw Client ID is used.
 */
function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'));
    if ((window as any).google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(script);
  });
}

/**
 * Connects to Google Calendar using Google Identity Services (if a Client ID is provided)
 * or falls back to the provisioned Firebase Google OAuth popup when `"firebase-provisioned"` is used.
 */
export const signInWithGoogleCalendar = async (
  customClientId?: string
): Promise<{
  user: { email: string | null; displayName: string | null };
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;

    if (customClientId && customClientId !== 'provisioned-firebase-oauth') {
      await loadGsiScript();
      const tokenResponse = await new Promise<{ access_token: string; expires_in?: number }>(
        (resolve, reject) => {
          const client = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: customClientId,
            scope: SCOPES.join(' '),
            callback: (resp: any) => {
              if (resp.error) {
                reject(new Error(resp.error_description || resp.error));
              } else {
                resolve(resp);
              }
            },
          });
          client.requestAccessToken({ prompt: 'consent' });
        }
      );

      cachedAccessToken = tokenResponse.access_token;
      tokenExpiresAtMs = Date.now() + (tokenResponse.expires_in || 3500) * 1000;
      cachedUserEmail = 'Google Calendar User';
      return {
        user: { email: cachedUserEmail, displayName: cachedUserEmail },
        accessToken: cachedAccessToken,
      };
    }

    // Provisioned Firebase Auth Google OAuth popup
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Calendar OAuth access token.');
    }
    cachedAccessToken = credential.accessToken;
    tokenExpiresAtMs = Date.now() + 3500 * 1000;
    cachedUserEmail = result.user.email || result.user.displayName || 'Connected Account';
    return {
      user: { email: result.user.email, displayName: result.user.displayName },
      accessToken: cachedAccessToken,
    };
  } catch (error) {
    console.error('Google Calendar sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken && tokenExpiresAtMs && Date.now() > tokenExpiresAtMs) {
    cachedAccessToken = null;
  }
  return cachedAccessToken;
};

export const isGoogleTokenExpired = (): boolean => {
  if (!cachedAccessToken) return true;
  if (tokenExpiresAtMs && Date.now() > tokenExpiresAtMs) return true;
  return false;
};

export const getConnectedGoogleUserEmail = (): string | null => cachedUserEmail;

export const disconnectGoogleCalendar = async (): Promise<void> => {
  try {
    if (cachedAccessToken && (window as any).google?.accounts?.oauth2?.revoke) {
      (window as any).google.accounts.oauth2.revoke(cachedAccessToken, () => {});
    }
    await auth.signOut();
  } catch {
    // ignore signOut errors
  }
  cachedAccessToken = null;
  cachedUserEmail = null;
  tokenExpiresAtMs = null;
};

export async function fetchUserCalendars(): Promise<GoogleCalendarListEntry[]> {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error('Not authenticated with Google Calendar (401). Please reconnect.');

  const res = await fetchWithRetry(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    const formatted = formatGoogleCalendarError(res.status, errText);
    throw new Error(formatted.userMessage);
  }
  const data = await res.json();
  return (data.items || []).map((item: Record<string, unknown>) => ({
    id: String(item.id || 'primary'),
    summary: String(item.summary || 'Calendar'),
    primary: Boolean(item.primary),
    backgroundColor: item.backgroundColor ? String(item.backgroundColor) : '#2563EB',
  }));
}

export async function fetchGoogleCalendarEventsForRange(
  startDateStr: string,
  endDateStr: string,
  calendarId = 'primary'
): Promise<GoogleCalendarEvent[]> {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error('Not authenticated with Google Calendar (401). Please reconnect.');

  const timeMin = new Date(`${startDateStr}T00:00:00`).toISOString();
  const timeMax = new Date(`${endDateStr}T23:59:59`).toISOString();

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  const res = await fetchWithRetry(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    const formatted = formatGoogleCalendarError(res.status, errText);
    throw new Error(formatted.userMessage);
  }
  const data = await res.json();
  return (data.items || []).map((item: Record<string, any>) => {
    const startRaw: string =
      item.start?.dateTime || item.start?.date || `${startDateStr}T09:00:00`;
    const endRaw: string =
      item.end?.dateTime || item.end?.date || `${startDateStr}T10:00:00`;
    const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);

    let startTime: string | undefined;
    let endTime: string | undefined;
    let dateStr = startDateStr;
    if (!isAllDay) {
      const sDate = new Date(startRaw);
      const eDate = new Date(endRaw);
      dateStr = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}-${String(
        sDate.getDate()
      ).padStart(2, '0')}`;
      startTime = `${String(sDate.getHours()).padStart(2, '0')}:${String(
        sDate.getMinutes()
      ).padStart(2, '0')}`;
      endTime = `${String(eDate.getHours()).padStart(2, '0')}:${String(
        eDate.getMinutes()
      ).padStart(2, '0')}`;
    } else if (item.start?.date) {
      dateStr = String(item.start.date).slice(0, 10);
    }

    const dayforgeTaskId = item.extendedProperties?.private?.dayforgeTaskId
      ? String(item.extendedProperties.private.dayforgeTaskId)
      : undefined;

    return {
      id: String(item.id),
      summary: String(item.summary || '(No title)'),
      description: item.description ? String(item.description) : undefined,
      start: startRaw,
      end: endRaw,
      startTime,
      endTime,
      date: dateStr,
      htmlLink: item.htmlLink ? String(item.htmlLink) : undefined,
      calendarId,
      isAllDay,
      source: 'google' as const,
      dayforgeTaskId,
    };
  });
}

export async function fetchGoogleCalendarEventsForDate(
  dateStr: string,
  calendarId = 'primary'
): Promise<GoogleCalendarEvent[]> {
  return fetchGoogleCalendarEventsForRange(dateStr, dateStr, calendarId);
}

/**
 * Creates or updates a Google Calendar event for a DayForge task.
 * Tags the event with `extendedProperties.private.dayforgeTaskId` so duplicates are prevented.
 */
export async function syncTaskToGoogleCalendar(
  task: Task,
  calendarId = 'primary',
  timezone = 'Asia/Kolkata'
): Promise<{ eventId: string; calendarId: string; htmlLink?: string }> {
  const token = await getGoogleAccessToken();
  if (!token) {
    throw new Error('Not authenticated with Google Calendar (401). Please connect or reconnect.');
  }

  const startStr = task.start || '09:00';
  const startDateObj = new Date(`${task.date}T${startStr}:00`);

  let endDateObj: Date;
  if (task.end) {
    endDateObj = new Date(`${task.date}T${task.end}:00`);
  } else {
    endDateObj = new Date(startDateObj.getTime() + (task.estimatedMinutes || 45) * 60000);
  }
  if (endDateObj <= startDateObj) {
    endDateObj = new Date(
      startDateObj.getTime() + Math.max(15, task.estimatedMinutes || 45) * 60000
    );
  }

  const reminderOverrides = (task.reminders || [10]).map((mins) => ({
    method: 'popup',
    minutes: Math.max(0, Number(mins) || 10),
  }));

  const body: Record<string, any> = {
    summary: task.title,
    description: `${task.description || ''}\n\nCategory: ${task.category} · Priority: ${
      task.priority
    }`.trim(),
    start: {
      dateTime: startDateObj.toISOString(),
      timeZone: timezone,
    },
    end: {
      dateTime: endDateObj.toISOString(),
      timeZone: timezone,
    },
    extendedProperties: {
      private: {
        dayforgeTaskId: task.masterTaskId || task.id,
      },
    },
    reminders: {
      useDefault: reminderOverrides.length === 0,
      overrides: reminderOverrides.slice(0, 5),
    },
  };

  const targetCalId = task.googleCalendarId || calendarId || 'primary';
  const isUpdate = Boolean(task.googleEventId);
  const endpoint = isUpdate
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        targetCalId
      )}/events/${encodeURIComponent(task.googleEventId!)}`
    : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalId)}/events`;

  const res = await fetchWithRetry(endpoint, {
    method: isUpdate ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    const formatted = formatGoogleCalendarError(res.status, errText);
    const err = new Error(formatted.userMessage) as Error & { code?: string };
    err.code = formatted.code;
    throw err;
  }

  const data = await res.json();
  return {
    eventId: String(data.id),
    calendarId: targetCalId,
    htmlLink: data.htmlLink ? String(data.htmlLink) : undefined,
  };
}

/**
 * Deletes a DayForge-created event from Google Calendar when the user explicitly opts to delete it.
 */
export async function deleteTaskFromGoogleCalendar(
  googleEventId: string,
  calendarId = 'primary'
): Promise<void> {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error('Not authenticated with Google Calendar (401).');

  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events/${encodeURIComponent(googleEventId)}`;

  const res = await fetchWithRetry(endpoint, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const errText = await res.text();
    const formatted = formatGoogleCalendarError(res.status, errText);
    throw new Error(formatted.userMessage);
  }
}

/**
 * Zero-setup fallback: generates a direct Google Calendar template link for a task,
 * including `ctz` (timezone) and `recur=RRULE:...` for recurring tasks.
 */
export function buildGoogleCalendarTemplateUrl(
  task: Task,
  timezone = 'Asia/Kolkata'
): string {
  const startStr = task.start || '09:00';
  const cleanDate = task.date.replace(/-/g, '');
  const [sh, sm] = startStr.split(':').map(Number);
  const startLocal = `${cleanDate}T${String(sh || 9).padStart(2, '0')}${String(sm || 0).padStart(
    2,
    '0'
  )}00`;

  let endLocal: string;
  if (task.end) {
    const [eh, em] = task.end.split(':').map(Number);
    endLocal = `${cleanDate}T${String(eh || 10).padStart(2, '0')}${String(em || 0).padStart(
      2,
      '0'
    )}00`;
  } else {
    const totalEndMin = (sh || 9) * 60 + (sm || 0) + (task.estimatedMinutes || 45);
    const eh = Math.min(23, Math.floor(totalEndMin / 60));
    const em = totalEndMin % 60;
    endLocal = `${cleanDate}T${String(eh).padStart(2, '0')}${String(em).padStart(2, '0')}00`;
  }

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', task.title);
  url.searchParams.set('dates', `${startLocal}/${endLocal}`);
  url.searchParams.set('ctz', timezone);
  url.searchParams.set(
    'details',
    `${task.description || ''}\nCategory: ${task.category} | Priority: ${task.priority}`.trim()
  );

  const rrule = buildRRULEString(task);
  if (rrule) {
    url.searchParams.set('recur', `RRULE:${rrule}`);
  }

  return url.toString();
}

/**
 * Exports tasks to RFC 5545 compliant .ics format.
 */
export function exportTasksToICS(tasks: Task[], timezone = 'Asia/Kolkata'): string {
  return generateRFC5545ICS(tasks, timezone);
}
