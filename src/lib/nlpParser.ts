import { addDays, format, nextDay, parseISO, isValid } from 'date-fns';
import { ParsedQuickAdd, Priority } from '../types';

const KNOWN_CATEGORIES: Record<string, string> = {
  study: 'Study',
  dsa: 'Study',
  exam: 'Study',
  coding: 'Coding',
  code: 'Coding',
  dev: 'Coding',
  work: 'Work',
  meeting: 'Work',
  health: 'Health',
  gym: 'Health',
  workout: 'Health',
  run: 'Health',
  personal: 'Personal',
  errand: 'Personal',
};

const WEEKDAY_MAP: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function normalizeTimeToken(rawHour: string, rawMin: string | undefined, meridiem: string | undefined): string | null {
  let hour = parseInt(rawHour, 10);
  const minute = rawMin ? parseInt(rawMin, 10) : 0;
  if (isNaN(hour) || isNaN(minute) || minute < 0 || minute > 59) return null;

  if (meridiem) {
    const m = meridiem.toLowerCase();
    if (m === 'pm' && hour < 12) hour += 12;
    if (m === 'am' && hour === 12) hour = 0;
  }
  if (hour < 0 || hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startTotal = sh * 60 + sm;
  const endTotal = eh * 60 + em;
  return endTotal > startTotal ? endTotal - startTotal : 0;
}

function addMinutesToTime(start: string, minutes: number): string {
  const [sh, sm] = start.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, sh * 60 + sm + minutes);
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

/**
 * Parses natural language quick-add input into structured task fields locally.
 * Example: "Study DSA tomorrow 6pm-8pm #study !high 2h"
 */
export function parseQuickAddInput(
  rawInput: string,
  referenceDateStr: string,
  defaultDurationMinutes = 45,
  customCategories: string[] = []
): ParsedQuickAdd {
  let working = rawInput.trim();
  const baseDate = isValid(parseISO(referenceDateStr)) ? parseISO(referenceDateStr) : new Date();

  let date = format(baseDate, 'yyyy-MM-dd');
  let start: string | undefined;
  let end: string | undefined;
  let explicitMinutes: number | undefined;
  let category = 'Work';
  let categoryMatched = false;
  const tags: string[] = [];
  let priority: Priority = 'Med';
  let important = false;
  let urgent = false;

  // 1. Extract #tags and match category
  working = working.replace(/(?:^|\s)#([a-zA-Z0-9_-]+)/g, (_, tagRaw: string) => {
    const lower = tagRaw.toLowerCase();
    const customMatch = customCategories.find((c) => c.toLowerCase() === lower);
    if (customMatch && !categoryMatched) {
      category = customMatch;
      categoryMatched = true;
    } else if (KNOWN_CATEGORIES[lower] && !categoryMatched) {
      category = KNOWN_CATEGORIES[lower];
      categoryMatched = true;
    }
    if (!tags.includes(lower)) {
      tags.push(lower);
    }
    return ' ';
  });

  // 2. Extract priority & Eisenhower flags (!high, !med, !low, !important, !urgent, !!, !!!)
  working = working.replace(/(?:^|\s)!(high|med|medium|low|important|urgent|imp|urg|!!|!)(?=\s|$)/gi, (_, token: string) => {
    const t = token.toLowerCase();
    if (t === 'high' || t === '!!') {
      priority = 'High';
      important = true;
    } else if (t === 'med' || t === 'medium' || t === '!') {
      priority = 'Med';
    } else if (t === 'low') {
      priority = 'Low';
    } else if (t === 'important' || t === 'imp') {
      important = true;
    } else if (t === 'urgent' || t === 'urg') {
      urgent = true;
    }
    return ' ';
  });

  // 3. Extract time range e.g. "6pm-8pm", "6:30pm - 8:00pm", "14:00-16:00", "9am-11am"
  const rangeRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
  const rangeMatch = working.match(rangeRegex);
  if (rangeMatch) {
    const [, h1, m1, mer1, h2, m2, mer2] = rangeMatch;
    // If first time has no meridiem, inherit from second if reasonable
    const effectiveMer1 = mer1 || (mer2 && parseInt(h1, 10) <= 12 && parseInt(h1, 10) < parseInt(h2, 10) ? mer2 : undefined);
    const parsedStart = normalizeTimeToken(h1, m1, effectiveMer1);
    const parsedEnd = normalizeTimeToken(h2, m2, mer2);
    if (parsedStart && parsedEnd) {
      start = parsedStart;
      end = parsedEnd;
      working = working.replace(rangeMatch[0], ' ');
    }
  } else {
    // Single start time e.g. "at 6pm", "6:30pm", "at 14:00"
    const singleTimeRegex = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\bat\s+(\d{1,2}):(\d{2})\b/i;
    const singleMatch = working.match(singleTimeRegex);
    if (singleMatch) {
      if (singleMatch[1]) {
        const parsedStart = normalizeTimeToken(singleMatch[1], singleMatch[2], singleMatch[3]);
        if (parsedStart) start = parsedStart;
      } else if (singleMatch[4]) {
        const parsedStart = normalizeTimeToken(singleMatch[4], singleMatch[5], undefined);
        if (parsedStart) start = parsedStart;
      }
      working = working.replace(singleMatch[0], ' ');
    }
  }

  // 4. Extract explicit duration e.g. "2h 30m", "1.5h", "2h", "45m", "90min", "2 hrs"
  const comboDurRegex = /\b(\d+)\s*(?:h|hr|hrs|hour|hours)\s*(\d+)\s*(?:m|min|mins|minute|minutes)\b/i;
  const comboMatch = working.match(comboDurRegex);
  if (comboMatch) {
    explicitMinutes = parseInt(comboMatch[1], 10) * 60 + parseInt(comboMatch[2], 10);
    working = working.replace(comboMatch[0], ' ');
  } else {
    const hoursRegex = /\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i;
    const minsRegex = /\b(\d+)\s*(?:m|min|mins|minute|minutes)\b/i;
    const hMatch = working.match(hoursRegex);
    if (hMatch) {
      explicitMinutes = Math.round(parseFloat(hMatch[1]) * 60);
      working = working.replace(hMatch[0], ' ');
    }
    const mMatch = working.match(minsRegex);
    if (mMatch) {
      explicitMinutes = (explicitMinutes || 0) + parseInt(mMatch[1], 10);
      working = working.replace(mMatch[0], ' ');
    }
  }

  // 5. Extract relative dates: "today", "tomorrow", "tmrw", explicit YYYY-MM-DD, or weekday names
  const isoDateRegex = /\b(\d{4}-\d{2}-\d{2})\b/;
  const isoMatch = working.match(isoDateRegex);
  if (isoMatch && isValid(parseISO(isoMatch[1]))) {
    date = isoMatch[1];
    working = working.replace(isoMatch[0], ' ');
  } else if (/\b(?:tomorrow|tmrw|tmw)\b/i.test(working)) {
    date = format(addDays(baseDate, 1), 'yyyy-MM-dd');
    working = working.replace(/\b(?:tomorrow|tmrw|tmw)\b/i, ' ');
  } else if (/\btoday\b/i.test(working)) {
    date = format(baseDate, 'yyyy-MM-dd');
    working = working.replace(/\btoday\b/i, ' ');
  } else {
    const weekdayRegex = /\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;
    const wdMatch = working.match(weekdayRegex);
    if (wdMatch) {
      const targetDay = WEEKDAY_MAP[wdMatch[1].toLowerCase()];
      if (targetDay !== undefined) {
        date = format(nextDay(baseDate, targetDay), 'yyyy-MM-dd');
        working = working.replace(wdMatch[0], ' ');
      }
    }
  }

  // Reconcile start, end, and estimatedMinutes
  let estimatedMinutes = explicitMinutes ?? defaultDurationMinutes;
  if (start && end) {
    const rangeDiff = diffMinutes(start, end);
    if (rangeDiff > 0 && !explicitMinutes) {
      estimatedMinutes = rangeDiff;
    }
  } else if (start && !end) {
    end = addMinutesToTime(start, estimatedMinutes);
  }

  // Infer category from title keywords if no #tag set it
  const cleanTitle = working.replace(/\s+/g, ' ').trim();
  if (!categoryMatched && cleanTitle) {
    const lowerWords = cleanTitle.toLowerCase().split(/\W+/);
    for (const w of lowerWords) {
      if (KNOWN_CATEGORIES[w]) {
        category = KNOWN_CATEGORIES[w];
        break;
      }
    }
  }

  return {
    cleanTitle: cleanTitle || rawInput.trim(),
    date,
    start,
    end,
    estimatedMinutes: Math.max(5, estimatedMinutes),
    category,
    tags,
    priority,
    important,
    urgent,
  };
}
