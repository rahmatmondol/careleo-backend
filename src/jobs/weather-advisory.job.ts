/**
 * Weather Advisory Job — runs hourly, at most one message per user per day.
 *
 * Heatstroke, burnt paws on afternoon pavement, a small dog out too long in the
 * cold, a storm-anxious cat: all predictable a few hours ahead, and all things
 * the owner would act on if someone mentioned them. Nothing is sent on an
 * ordinary day — only genuinely notable weather produces an advisory, which is
 * what stops this becoming yet another daily buzz.
 *
 * Location comes from coordinates when the user has shared them, and otherwise
 * from the city already on their profile — resolved once and stored, so most
 * users get this without ever seeing a location prompt. Users with neither are
 * simply skipped.
 */

import { eq, isNotNull, isNull, or, and } from 'drizzle-orm';
import { db } from '@/shared/db';
import { pets, users } from '@/shared/db/schema';
import { AiService } from '@/modules/ai/service';
import { FALLBACK_TZ } from '@/modules/notifications/preferences';
import { hourInZone } from '@/shared/types/timezone';
import { advisoryFor, fetchDailyWeather, geocodeCity } from '@/shared/integrations/weather';
import { sendProactive, sentWithin } from './shared/proactive';

/** Early enough to change the day's plans. */
const ADVISE_HOUR = 7;
const MAX_PER_RUN = 100;

export type WeatherAdvisoryOptions = { onlyUserId?: string; ignoreSchedule?: boolean };

export async function runWeatherAdvisoryJob(opts: WeatherAdvisoryOptions = {}) {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);

  let candidates = await db
    .selectDistinct({
      userId: users.id,
      latitude: users.latitude,
      longitude: users.longitude,
      city: users.city,
      country: users.country,
      timezone: users.timezone,
    })
    .from(users)
    .innerJoin(pets, eq(pets.userId, users.id))
    .where(
      or(
        and(isNotNull(users.latitude), isNotNull(users.longitude)),
        and(isNull(users.latitude), isNotNull(users.city)),
      ),
    );

  if (opts.onlyUserId) candidates = candidates.filter((c) => c.userId === opts.onlyUserId);
  if (!candidates.length) return { advised: 0, candidates: 0 };

  // One forecast per location, not per user — neighbours share a sky.
  const forecastCache = new Map<string, Awaited<ReturnType<typeof fetchDailyWeather>>>();

  let advised = 0;
  for (const candidate of candidates) {
    if (advised >= MAX_PER_RUN) break;

    const timeZone = candidate.timezone || FALLBACK_TZ;
    if (!opts.ignoreSchedule && hourInZone(timeZone, now) !== ADVISE_HOUR) continue;
    if (await sentWithin(candidate.userId, 'weather_advisory', dayAgo)) continue;

    const coords = await resolveCoordinates(candidate);
    if (!coords) continue;
    const { latitude: lat, longitude: lon } = coords;

    // ~11 km of resolution is plenty for "is it hot today".
    const cacheKey = `${lat.toFixed(1)},${lon.toFixed(1)},${timeZone}`;

    if (!forecastCache.has(cacheKey)) {
      forecastCache.set(cacheKey, await fetchDailyWeather(lat, lon, timeZone));
    }
    const weather = forecastCache.get(cacheKey);
    if (!weather) continue;

    const advisory = advisoryFor(weather);
    if (!advisory) continue;

    const [pet] = await db
      .select({ id: pets.id, name: pets.name })
      .from(pets)
      .where(eq(pets.userId, candidate.userId))
      .orderBy(pets.createdAt)
      .limit(1);
    if (!pet) continue;

    const fallback = `আজ ${advisory.summary}. ${pet.name}-এর দিকে একটু খেয়াল রেখো।`;

    const message = await AiService.generateProactiveMessage({
      userId: candidate.userId,
      petId: pet.id,
      feature: 'weather_advisory',
      fallback,
      task: `Today's weather where the owner lives: ${advisory.summary}. Write ONE practical message about what that means for this specific pet today — use their breed, age, coat and any known conditions to make the advice concrete rather than generic.`,
    });

    await sendProactive({
      userId: candidate.userId,
      petId: pet.id,
      messageType: 'weather_advisory',
      message,
      pushTitle: advisory.kind === 'severe_heat' ? `Dangerous heat for ${pet.name}` : `Weather care for ${pet.name}`,
      type: 'HEALTH_ALERT',
      priority: advisory.priority,
      data: { event: 'weather_advisory', petId: pet.id, advisory: advisory.kind },
    });

    advised++;
  }

  return { advised, candidates: candidates.length };
}

/**
 * Coordinates for a user, geocoding their city the first time and writing the
 * answer back so the lookup happens once per user, not once per morning.
 */
async function resolveCoordinates(candidate: {
  userId: string;
  latitude: unknown;
  longitude: unknown;
  city: string | null;
  country: string | null;
}): Promise<{ latitude: number; longitude: number } | null> {
  const lat = Number(candidate.latitude);
  const lon = Number(candidate.longitude);
  if (candidate.latitude !== null && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { latitude: lat, longitude: lon };
  }

  if (!candidate.city) return null;

  const geocoded = await geocodeCity(candidate.city, candidate.country);
  if (!geocoded) return null;

  try {
    await db
      .update(users)
      .set({
        latitude: String(geocoded.latitude.toFixed(6)),
        longitude: String(geocoded.longitude.toFixed(6)),
      })
      .where(eq(users.id, candidate.userId));
  } catch {
    // Caching the result is an optimisation, not a requirement.
  }

  return geocoded;
}
