// datas/vizQuali.js

// --- Stopwords FR (comparaison sans accents)
const STOPWORDS_FR = new Set([
  "a","à","au","aux","avec","ce","ces","dans","de","des","du","elle","en","et","eux","il","je","la","le","les","leur","lui","ma","mais","me","même","mes","moi","mon","ne","nos","notre","nous","on","ou","par","pas","pour","qu","que","qui","sa","se","ses","son","sur","ta","te","tes","toi","ton","tu","un","une","vos","votre","vous","c","d","j","l","n","s","t","y","ete","etre","fait","ca","ici","est","sont","etait","etaient","ai","as","avons","avez","ont","avais","avait","avions","aviez","avaient","aurai","auras","aura","aurons","aurez","auront","suis","es","sommes","etes","serai","seras","sera","serons","serez","seront","ceci","cela","cet","cette","ces","celui","celle","ceux","celles","plus","moins","tres","comme","donc","ainsi","alors","car"
]);

// ─── État global ───────────────────────────────────────────────
let LAST_FREQS        = [];
let CURRENT_FONT      = "sans-serif";
let CURRENT_BG        = "";
let CURRENT_MAX_WORDS = 50;
let BANLIST           = new Set(); // mots normalisés à exclure
let WHITELIST         = new Set(); // mots normalisés à afficher uniquement
// ───────────────────────────────────────────────────────────────

