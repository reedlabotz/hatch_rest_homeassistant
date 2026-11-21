/**
 * Hatch Rest Custom Lovelace Cards (Mushroom-inspired, Theme-aware)
 *
 * Cards included:
 *  - custom:hatch-rest-program-card   (Live running program playtime & next schedule)
 *  - custom:hatch-rest-favorites-card (Mushroom-style favorite selector grid)
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SOUND_LABELS = {
  none: "No Sound",
  stream: "Stream",
  noise: "White Noise",
  dryer: "Dryer",
  ocean: "Ocean",
  wind: "Wind",
  rain: "Rain",
  bird: "Birds",
  crickets: "Crickets",
  brahms: "Brahms",
  twinkle: "Twinkle",
  rockabye: "Rockabye",
};

const SOUND_ICONS = {
  none: "mdi:volume-off",
  "no sound": "mdi:volume-off",
  stream: "mdi:waves",
  noise: "mdi:waveform",
  "white noise": "mdi:waveform",
  dryer: "mdi:fan",
  ocean: "mdi:waves",
  wind: "mdi:pine-tree",
  rain: "mdi:weather-pouring",
  bird: "mdi:bird",
  crickets: "mdi:bug",
  brahms: "mdi:music-note",
  twinkle: "mdi:star-four-points",
  rockabye: "mdi:weather-night",
};

let _svgUid = 0;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSoundName(sound) {
  if (!sound) return "No Sound";
  const key = String(sound).toLowerCase();
  if (SOUND_LABELS[key]) return SOUND_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

function getSoundIcon(sound) {
  if (!sound) return "mdi:music-note";
  return SOUND_ICONS[String(sound).toLowerCase()] || "mdi:music-note";
}

function isRainbowColor(color) {
  return (
    Array.isArray(color) &&
    color.length === 3 &&
    color[0] === 254 &&
    color[1] === 254 &&
    color[2] === 254
  );
}

function formatColorCss(color, brightness) {
  if (!Array.isArray(color) || color.length !== 3 || brightness === 0) {
    return null;
  }
  if (isRainbowColor(color)) {
    return "conic-gradient(from 0deg, #ff595e, #ffca3a, #8ac926, #1982c4, #6a4c93, #ff595e)";
  }
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

function formatClockTime(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatDurationHM(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

function formatDurationShort(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  if (mins > 0) return `${mins}m`;
  return `${secs}s`;
}

function deriveSiblingEntity(entityId, fromSuffix, newDomain, newSuffix) {
  if (!entityId || !entityId.includes(".")) return null;
  const [, objectId] = entityId.split(".", 2);
  if (objectId.endsWith(fromSuffix)) {
    const base = objectId.slice(0, -fromSuffix.length);
    return `${newDomain}.${base}${newSuffix}`;
  }
  return null;
}

function deriveDeviceTitle(stateObj, fallback) {
  const friendly = stateObj?.attributes?.friendly_name;
  if (!friendly) return fallback;
  return friendly
    .replace(/\s+(Programs|Favorite|Sleep Timer|Timer Ends|Switch|Light)$/i, "")
    .trim();
}

function parseHHMM(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const parts = timeStr.split(":");
  if (parts.length < 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function findRunningProgram(programs, now) {
  if (!Array.isArray(programs)) return null;

  const candidates = [];
  for (const prog of programs) {
    if (!prog || !prog.enabled || !prog.duration_seconds) continue;
    const parsed = parseHHMM(prog.time);
    if (!parsed) continue;
    const days = Array.isArray(prog.days) ? prog.days : [];
    const durationMs = prog.duration_seconds * 1000;

    for (const dayOffset of [0, -1]) {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + dayOffset,
        parsed.hour,
        parsed.minute,
        0,
        0
      );
      const dayName = DAY_NAMES[start.getDay()];
      if (!days.includes(dayName)) continue;
      const end = new Date(start.getTime() + durationMs);
      if (now >= start && now < end) {
        candidates.push({ prog, start, end });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.start.getTime() - a.start.getTime());
  return candidates[0];
}

function findNextProgram(programs, now) {
  if (!Array.isArray(programs)) return null;

  let best = null;
  for (const prog of programs) {
    if (!prog || !prog.enabled) continue;
    const parsed = parseHHMM(prog.time);
    if (!parsed) continue;
    const days = Array.isArray(prog.days) ? prog.days : [];
    if (days.length === 0) continue;

    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + offset,
        parsed.hour,
        parsed.minute,
        0,
        0
      );
      const dayName = DAY_NAMES[candidate.getDay()];
      if (!days.includes(dayName)) continue;
      if (candidate <= now) continue;

      if (!best || candidate < best.start) {
        best = { prog, start: candidate, dayOffset: offset };
      }
      break;
    }
  }
  return best;
}

/**
 * Resolve current light state (on/off, rgb_color, brightness 0..255)
 * from a light entity and optional power switch entity.
 */
function getLiveLightVisual(hass, lightEntityId, powerEntityId, fallbackProg) {
  const lightState = lightEntityId ? hass?.states?.[lightEntityId] : null;
  const powerState = powerEntityId ? hass?.states?.[powerEntityId] : null;

  if (lightState) {
    const powerOff = powerState ? powerState.state === "off" : false;
    const isLit = !powerOff && lightState.state === "on";
    const brightness = isLit
      ? Number(lightState.attributes?.brightness ?? 255)
      : 0;
    const isRainbow = lightState.attributes?.effect === "Rainbow";
    const rgb = isRainbow
      ? [254, 254, 254]
      : lightState.attributes?.rgb_color || [255, 190, 110];
    return { isLit: isLit && brightness > 0, rgb, brightness };
  }

  if (fallbackProg) {
    const b = Number(fallbackProg.brightness ?? 0);
    const rgb = fallbackProg.color || [255, 190, 110];
    return { isLit: b > 0, rgb, brightness: b };
  }

  return { isLit: false, rgb: null, brightness: 0 };
}

function getLiveSoundIcon(hass, mediaEntityId, powerEntityId, fallbackSound) {
  const powerState = powerEntityId ? hass?.states?.[powerEntityId] : null;
  if (powerState && powerState.state === "off") {
    return null;
  }

  const mediaState = mediaEntityId ? hass?.states?.[mediaEntityId] : null;
  if (mediaState && mediaState.state === "playing") {
    const src = mediaState.attributes?.source;
    if (src && String(src).toLowerCase() !== "none") {
      return getSoundIcon(src);
    }
  }

  if (fallbackSound && String(fallbackSound).toLowerCase() !== "none") {
    return getSoundIcon(fallbackSound);
  }
  return null;
}

/**
 * Render a mini Hatch Rest silhouette SVG that glows with the current color
 * and scales its luminance/glow with brightness (0..255), or looks off when unlit.
 */
