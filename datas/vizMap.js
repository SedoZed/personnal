// datas/vizMap.js
// Carte sombre + tooltip/popup + filtres région / nationalité / courant
// ✅ Corrige les genres multi-valeurs (ex: "expressionism,abstractionism") : split + filtre "contient"

const CSV_PATH = "./datas/artists.csv";

const ALL = "__ALL__";

// Coordonnées représentatives par nationalité
const NATIONALITY_COORDS = {
  Italian:   { lat: 41.9028, lon: 12.4964 },
  French:    { lat: 48.8566, lon: 2.3522 },
  Belgian:   { lat: 50.8503, lon: 4.3517 },
  Flemish:   { lat: 50.8503, lon: 4.3517 },
  Dutch:     { lat: 52.3676, lon: 4.9041 },
  Spanish:   { lat: 40.4168, lon: -3.7038 },
  Russian:   { lat: 55.7558, lon: 37.6173 },
  Mexican:   { lat: 19.4326, lon: -99.1332 },
  German:    { lat: 52.5200, lon: 13.4050 },
  Austrian:  { lat: 48.2082, lon: 16.3738 },
  Swiss:     { lat: 46.9480, lon: 7.4474 },
  British:   { lat: 51.5072, lon: -0.1276 },
  Norwegian: { lat: 59.9139, lon: 10.7522 },
  American:  { lat: 38.9072, lon: -77.0369 },
  Greek:     { lat: 37.9838, lon: 23.7275 },
  Belarusian:{ lat: 53.9006, lon: 27.5590 },
  Jewish:    null
};

// Mapping nationalité -> région (à compléter au besoin)
const NATIONALITY_REGION = {
  Italian: "Europe",
  French: "Europe",
  Belgian: "Europe",
  Flemish: "Europe",
  Dutch: "Europe",
  Spanish: "Europe",
  German: "Europe",
  Austrian: "Europe",
  Swiss: "Europe",
  British: "Europe",
  Norwegian: "Europe",
  Greek: "Europe",
  Belarusian: "Europe",
  Russian: "Europe",
  American: "Amérique du Nord",
  Mexican: "Amérique du Nord"
};

const REGIONS = [
  "Europe",
  "Asie",
  "Amérique du Nord",
  "Amérique du Sud",
  "Afrique",
  "Océanie"
];

const WIKI_THUMB_CACHE = new Map();
let PINNED_MARKER = null;

let map = null;
let layerGroup = null;

let ALL_ROWS = [];        // rows CSV parsées
let CURRENT_MARKERS = []; // markers actuellement affichés

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ✅ Parse genres multi-valeurs (normalisé en minuscules)
function parseGenres(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueNonEmpty(values) {
  return Array.from(new Set(values.map(v => String(v ?? "").trim()).filter(Boolean)));
}

function pickPrimaryNationality(nationalityRaw) {
  if (!nationalityRaw) return null;
  const parts = String(nationalityRaw).split(",").map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const coords = NATIONALITY_COORDS[p];
    if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) return p;
  }
  return null;
}

function pickCoordsFromNationality(nationalityRaw) {
  const nat = pickPrimaryNationality(nationalityRaw);
  if (!nat) return null;
  const coords = NATIONALITY_COORDS[nat];
  if (!coords) return null;
  return { ...coords, nat };
}

function wikiTitleFromUrl(url) {
  try {
    const u = new URL(url);
    const idx = u.pathname.indexOf("/wiki/");
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + "/wiki/".length));
  } catch {
    return null;
  }
}

async function fetchWikiThumbnail(title) {
  if (!title) return null;
  if (WIKI_THUMB_CACHE.has(title)) return WIKI_THUMB_CACHE.get(title);

  const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const r = await fetch(endpoint, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const thumb = j?.thumbnail?.source || null;
    WIKI_THUMB_CACHE.set(title, thumb);
    return thumb;
  } catch {
    WIKI_THUMB_CACHE.set(title, null);
    return null;
  }
}