function normalizeForStopwords(word) {
  return word.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tokenize(text) {
  if (!text.trim()) return [];
  return text
    .replace(/[^\wàâäéèêëîïôùûüÿæœçÀÂÄÉÈÊËÎÏÔÙÛÜŸÆŒÇ0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(w => w.replace(/^[-']+|[-']+$/g, ""))
    .filter(w => w.length >= 3)
    .filter(w => !STOPWORDS_FR.has(normalizeForStopwords(w)))
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function wordFrequencies(tokens) {
  const map = new Map();
  for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
  return Array.from(map, ([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

// --- Applique ban-list et whitelist sur LAST_FREQS
// Priorité : si whitelist non vide → afficher seulement ces mots
//            ban-list toujours appliquée en plus
function applyFilters(freqs) {
  return freqs.filter(d => {
    const norm = normalizeForStopwords(d.word);
    if (WHITELIST.size > 0 && !WHITELIST.has(norm)) return false;
    if (BANLIST.has(norm)) return false;
    return true;
  });
}

function applyBackground(color) {
  const bg = color || "rgba(255,255,255,0.02)";
  ["wordcloud", "occurrences"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.background = bg;
  });
}

// --- Re-render l'onglet actif (avec filtres appliqués)
function rerender() {
  if (!LAST_FREQS.length) return;
  const filtered = applyFilters(LAST_FREQS);
  const tabCloud = document.getElementById("tab-cloud");
  const tabOcc   = document.getElementById("tab-occ");
  if (tabCloud && tabCloud.style.display !== "none") renderWordCloud(filtered);
  if (tabOcc   && tabOcc.style.display   !== "none") renderOccurrences(filtered);
}

// ─── Tags UI ──────────────────────────────────────────────────

function addTag(set, word, containerId, color) {
  const norm = normalizeForStopwords(word.trim());
  if (!norm || norm.length < 1 || set.has(norm)) return false;
  set.add(norm);
  renderTags(set, containerId, color);
  return true;
}

function removeTag(set, norm, containerId, color) {
  set.delete(norm);
  renderTags(set, containerId, color);
}

function renderTags(set, containerId, color) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  set.forEach(norm => {
    const pill = document.createElement("span");
    pill.style.cssText = `display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;background:${color.bg};border:1px solid ${color.border};color:${color.text};font-size:12px;margin:2px 2px 2px 0;`;
    pill.textContent = norm;
    const x = document.createElement("button");
    x.textContent = "×";
    x.title = "Retirer";
    x.style.cssText = `background:none;border:none;color:${color.text};cursor:pointer;padding:0;font-size:14px;line-height:1;opacity:0.7;`;
    x.addEventListener("click", () => { removeTag(set, norm, containerId, color); rerender(); });
    pill.appendChild(x);
    container.appendChild(pill);
  });
}

// ─────────────────────────────────────────────────────────────

// --- Tabs UI
function setupTabs() {
  const btns     = document.querySelectorAll(".tabBtn");
  const tabCloud = document.getElementById("tab-cloud");
  const tabOcc   = document.getElementById("tab-occ");

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(b => { b.style.background = "transparent"; b.style.color = "#c9d1d9"; });
      btn.style.background = "rgba(255,255,255,0.06)";
      btn.style.color = "#fff";

      const filtered = applyFilters(LAST_FREQS);
      if (btn.dataset.tab === "cloud") {
        tabCloud.style.display = "block";
        tabOcc.style.display   = "none";
        if (LAST_FREQS.length) renderWordCloud(filtered);
      } else {
        tabCloud.style.display = "none";
        tabOcc.style.display   = "block";
        if (LAST_FREQS.length) renderOccurrences(filtered);
      }
    });
  });
}

// --- Wordcloud
function renderWordCloud(freqs) {
  const container = document.getElementById("wordcloud");
  container.innerHTML = "";
  const rect   = container.getBoundingClientRect();
  const width  = Math.max(320, Math.floor(rect.width));
  const height = Math.max(260, Math.floor(rect.height));
  const top    = freqs.slice(0, CURRENT_MAX_WORDS);
  const max    = top[0]?.count || 1;
  const size   = d3.scaleLinear().domain([1, max]).range([12, 64]);
  const words  = top.map(d => ({ text: d.word, size: size(d.count), count: d.count }));

  const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
  const g   = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

  d3.layout.cloud()
    .size([width, height]).words(words).padding(2)
    .rotate(() => (Math.random() > 0.85 ? 90 : 0))
    .font(CURRENT_FONT).fontSize(d => d.size)
    .on("end", (dw) => {
      g.selectAll("text").data(dw).enter().append("text")
        .style("font-size",   d => `${d.size}px`)
        .style("font-family", CURRENT_FONT)
        .style("fill", "currentColor").style("opacity", 0.95)
        .attr("text-anchor", "middle")
        .attr("transform", d => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
        .text(d => d.text)
        .append("title").text(d => `${d.text} — ${d.count}`);
    }).start();
}

// --- Occurrences
function renderOccurrences(freqs) {
  const container = document.getElementById("occurrences");
  container.innerHTML = "";
  const rect   = container.getBoundingClientRect();
  const width  = Math.max(360, Math.floor(rect.width));
  const height = Math.max(260, Math.floor(rect.height));
  const data   = freqs.slice(0, CURRENT_MAX_WORDS).reverse();
  const margin = { top: 16, right: 16, bottom: 16, left: 110 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top  - margin.bottom;

  const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
  const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.count) || 1]).range([0, w]);
  const y = d3.scaleBand().domain(data.map(d => d.word)).range([h, 0]).padding(0.2);

  g.append("g").call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove())
    .selectAll("text")
    .style("fill", "currentColor").style("font-family", CURRENT_FONT).style("opacity", 0.9);

  g.selectAll("rect").data(data).enter().append("rect")
    .attr("x", 0).attr("y", d => y(d.word))
    .attr("height", y.bandwidth()).attr("width", d => x(d.count))
    .attr("fill", "currentColor").attr("opacity", 0.18);

  g.selectAll("text.value").data(data).enter().append("text")
    .attr("class", "value")
    .attr("x", d => x(d.count) + 6)
    .attr("y", d => (y(d.word) || 0) + y.bandwidth() / 2 + 4)
    .style("fill", "currentColor").style("font-family", CURRENT_FONT).style("opacity", 0.9)
    .text(d => d.count);
}

// ─── Export ────────────────────────────────────────────────────

