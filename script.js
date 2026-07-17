'use strict';

/* ════════════════════════════════════════════════════════════════════════
   SECTION 0 — WEATHER THEME ENGINE
   Dynamically adjusts background, colors, and atmosphere effects based
   on the current weather condition & time of day at the searched location.
   ════════════════════════════════════════════════════════════════════════ */

const WX_THEMES = {
    // theme-key : { label, emoji, particleType }
    'thunderstorm':        { label: 'Thunderstorm',    emoji: '⛈️',  particle: 'rain-heavy'  },
    'heavy-rain':          { label: 'Heavy Rain',      emoji: '🌧️',  particle: 'rain-heavy'  },
    'rainy':               { label: 'Rainy',           emoji: '🌦️',  particle: 'rain-light'  },
    'snow':                { label: 'Snowing',         emoji: '❄️',  particle: 'snow'        },
    'foggy':               { label: 'Foggy',           emoji: '🌫️',  particle: 'fog'         },
    'cloudy':              { label: 'Overcast',        emoji: '☁️',  particle: null           },
    'partly-cloudy':       { label: 'Partly Cloudy',  emoji: '⛅',  particle: null           },
    'partly-cloudy-night': { label: 'Partly Cloudy',  emoji: '🌤️',  particle: null           },
    'sunny':               { label: 'Sunny',           emoji: '☀️',  particle: null           },
    'sunset':              { label: 'Sunset / Dusk',  emoji: '🌅',  particle: null           },
    'clear-night':         { label: 'Clear Night',    emoji: '🌙',  particle: 'stars'        },
};

let particleAnimId = null;

/**
 * Derive the visual theme key from an OWM weather object + time context.
 * @param {object} weatherItem  – current.weather[0] from OWM
 * @param {boolean} isDay       – whether the sun is up at the location
 * @param {boolean} isDusk      – ±45 min of sunrise/sunset (golden hour)
 */
function getWeatherTheme(weatherItem, isDay, isDusk) {
    const id = weatherItem.id;

    // Thunderstorm group (2xx)
    if (id >= 200 && id <= 232) return 'thunderstorm';

    // Drizzle group (3xx) — treat as light rain
    if (id >= 300 && id <= 321) return 'rainy';

    // Rain group (5xx)
    if (id >= 500 && id <= 531) {
        if (id === 502 || id === 503 || id === 504 || id === 522) return 'heavy-rain';
        return 'rainy';
    }

    // Snow group (6xx)
    if (id >= 600 && id <= 622) return 'snow';

    // Atmosphere (fog, mist, haze, smoke, dust) (7xx)
    if (id >= 700 && id <= 781) return 'foggy';

    // Clear sky (800)
    if (id === 800) {
        if (!isDay) return 'clear-night';
        if (isDusk) return 'sunset';
        return 'sunny';
    }

    // Clouds (80x)
    if (id === 801 || id === 802) {
        if (!isDay) return 'partly-cloudy-night';
        return 'partly-cloudy';
    }
    if (id >= 803 && id <= 804) return 'cloudy';

    return isDay ? 'partly-cloudy' : 'clear-night';
}

/**
 * Main entry point — call this after a weather result is rendered.
 * @param {object} current      – current weather object from OWM
 * @param {number} timezoneOffset – seconds east of UTC
 */
function applyWeatherTheme(current, timezoneOffset) {
    const nowUnix = current.dt;
    const sunriseUnix = current.sunrise;
    const sunsetUnix  = current.sunset;

    const isDay  = nowUnix >= sunriseUnix && nowUnix <= sunsetUnix;
    const duskWindow = 45 * 60; // 45 minutes
    const isDusk = (nowUnix >= sunriseUnix - duskWindow && nowUnix <= sunriseUnix + duskWindow) ||
                   (nowUnix >= sunsetUnix  - duskWindow && nowUnix <= sunsetUnix  + duskWindow);

    const themeKey = getWeatherTheme(current.weather[0], isDay, isDusk);
    const themeMeta = WX_THEMES[themeKey] || WX_THEMES['partly-cloudy'];

    // Apply data-theme attribute to document root
    document.documentElement.setAttribute('data-theme', themeKey);

    // Update theme badge
    const badge = document.getElementById('wxThemeBadge');
    const badgeText = document.getElementById('wxThemeBadgeText');
    if (badge && badgeText) {
        badgeText.textContent = `${themeMeta.emoji} ${themeMeta.label}`;
        badge.classList.add('visible');
    }

    // Trigger atmosphere effects
    updateAtmosphereEffects(themeKey, themeMeta.particle, isDay);

    // Smooth sun orb for warm themes
    updateSunOrb(themeKey);
}

/* ── Particle / atmosphere effects ───────────────────────────────────── */

function updateAtmosphereEffects(themeKey, particleType, isDay) {
    // Cancel existing animation
    if (particleAnimId) { cancelAnimationFrame(particleAnimId); particleAnimId = null; }

    const canvas     = document.getElementById('wxParticleCanvas');
    const fogOverlay = document.getElementById('wxFogOverlay');
    const starsEl    = document.getElementById('wxStars');
    const lightning  = document.getElementById('wxLightning');

    // Reset all
    canvas.classList.remove('active');
    fogOverlay.classList.remove('active');
    starsEl.classList.remove('active');
    lightning.classList.remove('lightning-active');

    switch (particleType) {
        case 'rain-light':  startRainCanvas(canvas, 'light');  break;
        case 'rain-heavy':  startRainCanvas(canvas, 'heavy');  break;
        case 'snow':        startSnowCanvas(canvas);            break;
        case 'fog':         fogOverlay.classList.add('active'); break;
        case 'stars':       buildStarsSVG(starsEl);             break;
        default:            /* clear sky / cloudy — no particles */  break;
    }

    if (themeKey === 'thunderstorm') {
        lightning.classList.add('lightning-active');
    }
}

