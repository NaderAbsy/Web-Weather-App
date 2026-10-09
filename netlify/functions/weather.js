/* Server-side proxy for the OpenWeather API.
 *
 * The key used to sit in public/app.js, which meant anyone viewing source could
 * take it. Here it stays in the OPENWEATHER_API_KEY environment variable and
 * never reaches the browser.
 *
 * `endpoint` is matched against a fixed list rather than passed through, so this
 * cannot be used as a general-purpose proxy for arbitrary URLs.
 */

const ALLOWED = {
  weather:  '/data/2.5/weather',
  forecast: '/data/2.5/forecast',
  air:      '/data/2.5/air_pollution',
  geo:      '/geo/1.0/direct'
};

// Only these reach OpenWeather, and only if they look like what the app sends;
// anything else a caller appends is dropped.
const PASS_THROUGH = {
  lat:   (v) => isFinite(v) && Math.abs(v) <= 90,
  lon:   (v) => isFinite(v) && Math.abs(v) <= 180,
  units: (v) => v === 'metric' || v === 'imperial' || v === 'standard',
  q:     (v) => v.length > 0 && v.length <= 100,
  limit: (v) => /^([1-9]|10)$/.test(v)
};

export default async (request) => {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    return Response.json({ error: 'Weather service is not configured.' }, { status: 500 });
  }

  const incoming = new URL(request.url);
  const path = ALLOWED[incoming.searchParams.get('endpoint')];
  if (!path) {
    return Response.json({ error: 'Unknown endpoint.' }, { status: 400 });
  }

  const target = new URL('https://api.openweathermap.org' + path);
  for (const [name, valid] of Object.entries(PASS_THROUGH)) {
    const value = incoming.searchParams.get(name);
    if (value === null) continue;
    if (value.trim() === '' || !valid(value)) {
      return Response.json({ error: 'Invalid ' + name + '.' }, { status: 400 });
    }
    target.searchParams.set(name, value);
  }
  target.searchParams.set('appid', key);

  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(9000) });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'content-type': 'application/json',
        // Forecasts move slowly; let the edge absorb repeat lookups. Errors are
        // never cached, so a brief upstream failure doesn't stick for ten minutes.
        'cache-control': upstream.ok ? 'public, max-age=300, s-maxage=600' : 'no-store'
      }
    });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    return Response.json(
      { error: timedOut ? 'Weather service timed out.' : 'Weather service unreachable.' },
      { status: 504 }
    );
  }
};

export const config = {
  path: '/api/weather',
  // Each visitor (per IP) gets 60 calls a minute. Loading a city takes 3 and search
  // suggestions 1 per pause in typing, so real use stays well below this; a script
  // looping over the proxy gets HTTP 429 instead of spending the OpenWeather quota.
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ['ip', 'domain']
  }
};