function cardHtml({ name, genre, nationality, years, thumbUrl, wikiUrl }) {
  const safeName = escapeHtml(name);
  const safeGenre = escapeHtml(genre);
  const safeNat = escapeHtml(nationality);
  const safeYears = escapeHtml(years);
  const safeWiki = escapeHtml(wikiUrl || "");

  const img = thumbUrl
    ? `<img src="${escapeHtml(thumbUrl)}" alt="${safeName}"
         style="width:100%;height:100%;object-fit:contain;display:block;padding:6px;background:rgba(255,255,255,0.04);">`
    : `<div style="display:flex;align-items:center;justify-content:center;height:100%;opacity:.7;">(photo en chargement / indisponible)</div>`;

  const wikiLine = safeWiki
    ? `<div style="margin-top:8px;font-size:12px;opacity:.9;">
         <a href="${safeWiki}" target="_blank" rel="noopener noreferrer"
            style="color:#9ecbff;text-decoration:none;">
           Ouvrir Wikipedia
         </a>
       </div>`
    : "";

  return `
    <div style="width:240px;">
      <div style="width:100%; height:140px; border-radius:12px; overflow:hidden; background:rgba(255,255,255,0.03); margin-bottom:10px;">
        ${img}
      </div>
      <div style="font-weight:800; margin-bottom:6px;">${safeName}</div>
      <div style="font-size:12px; line-height:1.45; opacity:.92;">
        <div><b>Courant:</b> ${safeGenre || "—"}</div>
        <div><b>Nationalité:</b> ${safeNat || "—"}</div>
        <div><b>Années:</b> ${safeYears || "—"}</div>
      </div>
      ${wikiLine}
    </div>
  `;
}

function hoverHtml(payload) {
  return cardHtml(payload);
}