/* Rain particle system */
function startRainCanvas(canvas, intensity) {
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const count    = intensity === 'heavy' ? 250 : 110;
    const speed    = intensity === 'heavy' ? [12, 22] : [6, 12];
    const alpha    = intensity === 'heavy' ? [0.25, 0.55] : [0.15, 0.35];
    const len      = intensity === 'heavy' ? [18, 34] : [10, 20];
    const angle    = intensity === 'heavy' ? 0.40 : 0.22; // radians slant

    const drops = Array.from({ length: count }, () => ({
        x:  Math.random() * (window.innerWidth + 200) - 100,
        y:  Math.random() * window.innerHeight,
        v:  speed[0] + Math.random() * (speed[1] - speed[0]),
        a:  alpha[0] + Math.random() * (alpha[1] - alpha[0]),
        l:  len[0]   + Math.random() * (len[1]   - len[0]),
    }));

    const dx = Math.sin(angle);
    const dy = Math.cos(angle);

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(180, 215, 255, 1)';
        ctx.lineWidth = intensity === 'heavy' ? 1.2 : 0.9;

        for (const d of drops) {
            ctx.globalAlpha = d.a;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x + dx * d.l, d.y + dy * d.l);
            ctx.stroke();

            d.x += dx * d.v;
            d.y += dy * d.v;

            if (d.y > canvas.height + 50 || d.x > canvas.width + 50) {
                d.x = Math.random() * canvas.width - 100;
                d.y = -50;
            }
        }
        ctx.globalAlpha = 1;
        particleAnimId = requestAnimationFrame(draw);
    }

    canvas.classList.add('active');
    particleAnimId = requestAnimationFrame(draw);
}

/* Snow particle system */
function startSnowCanvas(canvas) {
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const flakes = Array.from({ length: 160 }, () => ({
        x:  Math.random() * window.innerWidth,
        y:  Math.random() * window.innerHeight,
        r:  1 + Math.random() * 3.5,
        v:  0.6 + Math.random() * 1.8,
        drift: (Math.random() - 0.5) * 0.5,
        a:  0.3 + Math.random() * 0.55,
        t:  Math.random() * Math.PI * 2,
    }));

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const f of flakes) {
            ctx.globalAlpha = f.a;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(220, 238, 255, 1)';
            ctx.fill();

            f.t += 0.015;
            f.x += Math.sin(f.t) * f.drift + f.drift;
            f.y += f.v;

            if (f.y > canvas.height + 10) {
                f.y = -10;
                f.x = Math.random() * canvas.width;
            }
        }
        ctx.globalAlpha = 1;
        particleAnimId = requestAnimationFrame(draw);
    }

    canvas.classList.add('active');
    particleAnimId = requestAnimationFrame(draw);
}

/* Procedural star SVG for clear nights */
function buildStarsSVG(svgEl) {
    const W = window.innerWidth, H = window.innerHeight;
    svgEl.setAttribute('width', W);
    svgEl.setAttribute('height', H);
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const starCount = 160;
    let html = '';
    for (let i = 0; i < starCount; i++) {
        const x = (Math.random() * W).toFixed(1);
        const y = (Math.random() * H * 0.7).toFixed(1);    // mostly upper sky
        const r = (0.5 + Math.random() * 1.5).toFixed(2);
        const dur = (2.5 + Math.random() * 3.5).toFixed(1);
        const delay = (Math.random() * 4).toFixed(1);
        const opMin = (0.2 + Math.random() * 0.2).toFixed(2);
        const opMax = (0.7 + Math.random() * 0.3).toFixed(2);
        html += `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${opMax}">
            <animate attributeName="opacity" values="${opMax};${opMin};${opMax}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>
        </circle>`;
    }
    svgEl.innerHTML = html;
    svgEl.classList.add('active');
}

/* Warm glow orb for sunny/sunset themes */
function updateSunOrb(themeKey) {
    const orb = document.getElementById('wxSunOrb');
    if (!orb) return;

    if (themeKey === 'sunny') {
        orb.style.width  = '340px';
        orb.style.height = '340px';
        orb.style.top    = '-80px';
        orb.style.right  = '8%';
        orb.style.left   = 'auto';
        orb.style.background = 'radial-gradient(circle, rgba(251,191,36,0.35) 0%, rgba(251,191,36,0.12) 50%, transparent 80%)';
        orb.classList.add('active');
    } else if (themeKey === 'sunset') {
        orb.style.width  = '500px';
        orb.style.height = '340px';
        orb.style.top    = 'auto';
        orb.style.bottom = '-60px';
        orb.style.right  = '-40px';
        orb.style.left   = 'auto';
        orb.style.background = 'radial-gradient(circle, rgba(251,146,60,0.40) 0%, rgba(220,80,20,0.18) 45%, transparent 75%)';
        orb.classList.add('active');
    } else {
        orb.classList.remove('active');
        // Reset bottom to prevent leftover positioning
        orb.style.bottom = 'auto';
    }
}

/* ════════════════════════════════════════════════════════════════════════
   SECTION 1 — CONFIG & HELPERS
   ════════════════════════════════════════════════════════════════════════ */

const API_KEY = 'c3316f6e0a47a2caaa4e93ca977005cb';

const PH_CENTER = [12.5, 122.0];
const PH_ZOOM   = 6;

/** Popular Philippine cities — hardcoded coords skip 5 geocoding round-trips. */
const POPULAR_CITIES = [
    { name: 'Manila',      state: 'Metro Manila',     country: 'PH', lat: 14.5995, lon: 120.9842 },
    { name: 'Cebu City',   state: 'Central Visayas',  country: 'PH', lat: 10.3157, lon: 123.8854 },
    { name: 'Davao City',  state: 'Davao Region',     country: 'PH', lat:  7.1907, lon: 125.4553 },
    { name: 'Baguio',      state: 'Cordillera',       country: 'PH', lat: 16.4023, lon: 120.5960 },
    { name: 'Iloilo City', state: 'Western Visayas',  country: 'PH', lat: 10.7202, lon: 122.5621 }
];

/* Fetches use OWM directly. */
const WMO_DESC = {
    0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'fog', 48: 'icy fog',
    51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
    56: 'light freezing drizzle', 57: 'heavy freezing drizzle',
    61: 'light rain', 63: 'rain', 65: 'heavy rain',
    66: 'light freezing rain', 67: 'heavy freezing rain',
    71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
    80: 'light rain showers', 81: 'rain showers', 82: 'heavy rain showers',
    85: 'snow showers', 86: 'heavy snow showers',
    95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'heavy thunderstorm with hail'
};

function wmoDescription(code) { return WMO_DESC[code] ?? 'unknown conditions'; }

function wmoIcon(code, isDay) {
    const d = isDay ? 'd' : 'n';
    if (code === 0)                 return `01${d}`;
    if (code <= 2)                  return `02${d}`;
    if (code === 3)                 return `04${d}`;
    if (code === 45 || code === 48) return `50${d}`;
    if (code >= 51 && code <= 57)   return `09${d}`;
    if (code >= 61 && code <= 67)   return `10${d}`;
    if (code >= 71 && code <= 77)   return `13${d}`;
    if (code >= 80 && code <= 82)   return `09${d}`;
    if (code === 85 || code === 86) return `13${d}`;
    if (code >= 95)                 return `11${d}`;
    return `01${d}`;
}

