/* ============================================================
   Skyline — weather
   ============================================================ */
(function () {
  'use strict';

  // The OpenWeather key lives in the Netlify Function, not here. Everything
  // goes through /api/weather so the key never reaches the browser.
  const API = '/api/weather';
  const api = function (endpoint, params) {
    let url = API + '?endpoint=' + endpoint;
    Object.keys(params).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null) {
        url += '&' + k + '=' + encodeURIComponent(params[k]);
      }
    });
    return url;
  };
  const FALLBACK_CITY = { name: 'Amman', country: 'JO', lat: 31.9539, lon: 35.9106 };
  const REFRESH_MS = 10 * 60 * 1000;

  const $ = (id) => document.getElementById(id);

  const el = {
    input: $('city-input'), clear: $('clear-search'), sugg: $('suggestions'),
    geo: $('geo-button'), unit: $('unit-toggle'), theme: $('theme-toggle'),
    refresh: $('refresh-button'), help: $('help-button'), helpSheet: $('help-sheet'), helpClose: $('help-close'),
    status: $('status'), skeleton: $('skeleton'),
    current: $('current'), hourlySec: $('hourly-section'),
    forecastSec: $('forecast-section'), airSec: $('air-section'),
    place: $('place'), fav: $('fav-toggle'), localTime: $('local-time'), ago: $('updated-ago'),
    condIcon: $('cond-icon'), condText: $('cond-text'),
    temp: $('temp'), deg: $('deg'), feels: $('feels'), hi: $('hi'), lo: $('lo'),
    humidity: $('humidity'), wind: $('wind'), windDir: $('wind-dir'), needle: $('compass-needle'),
    pressure: $('pressure'), visibility: $('visibility'), sunrise: $('sunrise'), sunset: $('sunset'),
    daylight: $('daylight'), daylightFill: $('daylight-fill'), daylightNow: $('daylight-now'), daylightText: $('daylight-text'),
    chart: $('chart'), chartTip: $('chart-tip'), chartReadout: $('chart-readout'),
    hourly: $('hourly'), forecast: $('forecast'),
    aqiNum: $('aqi-num'), aqiLabel: $('aqi-label'), aqiNote: $('aqi-note'),
    aqiToggle: $('aqi-toggle'), aqiDetail: $('aqi-detail'),
    savedWrap: $('saved-wrap'), savedList: $('saved-list'),
    recentWrap: $('recent-wrap'), recentList: $('recent-list')
  };

  let units = load('units', 'metric');
  let lastQuery = null;          // {label, lat, lon}
  let suggestions = [];
  let activeSuggestion = -1;
  let suggestTimer = null;
  let inFlight = null;           // AbortController

  let points = [];               // chart data: {dt, temp, pop, wind, icon, desc}
  let series = 'temp';
  let activeIdx = null;
  let tz = 0;                    // city timezone offset, seconds
  let updatedAt = 0;
  let openDay = null;

  /* ---------- storage (private-mode safe) ---------- */
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
    if (points.length) drawChart();
  }
  applyTheme(load('theme', window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next); save('theme', next);
  }
  el.theme.addEventListener('click', toggleTheme);

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
  function toggleUnits() {
    units = units === 'metric' ? 'imperial' : 'metric';
    save('units', units); renderUnitToggle();
    if (lastQuery) loadWeather(lastQuery);
  }
  el.unit.addEventListener('click', toggleUnits);

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
    if (on) {
      el.current.hidden = true; el.hourlySec.hidden = true;
      el.forecastSec.hidden = true; el.airSec.hidden = true;
    }
  }

  /* ---------- saved + recent chips ---------- */
  function sameCity(a, b) { return a && b && a.label === b.label; }

  function chip(city, opts) {
    const wrap = document.createElement('span');
    wrap.className = 'chip' + (sameCity(city, lastQuery) ? ' is-current' : '');

    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'chip-go';
    go.textContent = city.label;
    go.addEventListener('click', function () { loadWeather(city); });
    wrap.appendChild(go);

    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'chip-x';
    x.innerHTML = '&times;';
    x.setAttribute('aria-label', 'Remove ' + city.label + ' from ' + opts.listName);
    x.addEventListener('click', function (e) { e.stopPropagation(); opts.onRemove(city); });
    wrap.appendChild(x);

    return wrap;
  }

  function renderChips() {
    const saved = load('saved', []);
    const recent = load('recent', []).filter(function (c) {
      return !saved.some(function (s) { return s.label === c.label; });
    });

    el.savedWrap.hidden = !saved.length;
    el.savedList.innerHTML = '';
    saved.forEach(function (c) {
      el.savedList.appendChild(chip(c, {
        listName: 'saved',
        onRemove: function (city) {
          save('saved', load('saved', []).filter(function (s) { return s.label !== city.label; }));
          renderChips(); syncStar();
        }
      }));
    });

    el.recentWrap.hidden = !recent.length;
    el.recentList.innerHTML = '';
    recent.forEach(function (c) {
      el.recentList.appendChild(chip(c, {
        listName: 'recent',
        onRemove: function (city) {
          save('recent', load('recent', []).filter(function (s) { return s.label !== city.label; }));
          renderChips();
        }
      }));
    });
  }

  function rememberCity(city) {
    const list = load('recent', []).filter(function (c) { return c.label !== city.label; });
    list.unshift(city);
    save('recent', list.slice(0, 6));
    renderChips();
  }

  function isSaved(city) {
    return city ? load('saved', []).some(function (s) { return s.label === city.label; }) : false;
  }
  function syncStar() {
    const on = isSaved(lastQuery);
    el.fav.setAttribute('aria-pressed', String(on));
    el.fav.setAttribute('aria-label', (on ? 'Remove ' : 'Save ') + (lastQuery ? lastQuery.label : 'this city') + (on ? ' from saved' : ' to saved'));
  }
  el.fav.addEventListener('click', function () {
    if (!lastQuery) return;
    const saved = load('saved', []);
    if (isSaved(lastQuery)) {
      save('saved', saved.filter(function (s) { return s.label !== lastQuery.label; }));
    } else {
      saved.unshift({ label: lastQuery.label, lat: lastQuery.lat, lon: lastQuery.lon });
      save('saved', saved.slice(0, 8));
    }
    renderChips(); syncStar();
  });
  renderChips();

  /* ---------- formatting ---------- */
  function fmtTime(unixSeconds, offset) {
    const d = new Date((unixSeconds + offset) * 1000);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  }
  function fmtHour(unixSeconds, offset) {
    const h = new Date((unixSeconds + offset) * 1000).getUTCHours();
    return (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? 'am' : 'pm');
  }
  function fmtDay(unixSeconds, offset) {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date((unixSeconds + offset) * 1000).getUTCDay()];
  }
  const icon = (code) => 'https://openweathermap.org/img/wn/' + code + '@2x.png';
  const round = (n) => Math.round(n);

  const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const bearing = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

  const SKY = { Clear:'clear', Clouds:'clouds', Rain:'rain', Drizzle:'rain', Thunderstorm:'storm', Snow:'snow' };

  /* ---------- current conditions ---------- */
  function renderCurrent(data) {
    tz = data.timezone || 0;
    const label = data.name + (data.sys && data.sys.country ? ', ' + data.sys.country : '');
    el.place.textContent = label;
    el.condIcon.src = icon(data.weather[0].icon);
    el.condIcon.alt = data.weather[0].description;
    el.condText.textContent = data.weather[0].description;

    document.documentElement.setAttribute('data-sky', SKY[data.weather[0].main] || 'mist');

    el.temp.textContent = round(data.main.temp);
    el.deg.textContent = tempUnit();
    el.feels.textContent = round(data.main.feels_like) + tempUnit();
    el.hi.textContent = round(data.main.temp_max) + '°';
    el.lo.textContent = round(data.main.temp_min) + '°';

    el.humidity.textContent = data.main.humidity + '%';
    el.wind.textContent = data.wind.speed.toFixed(1) + ' ' + speedUnit();
    if (typeof data.wind.deg === 'number') {
      el.windDir.textContent = bearing(data.wind.deg) + ' · ' + Math.round(data.wind.deg) + '°';
      // the arrow points the way the wind is blowing towards
      el.needle.style.transform = 'rotate(' + ((data.wind.deg + 180) % 360) + 'deg)';
    } else {
      el.windDir.textContent = '';
    }
    el.pressure.textContent = data.main.pressure + ' hPa';
    el.visibility.textContent = data.visibility != null ? (data.visibility / 1000).toFixed(1) + ' km' : '—';

    const sr = data.sys && data.sys.sunrise, ss = data.sys && data.sys.sunset;
    el.sunrise.textContent = sr ? fmtTime(sr, tz) : '—';
    el.sunset.textContent  = ss ? fmtTime(ss, tz) : '—';
    renderDaylight(sr, ss);

    el.current.hidden = false;
    tickClock();
  }

  function renderDaylight(sunrise, sunset) {
    if (!sunrise || !sunset || sunset <= sunrise) { el.daylight.hidden = true; return; }
    const now = Math.floor(Date.now() / 1000);
    const span = sunset - sunrise;
    const pct = Math.max(0, Math.min(1, (now - sunrise) / span));
    el.daylightFill.style.width = (pct * 100) + '%';
    el.daylightNow.style.left = (pct * 100) + '%';

    const hours = Math.floor(span / 3600), mins = Math.round((span % 3600) / 60);
    if (now < sunrise) {
      el.daylightText.textContent = 'Sunrise in ' + until(sunrise - now) + ' · ' + hours + 'h ' + mins + 'm of daylight ahead';
    } else if (now > sunset) {
      el.daylightText.textContent = 'The sun set ' + until(now - sunset) + ' ago · ' + hours + 'h ' + mins + 'm of daylight today';
    } else {
      el.daylightText.textContent = until(sunset - now) + ' of daylight left · ' + hours + 'h ' + mins + 'm total';
    }
    el.daylight.hidden = false;
  }
  function until(seconds) {
    const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
    return h ? h + 'h ' + m + 'm' : m + 'm';
  }

  /* ---------- live clock + freshness ---------- */
  function tickClock() {
    if (el.current.hidden) return;
    el.localTime.textContent = 'Local time ' + fmtTime(Math.floor(Date.now() / 1000), tz);
    if (updatedAt) {
      const mins = Math.floor((Date.now() - updatedAt) / 60000);
      el.ago.textContent = mins < 1 ? 'updated just now' : 'updated ' + mins + 'm ago';
    }
  }
  setInterval(tickClock, 20000);
  setInterval(function () { if (lastQuery && !document.hidden) loadWeather(lastQuery, true); }, REFRESH_MS);

  /* ---------- hourly strip ---------- */
  function renderHourly() {
    el.hourly.innerHTML = '';
    points.forEach(function (p, i) {
      const li = document.createElement('li');
      li.dataset.idx = String(i);
      li.innerHTML =
        '<p class="h-time">' + fmtHour(p.dt, tz) + '</p>' +
        '<img src="' + icon(p.icon) + '" alt="' + p.desc + '" width="48" height="48" loading="lazy">' +
        '<p class="h-temp">' + round(p.temp) + '°</p>' +
        (p.pop > 10 ? '<p class="h-pop">' + p.pop + '%</p>' : '');
      li.addEventListener('mouseenter', function () { setActive(i, false); });
      li.addEventListener('click', function () { setActive(i, false); el.chart.focus(); });
      el.hourly.appendChild(li);
    });
    el.hourlySec.hidden = false;
  }

  /* ---------- the chart ---------- */
  const SERIES = {
    temp: { label: 'Temperature', fmt: (v) => round(v) + tempUnit(), kind: 'line' },
    pop:  { label: 'Chance of rain', fmt: (v) => Math.round(v) + '%', kind: 'bar' },
    wind: { label: 'Wind', fmt: (v) => v.toFixed(1) + ' ' + speedUnit(), kind: 'line' }
  };

  function drawChart() {
    if (!points.length) return;
    const w = el.chart.clientWidth || 640;
    const h = el.chart.clientHeight || 190;
    const padL = 36, padR = 16, padT = 28, padB = 26;
    const iw = Math.max(10, w - padL - padR);
    const ih = Math.max(10, h - padT - padB);

    const vals = points.map(function (p) { return p[series]; });
    let min, max;
    if (series === 'pop') {
      min = 0; max = Math.max(20, Math.max.apply(null, vals));
    } else {
      min = Math.min.apply(null, vals); max = Math.max.apply(null, vals);
      const pad = (max - min) || 1;
      min -= pad * 0.28; max += pad * 0.28;
    }
    const span = (max - min) || 1;
    const X = (i) => padL + (points.length < 2 ? iw / 2 : (iw * i) / (points.length - 1));
    const Y = (v) => padT + ih - ((v - min) / span) * ih;

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6ba8ff';

    let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">';
    svg += '<defs><linearGradient id="skylineFill" x1="0" y1="0" x2="0" y2="1">' +
           '<stop offset="0%" stop-color="' + accent + '" stop-opacity=".34"/>' +
           '<stop offset="100%" stop-color="' + accent + '" stop-opacity="0"/></linearGradient></defs>';

    // horizontal grid + y labels
    [0, 0.5, 1].forEach(function (t) {
      const gy = padT + ih * t;
      const value = max - span * t;
      svg += '<line class="grid-line" x1="' + padL + '" y1="' + gy + '" x2="' + (w - padR) + '" y2="' + gy + '"/>';
      svg += '<text class="y-label" x="2" y="' + (gy + 3.5) + '">' + SERIES[series].fmt(value) + '</text>';
    });

    if (SERIES[series].kind === 'bar') {
      const bw = Math.min(30, (iw / points.length) * 0.55);
      points.forEach(function (p, i) {
        const by = Y(p[series]), bh = Math.max(2, padT + ih - by);
        svg += '<rect class="bar" data-idx="' + i + '" x="' + (X(i) - bw / 2) + '" y="' + by + '" width="' + bw + '" height="' + bh + '"/>';
      });
    } else {
      let line = '', area = '';
      points.forEach(function (p, i) {
        const cmd = (i === 0 ? 'M' : 'L') + X(i) + ' ' + Y(p[series]);
        line += cmd; area += cmd;
      });
      area += 'L' + X(points.length - 1) + ' ' + (padT + ih) + 'L' + X(0) + ' ' + (padT + ih) + 'Z';
      svg += '<path class="area" d="' + area + '"/><path class="line" d="' + line + '"/>';
      points.forEach(function (p, i) {
        svg += '<circle class="point" cx="' + X(i) + '" cy="' + Y(p[series]) + '" r="3.4"/>';
      });
    }

    // x labels
    points.forEach(function (p, i) {
      if (points.length > 8 && i % 2) return;
      svg += '<text class="axis-label" x="' + X(i) + '" y="' + (h - 7) + '">' + fmtHour(p.dt, tz) + '</text>';
    });

    svg += '<line class="cursor-line" id="cur-line" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + ih) + '" style="display:none"/>';
    svg += '<circle class="cursor-dot" id="cur-dot" r="5" style="display:none"/>';
    svg += '</svg>';

    const old = el.chart.querySelector('svg');
    if (old) old.remove();
    el.chart.insertAdjacentHTML('afterbegin', svg);

    el.chart._X = X; el.chart._Y = Y;
    if (activeIdx !== null) setActive(activeIdx, false);
  }

  function setActive(i, announce) {
    if (!points.length) return;
    activeIdx = Math.max(0, Math.min(points.length - 1, i));
    const p = points[activeIdx];
    const X = el.chart._X, Y = el.chart._Y;
    if (!X) return;

    const cx = X(activeIdx), cy = Y(p[series]);
    const line = el.chart.querySelector('#cur-line');
    const dot  = el.chart.querySelector('#cur-dot');
    if (line) { line.setAttribute('x1', cx); line.setAttribute('x2', cx); line.style.display = ''; }
    if (dot)  { dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.style.display = ''; }

    el.chart.querySelectorAll('.bar').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.dataset.idx) === activeIdx);
    });

    el.chartTip.innerHTML =
      '<b>' + SERIES[series].fmt(p[series]) + '</b>' +
      '<span class="tip-sub">' + fmtHour(p.dt, tz) + ' · ' + p.desc + '</span>';
    // show first so the tip can be measured, then keep it inside the chart
    el.chartTip.hidden = false;
    const half = el.chartTip.offsetWidth / 2;
    const cw = el.chart.clientWidth;
    el.chartTip.style.left = Math.max(half + 2, Math.min(cw - half - 2, cx)) + 'px';
    el.chartTip.style.top = cy + 'px';
    // near the top of the plot there is no room above the point, so drop below it
    el.chartTip.classList.toggle('below', cy < el.chartTip.offsetHeight + 10);

    Array.prototype.forEach.call(el.hourly.children, function (li, n) {
      li.classList.toggle('is-active', n === activeIdx);
    });

    if (announce) {
      el.chartReadout.textContent = fmtHour(p.dt, tz) + ': ' + SERIES[series].fmt(p[series]) + ', ' + p.desc;
    }
  }

  function clearActive() {
    activeIdx = null;
    el.chartTip.hidden = true;
    const line = el.chart.querySelector('#cur-line');
    const dot  = el.chart.querySelector('#cur-dot');
    if (line) line.style.display = 'none';
    if (dot)  dot.style.display = 'none';
    el.chart.querySelectorAll('.bar.is-active').forEach(function (b) { b.classList.remove('is-active'); });
    Array.prototype.forEach.call(el.hourly.children, function (li) { li.classList.remove('is-active'); });
  }

  function idxFromX(clientX) {
    const rect = el.chart.getBoundingClientRect();
    const X = el.chart._X;
    if (!X) return 0;
    const x = clientX - rect.left;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(X(i) - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  el.chart.addEventListener('pointermove', function (e) { setActive(idxFromX(e.clientX), false); });
  el.chart.addEventListener('pointerdown', function (e) { setActive(idxFromX(e.clientX), true); });
  el.chart.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') clearActive(); });
  el.chart.addEventListener('focus', function () { if (activeIdx === null) setActive(0, true); });
  el.chart.addEventListener('blur', clearActive);
  el.chart.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActive((activeIdx === null ? -1 : activeIdx) + 1, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((activeIdx === null ? 1 : activeIdx) - 1, true); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0, true); }
    else if (e.key === 'End') { e.preventDefault(); setActive(points.length - 1, true); }
    else if (e.key === 'Escape') { clearActive(); }
  });

  function setSeries(next) {
    if (!SERIES[next]) return;
    series = next;
    document.querySelectorAll('.seg').forEach(function (b) {
      const on = b.dataset.series === next;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    el.chart.setAttribute('aria-label', SERIES[next].label + ' over the next 24 hours. Use the left and right arrow keys to step through each hour.');
    drawChart();
  }
  document.querySelectorAll('.seg').forEach(function (b) {
    b.addEventListener('click', function () { setSeries(b.dataset.series); });
  });

  if (window.ResizeObserver) {
    let raf = null;
    new ResizeObserver(function () {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () { if (points.length) drawChart(); });
    }).observe(el.chart);
  } else {
    window.addEventListener('resize', function () { if (points.length) drawChart(); });
  }

  /* ---------- 5-day forecast, expandable ---------- */
  function renderForecast(forecast) {
    const days = {};
    const order = [];
    forecast.list.forEach(function (slot) {
      const key = new Date((slot.dt + tz) * 1000).toISOString().slice(0, 10);
      if (!days[key]) { days[key] = { dt: slot.dt, min: Infinity, max: -Infinity, icons: {}, descs: {}, slots: [] }; order.push(key); }
      const day = days[key];
      day.min = Math.min(day.min, slot.main.temp_min);
      day.max = Math.max(day.max, slot.main.temp_max);
      day.slots.push(slot);
      const ic = slot.weather[0].icon.replace('n', 'd');
      day.icons[ic] = (day.icons[ic] || 0) + 1;
      day.descs[slot.weather[0].description] = (day.descs[slot.weather[0].description] || 0) + 1;
    });

    const mostCommon = (obj) => Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; })[0];
    const keys = order.slice(0, 5);

    el.forecast.innerHTML = '';
    keys.forEach(function (key, i) {
      const day = days[key];
      const name = i === 0 ? 'Today' : fmtDay(day.dt, tz);
      const li = document.createElement('li');
      const panelId = 'day-panel-' + i;

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'f-row';
      row.setAttribute('aria-expanded', 'false');
      row.setAttribute('aria-controls', panelId);
      row.innerHTML =
        '<span class="f-day">' + name + '</span>' +
        '<img src="' + icon(mostCommon(day.icons)) + '" alt="" width="48" height="48" loading="lazy">' +
        '<span class="f-desc">' + mostCommon(day.descs) + '</span>' +
        '<span class="f-temps">' + round(day.max) + '° <span class="f-lo">' + round(day.min) + '°</span></span>' +
        '<svg class="f-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

      const panel = document.createElement('div');
      panel.className = 'f-panel';
      panel.id = panelId;
      panel.hidden = true;
      panel.innerHTML = '<ul class="f-hours">' + day.slots.map(function (s) {
        const pop = Math.round((s.pop || 0) * 100);
        return '<li><p class="fh-time">' + fmtHour(s.dt, tz) + '</p>' +
               '<img src="' + icon(s.weather[0].icon) + '" alt="' + s.weather[0].description + '" width="40" height="40" loading="lazy">' +
               '<p class="fh-temp">' + round(s.main.temp) + '°</p>' +
               (pop > 10 ? '<p class="fh-pop">' + pop + '%</p>' : '') + '</li>';
      }).join('') + '</ul>';

      row.addEventListener('click', function () {
        const open = panel.hidden;
        // accordion: only one day open at a time
        el.forecast.querySelectorAll('.f-panel').forEach(function (p) { p.hidden = true; });
        el.forecast.querySelectorAll('.f-row').forEach(function (r) { r.setAttribute('aria-expanded', 'false'); });
        el.forecast.querySelectorAll('li').forEach(function (l) { l.classList.remove('is-open'); });
        if (open) {
          panel.hidden = false;
          row.setAttribute('aria-expanded', 'true');
          li.classList.add('is-open');
          openDay = name;
        } else {
          openDay = null;
        }
      });

      li.appendChild(row);
      li.appendChild(panel);
      el.forecast.appendChild(li);

      if (openDay === name) row.click();   // keep the open day open across refreshes
    });

    el.forecastSec.hidden = false;
  }

  /* ---------- air quality ---------- */
  const AQI = [
    null,
    { label: 'Good',      color: '#7ad47a', note: 'Air quality is satisfactory and poses little or no risk.' },
    { label: 'Fair',      color: '#d6d95c', note: 'Acceptable, though unusually sensitive people may notice it.' },
    { label: 'Moderate',  color: '#f0a854', note: 'Sensitive groups should consider easing long outdoor exertion.' },
    { label: 'Poor',      color: '#ef6f6f', note: 'Everyone may feel effects; sensitive groups more seriously.' },
    { label: 'Very poor', color: '#b96ad9', note: 'Health warnings. Avoid prolonged outdoor exertion.' }
  ];
  const POLLUTANTS = [
    { key: 'pm2_5', name: 'PM2.5' }, { key: 'pm10', name: 'PM10' }, { key: 'o3', name: 'Ozone' },
    { key: 'no2', name: 'NO₂' }, { key: 'so2', name: 'SO₂' }, { key: 'co', name: 'CO' }
  ];

  function renderAir(data) {
    const entry = data && data.list && data.list[0];
    if (!entry) { el.airSec.hidden = true; return; }
    const level = entry.main.aqi;
    const info = AQI[level];
    if (!info) { el.airSec.hidden = true; return; }

    el.aqiNum.textContent = level;
    el.aqiNum.style.setProperty('--aqi-color', info.color);
    el.aqiLabel.textContent = info.label;
    el.aqiNote.textContent = info.note;

    document.querySelectorAll('.aqi-scale i').forEach(function (seg) {
      seg.classList.toggle('is-on', Number(seg.dataset.level) === level);
    });

    el.aqiDetail.innerHTML = POLLUTANTS.map(function (p) {
      const v = entry.components[p.key];
      if (v == null) return '';
      return '<li><span class="p-name">' + p.name + '</span>' +
             '<span class="p-value">' + (v < 10 ? v.toFixed(2) : Math.round(v)) +
             ' <span class="p-unit">µg/m³</span></span></li>';
    }).join('');

    el.airSec.hidden = false;
  }

  el.aqiToggle.addEventListener('click', function () {
    const open = el.aqiDetail.hidden;
    el.aqiDetail.hidden = !open;
    el.aqiToggle.setAttribute('aria-expanded', String(open));
    el.aqiToggle.textContent = open ? 'Hide pollutant breakdown' : 'Show pollutant breakdown';
  });

  /* ---------- data ---------- */
  function loadWeather(place, quiet) {
    lastQuery = place;
    hideStatus();
    if (!quiet) { setLoading(true); clearActive(); }

    if (inFlight) inFlight.abort();
    inFlight = new AbortController();
    const signal = inFlight.signal;

    const q = { lat: place.lat, lon: place.lon, units: units };

    Promise.all([
      fetch(api('weather', q), { signal }).then(handle),
      fetch(api('forecast', q), { signal }).then(handle)
    ])
      .then(function (results) {
        const now = results[0], forecast = results[1];
        setLoading(false);
        updatedAt = Date.now();

        tz = (forecast.city && forecast.city.timezone) || now.timezone || 0;
        renderCurrent(now);

        points = forecast.list.slice(0, 8).map(function (s) {
          return {
            dt: s.dt, temp: s.main.temp, pop: Math.round((s.pop || 0) * 100),
            wind: s.wind.speed, icon: s.weather[0].icon, desc: s.weather[0].description
          };
        });
        renderHourly();
        setSeries(series);
        renderForecast(forecast);

        const label = now.name + (now.sys && now.sys.country ? ', ' + now.sys.country : '');
        lastQuery = { label: label, lat: place.lat, lon: place.lon };
        rememberCity(lastQuery);
        syncStar();
        document.title = round(now.main.temp) + tempUnit() + ' · ' + now.name + ' — Skyline';
      })
      .catch(function (err) {
        if (err.name === 'AbortError') return;
        setLoading(false);
        showStatus(
          err.status === 500 ? 'Weather service is not configured yet.'
          : err.status === 401 ? 'Weather service rejected the API key.'
          : err.status === 429 ? 'Too many requests — the API rate limit was hit. Try again shortly.'
          : 'Could not load the forecast. Check your connection and try again.',
          true
        );
      });

    // air quality is a separate product; a failure there must not sink the page
    fetch(api('air', { lat: place.lat, lon: place.lon }), { signal })
      .then(handle).then(renderAir)
      .catch(function () { el.airSec.hidden = true; });
  }

  function handle(res) {
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return res.json();
  }

  el.refresh.addEventListener('click', function () {
    if (!lastQuery) return useMyLocation(false);
    el.refresh.classList.add('is-spinning');
    setTimeout(function () { el.refresh.classList.remove('is-spinning'); }, 700);
    loadWeather(lastQuery);
  });

  /* ---------- search suggestions (Geocoding API) ---------- */
  function fetchSuggestions(term) {
    fetch(api('geo', { q: term, limit: 6 }))
      .then(handle)
      .then(function (list) {
        suggestions = list.map(function (c) {
          return {
            label: c.name + (c.state ? ', ' + c.state : '') + ', ' + c.country,
            name: c.name, state: c.state, country: c.country, lat: c.lat, lon: c.lon
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
      if (e.key === 'Enter' && el.input.value.trim().length >= 2) fetchSuggestions(el.input.value.trim());
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

  /* ---------- help sheet + keyboard shortcuts ---------- */
  function openHelp() {
    if (typeof el.helpSheet.showModal === 'function') el.helpSheet.showModal();
    else el.helpSheet.setAttribute('open', '');
  }
  function closeHelp() {
    if (typeof el.helpSheet.close === 'function') el.helpSheet.close();
    else el.helpSheet.removeAttribute('open');
  }
  el.help.addEventListener('click', openHelp);
  el.helpClose.addEventListener('click', closeHelp);
  el.helpSheet.addEventListener('click', function (e) { if (e.target === el.helpSheet) closeHelp(); });

  document.addEventListener('keydown', function (e) {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === '/') { e.preventDefault(); el.input.focus(); el.input.select(); }
    else if (e.key === '?') { e.preventDefault(); openHelp(); }
    else if (e.key === 'u' || e.key === 'U') toggleUnits();
    else if (e.key === 't' || e.key === 'T') toggleTheme();
    else if (e.key === 'r' || e.key === 'R') { if (lastQuery) loadWeather(lastQuery); }
    else if (e.key === 'l' || e.key === 'L') useMyLocation(false);
    else if (e.key === '1') setSeries('temp');
    else if (e.key === '2') setSeries('pop');
    else if (e.key === '3') setSeries('wind');
  });

  /* ---------- start ---------- */
  const saved = load('saved', []);
  const recent = load('recent', []);
  if (saved.length) loadWeather(saved[0]);
  else if (recent.length) loadWeather(recent[0]);
  else useMyLocation(true);
})();