// Pin sobre
const soberIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      width:12px;height:12px;border-radius:999px;
      background: rgba(255,255,255,0.85);
      box-shadow: 0 0 0 4px rgba(255,255,255,0.12);
      border: 1px solid rgba(0,0,0,0.25);
    "></div>
  `,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

// Tooltip top/bottom selon place
function chooseTooltipDirection(map, latlng) {
  const size = map.getSize();
  const p = map.latLngToContainerPoint(latlng);
  const margin = 170;

  if (p.y < margin) return { direction: "bottom", offset: [0, 12] };
  if (size.y - p.y < margin) return { direction: "top", offset: [0, -12] };
  return { direction: "top", offset: [0, -12] };
}

// --- Filtres UI
function fillSelect(selectEl, values, placeholderLabel) {
  selectEl.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = ALL;
  optAll.textContent = placeholderLabel;
  selectEl.appendChild(optAll);

  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;          // pour mouvement on stocke en lower-case
    opt.textContent = v;    // affichage tel quel (lower-case). Tu peux prettify si tu veux.
    selectEl.appendChild(opt);
  });
}

function getFilters() {
  const region = document.getElementById("regionSelect")?.value || ALL;
  const nat = document.getElementById("natSelect")?.value || ALL;
  const movement = document.getElementById("movementSelect")?.value || ALL; // lower-case
  return { region, nat, movement };
}

function rowMatchesFilters(row, { region, nat, movement }) {
  const coords = pickCoordsFromNationality(row.nationality);
  const primaryNat = coords?.nat || null;
  if (!primaryNat) return false;

  const rowRegion = NATIONALITY_REGION[primaryNat] || null;

  // ✅ genres individuels (lower-case)
  const rowMovements = parseGenres(row.genre);

  if (region !== ALL && rowRegion !== region) return false;
  if (nat !== ALL && primaryNat !== nat) return false;

  // ✅ contient au lieu de égalité
  if (movement !== ALL && !rowMovements.includes(movement)) return false;

  return true;
}

function clearMarkers() {
  if (!layerGroup) return;
  layerGroup.clearLayers();
  CURRENT_MARKERS = [];
}

function fitToMarkers(markers) {
  if (!markers.length) return;
  const group = L.featureGroup(markers);
  map.fitBounds(group.getBounds().pad(0.2));
}

// Construit un marker + lazy load photo
function buildMarker(row) {
  const coords = pickCoordsFromNationality(row.nationality);
  if (!coords) return null;

  const payload = {
    name: row.name,
    // conserve genre brut pour l'affichage carte (comme dans le CSV)
    genre: row.genre,
    nationality: row.nationality,
    years: row.years,
    thumbUrl: null, // lazy
    wikiUrl: row.wikipedia
  };

  const marker = L.marker([coords.lat, coords.lon], {
    title: row.name || "",
    icon: soberIcon
  });

  marker.bindTooltip(hoverHtml(payload), {
    direction: "top",
    opacity: 1,
    offset: [0, -12],
    className: "person-tooltip",
    sticky: true
  });

  marker.bindPopup(cardHtml(payload), {
    closeButton: true,
    autoPan: true,
    className: "person-popup"
  });

  async function ensureThumbAndRefresh() {
    if (payload.thumbUrl !== null) return; // déjà résolu (url ou null)
    const title = wikiTitleFromUrl(row.wikipedia);
    const thumb = await fetchWikiThumbnail(title);
    payload.thumbUrl = thumb; // peut rester null

    marker.setTooltipContent(hoverHtml(payload));
    marker.setPopupContent(cardHtml(payload));
  }

  marker.on("mouseover", async () => {
    if (PINNED_MARKER) return;

    const pref = chooseTooltipDirection(map, marker.getLatLng());
    marker.getTooltip().options.direction = pref.direction;
    marker.getTooltip().options.offset = pref.offset;

    marker.openTooltip();
    ensureThumbAndRefresh();
  });

  marker.on("mouseout", () => {
    if (!PINNED_MARKER) marker.closeTooltip();
  });

  marker.on("click", async (e) => {
    L.DomEvent.stopPropagation(e);
    marker.closeTooltip();

    if (PINNED_MARKER && PINNED_MARKER !== marker) {
      PINNED_MARKER.closePopup();
    }

    PINNED_MARKER = marker;
    marker.openPopup();

    ensureThumbAndRefresh();
  });

  marker.on("popupclose", () => {
    if (PINNED_MARKER === marker) PINNED_MARKER = null;
  });

  return marker;
}

function renderWithFilters() {
  const filters = getFilters();

  if (PINNED_MARKER) {
    PINNED_MARKER.closePopup();
    PINNED_MARKER = null;
  }

  clearMarkers();

  const filtered = ALL_ROWS.filter(r => rowMatchesFilters(r, filters));

  filtered.forEach(row => {
    const m = buildMarker(row);
    if (!m) return;
    m.addTo(layerGroup);
    CURRENT_MARKERS.push(m);
  });

  fitToMarkers(CURRENT_MARKERS);
}

document.addEventListener("DOMContentLoaded", () => {
  // init map
  map = L.map("map", { preferCanvas: true }).setView([20, 0], 2);

  // fond sombre
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  }).addTo(map);

  layerGroup = L.layerGroup().addTo(map);

  map.on("click", () => {
    if (PINNED_MARKER) {
      PINNED_MARKER.closePopup();
      PINNED_MARKER = null;
    }
  });

  // init selects
  const regionSelect = document.getElementById("regionSelect");
  const natSelect = document.getElementById("natSelect");
  const movementSelect = document.getElementById("movementSelect");

  if (regionSelect) fillSelect(regionSelect, REGIONS, "Toutes");

  const natValues = Object.keys(NATIONALITY_COORDS)
    .filter(k => NATIONALITY_COORDS[k] && Number.isFinite(NATIONALITY_COORDS[k].lat))
    .sort((a, b) => a.localeCompare(b));
  if (natSelect) fillSelect(natSelect, natValues, "Toutes");

  const onChange = () => renderWithFilters();
  regionSelect?.addEventListener("change", onChange);
  natSelect?.addEventListener("change", onChange);
  movementSelect?.addEventListener("change", onChange);

  // load CSV
  Papa.parse(CSV_PATH, {
    download: true,
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
    complete: (res) => {
      ALL_ROWS = (res.data || []).filter(r => r && r.name);

      // ✅ mouvements uniques : split puis unique
      const movements = uniqueNonEmpty(
        ALL_ROWS.flatMap(r => parseGenres(r.genre))
      ).sort((a, b) => a.localeCompare(b));

      if (movementSelect) fillSelect(movementSelect, movements, "Tous");

      renderWithFilters();
    },
    error: (err) => console.error("Erreur CSV:", err)
  });
});