function uvInfo(uvi) {
    if (uvi < 3)  return { level: 'Low',       cls: 'uv-low'      };
    if (uvi < 6)  return { level: 'Moderate',  cls: 'uv-moderate' };
    if (uvi < 8)  return { level: 'High',      cls: 'uv-high'     };
    if (uvi < 11) return { level: 'Very High', cls: 'uv-veryhigh' };
    return            { level: 'Extreme',   cls: 'uv-extreme'  };
}

function parseLocalISOToUnix(localISO, utcOffsetSec) {
    return (Date.parse(localISO + 'Z') - utcOffsetSec * 1000) / 1000;
}

function fmtDateTimeInTZ(unix, offsetSeconds) {
    const shifted = new Date((unix + offsetSeconds) * 1000);
    return {
        date: shifted.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
        }),
        time: shifted.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
        })
    };
}

function fmtTimeInTZ(unix, offsetSeconds) {
    const shifted = new Date((unix + offsetSeconds) * 1000);
    return shifted.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function fmtForecastDay(dateStr, index) {
    if (index === 0) return 'Today';
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function fmtChartTime(unix, offsetSeconds) {
    const shifted = new Date((unix + offsetSeconds) * 1000);
    return shifted.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, timeZone: 'UTC' });
}

function windDir(deg) {
    if (deg == null) return '';
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
}

function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; }

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/** Normalise cache keys so "Manila" and "manila, philippines" dedupe better. */
function normalizeCacheKey(raw) {
    return raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/,\s*philippines$/i, '').trim();
}


/* ════════════════════════════════════════════════════════════════════════
   SECTION 2 — PERFORMANCE UTILITIES
   ════════════════════════════════════════════════════════════════════════ */

const CACHE_TTL_MS      = 10 * 60 * 1000;
const CACHE_STORAGE_KEY = 'wn_cache_v4';
const GEO_CACHE_TTL_MS  = 30 * 60 * 1000;
const GEO_CACHE_KEY     = 'wn_geo_v1';
const RECENT_STORAGE_KEY = 'wn_recent_v1';

const resultCache = new Map();
const geoCache    = new Map();
const iconCache   = new Set();

(function hydrateCache() {
    try {
        const raw = localStorage.getItem(CACHE_STORAGE_KEY);
        if (raw) {
            const stored = JSON.parse(raw);
            const now = Date.now();
            for (const [key, entry] of Object.entries(stored)) {
                if (now - entry.timestamp < CACHE_TTL_MS) resultCache.set(key, entry);
            }
        }
        const geoRaw = localStorage.getItem(GEO_CACHE_KEY);
        if (geoRaw) {
            const stored = JSON.parse(geoRaw);
            const now = Date.now();
            for (const [key, entry] of Object.entries(stored)) {
                if (now - entry.timestamp < GEO_CACHE_TTL_MS) geoCache.set(key, entry.data);
            }
        }
    } catch { /* fail silently */ }
})();

function getCached(key) {
    const entry = resultCache.get(normalizeCacheKey(key));
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        resultCache.delete(normalizeCacheKey(key));
        persistCache();
        return null;
    }
    return entry;
}

function setCached(key, payload) {
    const nk = normalizeCacheKey(key);
    resultCache.set(nk, { ...payload, timestamp: Date.now() });
    persistCache();
}

function persistCache() {
    try {
        const now = Date.now();
        const obj = {};
        for (const [key, entry] of resultCache) {
            if (now - entry.timestamp < CACHE_TTL_MS) obj[key] = entry;
        }
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
    } catch { /* quota */ }
}

function getGeoCached(query) {
    const key = query.trim().toLowerCase();
    return geoCache.get(key) ?? null;
}

function setGeoCached(query, data) {
    const key = query.trim().toLowerCase();
    geoCache.set(key, data);
    try {
        const obj = {};
        for (const [k, v] of geoCache) obj[k] = { data: v, timestamp: Date.now() };
        localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(obj));
    } catch { /* quota */ }
}

async function fetchWithRetry(url, opts = {}, maxTries = 2) {
    const RETRYABLE = new Set([429, 500, 502, 503, 504]);
    let lastErr;
    for (let attempt = 0; attempt < maxTries; attempt++) {
        try {
            const res = await fetch(url, opts);
            if (!res.ok && RETRYABLE.has(res.status) && attempt < maxTries - 1) {
                await delay(300 * 2 ** attempt);
                continue;
            }
            return res;
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            lastErr = err;
            if (attempt < maxTries - 1) await delay(300 * 2 ** attempt);
        }
    }
    throw lastErr ?? new Error('Network request failed after retries.');
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function preloadWeatherIcon(iconCode) {
    const href = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
    if (iconCache.has(href)) return;
    iconCache.add(href);
    const img = new Image();
    img.src = href;
}

const fcObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('fc-visible');
            fcObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1 });


/* ════════════════════════════════════════════════════════════════════════
   SECTION 3 — LAZY LEAFLET LOADER
   ════════════════════════════════════════════════════════════════════════ */

let leafletReady = null;
let PH_BOUNDS = null;

function loadLeaflet() {
    if (leafletReady) return leafletReady;
    leafletReady = new Promise((resolve, reject) => {
        if (window.L) { initPHBounds(); resolve(window.L); return; }
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        document.head.appendChild(css);
        const js = document.createElement('script');
        js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        js.onload = () => { initPHBounds(); resolve(window.L); };
        js.onerror = () => reject(new Error('Failed to load map library.'));
        document.head.appendChild(js);
    });
    return leafletReady;
}

function initPHBounds() {
    PH_BOUNDS = L.latLngBounds(L.latLng(4.5, 114.0), L.latLng(21.5, 127.0));
}


/* ════════════════════════════════════════════════════════════════════════
   SECTION 4 — VIEW SWITCHER
   ════════════════════════════════════════════════════════════════════════ */

const viewWeather = document.getElementById('view-weather');
const viewMap     = document.getElementById('view-map');

async function switchView(target, mapArgs = null) {
    if (target === 'map') {
        viewWeather.classList.add('hidden');
        viewMap.classList.remove('hidden');
        await ensureMapInitialized();
        if (mapArgs) showMapWithLocation(mapArgs);
    } else {
        viewMap.classList.add('hidden');
        viewWeather.classList.remove('hidden');
    }
}