function renderMiniHatchSvg({ isLit, rgb, brightness, size = 34 }) {
  const uid = ++_svgUid;
  const bNorm = isLit ? Math.max(0.15, Math.min(1, (brightness || 0) / 255)) : 0;
  const rainbow = isLit && isRainbowColor(rgb);

  let domeFill = isLit
    ? `url(#hatch-off-${uid})`
    : "color-mix(in srgb, var(--primary-text-color) 14%, var(--ha-card-background, var(--card-background-color, #475569)))";
  let domeStroke = isLit
    ? "color-mix(in srgb, var(--primary-text-color) 20%, transparent)"
    : "color-mix(in srgb, var(--primary-text-color) 16%, transparent)";
  let baseFill = `url(#hatch-base-${uid})`;
  let glowFilter = "none";
  let baseTopGlow = "transparent";
  let defs = `
    <linearGradient id="hatch-off-${uid}" x1="15%" y1="0%" x2="85%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.22)" />
      <stop offset="55%" stop-color="rgba(148,163,184,0.16)" />
      <stop offset="100%" stop-color="rgba(100,116,139,0.24)" />
    </linearGradient>
    <linearGradient id="hatch-base-${uid}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(203,213,225,0.72)" />
      <stop offset="30%" stop-color="rgba(241,245,249,0.92)" />
      <stop offset="70%" stop-color="rgba(226,232,240,0.85)" />
      <stop offset="100%" stop-color="rgba(148,163,184,0.72)" />
    </linearGradient>
  `;

  if (!isLit) {
    baseFill =
      "color-mix(in srgb, var(--primary-text-color) 22%, var(--ha-card-background, var(--card-background-color, #334155)))";
  }

  if (isLit && Array.isArray(rgb) && rgb.length === 3) {
    const [r, g, bl] = rgb;
    const coreOpacity = (0.45 + 0.55 * bNorm).toFixed(2);
    const midOpacity = (0.3 + 0.58 * bNorm).toFixed(2);
    const edgeOpacity = (0.2 + 0.55 * bNorm).toFixed(2);
    const glowAlpha = (0.22 + 0.55 * bNorm).toFixed(2);
    const glowRadius = (2.5 + 6.5 * bNorm).toFixed(1);

    if (rainbow) {
      defs += `
        <linearGradient id="hatch-grad-${uid}" x1="10%" y1="10%" x2="90%" y2="90%">
          <stop offset="0%" stop-color="#ff595e" stop-opacity="${coreOpacity}" />
          <stop offset="28%" stop-color="#ffca3a" stop-opacity="${coreOpacity}" />
          <stop offset="52%" stop-color="#8ac926" stop-opacity="${midOpacity}" />
          <stop offset="76%" stop-color="#1982c4" stop-opacity="${midOpacity}" />
          <stop offset="100%" stop-color="#6a4c93" stop-opacity="${edgeOpacity}" />
        </linearGradient>
      `;
      domeFill = `url(#hatch-grad-${uid})`;
      domeStroke = `rgba(255, 255, 255, ${(0.3 + 0.4 * bNorm).toFixed(2)})`;
      glowFilter = `drop-shadow(0 0 ${glowRadius}px rgba(168, 85, 247, ${glowAlpha}))`;
      baseTopGlow = `rgba(255, 202, 58, ${(0.25 + 0.35 * bNorm).toFixed(2)})`;
    } else {
      const brightR = Math.min(255, Math.round(r + (255 - r) * 0.52 * bNorm));
      const brightG = Math.min(255, Math.round(g + (255 - g) * 0.52 * bNorm));
      const brightB = Math.min(255, Math.round(bl + (255 - bl) * 0.52 * bNorm));
      const darkR = Math.round(r * 0.72);
      const darkG = Math.round(g * 0.72);
      const darkB = Math.round(bl * 0.72);

      defs += `
        <radialGradient id="hatch-grad-${uid}" cx="48%" cy="62%" r="65%">
          <stop offset="0%" stop-color="rgb(${brightR},${brightG},${brightB})" stop-opacity="${coreOpacity}" />
          <stop offset="58%" stop-color="rgb(${r},${g},${bl})" stop-opacity="${midOpacity}" />
          <stop offset="100%" stop-color="rgb(${darkR},${darkG},${darkB})" stop-opacity="${edgeOpacity}" />
        </radialGradient>
      `;
      domeFill = `url(#hatch-grad-${uid})`;
      domeStroke = `rgba(${brightR}, ${brightG}, ${brightB}, ${(0.35 + 0.45 * bNorm).toFixed(2)})`;
      glowFilter = `drop-shadow(0 0 ${glowRadius}px rgba(${r}, ${g}, ${bl}, ${glowAlpha}))`;
      baseTopGlow = `rgba(${r}, ${g}, ${bl}, ${(0.28 + 0.42 * bNorm).toFixed(2)})`;
    }
  }

  return `
    <svg
      width="${size}"
      height="${size}"
      viewBox="0 0 40 40"
      style="display:block;overflow:visible;filter:${glowFilter};"
      aria-hidden="true"
    >
      <defs>${defs}</defs>
      <!-- Soft surface shadow -->
      <ellipse cx="20" cy="35.2" rx="11.5" ry="1.8" fill="rgba(0,0,0,0.22)" />
      <!-- Translucent Hatch Rest Dome (parabolic capsule silhouette) -->
      <path
        d="M9.8 29 C9.8 21 11.4 10.5 14.4 7.6 C16.2 5.9 18 5.4 20 5.4 C22 5.4 23.8 5.9 25.6 7.6 C28.6 10.5 30.2 21 30.2 29 Z"
        fill="${domeFill}"
        stroke="${domeStroke}"
        stroke-width="0.9"
        stroke-linejoin="round"
      />
      <!-- Specular glass highlight on left curve -->
      <path
        d="M12.6 25.5 C12.7 19.2 13.8 11.8 16.2 9.1"
        fill="none"
        stroke="rgba(255,255,255,${isLit ? (0.3 + 0.35 * bNorm).toFixed(2) : "0.28"})"
        stroke-width="1.35"
        stroke-linecap="round"
      />
      <!-- Subtle speaker/touch seam between dome and base -->
      <rect
        x="9.5"
        y="28.3"
        width="21"
        height="1.3"
        rx="0.65"
        fill="rgba(15, 23, 42, 0.28)"
      />
      <!-- Matte Hatch Rest Base -->
      <path
        d="M9.3 29.4 L30.7 29.4 L31.2 33.1 C31.3 34.2 30.3 34.9 29.2 34.9 L10.8 34.9 C9.7 34.9 8.7 34.2 8.8 33.1 Z"
        fill="${baseFill}"
        stroke="rgba(100, 116, 139, 0.35)"
        stroke-width="0.7"
      />
      <!-- Light reflection on top edge of base when lit -->
      <line
        x1="10.5"
        y1="29.6"
        x2="29.5"
        y2="29.6"
        stroke="${baseTopGlow}"
        stroke-width="1.1"
        stroke-linecap="round"
      />
    </svg>
  `;
}

const SHARED_CARD_STYLES = `
  ha-card {
    container-type: inline-size;
    background: var(--ha-card-background, var(--card-background-color, #fff));
    border-radius: var(--ha-card-border-radius, 12px);
    border-width: var(--ha-card-border-width, 1px);
    border-style: solid;
    border-color: var(--ha-card-border-color, var(--divider-color, rgba(0, 0, 0, 0.12)));
    box-shadow: var(--ha-card-box-shadow, none);
    color: var(--primary-text-color);
    padding: 12px;
    overflow: hidden;
  }
  .mush-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .mush-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }
  .hatch-badge {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
    cursor: pointer;
    transition: transform 0.15s ease, background 0.2s ease;
  }
  .hatch-sound-overlay {
    position: absolute;
    left: 50%;
    top: 43%;
    width: 14px;
    height: 14px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    color: var(--primary-text-color);
    opacity: 0.62;
    line-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .hatch-sound-overlay.unlit {
    color: var(--secondary-text-color);
    opacity: 0.52;
  }
  .hatch-sound-overlay ha-icon {
    --mdc-icon-size: 13px;
  }
  .hatch-badge:hover {
    background: color-mix(in srgb, var(--primary-text-color) 11%, transparent);
  }
  .hatch-badge:active {
    transform: scale(0.95);
  }
  .mush-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }
  .mush-primary {
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    color: var(--primary-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mush-secondary {
    font-size: 12px;
    font-weight: 400;
    line-height: 16px;
    color: var(--secondary-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mush-icon-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
    color: var(--secondary-text-color);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
    padding: 0;
    transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
  }
  .mush-icon-btn:hover {
    background: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
    color: var(--primary-text-color);
  }
  .mush-icon-btn:active {
    transform: scale(0.94);
  }
  .mush-icon-btn.active {
    background: color-mix(in srgb, var(--btn-accent, var(--primary-color)) 16%, transparent);
    color: var(--btn-accent, var(--primary-color));
  }
  .mush-icon-btn ha-icon {
    --mdc-icon-size: 18px;
  }
  .mush-grid {
    display: grid;
    grid-template-columns: repeat(var(--mush-cols, 2), minmax(0, 1fr));
    gap: 10px;
  }
  @container (max-width: 380px) {
    .mush-grid {
      grid-template-columns: 1fr;
    }
  }
  .mush-fav {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--primary-text-color) 8%, transparent);
    background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
    color: var(--primary-text-color);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    min-width: 0;
    transition: background 0.15s ease, border-color 0.2s ease, transform 0.1s ease;
  }
  .mush-fav:hover {
    background: color-mix(in srgb, var(--primary-text-color) 10%, transparent);
  }
  .mush-fav:active {
    transform: scale(0.98);
  }
  .mush-fav.active {
    background: color-mix(in srgb, var(--fav-accent) 16%, transparent);
    border-color: color-mix(in srgb, var(--fav-accent) 55%, transparent);
  }
  .mush-fav-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
    gap: 2px;
  }
  .mush-meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mush-meta-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .mush-meta-item ha-icon {
    --mdc-icon-size: 13px;
  }
  .hatch-badge-sm {
    width: 36px;
    height: 36px;
    pointer-events: none;
  }
  .mush-playing-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fav-accent);
    flex-shrink: 0;
  }
  .mush-playing-badge ha-icon {
    --mdc-icon-size: 18px;
  }
`;

