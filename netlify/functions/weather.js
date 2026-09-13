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

// Only these reach OpenWeather; anything else a caller appends is dropped.
const PASS_THROUGH = ['lat', 'lon', 'units', 'q', 'limit'];

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
  for (const name of PASS_THROUGH) {
    const value = incoming.searchParams.get(name);
    if (value !== null) target.searchParams.set(name, value);
  }
  target.searchParams.set('appid', key);

  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(9000) });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'content-type': 'application/json',
        // Forecasts move slowly; let the edge absorb repeat lookups.
        'cache-control': 'public, max-age=300, s-maxage=600'
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

export const config = { path: '/api/weather' };