document.getElementById('openMapBtn').addEventListener('click', () => switchView('map'));
document.getElementById('closeMapBtn').addEventListener('click', () => switchView('weather'));
document.getElementById('viewMapBtn').addEventListener('click', () => {
    switchView('map', lastLocResult || null);
});
document.getElementById('weatherLinkBtn').addEventListener('click', () => {
    if (lastMapWeatherQuery) {
        switchView('weather');
        locationInput.value = lastMapWeatherQuery;
        handleSearch(lastMapWeatherQuery);
    }
});


/* ════════════════════════════════════════════════════════════════════════
   SECTION 5 — WEATHER: SEARCH, FETCH, RENDER
   ════════════════════════════════════════════════════════════════════════ */

const locationInput      = document.getElementById('locationInput');
const searchBtn          = document.getElementById('searchBtn');
const loadingState       = document.getElementById('loadingState');
const errorState         = document.getElementById('errorState');
const errorText          = document.getElementById('errorText');
const weatherCard        = document.getElementById('weatherCard');
const weatherContent     = document.getElementById('weatherContent');
const weatherSkeleton    = document.getElementById('weatherSkeleton');
const forecastSection    = document.getElementById('forecastSection');
const forecastRow        = document.getElementById('forecastRow');
const wxSplash           = document.getElementById('wxSplash');
const wxRightPlaceholder = document.getElementById('wxRightPlaceholder');
const weatherSuggestList = document.getElementById('weatherSuggestList');
const mapPreviewImg      = document.getElementById('mapPreviewImg');
const mapPreviewPlaceholder = document.getElementById('mapPreviewPlaceholder');
const chartWrap          = document.getElementById('chartWrap');
const chartPlaceholder   = document.getElementById('chartPlaceholder');
const hourlyChart        = document.getElementById('hourlyChart');
const chartLabels        = document.getElementById('chartLabels');
const rainRow            = document.getElementById('rainRow');
const popularCitiesList  = document.getElementById('popularCitiesList');

const elLocationName  = document.getElementById('locationName');
const elLocationDate  = document.getElementById('locationDate');
const elWeatherIcon   = document.getElementById('weatherIconImg');
const elTempValue     = document.getElementById('tempValue');
const elWxDescription = document.getElementById('wxDescription');
const elFeelsLike     = document.getElementById('feelsLike');
const elHumidity      = document.getElementById('dHumidity');
const elPrecip        = document.getElementById('dPrecip');
const elWind          = document.getElementById('dWind');
const elPressure      = document.getElementById('dPressure');
const elVisibility    = document.getElementById('dVisibility');
const elUVI           = document.getElementById('dUVI');
const elDewPoint      = document.getElementById('dDewPoint');
const elSunrise       = document.getElementById('dSunrise');
const elSunset        = document.getElementById('dSunset');
const elGust          = document.getElementById('dGust');
const elClouds        = document.getElementById('dClouds');

const DEBOUNCE_MS        = 400;
const MIN_LIVE_QUERY_LEN = 3;

let activeRequest = null;
let debounceTimer = null;
let lastLocResult = null;

searchBtn.addEventListener('click', () => {
    clearTimeout(debounceTimer);
    hideWeatherSuggestions();
    handleSearch(locationInput.value);
});

locationInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        hideWeatherSuggestions();
        handleSearch(locationInput.value);
    }
    if (e.key === 'Escape') hideWeatherSuggestions();
});

locationInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = locationInput.value.trim();
    if (query.length === 0) {
        hideWeatherSuggestions();
        if (activeRequest) { activeRequest.abort(); activeRequest = null; }
        setUI('idle');
        return;
    }
    if (query.length < MIN_LIVE_QUERY_LEN) { hideWeatherSuggestions(); return; }
    debounceTimer = setTimeout(() => fetchWeatherSuggestions(query), DEBOUNCE_MS);
});

document.addEventListener('click', (e) => {
    if (!weatherSuggestList.contains(e.target) && e.target !== locationInput) hideWeatherSuggestions();
});

weatherSuggestList.addEventListener('click', (e) => {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    locationInput.value = item.dataset.label;
    hideWeatherSuggestions();
    clearTimeout(debounceTimer);
    handleSearch(item.dataset.label);
});

let weatherSuggestController = null;

