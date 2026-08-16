/**
 * Today's weather for a coordinate, used only for pet-care advice.
 *
 * Backed by Open-Meteo, which needs no API key and no account — so this works
 * on a fresh checkout instead of being a feature nobody can turn on. Set
 * `WEATHER_API_URL` to point at a different compatible endpoint.
 *
 * Everything here is best-effort: no coordinates, a timeout, or a bad response
 * all mean "no advisory today", never an error the caller has to handle.
 */

const BASE_URL = process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = process.env.GEOCODE_API_URL || 'https://geocoding-api.open-meteo.com/v1/search';
const TIMEOUT_MS = 8000;

const getJson = async (url: URL): Promise<any | null> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

/**
 * City name → coordinates.
 *
 * Most users will never grant location permission, but many have already told
 * us their city on the profile screen. Resolving that once (and storing the
 * result) is what makes weather advice available to them at all.
 */
export const geocodeCity = async (
  city: string,
  country?: string | null,
): Promise<{ latitude: number; longitude: number } | null> => {
  const name = String(city ?? '').trim();
  if (name.length < 2) return null;

  const url = new URL(GEOCODE_URL);
  url.searchParams.set('name', name);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const body = await getJson(url);
  const results: any[] = Array.isArray(body?.results) ? body.results : [];
  if (!results.length) return null;

  // Prefer a hit in the country the user gave; a bare city name is ambiguous
  // in a way that would otherwise send Dhaka's weather to someone in Ontario.
  const wanted = String(country ?? '').trim().toLowerCase();
  const match =
    (wanted &&
      results.find(
        (r) =>
          String(r?.country ?? '').toLowerCase() === wanted ||
          String(r?.country_code ?? '').toLowerCase() === wanted,
      )) ||
    results[0];

  const latitude = Number(match?.latitude);
  const longitude = Number(match?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
};

export type DailyWeather = {
  maxTempC: number;
  minTempC: number;
  precipitationMm: number;
  maxWindKph: number;
};

export const fetchDailyWeather = async (
  latitude: number,
  longitude: number,
  timeZone: string,
): Promise<DailyWeather | null> => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const url = new URL(BASE_URL);
  url.searchParams.set('latitude', latitude.toFixed(4));
  url.searchParams.set('longitude', longitude.toFixed(4));
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
  );
  url.searchParams.set('timezone', timeZone || 'auto');
  url.searchParams.set('forecast_days', '1');

  const body = await getJson(url);
  const daily = body?.daily;
  if (!daily) return null;

  const first = (value: unknown) => Number((value as unknown[])?.[0] ?? NaN);

  const maxTempC = first(daily.temperature_2m_max);
  const minTempC = first(daily.temperature_2m_min);
  if (!Number.isFinite(maxTempC) || !Number.isFinite(minTempC)) return null;

  return {
    maxTempC,
    minTempC,
    precipitationMm: Number.isFinite(first(daily.precipitation_sum)) ? first(daily.precipitation_sum) : 0,
    maxWindKph: Number.isFinite(first(daily.wind_speed_10m_max)) ? first(daily.wind_speed_10m_max) : 0,
  };
};

export type WeatherAdvisory = {
  kind: 'severe_heat' | 'heat' | 'cold' | 'storm';
  priority: 'critical' | 'normal';
  /** Plain-language reason, used in the push and given to the model. */
  summary: string;
};

/**
 * Turn a forecast into at most one piece of advice.
 *
 * Ordered by how much it matters: heatstroke kills pets far faster than rain
 * inconveniences them, so a hot, wet day produces the heat advisory only. Only
 * genuinely notable weather returns anything — an ordinary day is silent, which
 * is what keeps this from becoming another daily notification.
 */
export const advisoryFor = (weather: DailyWeather): WeatherAdvisory | null => {
  if (weather.maxTempC >= 38) {
    return {
      kind: 'severe_heat',
      priority: 'critical',
      summary: `dangerous heat today (up to ${Math.round(weather.maxTempC)}°C) — pavement can burn paws, and short-nosed breeds are at real risk of heatstroke`,
    };
  }
  if (weather.maxTempC >= 32) {
    return {
      kind: 'heat',
      priority: 'normal',
      summary: `hot today (up to ${Math.round(weather.maxTempC)}°C) — walks are better early morning or after sunset, and water needs topping up more often`,
    };
  }
  if (weather.minTempC <= 4) {
    return {
      kind: 'cold',
      priority: 'normal',
      summary: `cold today (down to ${Math.round(weather.minTempC)}°C) — small, thin-coated, old and very young pets feel it first, so keep walks shorter`,
    };
  }
  if (weather.precipitationMm >= 20 || weather.maxWindKph >= 55) {
    return {
      kind: 'storm',
      priority: 'normal',
      summary: 'heavy rain and wind today — a good day for indoor play, and worth checking on pets who find storms frightening',
    };
  }
  return null;
};
