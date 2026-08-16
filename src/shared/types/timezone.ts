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
