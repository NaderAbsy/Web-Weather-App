# Skyline — Weather

**Live: [naderabsy-weather.netlify.app](https://naderabsy-weather.netlify.app)**

A weather app built on the OpenWeather API, with Firebase authentication and a
Firestore-backed user store. No frameworks, no build step — plain HTML, CSS and JavaScript.

## Features

- **Current conditions** — temperature, feels-like, high/low, humidity, wind, pressure, visibility, sunrise and sunset
- **Next 24 hours** — a scrollable hourly strip with precipitation probability
- **5-day forecast** — daily highs and lows, aggregated from the 3-hourly data
- **City search** — debounced autocomplete via the OpenWeather Geocoding API, navigable by keyboard
- **Geolocation** with a graceful fallback when permission is denied
- **°C / °F toggle** and **light/dark theme**, both remembered between visits
- **Recent cities** — your last five lookups, one click away
- **Accounts** — sign up, log in, Google sign-in, password reset and email verification via Firebase

## Stack

JavaScript (no framework) · OpenWeather Current, Forecast and Geocoding APIs ·
Firebase Authentication · Cloud Firestore · deployed on Netlify

## Structure

```
public/
  index.html              Main app
  app.css                 All styling, themed with CSS custom properties
  app.js                  Weather data, search, geolocation, units, theme
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

## Configuration

The OpenWeather key lives in `public/app.js`. It's a free-tier key with a rate limit rather
than a billing risk, but it is visible to anyone viewing the page — the proper fix is to proxy
requests through a Netlify Function so the key stays server-side.

Firebase config is in `public/fireBaseScript.js`. Those values are meant to be public; Firebase
security comes from its rules, not from hiding that key. New deployment domains must be added
under **Firebase Console → Authentication → Settings → Authorized domains** or sign-in will fail.

---

Built by [Nader Absy](https://naderabsy.com)