function filterFavoriteEntries(favState, { activeOption, hideEmpty = true, hideDisabled = true }) {
  const favoritesMap = favState?.attributes?.favorites || {};
  const options = Array.isArray(favState?.attributes?.options)
    ? favState.attributes.options.filter((o) => o !== "None")
    : [];

  let entries = Object.keys(favoritesMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((slot) => ({
      slot: Number(slot),
      ...favoritesMap[slot],
    }));

  if (entries.length === 0 && options.length > 0) {
    options.forEach((opt, idx) => {
      entries.push({
        slot: idx + 1,
        name: opt,
        color: null,
        brightness: null,
        sound: null,
        volume: null,
        enabled: true,
      });
    });
  } else {
    entries = entries.filter((fav) => {
      const optionName = fav.name || `Favorite ${fav.slot}`;
      if (activeOption === optionName) return true;
      if (hideDisabled && fav.enabled === false) return false;
      if (hideEmpty) {
        const noLight = fav.brightness === 0 || fav.brightness === null;
        const noSound = !fav.sound || String(fav.sound).toLowerCase() === "none" || fav.volume === 0;
        if (noLight && noSound) return false;
      }
      return true;
    });
  }
  return entries;
}

function renderFavoriteTilesHtml(entries, { activeOption, isOff, showDetails = true }) {
  return entries
    .map((fav) => {
      const optionName = fav.name || `Favorite ${fav.slot}`;
      const isActive = !isOff && activeOption === optionName;
      const colorCss = formatColorCss(fav.color, fav.brightness);
      const soundName = formatSoundName(fav.sound);
      const soundIcon = getSoundIcon(fav.sound);
      const volPct =
        typeof fav.volume === "number"
          ? `${Math.round((fav.volume / 255) * 100)}%`
          : "";
      const brightPct =
        typeof fav.brightness === "number"
          ? `${Math.round((fav.brightness / 255) * 100)}%`
          : "";

      const tileAccent =
        colorCss && !isRainbowColor(fav.color)
          ? `rgb(${fav.color[0]}, ${fav.color[1]}, ${fav.color[2]})`
          : "var(--primary-color)";

      const secondaryParts = [];
      if (fav.sound !== "none" && volPct) {
        secondaryParts.push(
          `<span class="mush-meta-item" title="${escapeHtml(soundName)}"><ha-icon icon="mdi:volume-medium"></ha-icon>${volPct}</span>`
        );
      }
      if (brightPct) {
        secondaryParts.push(
          `<span class="mush-meta-item" title="Brightness"><ha-icon icon="mdi:brightness-6"></ha-icon>${fav.brightness === 0 ? "Off" : brightPct}</span>`
        );
      }

      const favIsLit = Array.isArray(fav.color) && fav.brightness > 0;
      const favHatchSvg = renderMiniHatchSvg({
        isLit: favIsLit,
        rgb: fav.color,
        brightness: fav.brightness ?? 0,
        size: 30,
      });
      const favSoundOverlay =
        fav.sound && String(fav.sound).toLowerCase() !== "none"
          ? `<span class="hatch-sound-overlay ${favIsLit ? "" : "unlit"}"><ha-icon icon="${escapeHtml(soundIcon)}"></ha-icon></span>`
          : `<span class="hatch-sound-overlay unlit"><ha-icon icon="mdi:volume-off"></ha-icon></span>`;

      return `
        <button
          class="mush-fav ${isActive ? "active" : ""}"
          data-option="${escapeHtml(optionName)}"
          style="--fav-accent: ${tileAccent};"
          title="Play ${escapeHtml(optionName)} (${escapeHtml(soundName)})"
        >
          <div class="hatch-badge hatch-badge-sm">
            ${favHatchSvg}
            ${favSoundOverlay}
          </div>
          <div class="mush-fav-text">
            <div class="mush-primary">${escapeHtml(optionName)}</div>
            ${
              showDetails && secondaryParts.length
                ? `<div class="mush-secondary mush-meta-row">${secondaryParts.join("")}</div>`
                : ""
            }
          </div>
          ${
            isActive
              ? `<span class="mush-playing-badge" title="Playing" aria-label="Playing">
                   <ha-icon icon="mdi:volume-high"></ha-icon>
                 </span>`
              : ""
          }
        </button>
      `;
    })
    .join("");
}

function deriveAllDeviceEntities(config) {
  const entity = config?.entity || "";
  let base = null;
  if (entity.includes(".")) {
    const [, objectId] = entity.split(".", 2);
    for (const suffix of ["_programs", "_favorite", "_switch", "_light", "_media_player", "_sound", "_timer_ends"]) {
      if (objectId.endsWith(suffix)) {
        base = objectId.slice(0, -suffix.length);
        break;
      }
    }
  }
  return {
    powerId: config?.power_entity || (base ? `switch.${base}_switch` : null),
    lightId: config?.light_entity || (base ? `light.${base}_light` : null),
    mediaId: config?.media_entity || (base ? `media_player.${base}_media_player` : null),
    favoriteId: config?.favorite_entity || (base ? `select.${base}_favorite` : null),
    soundId: config?.sound_entity || (base ? `select.${base}_sound` : null),
    timerId: config?.timer_entity || (base ? `sensor.${base}_timer_ends` : null),
    programsId: config?.programs_entity || (base ? `sensor.${base}_programs` : null),
  };
}

function rgbToHex(rgb) {
  if (!Array.isArray(rgb) || rgb.length !== 3) return "#ff9329";
  return (
    "#" +
    rgb
      .map((c) => Math.max(0, Math.min(255, Number(c) || 0)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return [255, 147, 41];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

const COLOR_PRESETS = [
  { label: "Warm Amber", rgb: [255, 147, 41] },
  { label: "Soft Red", rgb: [239, 68, 68] },
  { label: "Coral", rgb: [251, 113, 133] },
  { label: "Sky Blue", rgb: [96, 165, 250] },
  { label: "Mint", rgb: [74, 222, 128] },
  { label: "Lavender", rgb: [168, 85, 247] },
];

class HatchRestDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._entities = {};
    this._title = "Hatch Rest";
    this._onKeyDown = (e) => {
      if (e.key === "Escape") this.close();
    };
  }

  open({ hass, entities, title }) {
    this._hass = hass;
    this._entities = entities || {};
    this._title = title || "Hatch Rest";
    document.addEventListener("keydown", this._onKeyDown);
    if (!this.isConnected) {
      document.body.appendChild(this);
    }
    this._render();
  }

  close() {
    document.removeEventListener("keydown", this._onKeyDown);
    if (this.isConnected) {
      this.remove();
    }
  }

  updateHass(hass) {
    this._hass = hass;
    if (this.isConnected) {
      this._render();
    }
  }

  _render() {
    if (!this.shadowRoot || !this._hass) return;
    const { powerId, lightId, mediaId, favoriteId, soundId } = this._entities;

    const powerState = powerId ? this._hass.states?.[powerId] : null;
    const lightState = lightId ? this._hass.states?.[lightId] : null;
    const mediaState = mediaId ? this._hass.states?.[mediaId] : null;
    const favState = favoriteId ? this._hass.states?.[favoriteId] : null;
    const soundState = soundId ? this._hass.states?.[soundId] : null;

    const isOff = powerState ? powerState.state === "off" : false;
    const liveLight = getLiveLightVisual(this._hass, lightId, powerId, null);
    const liveSoundIcon = getLiveSoundIcon(this._hass, mediaId, powerId, null);
    const hatchSvg = renderMiniHatchSvg({ ...liveLight, size: 36 });

    const brightPct = liveLight.isLit
      ? Math.round((liveLight.brightness / 255) * 100)
      : 0;
    const isRainbow = lightState?.attributes?.effect === "Rainbow";
    const currentHex = rgbToHex(liveLight.rgb);

    // Volume 0..100
    const volLevel = mediaState?.attributes?.volume_level;
    const volPct = typeof volLevel === "number" ? Math.round(volLevel * 100) : 40;

    // Sound options
    const soundOptions = soundState?.attributes?.options ||
      mediaState?.attributes?.source_list ||
      Object.values(SOUND_LABELS);
    const currentSound = isOff
      ? "None"
      : soundState?.state || mediaState?.attributes?.source || "None";

    // Favorites (using same filter & tile renderer as HatchRestFavoritesCard)
    const activeFav = isOff ? "None" : favState?.state || "None";
    const favEntries = favState
      ? filterFavoriteEntries(favState, {
          activeOption: favState.state,
          hideEmpty: true,
          hideDisabled: true,
        })
      : [];
    const favTilesHtml = renderFavoriteTilesHtml(favEntries, {
      activeOption: favState?.state,
      isOff,
      showDetails: true,
    });

    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_CARD_STYLES}
        :host {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(4px);
          font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        }
        .dialog-card {
          width: 100%;
          max-width: 420px;
          max-height: 90vh;
          overflow-y: auto;
          background: var(--ha-card-background, var(--card-background-color, #1c2433));
          color: var(--primary-text-color, #f8fafc);
          border-radius: 16px;
          border: 1px solid var(--ha-card-border-color, var(--divider-color, rgba(148,163,184,0.2)));
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .dlg-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .dlg-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }
        .dlg-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .section-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--secondary-text-color, #94a3b8);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .pill-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, transparent);
          background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
          color: var(--primary-text-color);
          font-size: 12px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .pill:hover {
          background: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
        }
        .pill.active {
          background: color-mix(in srgb, var(--pill-accent, var(--primary-color)) 20%, transparent);
          border-color: color-mix(in srgb, var(--pill-accent, var(--primary-color)) 65%, transparent);
          color: var(--primary-text-color);
        }
        .pill ha-icon {
          --mdc-icon-size: 14px;
          color: var(--secondary-text-color);
        }
        .pill.active ha-icon {
          color: var(--primary-color);
        }
        .pill-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .slider-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .slider-row ha-icon {
          --mdc-icon-size: 18px;
          color: var(--secondary-text-color);
          flex-shrink: 0;
        }
        input[type="range"] {
          flex: 1;
          accent-color: var(--primary-color, #38bdf8);
          cursor: pointer;
        }
        .color-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .swatch-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid transparent;
          cursor: pointer;
          padding: 0;
          transition: transform 0.12s ease, border-color 0.15s ease;
        }
        .swatch-btn:hover { transform: scale(1.1); }
        .swatch-btn.active {
          border-color: var(--primary-text-color);
          transform: scale(1.1);
        }
        .color-input-wrap {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 8px 3px 4px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--primary-text-color) 12%, transparent);
          background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
          font-size: 12px;
          cursor: pointer;
        }
        input[type="color"] {
          width: 22px;
          height: 22px;
          border: none;
          border-radius: 50%;
          padding: 0;
          background: transparent;
          cursor: pointer;
        }
      </style>
      <div class="dialog-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(this._title)} Controls">
        <div class="dlg-header">
          <div class="dlg-header-left">
            <div class="hatch-badge" style="cursor:default;">
              ${hatchSvg}
              ${
                liveSoundIcon
                  ? `<span class="hatch-sound-overlay ${liveLight.isLit ? "" : "unlit"}"><ha-icon icon="${escapeHtml(liveSoundIcon)}"></ha-icon></span>`
                  : ""
              }
            </div>
            <div class="mush-info">
              <div class="mush-primary">${escapeHtml(this._title)}</div>
              <div class="mush-secondary">${isOff ? "Off" : `${liveLight.isLit ? `Light ${brightPct}%` : "Light Off"} · ${escapeHtml(currentSound)}`}</div>
            </div>
          </div>
          <div class="dlg-actions">
            ${
              powerId
                ? `<button class="mush-icon-btn ${!isOff ? "active" : ""}" data-action="power" title="${isOff ? "Turn on" : "Turn off"}">
                     <ha-icon icon="mdi:power"></ha-icon>
                   </button>`
                : ""
            }
            <button class="mush-icon-btn" data-action="close" title="Close">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
        </div>

        ${
          favState
            ? `<div class="section">
                 <div class="section-label"><span>Favorites</span></div>
                 <div class="mush-grid" style="--mush-cols:2;">
                   ${favTilesHtml || `<div class="mush-secondary">No favorites loaded yet.</div>`}
                 </div>
               </div>`
            : ""
        }

        <div class="section">
          <div class="section-label">
            <span>Noise / Sound</span>
            <span>${volPct}%</span>
          </div>
          <div class="pill-grid">
            ${soundOptions
              .map((opt) => {
                const isAct = String(currentSound).toLowerCase() === String(opt).toLowerCase();
                const icon = getSoundIcon(opt);
                return `<button class="pill ${isAct ? "active" : ""}" data-sound="${escapeHtml(opt)}"><ha-icon icon="${escapeHtml(icon)}"></ha-icon>${escapeHtml(opt)}</button>`;
              })
              .join("")}
          </div>
          ${
            mediaState
              ? `<div class="slider-row">
                   <ha-icon icon="mdi:volume-medium"></ha-icon>
                   <input type="range" min="0" max="100" value="${volPct}" data-slider="volume" aria-label="Volume" />
                 </div>`
              : ""
          }
        </div>

        ${
          lightState
            ? `<div class="section">
                 <div class="section-label">
                   <span>Color & Brightness</span>
                   <span>${liveLight.isLit ? `${brightPct}%` : "Off"}</span>
                 </div>
                 <div class="color-row">
                   ${COLOR_PRESETS.map((p) => {
                     const isAct =
                       liveLight.isLit &&
                       !isRainbow &&
                       Array.isArray(liveLight.rgb) &&
                       liveLight.rgb[0] === p.rgb[0] &&
                       liveLight.rgb[1] === p.rgb[1] &&
                       liveLight.rgb[2] === p.rgb[2];
                     return `<button class="swatch-btn ${isAct ? "active" : ""}" data-rgb="${p.rgb.join(",")}" style="background:rgb(${p.rgb.join(",")});" title="${p.label}"></button>`;
                   }).join("")}
                   <button
                     class="swatch-btn ${liveLight.isLit && isRainbow ? "active" : ""}"
                     data-effect="Rainbow"
                     style="background:conic-gradient(from 0deg, #ff595e, #ffca3a, #8ac926, #1982c4, #6a4c93, #ff595e);"
                     title="Rainbow"
                   ></button>
                   <label class="color-input-wrap" title="Custom color">
                     <input type="color" value="${currentHex}" data-picker="rgb" />
                     <span>Custom</span>
                   </label>
                 </div>
                 <div class="slider-row">
                   <ha-icon icon="mdi:brightness-6"></ha-icon>
                   <input type="range" min="0" max="100" value="${brightPct}" data-slider="brightness" aria-label="Brightness" />
                 </div>
               </div>`
            : ""
        }
      </div>
    `;

    // Backdrop click to close
    this.shadowRoot.host.onclick = (e) => {
      if (e.composedPath()[0] === this) {
        this.close();
      }
    };
    this.shadowRoot.querySelector("[data-action='close']")?.addEventListener("click", () => this.close());
    this.shadowRoot.querySelector("[data-action='power']")?.addEventListener("click", () => {
      if (powerId) this._hass.callService("switch", "toggle", { entity_id: powerId });
    });

    this.shadowRoot.querySelectorAll(".mush-fav").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!favoriteId) return;
        const option = btn.getAttribute("data-option");
        if (!option) return;
        const isAlreadyActive = btn.classList.contains("active");
        this._hass.callService("select", "select_option", {
          entity_id: favoriteId,
          option: isAlreadyActive ? "None" : option,
        });
      });
    });

    this.shadowRoot.querySelectorAll("[data-sound]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const opt = btn.getAttribute("data-sound");
        if (soundState && soundId) {
          this._hass.callService("select", "select_option", { entity_id: soundId, option: opt });
        } else if (mediaState && mediaId) {
          this._hass.callService("media_player", "select_source", { entity_id: mediaId, source: opt });
        }
      });
    });

    this.shadowRoot.querySelector("[data-slider='volume']")?.addEventListener("change", (e) => {
      if (!mediaId) return;
      const val = Number(e.target.value) / 100;
      this._hass.callService("media_player", "volume_set", {
        entity_id: mediaId,
        volume_level: val,
      });
    });

    this.shadowRoot.querySelectorAll("[data-rgb]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!lightId) return;
        const rgb = btn.getAttribute("data-rgb").split(",").map(Number);
        this._hass.callService("light", "turn_on", {
          entity_id: lightId,
          rgb_color: rgb,
        });
      });
    });

    this.shadowRoot.querySelector("[data-effect='Rainbow']")?.addEventListener("click", () => {
      if (!lightId) return;
      this._hass.callService("light", "turn_on", {
        entity_id: lightId,
        effect: "Rainbow",
      });
    });

    this.shadowRoot.querySelector("[data-picker='rgb']")?.addEventListener("change", (e) => {
      if (!lightId) return;
      const rgb = hexToRgb(e.target.value);
      this._hass.callService("light", "turn_on", {
        entity_id: lightId,
        rgb_color: rgb,
      });
    });

    this.shadowRoot.querySelector("[data-slider='brightness']")?.addEventListener("change", (e) => {
      if (!lightId) return;
      const pct = Number(e.target.value);
      if (pct <= 0) {
        this._hass.callService("light", "turn_off", { entity_id: lightId });
      } else {
        this._hass.callService("light", "turn_on", {
          entity_id: lightId,
          brightness: Math.round((pct / 100) * 255),
        });
      }
    });
  }
}

if (!customElements.get("hatch-rest-dialog")) {
  customElements.define("hatch-rest-dialog", HatchRestDialog);
}

let _sharedHatchDialog = null;
function openHatchDialog({ hass, entities, title }) {
  if (!_sharedHatchDialog) {
    _sharedHatchDialog = document.createElement("hatch-rest-dialog");
  }
  _sharedHatchDialog.open({ hass, entities, title });
}


/* -------------------------------------------------------------------------- */
/*  1. Hatch Rest Program Playtime Card (Mushroom Style)                      */
/* -------------------------------------------------------------------------- */

class HatchRestProgramCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._ticker = null;
  }

  static getConfigElement() {
    return document.createElement("hatch-rest-program-card-editor");
  }

  static getStubConfig(hass) {
    const programsSensor = Object.keys(hass?.states || {}).find((id) =>
      /^sensor\..*_programs$/.test(id)
    );
    return {
      entity: programsSensor || "sensor.hatch_rest_programs",
      hide_when_idle: false,
      show_next_program: true,
    };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Please define an entity (e.g. sensor.hatch_rest_programs)");
    }
    this._config = {
      hide_when_idle: false,
      show_next_program: true,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    if (_sharedHatchDialog?.isConnected) {
      _sharedHatchDialog.updateHass(hass);
    }
    const watched = [
      this._config.entity,
      this._getPowerEntityId(),
      this._getLightEntityId(),
      this._getMediaEntityId(),
      this._getTimerEntityId(),
    ].filter(Boolean);
    if (!oldHass || watched.some((id) => oldHass.states?.[id] !== hass?.states?.[id])) {
      this._render();
    }
  }

  connectedCallback() {
    if (!this._ticker) {
      this._ticker = setInterval(() => this._updateTick(), 15000);
    }
    this._render();
  }

  disconnectedCallback() {
    if (this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }
  }

  getCardSize() {
    if (this._config.hide_when_idle && !this._isRunningNow()) {
      return 0;
    }
    return this._isRunningNow() ? 2 : 1;
  }

  _getPowerEntityId() {
    return (
      this._config.power_entity ||
      deriveSiblingEntity(this._config.entity, "_programs", "switch", "_switch")
    );
  }

  _getLightEntityId() {
    return (
      this._config.light_entity ||
      deriveSiblingEntity(this._config.entity, "_programs", "light", "_light")
    );
  }

  _getMediaEntityId() {
    return (
      this._config.media_entity ||
      deriveSiblingEntity(this._config.entity, "_programs", "media_player", "_media_player")
    );
  }

  _getTimerEntityId() {
    return (
      this._config.timer_entity ||
      deriveSiblingEntity(this._config.entity, "_programs", "sensor", "_timer_ends")
    );
  }

  _isDeviceOn() {
    const powerId = this._getPowerEntityId();
    if (!powerId || !this._hass?.states?.[powerId]) {
      return true;
    }
    return this._hass.states[powerId].state === "on";
  }

  _isRunningNow() {
    const stateObj = this._hass?.states?.[this._config.entity];
    if (!stateObj || !this._isDeviceOn()) return false;
    return Boolean(findRunningProgram(stateObj.attributes?.programs, new Date()));
  }

  _openMoreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId },
      })
    );
  }

  _togglePower(e) {
    e.stopPropagation();
    const powerId = this._getPowerEntityId();
    if (!powerId || !this._hass) return;
    this._hass.callService("switch", "toggle", { entity_id: powerId });
  }

  _updateTick() {
    const stateObj = this._hass?.states?.[this._config.entity];
    if (!stateObj) return;

    const now = new Date();
    const running = this._isDeviceOn()
      ? findRunningProgram(stateObj.attributes?.programs, now)
      : null;

    const elapsedEl = this.shadowRoot?.querySelector("[data-role='elapsed']");
    const remainingEl = this.shadowRoot?.querySelector("[data-role='remaining']");
    const progressEl = this.shadowRoot?.querySelector("[data-role='progress-fill']");
    const pctEl = this.shadowRoot?.querySelector("[data-role='progress-pct']");

    if (running && elapsedEl && remainingEl && progressEl) {
      const elapsedSec = Math.max(0, (now.getTime() - running.start.getTime()) / 1000);
      const remainingSec = Math.max(0, (running.end.getTime() - now.getTime()) / 1000);
      const totalSec = running.prog.duration_seconds || 1;
      const pct = Math.min(100, Math.max(0, (elapsedSec / totalSec) * 100));

      elapsedEl.textContent = `${formatDurationHM(elapsedSec)} played`;
      remainingEl.textContent = `${formatDurationShort(remainingSec)} left`;
      progressEl.style.width = `${pct.toFixed(2)}%`;
    } else if ((running && !elapsedEl) || (!running && elapsedEl)) {
      this._render();
    }
  }

  _render() {
    if (!this.shadowRoot) return;

    const stateObj = this._hass?.states?.[this._config.entity];
    if (!stateObj) {
      this.style.display = "";
      this.shadowRoot.innerHTML = `
        <style>${SHARED_CARD_STYLES}</style>
        <ha-card>
          <div class="mush-secondary">Entity not found: <code>${escapeHtml(this._config.entity)}</code></div>
        </ha-card>
      `;
      return;
    }

    const now = new Date();
    const deviceOn = this._isDeviceOn();
    const programs = stateObj.attributes?.programs || [];
    const running = deviceOn ? findRunningProgram(programs, now) : null;

    if (!running && this._config.hide_when_idle) {
      this.style.display = "none";
      this.shadowRoot.innerHTML = "";
      return;
    }
    this.style.display = "";

    const title = this._config.title || deriveDeviceTitle(stateObj, "Hatch Rest");
    const powerId = this._getPowerEntityId();
    const lightId = this._getLightEntityId();
    const mediaId = this._getMediaEntityId();
    const hasPowerEntity = Boolean(powerId && this._hass?.states?.[powerId]);

    const liveLight = getLiveLightVisual(
      this._hass,
      lightId,
      powerId,
      running?.prog
    );
    const liveSoundIcon = getLiveSoundIcon(
      this._hass,
      mediaId,
      powerId,
      running?.prog?.sound
    );
    const hatchSvg = renderMiniHatchSvg({ ...liveLight, size: 34 });
    const hatchBadgeHtml = `
      ${hatchSvg}
      ${
        liveSoundIcon
          ? `<span class="hatch-sound-overlay ${liveLight.isLit ? "" : "unlit"}"><ha-icon icon="${escapeHtml(liveSoundIcon)}"></ha-icon></span>`
          : ""
      }
    `;

    const timerId = this._getTimerEntityId();
    const timerState = timerId ? this._hass?.states?.[timerId] : null;
    let sleepTimerText = null;
    if (
      timerState &&
      timerState.state &&
      timerState.state !== "unknown" &&
      timerState.state !== "unavailable"
    ) {
      const endsAt = new Date(timerState.state);
      if (!Number.isNaN(endsAt.getTime()) && endsAt > now) {
        sleepTimerText = formatDurationShort((endsAt.getTime() - now.getTime()) / 1000);
      }
    }

    if (running) {
      const { prog, start, end } = running;
      const elapsedSec = Math.max(0, (now.getTime() - start.getTime()) / 1000);
      const remainingSec = Math.max(0, (end.getTime() - now.getTime()) / 1000);
      const totalSec = prog.duration_seconds || 1;
      const pct = Math.min(100, Math.max(0, (elapsedSec / totalSec) * 100));

      const barFill =
        liveLight.isLit && Array.isArray(liveLight.rgb)
          ? isRainbowColor(liveLight.rgb)
            ? "linear-gradient(90deg, #ff595e, #ffca3a, #8ac926, #1982c4, #6a4c93)"
            : `rgb(${liveLight.rgb[0]}, ${liveLight.rgb[1]}, ${liveLight.rgb[2]})`
          : "var(--primary-color)";

      const brightnessPct = liveLight.isLit
        ? Math.round((liveLight.brightness / 255) * 100)
        : 0;
      const volumePct =
        typeof prog.volume === "number"
          ? Math.round((prog.volume / 255) * 100)
          : null;
      const soundName = formatSoundName(prog.sound);
      const soundIcon = getSoundIcon(prog.sound);
      const windowLabel = `${formatClockTime(start)} – ${formatClockTime(end)}`;

      const accentColor =
        liveLight.isLit && Array.isArray(liveLight.rgb) && !isRainbowColor(liveLight.rgb)
          ? `rgb(${liveLight.rgb[0]}, ${liveLight.rgb[1]}, ${liveLight.rgb[2]})`
          : "var(--primary-color)";

      this.shadowRoot.innerHTML = `
        <style>
          ${SHARED_CARD_STYLES}
          ha-card {
            padding: 12px;
            cursor: pointer;
          }
          .mush-card-stack {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .compact-row {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .compact-body {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 3px;
          }
          .compact-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            min-width: 0;
          }
          .compact-title {
            display: flex;
            align-items: baseline;
            gap: 6px;
            min-width: 0;
            overflow: hidden;
          }
          .compact-title .mush-primary {
            flex-shrink: 0;
          }
          .compact-title .mush-secondary {
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .playtime-text {
            font-size: 13px;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            color: var(--primary-text-color);
            flex-shrink: 0;
          }
          .remaining-text {
            font-size: 12px;
            font-variant-numeric: tabular-nums;
            color: var(--secondary-text-color);
            flex-shrink: 0;
          }
          .inline-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: var(--secondary-text-color);
            min-width: 0;
            overflow: hidden;
            white-space: nowrap;
          }
          .inline-item {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            white-space: nowrap;
          }
          @container (max-width: 400px) {
            .hide-narrow {
              display: none;
            }
          }
          .inline-item ha-icon {
            --mdc-icon-size: 14px;
          }
          .mush-bar-track {
            height: 4px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
            overflow: hidden;
          }
          .mush-bar-fill {
            height: 100%;
            border-radius: 999px;
            background: ${barFill};
            transition: width 0.6s linear;
          }
        </style>
        <ha-card>
          <div class="mush-card-stack">
            <div class="compact-row">
            <div class="hatch-badge" data-action="light-info" title="Open light controls">
              ${hatchBadgeHtml}
            </div>
            <div class="compact-body">
              <div class="compact-line">
                <div class="compact-title">
                  <span class="mush-primary">${escapeHtml(prog.name || `Program ${prog.slot}`)}</span>
                  <span class="mush-secondary hide-narrow">· ${escapeHtml(title)}</span>
                </div>
                <span class="playtime-text" data-role="elapsed">${formatDurationHM(elapsedSec)} played</span>
              </div>
              <div class="compact-line">
                <div class="inline-meta">
                  <span class="hide-narrow">${escapeHtml(windowLabel)}</span>
                  <span class="inline-item" title="Volume">
                    <ha-icon icon="mdi:volume-medium"></ha-icon>
                    ${prog.sound === "none" ? "Muted" : volumePct !== null ? `${volumePct}%` : ""}
                  </span>
                  <span class="inline-item" title="Brightness">
                    <ha-icon icon="mdi:brightness-6"></ha-icon>
                    ${liveLight.isLit ? `${brightnessPct}%` : "Off"}
                  </span>
                  ${
                    prog.toddler_lock
                      ? `<span class="inline-item hide-narrow" title="Toddler Lock"><ha-icon icon="mdi:lock"></ha-icon>Lock</span>`
                      : ""
                  }
                  ${
                    sleepTimerText
                      ? `<span class="inline-item hide-narrow" title="Sleep Timer"><ha-icon icon="mdi:timer-outline"></ha-icon>Timer ${escapeHtml(sleepTimerText)}</span>`
                      : ""
                  }
                </div>
                <span class="remaining-text" data-role="remaining">${formatDurationShort(remainingSec)} left</span>
              </div>
            </div>
            ${
              hasPowerEntity
                ? `<button class="mush-icon-btn active" style="--btn-accent: ${accentColor};" data-action="power" title="Turn off" aria-label="Turn off">
                     <ha-icon icon="mdi:power"></ha-icon>
                   </button>`
                : ""
            }
          </div>

            <div class="mush-bar-track">
              <div class="mush-bar-fill" data-role="progress-fill" style="width: ${pct.toFixed(2)}%"></div>
            </div>
          </div>
        </ha-card>
      `;
    } else {
      const next = this._config.show_next_program
        ? findNextProgram(programs, now)
        : null;

      let statusPrefix = deviceOn ? "Idle" : "Off";
      let secondaryText = statusPrefix;
      if (next) {
        const dayLabel =
          next.dayOffset === 0
            ? "Today"
            : next.dayOffset === 1
            ? "Tomorrow"
            : DAY_NAMES[next.start.getDay()];
        secondaryText = `${statusPrefix} · Next: ${next.prog.name || `Program ${next.prog.slot}`} · ${dayLabel} ${next.prog.time}`;
      }

      this.shadowRoot.innerHTML = `
        <style>
          ${SHARED_CARD_STYLES}
          ha-card { cursor: pointer; }
        </style>
        <ha-card>
          <div class="mush-header">
            <div class="mush-header-left">
              <div class="hatch-badge" data-action="light-info" title="Open light controls">
                ${hatchBadgeHtml}
              </div>
              <div class="mush-info">
                <div class="mush-primary">${escapeHtml(title)}</div>
                <div class="mush-secondary">${escapeHtml(secondaryText)}</div>
              </div>
            </div>
            ${
              hasPowerEntity
                ? `<button class="mush-icon-btn ${deviceOn ? "active" : ""}" data-action="power" title="${deviceOn ? "Turn off" : "Turn on"}" aria-label="${deviceOn ? "Turn off" : "Turn on"}">
                     <ha-icon icon="mdi:power"></ha-icon>
                   </button>`
                : ""
            }
          </div>
        </ha-card>
      `;
    }

    const openDialog = () =>
      openHatchDialog({
        hass: this._hass,
        entities: deriveAllDeviceEntities(this._config),
        title,
      });

    this.shadowRoot.querySelector("ha-card")?.addEventListener("click", openDialog);
    this.shadowRoot
      .querySelector("[data-action='light-info']")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        openDialog();
      });
    this.shadowRoot
      .querySelector("[data-action='power']")
      ?.addEventListener("click", (e) => this._togglePower(e));
  }
}

/* -------------------------------------------------------------------------- */
/*  2. Hatch Rest Favorites Selector Card (Mushroom Style)                    */
/* -------------------------------------------------------------------------- */

class HatchRestFavoritesCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
  }

  static getConfigElement() {
    return document.createElement("hatch-rest-favorites-card-editor");
  }

  static getStubConfig(hass) {
    const favSelect = Object.keys(hass?.states || {}).find((id) =>
      /^select\..*_favorite$/.test(id)
    );
    return {
      entity: favSelect || "select.hatch_rest_favorite",
      columns: 2,
      show_none_button: true,
      show_details: true,
    };
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Please define an entity (e.g. select.hatch_rest_favorite)");
    }
    this._config = {
      columns: 2,
      show_none_button: true,
      show_details: true,
      hide_empty: true,
      hide_disabled: true,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    if (_sharedHatchDialog?.isConnected) {
      _sharedHatchDialog.updateHass(hass);
    }
    const watched = [
      this._config.entity,
      this._getPowerEntityId(),
      this._getLightEntityId(),
      this._getMediaEntityId(),
    ].filter(Boolean);
    if (!oldHass || watched.some((id) => oldHass.states?.[id] !== hass?.states?.[id])) {
      this._render();
    }
  }

  getCardSize() {
    return 3;
  }

  _getPowerEntityId() {
    return (
      this._config.power_entity ||
      deriveSiblingEntity(this._config.entity, "_favorite", "switch", "_switch")
    );
  }

  _getLightEntityId() {
    return (
      this._config.light_entity ||
      deriveSiblingEntity(this._config.entity, "_favorite", "light", "_light")
    );
  }

  _getMediaEntityId() {
    return (
      this._config.media_entity ||
      deriveSiblingEntity(this._config.entity, "_favorite", "media_player", "_media_player")
    );
  }

  _selectOption(option) {
    if (!this._hass || !this._config.entity) return;
    this._hass.callService("select", "select_option", {
      entity_id: this._config.entity,
      option,
    });
  }

  _openMoreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId },
      })
    );
  }

  _render() {
    if (!this.shadowRoot) return;

    const stateObj = this._hass?.states?.[this._config.entity];
    if (!stateObj) {
      this.shadowRoot.innerHTML = `
        <style>${SHARED_CARD_STYLES}</style>
        <ha-card>
          <div class="mush-secondary">Entity not found: <code>${escapeHtml(this._config.entity)}</code></div>
        </ha-card>
      `;
      return;
    }

    const title =
      this._config.title || `${deriveDeviceTitle(stateObj, "Hatch Rest")} Favorites`;
    const activeOption = stateObj.state;
    const powerId = this._getPowerEntityId();
    const lightId = this._getLightEntityId();
    const mediaId = this._getMediaEntityId();
    const powerState = powerId ? this._hass?.states?.[powerId] : null;
    const isOff = powerState ? powerState.state === "off" : false;

    const liveLight = getLiveLightVisual(this._hass, lightId, powerId, null);
    const hatchSvg = renderMiniHatchSvg({ ...liveLight, size: 34 });
    const liveBrightPct = liveLight.isLit
      ? Math.round((liveLight.brightness / 255) * 100)
      : 0;

    const favoritesMap = stateObj.attributes?.favorites || {};
    const options = Array.isArray(stateObj.attributes?.options)
      ? stateObj.attributes.options.filter((o) => o !== "None")
      : [];

    let entries = Object.keys(favoritesMap)
      .sort((a, b) => Number(a) - Number(b))
      .map((slot) => ({
        slot: Number(slot),
        ...favoritesMap[slot],
      }));

    if (entries.length === 0 && options.length > 0) {
      options.forEach((opt, idx) => {
        entries.push({
          slot: idx + 1,
          name: opt,
          color: null,
          brightness: null,
          sound: null,
          volume: null,
          enabled: true,
        });
      });
    } else {
      entries = entries.filter((fav) => {
        const optionName = fav.name || `Favorite ${fav.slot}`;
        if (activeOption === optionName) return true;
        if (this._config.hide_disabled && fav.enabled === false) return false;
        if (this._config.hide_empty) {
          const noLight = fav.brightness === 0 || fav.brightness === null;
          const noSound = !fav.sound || String(fav.sound).toLowerCase() === "none" || fav.volume === 0;
          if (noLight && noSound) return false;
        }
        return true;
      });
    }

    const cols = Number(this._config.columns) || 2;
    const hasActive = activeOption && activeOption !== "None" && !isOff;
    const activeFav = hasActive
      ? entries.find((f) => (f.name || `Favorite ${f.slot}`) === activeOption)
      : null;
    const liveSoundIcon = getLiveSoundIcon(
      this._hass,
      mediaId,
      powerId,
      activeFav?.sound
    );
    const hatchBadgeHtml = `
      ${hatchSvg}
      ${
        liveSoundIcon
          ? `<span class="hatch-sound-overlay ${liveLight.isLit ? "" : "unlit"}"><ha-icon icon="${escapeHtml(liveSoundIcon)}"></ha-icon></span>`
          : ""
      }
    `;

    const activeAccent =
      activeFav && Array.isArray(activeFav.color) && !isRainbowColor(activeFav.color)
        ? `rgb(${activeFav.color[0]}, ${activeFav.color[1]}, ${activeFav.color[2]})`
        : "var(--primary-color)";

    let lightNote = "";
    if (liveLight.isLit) {
      const favBrightPct =
        activeFav && typeof activeFav.brightness === "number"
          ? Math.round((activeFav.brightness / 255) * 100)
          : null;
      const isEdited = favBrightPct !== null && Math.abs(liveBrightPct - favBrightPct) > 2;
      lightNote = ` · Light ${liveBrightPct}%${isEdited ? " · edited" : ""}`;
    }

    const headerSub = isOff
      ? "Off"
      : hasActive
      ? `Playing ${activeOption}${lightNote}`
      : liveLight.isLit
      ? `Light ${liveBrightPct}%`
      : "Select a favorite";

    const tilesHtml = entries
      .map((fav) => {
        const optionName = fav.name || `Favorite ${fav.slot}`;
        const isActive = !isOff && activeOption === optionName;
        const colorCss = formatColorCss(fav.color, fav.brightness);
        const soundName = formatSoundName(fav.sound);
        const soundIcon = getSoundIcon(fav.sound);
        const volPct =
          typeof fav.volume === "number"
            ? `${Math.round((fav.volume / 255) * 100)}%`
            : "";
        const brightPct =
          typeof fav.brightness === "number"
            ? `${Math.round((fav.brightness / 255) * 100)}%`
            : "";

        const tileAccent =
          colorCss && !isRainbowColor(fav.color)
            ? `rgb(${fav.color[0]}, ${fav.color[1]}, ${fav.color[2]})`
            : "var(--primary-color)";

        const secondaryParts = [];
        if (fav.sound !== "none" && volPct) {
          secondaryParts.push(
            `<span class="mush-meta-item" title="${escapeHtml(soundName)}"><ha-icon icon="mdi:volume-medium"></ha-icon>${volPct}</span>`
          );
        }
        if (brightPct) {
          secondaryParts.push(
            `<span class="mush-meta-item" title="Brightness"><ha-icon icon="mdi:brightness-6"></ha-icon>${fav.brightness === 0 ? "Off" : brightPct}</span>`
          );
        }

        const favIsLit = Array.isArray(fav.color) && fav.brightness > 0;
        const favHatchSvg = renderMiniHatchSvg({
          isLit: favIsLit,
          rgb: fav.color,
          brightness: fav.brightness ?? 0,
          size: 30,
        });
        const favSoundOverlay =
          fav.sound && String(fav.sound).toLowerCase() !== "none"
            ? `<span class="hatch-sound-overlay ${favIsLit ? "" : "unlit"}"><ha-icon icon="${escapeHtml(soundIcon)}"></ha-icon></span>`
            : `<span class="hatch-sound-overlay unlit"><ha-icon icon="mdi:volume-off"></ha-icon></span>`;

        return `
          <button
            class="mush-fav ${isActive ? "active" : ""}"
            data-option="${escapeHtml(optionName)}"
            style="--fav-accent: ${tileAccent};"
            title="Play ${escapeHtml(optionName)} (${escapeHtml(soundName)})"
          >
            <div class="hatch-badge hatch-badge-sm">
              ${favHatchSvg}
              ${favSoundOverlay}
            </div>
            <div class="mush-fav-text">
              <div class="mush-primary">${escapeHtml(optionName)}</div>
              ${
                this._config.show_details && secondaryParts.length
                  ? `<div class="mush-secondary mush-meta-row">${secondaryParts.join("")}</div>`
                  : ""
              }
            </div>
            ${
              isActive
                ? `<span class="mush-playing-badge" title="Playing" aria-label="Playing">
                     <ha-icon icon="mdi:volume-high"></ha-icon>
                   </span>`
                : ""
            }
          </button>
        `;
      })
      .join("");

    const hasPowerEntity = Boolean(powerId && this._hass?.states?.[powerId]);

    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_CARD_STYLES}
        .mush-card-stack {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .mush-grid {
          display: grid;
          grid-template-columns: repeat(${cols}, minmax(0, 1fr));
          gap: 10px;
        }
        @container (max-width: 380px) {
          .mush-grid {
            grid-template-columns: 1fr;
          }
        }
        .mush-fav {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--primary-text-color) 8%, transparent);
          background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
          color: var(--primary-text-color);
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          min-width: 0;
          transition: background 0.15s ease, border-color 0.2s ease, transform 0.1s ease;
        }
        .mush-fav:hover {
          background: color-mix(in srgb, var(--primary-text-color) 10%, transparent);
        }
        .mush-fav:active {
          transform: scale(0.98);
        }
        .mush-fav.active {
          background: color-mix(in srgb, var(--fav-accent) 16%, transparent);
          border-color: color-mix(in srgb, var(--fav-accent) 55%, transparent);
        }
        .mush-fav-text {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
          gap: 2px;
        }
        .mush-meta-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .mush-meta-item {
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .mush-meta-item ha-icon {
          --mdc-icon-size: 13px;
        }
        .hatch-badge-sm {
          width: 36px;
          height: 36px;
          pointer-events: none;
        }
        .mush-playing-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--fav-accent);
          flex-shrink: 0;
        }
        .mush-playing-badge ha-icon {
          --mdc-icon-size: 18px;
        }
      </style>
      <ha-card>
        <div class="mush-card-stack">
          <div class="mush-header">
          <div class="mush-header-left" data-action="entity-info" style="cursor:pointer;">
            <div class="hatch-badge" data-action="light-info" title="Open light controls">
              ${hatchBadgeHtml}
            </div>
            <div class="mush-info">
              <div class="mush-primary">${escapeHtml(title)}</div>
              <div class="mush-secondary">${escapeHtml(headerSub)}</div>
            </div>
          </div>
          ${
            this._config.show_none_button
              ? `<button
                   class="mush-icon-btn ${hasActive ? "active" : ""}"
                   style="--btn-accent: ${activeAccent};"
                   data-action="${hasPowerEntity && isOff ? "power-on" : "none"}"
                   title="${hasPowerEntity && isOff ? "Turn on" : "Stop playing"}"
                   aria-label="${hasPowerEntity && isOff ? "Turn on" : "Stop playing"}"
                 >
                   <ha-icon icon="mdi:power"></ha-icon>
                 </button>`
              : ""
          }
        </div>
          <div class="mush-grid">
            ${tilesHtml || `<div class="mush-secondary">No favorites loaded yet.</div>`}
          </div>
        </div>
      </ha-card>
    `;

    const openDialog = () =>
      openHatchDialog({
        hass: this._hass,
        entities: deriveAllDeviceEntities(this._config),
        title: deriveDeviceTitle(stateObj, "Hatch Rest"),
      });

    this.shadowRoot
      .querySelector("[data-action='entity-info']")
      ?.addEventListener("click", openDialog);

    this.shadowRoot
      .querySelector("[data-action='light-info']")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        openDialog();
      });

    this.shadowRoot
      .querySelector("[data-action='none']")
      ?.addEventListener("click", () => {
        this._selectOption("None");
      });

    this.shadowRoot
      .querySelector("[data-action='power-on']")
      ?.addEventListener("click", () => {
        if (powerId && this._hass) {
          this._hass.callService("switch", "turn_on", { entity_id: powerId });
        }
      });

    this.shadowRoot.querySelectorAll(".mush-fav").forEach((btn) => {
      btn.addEventListener("click", () => {
        const option = btn.getAttribute("data-option");
        if (!option) return;
        const isAlreadyActive = btn.classList.contains("active");
        this._selectOption(isAlreadyActive ? "None" : option);
      });
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  3. Simple Visual Card Editors                                             */
/* -------------------------------------------------------------------------- */

class HatchRestProgramCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _emit(newConfig) {
    this._config = newConfig;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        bubbles: true,
        composed: true,
        detail: { config: newConfig },
      })
    );
  }

  _render() {
    if (!this._config) return;
    if (!this.innerHTML) {
      this.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;padding:8px 0;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">
            <span>Programs Sensor Entity (required)</span>
            <input data-field="entity" type="text" style="padding:8px;border-radius:6px;border:1px solid var(--divider-color,#ccc);background:transparent;color:inherit;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">
            <span>Title (optional)</span>
            <input data-field="title" type="text" placeholder="Auto from device name" style="padding:8px;border-radius:6px;border:1px solid var(--divider-color,#ccc);background:transparent;color:inherit;" />
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <input data-field="hide_when_idle" type="checkbox" />
            <span>Hide card when no program is running</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <input data-field="show_next_program" type="checkbox" />
            <span>Show next scheduled program when idle</span>
          </label>
        </div>
      `;
      this.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", () => {
          const field = input.getAttribute("data-field");
          const updated = { ...this._config };
          if (input.type === "checkbox") {
            updated[field] = input.checked;
          } else if (input.value) {
            updated[field] = input.value;
          } else {
            delete updated[field];
          }
          this._emit(updated);
        });
      });
    }
    this.querySelector("[data-field='entity']").value = this._config.entity || "";
    this.querySelector("[data-field='title']").value = this._config.title || "";
    this.querySelector("[data-field='hide_when_idle']").checked = Boolean(
      this._config.hide_when_idle
    );
    this.querySelector("[data-field='show_next_program']").checked =
      this._config.show_next_program !== false;
  }
}

class HatchRestFavoritesCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _emit(newConfig) {
    this._config = newConfig;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        bubbles: true,
        composed: true,
        detail: { config: newConfig },
      })
    );
  }

  _render() {
    if (!this._config) return;
    if (!this.innerHTML) {
      this.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;padding:8px 0;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">
            <span>Favorite Select Entity (required)</span>
            <input data-field="entity" type="text" style="padding:8px;border-radius:6px;border:1px solid var(--divider-color,#ccc);background:transparent;color:inherit;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">
            <span>Title (optional)</span>
            <input data-field="title" type="text" placeholder="Auto from device name" style="padding:8px;border-radius:6px;border:1px solid var(--divider-color,#ccc);background:transparent;color:inherit;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">
            <span>Columns</span>
            <input data-field="columns" type="number" min="1" max="6" style="padding:8px;border-radius:6px;border:1px solid var(--divider-color,#ccc);background:transparent;color:inherit;" />
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <input data-field="show_none_button" type="checkbox" />
            <span>Show Stop / None button</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <input data-field="show_details" type="checkbox" />
            <span>Show sound & light details on tiles</span>
          </label>
        </div>
      `;
      this.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", () => {
          const field = input.getAttribute("data-field");
          const updated = { ...this._config };
          if (input.type === "checkbox") {
            updated[field] = input.checked;
          } else if (input.type === "number") {
            updated[field] = Number(input.value) || 2;
          } else if (input.value) {
            updated[field] = input.value;
          } else {
            delete updated[field];
          }
          this._emit(updated);
        });
      });
    }
    this.querySelector("[data-field='entity']").value = this._config.entity || "";
    this.querySelector("[data-field='title']").value = this._config.title || "";
    this.querySelector("[data-field='columns']").value = this._config.columns || 2;
    this.querySelector("[data-field='show_none_button']").checked =
      this._config.show_none_button !== false;
    this.querySelector("[data-field='show_details']").checked =
      this._config.show_details !== false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Register Custom Elements & Lovelace Card Picker Metadata                  */
/* -------------------------------------------------------------------------- */

if (!customElements.get("hatch-rest-program-card")) {
  customElements.define("hatch-rest-program-card", HatchRestProgramCard);
}
if (!customElements.get("hatch-rest-program-card-editor")) {
  customElements.define("hatch-rest-program-card-editor", HatchRestProgramCardEditor);
}
if (!customElements.get("hatch-rest-favorites-card")) {
  customElements.define("hatch-rest-favorites-card", HatchRestFavoritesCard);
}
if (!customElements.get("hatch-rest-favorites-card-editor")) {
  customElements.define("hatch-rest-favorites-card-editor", HatchRestFavoritesCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "hatch-rest-program-card")) {
  window.customCards.push({
    type: "hatch-rest-program-card",
    name: "Hatch Rest Program Playtime",
    description: "Mushroom-style card showing live running playtime and mini Hatch light state.",
    preview: true,
  });
}
if (!window.customCards.some((c) => c.type === "hatch-rest-favorites-card")) {
  window.customCards.push({
    type: "hatch-rest-favorites-card",
    name: "Hatch Rest Favorites",
    description: "Mushroom-style favorite selector with live mini Hatch light state.",
    preview: true,
  });
}
