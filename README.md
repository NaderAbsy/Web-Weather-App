# Skyline — Weather

**Live: [naderabsy-weather.netlify.app](https://naderabsy-weather.netlify.app)**

A weather app built on the OpenWeather API, with Firebase authentication and a
Firestore-backed user store. No frameworks, no build step — plain HTML, CSS and JavaScript.

## Features

- **Current conditions** — temperature, feels-like, high/low, humidity, pressure, visibility, sunrise and sunset
- **Wind compass** — speed plus a needle and bearing showing the direction it is blowing towards
- **Daylight bar** — where you are between sunrise and sunset, and how much light is left
- **Interactive 24-hour chart** — scrub with a pointer or the arrow keys to read any hour;
  switch between temperature, chance of rain and wind. Scrubbing highlights the matching hour
  in the strip below it.
- **Air quality** — AQI with a five-step scale and a pollutant breakdown (PM2.5, PM10, O₃, NO₂, SO₂, CO)
- **5-day forecast** — daily highs and lows, and each day expands to its hour-by-hour detail
- **City search** — debounced autocomplete via the OpenWeather Geocoding API, navigable by keyboard
- **Geolocation** with a graceful fallback when permission is denied
- **Saved and recent cities** — star a city to pin it; recent lookups are kept automatically
- **°C / °F toggle** and **light/dark theme**, both remembered between visits
- **A backdrop that follows the sky** — the palette shifts with clear, cloud, rain, storm, snow and mist
- **Live local clock**, a freshness stamp, and a refresh every ten minutes
- **Keyboard shortcuts** — <kbd>/</kbd> search, <kbd>u</kbd> units, <kbd>t</kbd> theme,
  <kbd>r</kbd> refresh, <kbd>l</kbd> location, <kbd>1</kbd>–<kbd>3</kbd> chart series,
  <kbd>?</kbd> for the full list
- **Accounts** — sign up, log in, Google sign-in, password reset and email verification via Firebase

## Stack

JavaScript (no framework, no build step) · hand-rolled SVG charting, no charting library ·
OpenWeather Current, Forecast, Geocoding and Air Pollution APIs ·
Firebase Authentication · Cloud Firestore · deployed on Netlify

## Structure

```
public/
  index.html              Main app
  app.css                 All styling, themed with CSS custom properties
  app.js                  Weather data, chart, search, geolocation, units, theme
  index.js                Auth UI wiring
  fireBaseScript.js       Firebase initialisation and auth functions
  login / signup / reset-password   Auth pages
netlify.toml              Publish config and headers
```

## Running locally

```bash
cd public
python3 -m http.server 4190
```

Then open `http://localhost:4190`.

## Accessibility

The chart is reachable by keyboard and announces each hour through a live region, so it is not
a mouse-only feature. The forecast rows are real buttons with `aria-expanded`, the search box is
a proper combobox, and the `[hidden]` attribute is forced to win over class-based `display`
rules so nothing can be left visible after it is dismissed. Motion respects
`prefers-reduced-motion`.

## Configuration

The OpenWeather key lives in `public/app.js`. It's a free-tier key with a rate limit rather
than a billing risk, but it is visible to anyone viewing the page — the proper fix is to proxy
requests through a Netlify Function so the key stays server-side.

Firebase config is in `public/fireBaseScript.js`. Those values are meant to be public; Firebase
security comes from its rules, not from hiding that key. New deployment domains must be added
under **Firebase Console → Authentication → Settings → Authorized domains** or sign-in will fail.

---

Built by [Nader Absy](https://naderabsy.com)