async function fetchWeatherSuggestions(query) {
    if (weatherSuggestController) weatherSuggestController.abort();
    const controller = new AbortController();
    weatherSuggestController = controller;

    try {
        const biasedQuery = /philippines/i.test(query) ? query : `${query}, Philippines`;
        const cached = getGeoCached(biasedQuery);
        if (cached) {
            if (!controller.signal.aborted) renderWeatherSuggestions(cached);
            return;
        }

        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(biasedQuery)}&limit=5&appid=${API_KEY}`;
        const res = await fetchWithRetry(url, { signal: controller.signal });
        if (!res.ok) { hideWeatherSuggestions(); return; }

        const results = await res.json();
        if (controller.signal.aborted) return;

        if (Array.isArray(results) && results.length > 0) {
            setGeoCached(biasedQuery, results);
            renderWeatherSuggestions(results);
        } else {
            hideWeatherSuggestions();
        }
    } catch (err) {
        if (err.name !== 'AbortError') hideWeatherSuggestions();
    } finally {
        if (weatherSuggestController === controller) weatherSuggestController = null;
    }
}

function renderWeatherSuggestions(results) {
    weatherSuggestList.innerHTML = '';
    results.forEach((r) => {
        const label = [r.name, r.state, r.country].filter(Boolean).join(', ');
        const li = document.createElement('li');
        li.className = 'suggest-item';
        li.textContent = label;
        li.dataset.label = label;
        weatherSuggestList.appendChild(li);
    });
    weatherSuggestList.classList.remove('hidden');
}

function hideWeatherSuggestions() {
    weatherSuggestList.classList.add('hidden');
    weatherSuggestList.innerHTML = '';
}

(function runDeepLinkedSearch() {
    const q = new URLSearchParams(window.location.search).get('q');
    if (!q) return;
    locationInput.value = q;
    handleSearch(q);
})();

async function handleSearch(rawQuery, { silent = false } = {}) {
    const query = (rawQuery ?? locationInput.value).trim();

    if (!query) {
        showError('Enter a location name (e.g. Naguilian, La Union).');
        return;
    }
    if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
        showError('No API key set. Open script.js and replace YOUR_API_KEY_HERE with your OWM key.');
        return;
    }

    const cacheKey = normalizeCacheKey(query);
    const cached = getCached(cacheKey);
    if (cached) {
        if (activeRequest) activeRequest.abort();
        renderWeather(cached.current, cached.loc, cached.timezoneOffset, cached.hourly);
        renderForecast(cached.forecast);
        renderHourlyChart(cached.hourly, cached.timezoneOffset);
        updateMapPreview(cached.loc.lat, cached.loc.lon);
        applyWeatherTheme(cached.current, cached.timezoneOffset);
        setUI('result');
        return;
    }

    if (activeRequest) activeRequest.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const signal = controller.signal;

    setUI('loading');

    try {
        /* ── Resolve coordinates ─────────────────────────────────────────
         * 1. Check if query matches a popular city (instant, zero network).
         * 2. Otherwise, fall back to geocoding API.
         */
        let lat, lon, name, state, country;

        const knownCity = resolveKnownCity(query);
        if (knownCity) {
            ({ lat, lon, name, state, country } = knownCity);
        } else {
            const geoURL = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${API_KEY}`;
            const geoRes = await fetchWithRetry(geoURL, { signal });
            if (!geoRes.ok) throw new Error(`Geocoding error (HTTP ${geoRes.status}). Check your API key.`);

            const geoData = await geoRes.json();
            if (!Array.isArray(geoData) || geoData.length === 0) {
                throw new Error(`Location not found: "${query}". Try a different spelling or add the province.`);
            }
            ({ lat, lon, name, state, country } = geoData[0]);
        }

        // Fire map preview tile download in parallel with the weather API calls
        updateMapPreview(lat, lon);

        /* ── Fetch current weather + 5-day forecast in PARALLEL ──────── */
        const currentURL  = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;
        const forecastURL = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;

        const [curRes, fcRes] = await Promise.all([
            fetchWithRetry(currentURL, { signal }),
            fetchWithRetry(forecastURL, { signal })
        ]);

        if (!curRes.ok) throw new Error(`Weather API error (HTTP ${curRes.status}). Try again later.`);
        if (!fcRes.ok)  throw new Error(`Forecast API error (HTTP ${fcRes.status}). Try again later.`);

        const [curData, fcData] = await Promise.all([curRes.json(), fcRes.json()]);

        const tzOffset = curData.timezone ?? 0;   // seconds east of UTC
        const ow       = curData;

        const current = {
            dt:         ow.dt,
            sunrise:    ow.sys.sunrise,
            sunset:     ow.sys.sunset,
            temp:       ow.main.temp,
            feels_like: ow.main.feels_like,
            pressure:   ow.main.pressure,
            humidity:   ow.main.humidity,
            dew_point:  ow.main.dew_point ?? estimateDewPoint(ow.main.temp, ow.main.humidity),
            uvi:        null,   // OWM free tier doesn't include UVI in /weather
            clouds:     ow.clouds?.all ?? 0,
            visibility: ow.visibility ?? 10000,
            wind_speed: (ow.wind?.speed ?? 0),          // m/s
            wind_gust:  ow.wind?.gust ?? null,
            wind_deg:   ow.wind?.deg ?? null,
            precip:     ow.rain?.['1h'] ?? ow.rain?.['3h'] ?? 0,
            weather: [{
                id:          ow.weather[0].id,
                description: ow.weather[0].description,
                icon:        ow.weather[0].icon
            }]
        };

        /* ── Build 5-day daily forecast from 3-hour list ───────────── */
        const forecast = buildDailyForecast(fcData.list, tzOffset);

        /* ── Build hourly summary from 3-hour forecast ────────────── */
        const hourly = buildHourlyFromForecast(fcData.list, tzOffset);

        const loc = { name: name || ow.name, state, country: country || ow.sys.country, lat, lon };
        preloadWeatherIcon(current.weather[0].icon);
        setCached(cacheKey, { current, forecast, hourly, loc, timezoneOffset: tzOffset });
        lastLocResult = { lat, lon, name: loc.name, state, country: loc.country };

        renderWeather(current, loc, tzOffset, hourly);
        renderForecast(forecast);
        renderHourlyChart(hourly, tzOffset);
        applyWeatherTheme(current, tzOffset);
        setUI('result');

    } catch (err) {
        if (err.name === 'AbortError') return;
        const isUnknownLocation = /^Location not found/.test(err.message);
        if (silent && isUnknownLocation) { setUI('idle'); return; }
        showError(err.message);
    } finally {
        if (activeRequest === controller) activeRequest = null;
    }
}

/** Estimate dew point from temperature and humidity (Magnus formula). */
function estimateDewPoint(tempC, rh) {
    const a = 17.27, b = 237.7;
    const alpha = (a * tempC) / (b + tempC) + Math.log(rh / 100);
    return Math.round((b * alpha) / (a - alpha));
}

/** Build daily forecast from OWM 3-hour list by grouping per calendar day. */
function buildDailyForecast(list, tzOffset) {
    const dayMap = new Map();
    for (const item of list) {
        const shifted = new Date((item.dt + tzOffset) * 1000);
        const dateKey = shifted.toISOString().slice(0, 10);
        if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
        dayMap.get(dateKey).push(item);
    }
    const forecast = [];
    for (const [dateStr, items] of dayMap) {
        if (forecast.length >= 5) break;
        const temps = items.map(i => i.main.temp);
        const totalPrecip = items.reduce((s, i) => s + (i.rain?.['3h'] ?? 0), 0);
        const winds = items.map(i => i.wind?.speed ?? 0);
        // Pick the most common weather condition (the mode of weather IDs)
        const midItem = items[Math.floor(items.length / 2)];
        forecast.push({
            date:    dateStr,
            code:    midItem.weather[0].id,
            icon:    midItem.weather[0].icon.replace(/n$/, 'd'),  // always show day icon for daily
            desc:    midItem.weather[0].description,
            tempMax: Math.round(Math.max(...temps)),
            tempMin: Math.round(Math.min(...temps)),
            precip:  totalPrecip,
            windMax: Math.max(...winds),
            uvMax:   null,
        });
    }
    return forecast;
}

/** Build hourly-style data from OWM 3-hour forecast (take next 10 slots). */
function buildHourlyFromForecast(list, tzOffset) {
    const nowUnix = Math.floor(Date.now() / 1000);
    const upcoming = list.filter(item => item.dt >= nowUnix - 3600);
    return upcoming.slice(0, 10).map(item => ({
        unix:     item.dt,
        temp:     item.main.temp,
        code:     item.weather[0].id,
        icon:     item.weather[0].icon,
        rainProb: Math.round((item.pop ?? 0) * 100),
    }));
}