// Résout currentColor depuis le conteneur (thème sombre → blanc cassé par défaut)
function resolveTextColor() {
  const el = document.getElementById("wordcloud");
  if (el) {
    const c = window.getComputedStyle(el).color;
    if (c && c !== "transparent" && c !== "") return c;
  }
  return "#e6edf3";
}

// Clone le SVG et remplace currentColor + injecte le fond si défini
function prepareSvgClone(svgEl, textColor) {
  const w = parseInt(svgEl.getAttribute("width"),  10);
  const h = parseInt(svgEl.getAttribute("height"), 10);
  const clone = svgEl.cloneNode(true);

  // Résoudre currentColor sur tous les éléments texte et rect
  clone.querySelectorAll("[style]").forEach(node => {
    if (node.style.fill === "currentColor")   node.style.fill   = textColor;
    if (node.style.color === "currentColor")  node.style.color  = textColor;
    if (node.style.stroke === "currentColor") node.style.stroke = textColor;
  });

  // Fond de couleur (inséré en premier enfant)
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", "0"); bg.setAttribute("y", "0");
  bg.setAttribute("width",  w); bg.setAttribute("height", h);
  bg.setAttribute("fill", CURRENT_BG || "#0d1117");
  clone.insertBefore(bg, clone.firstChild);

  return { clone, w, h };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Rend le SVG cloné dans un <canvas> et renvoie une Promise<canvas>
function svgToCanvas(clone, w, h, scale = 2) {
  return new Promise((resolve, reject) => {
    const str  = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([str], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      const canvas   = document.createElement("canvas");
      canvas.width   = w * scale;
      canvas.height  = h * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function setExportLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled   = loading;
  btn.style.opacity = loading ? "0.5" : "1";
}

async function exportSVG() {
  const svgEl = document.querySelector("#wordcloud svg");
  if (!svgEl) return;
  setExportLoading("exportSVG", true);
  try {
    const { clone } = prepareSvgClone(svgEl, resolveTextColor());
    const str  = new XMLSerializer().serializeToString(clone);
    triggerDownload(new Blob([str], { type: "image/svg+xml" }), "wordcloud.svg");
  } finally {
    setExportLoading("exportSVG", false);
  }
}

async function exportPNG() {
  const svgEl = document.querySelector("#wordcloud svg");
  if (!svgEl) return;
  setExportLoading("exportPNG", true);
  try {
    const { clone, w, h } = prepareSvgClone(svgEl, resolveTextColor());
    const canvas = await svgToCanvas(clone, w, h, 2);   // ×2 pour la résolution
    canvas.toBlob(blob => triggerDownload(blob, "wordcloud.png"), "image/png");
  } catch(e) {
    console.error("Export PNG :", e);
  } finally {
    setExportLoading("exportPNG", false);
  }
}

async function exportPDF() {
  const svgEl = document.querySelector("#wordcloud svg");
  if (!svgEl) return;
  if (typeof window.jspdf === "undefined") {
    alert("jsPDF est encore en cours de chargement. Réessaie dans un instant.");
    return;
  }
  setExportLoading("exportPDF", true);
  try {
    const { jsPDF }       = window.jspdf;
    const { clone, w, h } = prepareSvgClone(svgEl, resolveTextColor());
    const canvas = await svgToCanvas(clone, w, h, 2);
    const dataUrl    = canvas.toDataURL("image/png");
    const orientation = w >= h ? "l" : "p";
    const pdf  = new jsPDF({ orientation, unit: "px", format: [w, h], hotfixes: ["px_scaling"] });
    pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
    pdf.save("wordcloud.pdf");
  } catch(e) {
    console.error("Export PDF :", e);
  } finally {
    setExportLoading("exportPDF", false);
  }
}

// ─── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();

  const BAN_COLOR   = { bg: "rgba(220,60,60,0.15)",  border: "rgba(220,60,60,0.35)",  text: "#f08080" };
  const WHITE_COLOR = { bg: "rgba(60,180,120,0.15)", border: "rgba(60,180,120,0.35)", text: "#7de0b0" };

  const input         = document.getElementById("inputText");
  const btn           = document.getElementById("analyzeBtn");
  const status        = document.getElementById("status");
  const results       = document.getElementById("results");
  const fontSelect    = document.getElementById("fontSelect");
  const bgColorPicker = document.getElementById("bgColor");
  const bgReset       = document.getElementById("bgReset");
  const wordsSlider   = document.getElementById("wordsSlider");
  const wordsLabel    = document.getElementById("wordsLabel");
  const banInput      = document.getElementById("banInput");
  const banAdd        = document.getElementById("banAdd");
  const banClear      = document.getElementById("banClear");
  const wlInput       = document.getElementById("wlInput");
  const wlAdd         = document.getElementById("wlAdd");
  const wlClear       = document.getElementById("wlClear");

  // --- Slider
  wordsSlider.addEventListener("input", () => {
    CURRENT_MAX_WORDS = parseInt(wordsSlider.value, 10);
    wordsLabel.textContent = CURRENT_MAX_WORDS;
    rerender();
  });

  // --- Police
  fontSelect.addEventListener("change", () => { CURRENT_FONT = fontSelect.value; rerender(); });

  // --- Fond
  bgColorPicker.addEventListener("input", () => { CURRENT_BG = bgColorPicker.value; applyBackground(CURRENT_BG); });
  bgReset.addEventListener("click", () => { CURRENT_BG = ""; bgColorPicker.value = "#0d1117"; applyBackground(""); });

  // --- Ban-list
  function doAddBan() {
    if (addTag(BANLIST, banInput.value, "banTags", BAN_COLOR)) { banInput.value = ""; rerender(); }
  }
  banAdd.addEventListener("click", doAddBan);
  banInput.addEventListener("keydown", e => { if (e.key === "Enter") doAddBan(); });
  banClear.addEventListener("click", () => { BANLIST.clear(); renderTags(BANLIST, "banTags", BAN_COLOR); rerender(); });

  // --- Whitelist
  function doAddWl() {
    if (addTag(WHITELIST, wlInput.value, "wlTags", WHITE_COLOR)) { wlInput.value = ""; rerender(); }
  }
  wlAdd.addEventListener("click", doAddWl);
  wlInput.addEventListener("keydown", e => { if (e.key === "Enter") doAddWl(); });
  wlClear.addEventListener("click", () => { WHITELIST.clear(); renderTags(WHITELIST, "wlTags", WHITE_COLOR); rerender(); });

  // --- Analyse
  btn.addEventListener("click", () => {
    const text = input.value || "";
    status.textContent = "Analyse…";
    const tokens = tokenize(text);
    const freqs  = wordFrequencies(tokens);

    if (!tokens.length || !freqs.length) {
      results.style.display = "none";
      status.textContent = "Ajoute un texte (au moins quelques mots) 🙂";
      LAST_FREQS = [];
      return;
    }

    LAST_FREQS = freqs;
    results.style.display = "block";
    const filtered = applyFilters(freqs);
    const extra = filtered.length < freqs.length ? ` · ${filtered.length} après filtres` : "";
    status.textContent = `${tokens.length} mots retenus — ${freqs.length} termes uniques${extra}`;

    applyBackground(CURRENT_BG);
    renderWordCloud(filtered);
    document.querySelector('.tabBtn[data-tab="cloud"]').click();

    // Affiche la barre d'export
    const exportBar = document.getElementById("exportBar");
    if (exportBar) exportBar.style.display = "flex";
  });

  input.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") btn.click();
  });

  // --- Export
  document.getElementById("exportSVG")?.addEventListener("click", exportSVG);
  document.getElementById("exportPNG")?.addEventListener("click", exportPNG);
  document.getElementById("exportPDF")?.addEventListener("click", exportPDF);

  // --- Resize avec debounce
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(rerender, 150); });
});