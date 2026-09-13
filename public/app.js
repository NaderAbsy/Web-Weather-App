/* ============================================================
   Skyline — weather
   ============================================================ */
(function () {
  'use strict';

  const API_KEY = 'd6d5d476efed3e0953cd23870e8672db';
  const BASE = 'https://api.openweathermap.org';
  const FALLBACK_CITY = { name: 'Amman', country: 'JO', lat: 31.9539, lon: 35.9106 };

  const $ = (id) => document.getElementById(id);

  const el = {
    input: $('city-input'), clear: $('clear-search'), sugg: $('suggestions'),
    geo: $('geo-button'), unit: $('unit-toggle'), theme: $('theme-toggle'),
    status: $('status'), skeleton: $('skeleton'),
    current: $('current'), hourlySec: $('hourly-section'), forecastSec: $('forecast-section'),
    place: $('place'), localTime: $('local-time'), condIcon: $('cond-icon'), condText: $('cond-text'),
    temp: $('temp'), deg: $('deg'), feels: $('feels'), hi: $('hi'), lo: $('lo'),
    humidity: $('humidity'), wind: $('wind'), pressure: $('pressure'),
    visibility: $('visibility'), sunrise: $('sunrise'), sunset: $('sunset'),
    hourly: $('hourly'), forecast: $('forecast'),
    recentWrap: $('recent-wrap'), recentList: $('recent-list')
  };

  let units = load('units', 'metric');
  let lastQuery = null;          // {lat, lon, label}
  let suggestions = [];
  let activeSuggestion = -1;
  let suggestTimer = null;
  let inFlight = null;           // AbortController

  /* ---------- tiny storage helpers (private mode safe) ---------- */
  function load(key, fallback) {
    try { const v = localStorage.getItem('skyline.' + key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem('skyline.' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  /* ---------- theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const light = theme === 'light';
    el.theme.setAttribute('aria-pressed', String(!light));
    el.theme.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#eef3fb' : '#0b1220');
  }
  applyTheme(load('theme', window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  el.theme.addEventListener('click', function () {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next); save('theme', next);
  });

  /* ---------- units ---------- */
  function renderUnitToggle() {
    const metric = units === 'metric';
    el.unit.innerHTML =
      '<span class="' + (metric ? 'unit-active' : 'unit-idle') + '">°C</span>' +
      '<span class="unit-sep">/</span>' +
      '<span class="' + (metric ? 'unit-idle' : 'unit-active') + '">°F</span>';
    el.unit.setAttribute('aria-label', metric ? 'Switch to Fahrenheit' : 'Switch to Celsius');
  }
  renderUnitToggle();
  el.unit.addEventListener('click', function () {
    units = units === 'metric' ? 'imperial' : 'metric';
    save('units', units); renderUnitToggle();
    if (lastQuery) loadWeather(lastQuery);
  });

  const tempUnit  = () => (units === 'metric' ? '°C' : '°F');
  const speedUnit = () => (units === 'metric' ? 'm/s' : 'mph');

  /* ---------- ui state ---------- */
  function showStatus(message, isError) {
    el.status.textContent = message;
    el.status.classList.toggle('error', !!isError);
    el.status.hidden = false;
  }
  function hideStatus() { el.status.hidden = true; }

  function setLoading(on) {
    el.skeleton.hidden = !on;
    if (on) { el.current.hidden = true; el.hourlySec.hidden = true; el.forecastSec.hidden = true; }
  }

  /* ---------- recent cities ---------- */
  function renderRecent() {
    const list = load('recent', []);
    if (!list.length) { el.recentWrap.hidden = true; return; }
    el.recentWrap.hidden = false;
    el.recentList.innerHTML = '';
    list.forEach(function (c) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.label;
      b.addEventListener('click', function () { loadWeather(c); });
      el.recentList.appendChild(b);
    });
  }
  function rememberCity(city) {
    const list = load('recent', []).filter(function (c) { return c.label !== city.label; });
    list.unshift(city);
    save('recent', list.slice(0, 5));
    renderRecent();
  }
  renderRecent();

  /* ---------- formatting ---------- */
  function fmtTime(unixSeconds, tzOffsetSeconds) {
    const d = new Date((unixSeconds + tzOffsetSeconds) * 1000);
    return d.getUTCHours().toString().padStart(2, '0') + ':' + d.getUTCMinutes().toString().padStart(2, '0');
  }
  function fmtHour(unixSeconds, tzOffsetSeconds) {
    const d = new Date((unixSeconds + tzOffsetSeconds) * 1000);
    const h = d.getUTCHours();
    return (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? 'am' : 'pm');
  }
  function fmtDay(unixSeconds, tzOffsetSeconds) {
    const d = new Date((unixSeconds + tzOffsetSeconds) * 1000);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  }
  const icon = (code) => 'https://openweathermap.org/img/wn/' + code + '@2x.png';
  const round = (n) => Math.round(n);

  /* ---------- rendering ---------- */
  function renderCurrent(data) {
    const tz = data.timezone || 0;
    el.place.textContent = data.name + (data.sys && data.sys.country ? ', ' + data.sys.country : '');
    el.localTime.textContent = 'Local time ' + fmtTime(Math.floor(Date.now() / 1000), tz);
    el.condIcon.src = icon(data.weather[0].icon);
    el.condIcon.alt = data.weather[0].description;
    el.condText.textContent = data.weather[0].description;

    el.temp.textContent = round(data.main.temp);
    el.deg.textContent = tempUnit();
    el.feels.textContent = round(data.main.feels_like) + tempUnit();
    el.hi.textContent = round(data.main.temp_max) + '°';
    el.lo.textContent = round(data.main.temp_min) + '°';

    el.humidity.textContent = data.main.humidity + '%';
    el.wind.textContent = data.wind.speed.toFixed(1) + ' ' + speedUnit();
    el.pressure.textContent = data.main.pressure + ' hPa';
    el.visibility.textContent = data.visibility != null ? (data.visibility / 1000).toFixed(1) + ' km' : '—';
    el.sunrise.textContent = data.sys && data.sys.sunrise ? fmtTime(data.sys.sunrise, tz) : '—';
    el.sunset.textContent  = data.sys && data.sys.sunset  ? fmtTime(data.sys.sunset,  tz) : '—';

    el.current.hidden = false;
  }

  function renderHourly(forecast) {
    const tz = forecast.city && forecast.city.timezone ? forecast.city.timezone : 0;
    el.hourly.innerHTML = '';
    forecast.list.slice(0, 8).forEach(function (slot) {
      const li = document.createElement('li');
      const pop = Math.round((slot.pop || 0) * 100);
      li.innerHTML =
        '<p class="h-time">' + fmtHour(slot.dt, tz) + '</p>' +
        '<img src="' + icon(slot.weather[0].icon) + '" alt="' + slot.weather[0].description + '" width="48" height="48" loading="lazy">' +
        '<p class="h-temp">' + round(slot.main.temp) + '°</p>' +
        (pop > 10 ? '<p class="h-pop">' + pop + '%</p>' : '');
      el.hourly.appendChild(li);
    });
    el.hourlySec.hidden = false;
  }

  function renderForecast(forecast) {
    const tz = forecast.city && forecast.city.timezone ? forecast.city.timezone : 0;
    // group the 3-hourly list into days, then take min/max per day
    const days = {};
    forecast.list.forEach(function (slot) {
      const d = new Date((slot.dt + tz) * 1000).toISOString().slice(0, 10);
      if (!days[d]) days[d] = { dt: slot.dt, min: Infinity, max: -Infinity, icons: {}, descs: {} };
      const day = days[d];
      day.min = Math.min(day.min, slot.main.temp_min);
      day.max = Math.max(day.max, slot.main.temp_max);
      const ic = slot.weather[0].icon.replace('n', 'd');     // prefer daytime icon
      day.icons[ic] = (day.icons[ic] || 0) + 1;
      day.descs[slot.weather[0].description] = (day.descs[slot.weather[0].description] || 0) + 1;
    });

    const mostCommon = (obj) => Object.keys(obj).sort((a, b) => obj[b] - obj[a])[0];
    const keys = Object.keys(days).slice(0, 5);

    el.forecast.innerHTML = '';
    keys.forEach(function (key, i) {
      const day = days[key];
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="f-day">' + (i === 0 ? 'Today' : fmtDay(day.dt, tz)) + '</span>' +
        '<img src="' + icon(mostCommon(day.icons)) + '" alt="" width="48" height="48" loading="lazy">' +
        '<span class="f-desc">' + mostCommon(day.descs) + '</span>' +
        '<span class="f-temps">' + round(day.max) + '° <span class="f-lo">' + round(day.min) + '°</span></span>';
      el.forecast.appendChild(li);
    });
    el.forecastSec.hidden = false;
  }

  /* ---------- data ---------- */
  function loadWeather(place) {
    lastQuery = place;
    hideStatus();
    setLoading(true);

    if (inFlight) inFlight.abort();
    inFlight = new AbortController();
    const signal = inFlight.signal;

    const q = 'lat=' + place.lat + '&lon=' + place.lon + '&appid=' + API_KEY + '&units=' + units;

    Promise.all([
      fetch(BASE + '/data/2.5/weather?' + q, { signal }).then(handle),
      fetch(BASE + '/data/2.5/forecast?' + q, { signal }).then(handle)
    ])
      .then(function (results) {
        setLoading(false);
        renderCurrent(results[0]);
        renderHourly(results[1]);
        renderForecast(results[1]);
        rememberCity({
          label: results[0].name + (results[0].sys && results[0].sys.country ? ', ' + results[0].sys.country : ''),
          lat: place.lat, lon: place.lon
        });
        document.title = round(results[0].main.temp) + tempUnit() + ' · ' + results[0].name + ' — Skyline';
      })
      .catch(function (err) {
        if (err.name === 'AbortError') return;
        setLoading(false);
        showStatus(
          err.status === 401 ? 'Weather service rejected the API key.'
          : err.status === 429 ? 'Too many requests — the API rate limit was hit. Try again shortly.'
          : 'Could not load the forecast. Check your connection and try again.',
          true
        );
      });
  }

  function handle(res) {
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return res.json();
  }

  /* ---------- search suggestions (OpenWeather Geocoding API) ---------- */
  function fetchSuggestions(term) {
    fetch(BASE + '/geo/1.0/direct?q=' + encodeURIComponent(term) + '&limit=6&appid=' + API_KEY)
      .then(handle)
      .then(function (list) {
        suggestions = list.map(function (c) {
          return {
            label: c.name + (c.state ? ', ' + c.state : '') + ', ' + c.country,
            name: c.name, country: c.country, lat: c.lat, lon: c.lon
          };
        });
        renderSuggestions();
      })
      .catch(function () { closeSuggestions(); });
  }

  function renderSuggestions() {
    if (!suggestions.length) { closeSuggestions(); return; }
    el.sugg.innerHTML = '';
    suggestions.forEach(function (s, i) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === activeSuggestion));
      li.innerHTML = '<span>' + s.name + (s.state ? ', ' + s.state : '') + '</span><span class="sug-country">' + s.country + '</span>';
      li.addEventListener('mousedown', function (e) { e.preventDefault(); choose(i); });
      el.sugg.appendChild(li);
    });
    el.sugg.hidden = false;
    el.input.setAttribute('aria-expanded', 'true');
  }

  function closeSuggestions() {
    el.sugg.hidden = true;
    el.input.setAttribute('aria-expanded', 'false');
    activeSuggestion = -1;
  }

  function choose(i) {
    const s = suggestions[i];
    if (!s) return;
    el.input.value = s.label;
    el.clear.hidden = false;
    closeSuggestions();
    loadWeather(s);
  }

  el.input.addEventListener('input', function () {
    const term = el.input.value.trim();
    el.clear.hidden = !term;
    clearTimeout(suggestTimer);
    if (term.length < 2) { closeSuggestions(); return; }
    suggestTimer = setTimeout(function () { fetchSuggestions(term); }, 280);
  });

  el.input.addEventListener('keydown', function (e) {
    if (el.sugg.hidden) {
      if (e.key === 'Enter' && el.input.value.trim().length >= 2) { fetchSuggestions(el.input.value.trim()); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); activeSuggestion = Math.min(activeSuggestion + 1, suggestions.length - 1); renderSuggestions(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeSuggestion = Math.max(activeSuggestion - 1, 0); renderSuggestions(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(activeSuggestion >= 0 ? activeSuggestion : 0); }
    else if (e.key === 'Escape') { closeSuggestions(); }
  });

  el.input.addEventListener('blur', function () { setTimeout(closeSuggestions, 120); });

  el.clear.addEventListener('click', function () {
    el.input.value = ''; el.clear.hidden = true; closeSuggestions(); el.input.focus();
  });

  /* ---------- geolocation ---------- */
  function useMyLocation(quiet) {
    if (!navigator.geolocation) {
      if (!quiet) showStatus('This browser does not support location lookup.', true);
      return loadWeather(FALLBACK_CITY);
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      function (pos) { loadWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
      function () {
        setLoading(false);
        showStatus('Location unavailable — showing ' + FALLBACK_CITY.name + '. Search for any city above.');
        loadWeather(FALLBACK_CITY);
      },
      { timeout: 8000, maximumAge: 600000 }
    );
  }
  el.geo.addEventListener('click', function () { useMyLocation(false); });

  /* ---------- start ---------- */
  const recent = load('recent', []);
  if (recent.length) loadWeather(recent[0]);
  else useMyLocation(true);
})();