/* Legacy: keep for old cached Open-Meteo data still in localStorage */
function buildHourlySlice(hourly, tzOffset, currentTimeISO) {
    if (!hourly?.time) return [];
    const nowIdx = hourly.time.findIndex(t => t >= currentTimeISO);
    const start = Math.max(0, nowIdx === -1 ? 0 : nowIdx);
    return hourly.time.slice(start, start + 10).map((time, i) => ({
        time,
        unix: parseLocalISOToUnix(time, tzOffset),
        temp: hourly.temperature_2m[start + i],
        code: hourly.weather_code[start + i],
        rainProb: hourly.precipitation_probability?.[start + i] ?? 0,
    }));
}

function renderWeather(c, loc, timezoneOffset, hourly) {
    const locParts = [loc.name, loc.state, loc.country].filter(Boolean);
    elLocationName.textContent = locParts.join(', ');

    const { date, time } = fmtDateTimeInTZ(c.dt, timezoneOffset);
    elLocationDate.textContent = time;

    const iconSrc = `https://openweathermap.org/img/wn/${c.weather[0].icon}@2x.png`;
    elWeatherIcon.src = iconSrc;
    elWeatherIcon.alt = c.weather[0].description;

    elTempValue.textContent     = Math.round(c.temp);
    elWxDescription.textContent = capitalize(c.weather[0].description);
    elFeelsLike.textContent     = `Feels like ${Math.round(c.feels_like)}°C`;

    elHumidity.textContent = `${c.humidity}%`;
    elPrecip.textContent   = c.precip > 0 ? `${c.precip.toFixed(1)} mm` : '—';
    elWind.textContent     = `${(c.wind_speed * 3.6).toFixed(1)} km/h ${windDir(c.wind_deg)}`;
    elPressure.textContent   = `${c.pressure} hPa`;
    elVisibility.textContent = `${(c.visibility / 1000).toFixed(1)} km`;
    elDewPoint.textContent   = `${Math.round(c.dew_point)}°C`;
    elSunrise.textContent    = fmtTimeInTZ(c.sunrise, timezoneOffset);
    elSunset.textContent     = fmtTimeInTZ(c.sunset, timezoneOffset);
    elGust.textContent       = c.wind_gust != null ? `${(c.wind_gust * 3.6).toFixed(1)} km/h` : 'N/A';
    elClouds.textContent     = `${c.clouds}%`;

    if (c.uvi == null) {
        elUVI.textContent = 'N/A';
    } else {
        const { level, cls } = uvInfo(c.uvi);
        elUVI.innerHTML = `<span class="${cls}">${Math.round(c.uvi)}</span>`;
    }
}

function renderForecast(forecast) {
    const frag = document.createDocumentFragment();

    forecast.slice(0, 5).forEach((day, i) => {
        const label    = fmtForecastDay(day.date, i);
        // Use OWM icon directly if available, otherwise fall back to WMO mapping
        const iconCode = day.icon ?? wmoIcon(day.code, 1);
        const desc     = capitalize(day.desc ?? wmoDescription(day.code));
        const maxTemp  = Math.round(day.tempMax);
        const minTemp  = Math.round(day.tempMin);
        const precip   = day.precip > 0 ? `${day.precip.toFixed(1)}mm` : '—';

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
            <img class="fc-icon" src="https://openweathermap.org/img/wn/${iconCode}@2x.png"
                 alt="${escapeHTML(desc)}" loading="lazy" decoding="async" width="34" height="34" />
            <p class="fc-day">${label}</p>
            <p class="fc-desc">${escapeHTML(desc)}</p>
            <div class="fc-temps">
                <span class="fc-max">${maxTemp}°</span>
                <span class="fc-min">${minTemp}°</span>
            </div>
            <div class="fc-meta">🌧 ${precip}</div>
        `;
        fcObserver.observe(card);
        frag.appendChild(card);
    });

    forecastRow.replaceChildren(frag);
    wxRightPlaceholder.classList.add('hidden');
}

function renderHourlyChart(hourly, tzOffset) {
    if (!hourly?.length) {
        chartWrap.classList.add('hidden');
        chartPlaceholder.classList.remove('hidden');
        return;
    }

    chartWrap.classList.remove('hidden');
    chartPlaceholder.classList.add('hidden');

    const temps = hourly.map(h => h.temp);
    const minT  = Math.min(...temps) - 1;
    const maxT  = Math.max(...temps) + 1;
    const range = maxT - minT || 1;
    const W = 600, H = 100, padY = 12;

    const points = hourly.map((h, i) => {
        const x = (i / (hourly.length - 1 || 1)) * W;
        const y = padY + (1 - (h.temp - minT) / range) * (H - padY * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const areaPath = `M0,${H} L${points.join(' L')} L${W},${H} Z`;
    const linePath = `M${points.join(' L')}`;

    hourlyChart.innerHTML = `
        <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="rgba(56,189,248,0.45)"/>
                <stop offset="100%" stop-color="rgba(56,189,248,0.02)"/>
            </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#chartGrad)"/>
        <path d="${linePath}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${hourly.map((h, i) => {
            const x = (i / (hourly.length - 1 || 1)) * W;
            const y = padY + (1 - (h.temp - minT) / range) * (H - padY * 2);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#fff" stroke="#38bdf8" stroke-width="1.5"/>`;
        }).join('')}
    `;

    chartLabels.innerHTML = hourly.map((h, i) =>
        `<span>${i === 0 ? 'Now' : fmtChartTime(h.unix, tzOffset)}</span>`
    ).join('');

    rainRow.innerHTML =
        `<div class="rain-label">Rain %</div>` +
        `<div class="rain-cells">${hourly.map(h => `<span class="rain-cell">${Math.round(h.rainProb)}%</span>`).join('')}</div>`;
}

function updateMapPreview(lat, lon) {
    const zoom = 10;
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    mapPreviewImg.src = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
    mapPreviewImg.classList.remove('hidden');
    mapPreviewPlaceholder.classList.add('hidden');
}

function setUI(state) {
    loadingState.classList.add('hidden');
    searchBtn.disabled = false;

    if (state === 'loading') {
        errorState.classList.add('hidden');
        loadingState.classList.remove('hidden');
        searchBtn.disabled = true;
        wxSplash.classList.add('hidden');
        weatherContent.classList.add('hidden');
        weatherSkeleton.classList.remove('hidden');
    } else if (state === 'error') {
        errorState.classList.remove('hidden');
        weatherContent.classList.add('hidden');
        weatherSkeleton.classList.add('hidden');
        wxSplash.classList.remove('hidden');
        wxRightPlaceholder.classList.remove('hidden');
        forecastRow.replaceChildren();
        chartWrap.classList.add('hidden');
        chartPlaceholder.classList.remove('hidden');
    } else if (state === 'result') {
        errorState.classList.add('hidden');
        wxSplash.classList.add('hidden');
        weatherSkeleton.classList.add('hidden');
        weatherContent.classList.remove('hidden');
        wxRightPlaceholder.classList.add('hidden');
    }
}

function showError(msg) {
    errorText.textContent = msg;
    setUI('error');
}


/* ════════════════════════════════════════════════════════════════════════
   SECTION 6 — POPULAR CITIES (single batched request)
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Resolve a search query against the hardcoded POPULAR_CITIES list.
 * Returns the city object if matched, otherwise null.
 */
function resolveKnownCity(query) {
    const q = query.trim().toLowerCase().replace(/,\s*philippines$/i, '').replace(/\s+/g, ' ').trim();
    return POPULAR_CITIES.find(c => {
        const variants = [
            c.name.toLowerCase(),
            `${c.name}, ${c.state}`.toLowerCase(),
            `${c.name}, ${c.state}, ${c.country}`.toLowerCase(),
            `${c.name}, ${c.country}`.toLowerCase(),
        ];
        return variants.some(v => v === q);
    }) ?? null;
}

/**
 * Fetch all popular cities' current weather in ONE batched Open-Meteo call.
 * Before: 5 geocoding + 5 weather requests = 10 HTTP round-trips.
 * After:  1 weather request = 1 HTTP round-trip.
 */
async function prefetchPopularCities() {
    // Check if we already have all cities cached
    const allCached = POPULAR_CITIES.every(c => getCached(c.name));
    if (allCached) {
        renderPopularCitiesFromCache();
        return;
    }

    try {
        /* Fetch all 5 cities in PARALLEL from OWM — 5 lightweight requests
         * that run concurrently finish faster than 1 large batch request. */
        const promises = POPULAR_CITIES.map(async (city) => {
            try {
                const url = `https://api.openweathermap.org/data/2.5/weather?lat=${city.lat}&lon=${city.lon}&units=metric&appid=${API_KEY}`;
                const res = await fetchWithRetry(url);
                if (!res.ok) return null;
                const ow = await res.json();
                return {
                    name: [city.name, city.state].filter(Boolean).join(', '),
                    temp: Math.round(ow.main.temp),
                    desc: ow.weather[0].description,
                    icon: ow.weather[0].icon,
                    query: [city.name, city.state, city.country].filter(Boolean).join(', ')
                };
            } catch { return null; }
        });

        const snapshots = await Promise.all(promises);
        renderPopularCities(snapshots);
    } catch {
        renderPopularCitiesFromCache();
    }
}

