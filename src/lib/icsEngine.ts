import { GoogleCalendarEvent, Priority, RecurrenceRule, Task } from '../types';
import { buildRRULEString } from './recurrenceEngine';

export interface ParsedICSEventPreview {
  uid: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  start?: string; // HH:mm
  end?: string; // HH:mm
  estimatedMinutes: number;
  category: string;
  isAllDay: boolean;
  rrule?: string;
  reminders: number[];
  selected: boolean;
}

function formatLocalDateTimeForICS(dateStr: string, timeStr: string): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const [hh, mm] = (timeStr || '09:00').split(':');
  return `${cleanDate}T${String(hh || '09').padStart(2, '0')}${String(mm || '00').padStart(2, '0')}00`;
}

function formatUTCStamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function addMinutesToTimeStr(timeStr: string, minutesToAdd: number): string {
  const [h, m] = (timeStr || '09:00').split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + (m || 0) + minutesToAdd));
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/**
 * Generates an RFC 5545 compliant .ics file with CRLF line endings, TZID, RRULE, and VALARM blocks.
 */
export function generateRFC5545ICS(tasks: Task[], timezone = 'Asia/Kolkata'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DayForge//Own Your Time//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-TIMEZONE:${timezone}`,
  ];

  const dtstamp = formatUTCStamp(new Date());

  for (const t of tasks) {
    const startStr = t.start || '09:00';
    const endStr = t.end || addMinutesToTimeStr(startStr, t.estimatedMinutes || 45);
    const dtStart = formatLocalDateTimeForICS(t.date, startStr);
    const dtEnd = formatLocalDateTimeForICS(t.date, endStr);
    const rrule = buildRRULEString(t);

    lines.push(
      'BEGIN:VEVENT',
      `UID:dayforge-${t.id.replace(/[^a-zA-Z0-9-_]/g, '-')}@dayforge.app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${timezone}:${dtStart}`,
      `DTEND;TZID=${timezone}:${dtEnd}`,
      `SUMMARY:${(t.title || 'Task').replace(/\r?\n/g, ' ')}`,
      `DESCRIPTION:${(t.description || '').replace(/\r?\n/g, '\\n')}`,
      `CATEGORIES:${t.category || 'Work'}`
    );

    if (rrule) {
      lines.push(`RRULE:${rrule}`);
    }

    const reminders = Array.isArray(t.reminders) ? t.reminders : [];
    for (const remMin of reminders) {
      const mins = Math.max(0, Number(remMin) || 0);
      lines.push(
        'BEGIN:VALARM',
        `TRIGGER:-PT${mins}M`,
        'ACTION:DISPLAY',
        `DESCRIPTION:Reminder: ${(t.title || 'Task').replace(/\r?\n/g, ' ')}`,
        'END:VALARM'
      );
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Parses an RFC 5545 .ics string into a list of previewable events for import.
 */
export function parseICSContent(
  rawIcs: string,
  fallbackDateStr: string
): ParsedICSEventPreview[] {
  // Unfold RFC 5545 folded lines
  const unfolded = rawIcs.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const previews: ParsedICSEventPreview[] = [];
  let inEvent = false;
  let inAlarm = false;
  let current: Record<string, string> = {};
  let currentAlarms: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      inAlarm = false;
      current = {};
      currentAlarms = [];
      continue;
    }

    if (line === 'BEGIN:VALARM') {
      inAlarm = true;
      continue;
    }

    if (line === 'END:VALARM') {
      inAlarm = false;
      continue;
    }

    if (line === 'END:VEVENT') {
      if (inEvent) {
        const parsed = buildPreviewFromMap(current, currentAlarms, fallbackDateStr, previews.length);
        if (parsed) previews.push(parsed);
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx).toUpperCase();
    const val = line.slice(colonIdx + 1);
    const baseKey = rawKey.split(';')[0];

    if (inAlarm) {
      if (baseKey === 'TRIGGER') {
        const mMatch = val.match(/-?PT(\d+)M/i);
        const hMatch = val.match(/-?PT(\d+)H/i);
        if (mMatch) currentAlarms.push(parseInt(mMatch[1], 10));
        else if (hMatch) currentAlarms.push(parseInt(hMatch[1], 10) * 60);
      }
      continue;
    }

    current[baseKey] = val;
    current[`${baseKey}_RAWKEY`] = rawKey;
  }

  return previews;
}

function buildPreviewFromMap(
  map: Record<string, string>,
  alarms: number[],
  fallbackDateStr: string,
  idx: number
): ParsedICSEventPreview | null {
  const title = (map.SUMMARY || 'Imported Calendar Event').replace(/\\n/g, ' ').replace(/\\,/g, ',');
  const description = (map.DESCRIPTION || '').replace(/\\n/g, '\n').replace(/\\,/g, ',');
  const uid = map.UID || `ics-import-${Date.now()}-${idx}`;
  const category = (map.CATEGORIES || 'Work').split(',')[0].trim() || 'Work';

  const dtStartRaw = map.DTSTART || '';
  const dtEndRaw = map.DTEND || '';

  let date = fallbackDateStr;
  let start: string | undefined = '09:00';
  let end: string | undefined = '09:45';
  let isAllDay = false;

  if (dtStartRaw) {
    const clean = dtStartRaw.replace(/Z$/, '');
    if (/^\d{8}$/.test(clean)) {
      date = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
      isAllDay = true;
      start = undefined;
      end = undefined;
    } else if (/^\d{8}T\d{4,6}/.test(clean)) {
      date = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
      const tPart = clean.split('T')[1];
      start = `${tPart.slice(0, 2)}:${tPart.slice(2, 4)}`;
    }
  }

  if (dtEndRaw && !isAllDay) {
    const cleanEnd = dtEndRaw.replace(/Z$/, '');
    if (/^\d{8}T\d{4,6}/.test(cleanEnd)) {
      const tPart = cleanEnd.split('T')[1];
      end = `${tPart.slice(0, 2)}:${tPart.slice(2, 4)}`;
    }
  }

  let estimatedMinutes = 45;
  if (start && end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const diff = eh * 60 + em - (sh * 60 + sm);
    if (diff > 0) estimatedMinutes = diff;
  }

  return {
    uid,
    title,
    description,
    date,
    start,
    end,
    estimatedMinutes,
    category,
    isAllDay,
    rrule: map.RRULE,
    reminders: alarms.length > 0 ? alarms : [10],
    selected: true,
  };
}

/**
 * Converts a parsed .ics RRULE string into a DayForge RecurrenceRule.
 */
export function parseICSRRuleToDayForge(rruleStr?: string): RecurrenceRule | undefined {
  if (!rruleStr) return undefined;
  const parts = Object.fromEntries(
    rruleStr.split(';').map((kv) => {
      const [k, v] = kv.split('=');
      return [k?.toUpperCase(), v?.toUpperCase()];
    })
  );

  const dayLookup: Record<string, number> = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
  };

  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) || 1 : 1;
  let endType: 'never' | 'on_date' | 'after_count' = 'never';
  let endCount: number | undefined;
  let endDate: string | undefined;

  if (parts.COUNT) {
    endType = 'after_count';
    endCount = parseInt(parts.COUNT, 10) || 5;
  } else if (parts.UNTIL && parts.UNTIL.length >= 8) {
    endType = 'on_date';
    endDate = `${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}`;
  }

  if (parts.FREQ === 'DAILY') {
    return {
      frequency: interval > 1 ? 'every_n_days' : 'daily',
      interval,
      endType,
      endCount,
      endDate,
    };
  }

  if (parts.FREQ === 'WEEKLY') {
    if (parts.BYDAY === 'MO,TU,WE,TH,FR') {
      return { frequency: 'weekdays', interval: 1, endType, endCount, endDate };
    }
    const daysOfWeek = parts.BYDAY
      ? parts.BYDAY.split(',')
          .map((d: string) => dayLookup[d])
          .filter((n: number | undefined): n is number => typeof n === 'number')
      : undefined;
    return {
      frequency: interval > 1 ? 'every_n_weeks' : 'weekly',
      interval,
      daysOfWeek,
      endType,
      endCount,
      endDate,
    };
  }

  return undefined;
}

