/**
 * IANA timezone validation.
 *
 * Users carry a `timezone` so scheduled work (the daily AI check-in, and
 * anything else that should land at a person's morning rather than the
 * server's) fires on their clock. The stored value reaches SQL through
 * `AT TIME ZONE`, so it must never be free text — accept only a zone the
 * runtime itself recognises.
 */
export const isIanaZone = (value: unknown): boolean => {
  const zone = String(value ?? '').trim();
  if (!zone || zone.length > 64 || !/^[A-Za-z0-9+_\-/]+$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** Current hour-of-day (0–23) in `timeZone`, falling back to the host clock. */
export const hourInZone = (timeZone: string, at: Date = new Date()): number => {
  try {
    return Number(
      new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(at),
    );
  } catch {
    return at.getHours();
  }
};

/**
 * Calendar date in `timeZone` as `YYYY-MM-DD`.
 *
 * For "is this the same day for this user" — comparing UTC instants gets that
 * wrong on either side of local midnight. The format sorts lexicographically,
 * so two keys can be compared directly.
 */
export const dayKeyInZone = (timeZone: string, at: Date = new Date()): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
};

/** Minutes since local midnight (0–1439) in `timeZone`. */
export const minutesInZone = (timeZone: string, at: Date = new Date()): number => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? NaN);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? NaN);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return at.getHours() * 60 + at.getMinutes();
    // `hour12: false` still renders midnight as 24 in some ICU builds.
    return (hour % 24) * 60 + minute;
  } catch {
    return at.getHours() * 60 + at.getMinutes();
  }
};

/** `HH:mm` → minutes since midnight, or null when unparseable. */
export const parseHhMm = (value: unknown): number | null => {
  const m = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
};

/**
 * The wall clock in `timeZone`, expressed as if it were UTC.
 *
 * The building block for going the *other* way — from what a clock reads to the
 * instant it reads it — which is what every "07:00 feeding" in this codebase
 * actually needs.
 */
const wallClockMs = (timeZone: string, at: Date): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
};

/** How far ahead of UTC `timeZone` is at `at`, in milliseconds. */
export const zoneOffsetMs = (timeZone: string, at: Date = new Date()): number => {
  try {
    return wallClockMs(timeZone, at) - at.getTime();
  } catch {
    return -at.getTimezoneOffset() * 60_000;
  }
};

/**
 * The instant at which the clock in `timeZone` reads the given wall time.
 *
 * `new Date(y, m, d, h, min)` builds the instant in the *server process's*
 * zone, which is an accident of deployment and matches nobody — a 07:00
 * feeding written that way on a UTC host lands at 13:00 for a user in Dhaka.
 * `month` is 1-based; day/hour/minute may overflow (day 32, hour 25) the same
 * way `Date.UTC` allows, which is how "same time tomorrow" is expressed.
 */
export const zonedTimeToUtc = (
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date => {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  try {
    // Two passes: the first offset is read at the wrong instant when the guess
    // and the answer sit on opposite sides of a DST change.
    const first = wanted - zoneOffsetMs(timeZone, new Date(wanted));
    return new Date(wanted - zoneOffsetMs(timeZone, new Date(first)));
  } catch {
    return new Date(year, month - 1, day, hour, minute, 0, 0);
  }
};

/** `YYYY-MM-DD` → `[year, month (1-based), day]`. */
export const splitDayKey = (dayKey: string): [number, number, number] => {
  const [y, m, d] = dayKey.split('-').map((n) => Number(n));
  return [y, m, d];
};

/**
 * A time of day as a human might write it → minutes since midnight.
 *
 * Looser than `parseHhMm` on purpose: these values come from an AI plan and
 * from AI tool calls, which produce "7:00 AM" as readily as "07:00", and the
 * strict parser turned anything it didn't recognise into a silent 08:00.
 */
export const parseClockTime = (value: unknown): number | null => {
  const raw = String(value ?? '').trim();
  const m12 = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?$/);
  if (m12) {
    const h = Number(m12[1]);
    const min = m12[2] ? Number(m12[2]) : 0;
    if (h < 1 || h > 12 || min > 59) return null;
    const pm = m12[3].toLowerCase() === 'p';
    return ((h % 12) + (pm ? 12 : 0)) * 60 + min;
  }
  const m24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const min = Number(m24[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  return null;
};

/**
 * The next time the clock in `timeZone` reads `HH:mm` — today if that is still
 * ahead, otherwise tomorrow.
 *
 * Accepting a care plan at 9pm shouldn't fire three "overdue" pushes
 * immediately, so a slot that has already passed rolls forward a day.
 */
export const nextZonedSlot = (
  timeZone: string,
  time: unknown,
  now: Date = new Date(),
): Date => {
  const minutes = parseClockTime(time) ?? 8 * 60;
  const [y, m, d] = splitDayKey(dayKeyInZone(timeZone, now));
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const today = zonedTimeToUtc(timeZone, y, m, d, hour, minute);
  return today.getTime() > now.getTime() ? today : zonedTimeToUtc(timeZone, y, m, d + 1, hour, minute);
};

/** `YYYY-MM-DD` for `days` after today, on the user's calendar. */
export const dayKeyPlusDays = (timeZone: string, days: number, now: Date = new Date()): string => {
  const [y, m, d] = splitDayKey(dayKeyInZone(timeZone, now));
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
};

/**
 * What the user's clock says right now — for prompts, where an AI with no
 * notion of the time of day cannot answer "when is his next meal?".
 */
export const describeNowInZone = (timeZone: string, now: Date = new Date()): string => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(now);
  } catch {
    return now.toISOString();
  }
};