function renderPopularCitiesFromCache() {
    const snapshots = POPULAR_CITIES.map(city => {
        const cached = getCached(city.name);
        if (!cached) return null;
        const c = cached.current;
        const loc = cached.loc;
        return {
            name: [loc.name, loc.state].filter(Boolean).join(', '),
            temp: Math.round(c.temp),
            desc: c.weather[0].description,
            icon: c.weather[0].icon,
            query: [loc.name, loc.state, loc.country].filter(Boolean).join(', ')
        };
    });
    if (snapshots.some(Boolean)) renderPopularCities(snapshots);
}

function renderPopularCities(snapshots) {
    popularCitiesList.replaceChildren();
    snapshots.filter(Boolean).forEach((snap) => {
        const li = document.createElement('li');
        li.className = 'city-item';
        li.innerHTML = `
            <img class="city-icon" src="https://openweathermap.org/img/wn/${snap.icon}@2x.png"
                 alt="" loading="lazy" decoding="async" width="32" height="32" />
            <div class="city-info">
                <p class="city-name">${escapeHTML(snap.name)}</p>
                <p class="city-desc">${escapeHTML(capitalize(snap.desc))}</p>
            </div>
            <span class="city-temp">${snap.temp}°</span>
        `;
        li.addEventListener('click', () => {
            locationInput.value = snap.query;
            handleSearch(snap.query);
        });
        popularCitiesList.appendChild(li);
    });
}

if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(prefetchPopularCities, { timeout: 2000 });
} else {
    setTimeout(prefetchPopularCities, 800);
}


/* ════════════════════════════════════════════════════════════════════════
   SECTION 7 — MAP
   ════════════════════════════════════════════════════════════════════════ */

const mapSearchInput  = document.getElementById('mapSearchInput');
const mapSearchBtn    = document.getElementById('mapSearchBtn');
const locateBtn       = document.getElementById('locateBtn');
const mapLoadingState = document.getElementById('mapLoadingState');
const mapErrorState   = document.getElementById('mapErrorState');
const mapErrorText    = document.getElementById('mapErrorText');
const suggestList     = document.getElementById('suggestList');
const recentRow       = document.getElementById('recentRow');
const recentChips     = document.getElementById('recentChips');
const infoPanel       = document.getElementById('infoPanel');
const infoName        = document.getElementById('infoName');
const infoCoords      = document.getElementById('infoCoords');

let leafletMap      = null;
let activeMarker    = null;
let recentLocations = [];
let lastMapWeatherQuery = null;

(function hydrateRecent() {
    try {
        const raw = localStorage.getItem(RECENT_STORAGE_KEY);
        if (raw) recentLocations = JSON.parse(raw).slice(0, 6);
        renderRecent();
    } catch { /* fail silently */ }
})();

mapSearchBtn.addEventListener('click', () => runMapSearch(mapSearchInput.value));
mapSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  runMapSearch(mapSearchInput.value);
    if (e.key === 'Escape') hideSuggestions();
});
document.addEventListener('click', (e) => {
    if (!suggestList.contains(e.target) && e.target !== mapSearchInput) hideSuggestions();
});
suggestList.addEventListener('click', (e) => {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    selectPlace(JSON.parse(item.dataset.place));
    hideSuggestions();
});
locateBtn.addEventListener('click', useMyLocation);

async function ensureMapInitialized() {
    if (leafletMap) return;
    await loadLeaflet();
    initMap();
}