export function convertPreviewToTaskInput(
  item: ParsedICSEventPreview
): Omit<Task, 'id' | 'createdAt' | 'order'> {
  const recurrenceRule = parseICSRRuleToDayForge(item.rrule);
  return {
    title: item.title,
    description: item.description,
    category: item.category || 'Work',
    tags: ['ics-import'],
    priority: 'Med' as Priority,
    important: false,
    urgent: false,
    date: item.date,
    start: item.start,
    end: item.end,
    estimatedMinutes: item.estimatedMinutes || 45,
    status: 'To Do',
    subtasks: [],
    recurrence: recurrenceRule ? recurrenceRule.frequency : 'none',
    recurrenceRule,
    reminders: item.reminders,
  };
}

export function convertPreviewToExternalEvent(
  item: ParsedICSEventPreview
): GoogleCalendarEvent {
  return {
    id: `ics-ext-${item.uid}-${item.date}`,
    summary: item.title,
    description: item.description,
    start: item.start ? `${item.date}T${item.start}:00` : item.date,
    end: item.end ? `${item.date}T${item.end}:00` : item.date,
    startTime: item.start,
    endTime: item.end,
    date: item.date,
    calendarId: 'ics-imported',
    isAllDay: item.isAllDay,
    source: 'ics',
  };
}