function initMap() {
    leafletMap = L.map('map', {
        zoomControl: true,
        minZoom: 5,
        maxZoom: 18,
        maxBounds: PH_BOUNDS,
        maxBoundsViscosity: 1.0
    }).setView(PH_CENTER, PH_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        subdomains: 'abc',
        maxZoom: 19
    }).addTo(leafletMap);

    leafletMap.on('click', (e) => reverseGeocode(e.latlng.lat, e.latlng.lng));
    requestAnimationFrame(() => leafletMap.invalidateSize());
}

function showMapWithLocation({ lat, lon, name, state, country }) {
    const latlng = L.latLng(lat, lon);
    const inBounds = PH_BOUNDS.contains(latlng);
    placePin({ lat: inBounds ? lat : PH_CENTER[0], lon: inBounds ? lon : PH_CENTER[1], name, state, country });
}

function pinIcon() {
    return L.divIcon({
        className: 'wx-pin',
        html: `<svg width="30" height="40" viewBox="0 0 34 44" fill="none"><path d="M17 43C17 43 32 27.5 32 16.5C32 7.94 25.06 1 17 1C8.94 1 2 7.94 2 16.5C2 27.5 17 43 17 43Z" fill="#ef4444" stroke="#fff" stroke-width="2"/><circle cx="17" cy="16" r="6" fill="#fff"/></svg>`,
        iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36]
    });
}

async function runMapSearch(rawQuery) {
    const query = (rawQuery ?? '').trim();
    hideSuggestions();
    if (!query) { showMapError('Enter a place name in the Philippines.'); return; }

    await ensureMapInitialized();
    setMapLoading(true);
    mapErrorState.classList.add('hidden');

    try {
        const biasedQuery = /philippines/i.test(query) ? query : `${query}, Philippines`;
        const cached = getGeoCached(biasedQuery);
        let results = cached;

        if (!results) {
            const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(biasedQuery)}&limit=5&appid=${API_KEY}`;
            const res = await fetchWithRetry(url);
            if (!res.ok) throw new Error(`Geocoding error (HTTP ${res.status}).`);
            results = await res.json();
            if (Array.isArray(results) && results.length) setGeoCached(biasedQuery, results);
        }

        if (!Array.isArray(results) || results.length === 0) {
            throw new Error(`No location found for "${query}".`);
        }

        const phResults = results.filter(r => PH_BOUNDS.contains(L.latLng(r.lat, r.lon)));
        const pool = phResults.length > 0 ? phResults : results;

        if (pool.length === 1) selectPlace(pool[0]);
        else showSuggestions(pool);
    } catch (err) {
        showMapError(err.message);
    } finally {
        setMapLoading(false);
    }
}

function showSuggestions(results) {
    suggestList.innerHTML = '';
    results.forEach((r) => {
        const li = document.createElement('li');
        li.className = 'suggest-item';
        li.textContent = [r.name, r.state, r.country].filter(Boolean).join(', ');
        li.dataset.place = JSON.stringify(r);
        suggestList.appendChild(li);
    });
    suggestList.classList.remove('hidden');
}

function hideSuggestions() {
    suggestList.classList.add('hidden');
    suggestList.innerHTML = '';
}

function selectPlace(place) {
    const { lat, lon, name, state, country } = place;
    placePin({ lat, lon, name, state, country });
    mapSearchInput.value = [name, state, country].filter(Boolean).join(', ');
}

async function reverseGeocode(lat, lon) {
    await ensureMapInitialized();
    setMapLoading(true);
    mapErrorState.classList.add('hidden');
    try {
        const url = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`;
        const res = await fetchWithRetry(url);
        if (!res.ok) throw new Error(`Geocoding error (HTTP ${res.status}).`);
        const results = await res.json();
        const place = results[0];
        if (place) placePin({ lat, lon, name: place.name, state: place.state, country: place.country });
        else placePin({ lat, lon, name: null, state: null, country: null });
    } catch (err) {
        showMapError(err.message);
    } finally {
        setMapLoading(false);
    }
}

function useMyLocation() {
    if (!navigator.geolocation) { showMapError('Geolocation is not supported.'); return; }
    setMapLoading(true);
    mapErrorState.classList.add('hidden');
    navigator.geolocation.getCurrentPosition(
        (pos) => reverseGeocode(pos.coords.latitude, pos.coords.longitude),
        () => { setMapLoading(false); showMapError('Could not access your location.'); },
        { timeout: 10000, maximumAge: 60000 }
    );
}

function placePin({ lat, lon, name, state, country }) {
    mapErrorState.classList.add('hidden');
    if (activeMarker) leafletMap.removeLayer(activeMarker);
    activeMarker = L.marker([lat, lon], { icon: pinIcon() }).addTo(leafletMap);

    const label = [name, state, country].filter(Boolean).join(', ') || 'Unnamed location';
    activeMarker.bindPopup(`<strong>${escapeHTML(label)}</strong><br>${lat.toFixed(4)}°, ${lon.toFixed(4)}°`).openPopup();

    leafletMap.flyTo([lat, lon], Math.max(leafletMap.getZoom(), 8), { duration: 1.0 });

    infoPanel.classList.remove('hidden');
    infoName.textContent   = label;
    infoCoords.textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
    lastMapWeatherQuery = label !== 'Unnamed location' ? label : `${lat},${lon}`;
    if (name) addRecent({ name: label, lat, lon });
}

function addRecent(entry) {
    recentLocations = recentLocations.filter(r => r.name !== entry.name);
    recentLocations.unshift(entry);
    recentLocations = recentLocations.slice(0, 6);
    try { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentLocations)); } catch { /* quota */ }
    renderRecent();
}

function renderRecent() {
    recentChips.innerHTML = '';
    recentLocations.forEach((r) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = r.name;
        chip.dataset.lat = r.lat;
        chip.dataset.lon = r.lon;
        recentChips.appendChild(chip);
    });
    recentRow.classList.toggle('hidden', recentLocations.length === 0);
}

recentChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    placePin({ lat: +chip.dataset.lat, lon: +chip.dataset.lon, name: chip.textContent });
});

function setMapLoading(isLoading) {
    mapLoadingState.classList.toggle('hidden', !isLoading);
    mapSearchBtn.disabled = isLoading;
    locateBtn.disabled = isLoading;
}

function showMapError(msg) {
    mapErrorText.textContent = msg;
    mapErrorState.classList.remove('hidden');
}