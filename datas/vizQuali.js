// datas/vizQuali.js

// --- Stopwords FR (comparaison sans accents)
const STOPWORDS_FR = new Set([
  "a","à","au","aux","avec","ce","ces","dans","de","des","du","elle","en","et","eux","il","je","la","le","les","leur","lui","ma","mais","me","même","mes","moi","mon","ne","nos","notre","nous","on","ou","par","pas","pour","qu","que","qui","sa","se","ses","son","sur","ta","te","tes","toi","ton","tu","un","une","vos","votre","vous","c","d","j","l","n","s","t","y","ete","etre","fait","ca","ici","est","sont","etait","etaient","ai","as","avons","avez","ont","avais","avait","avions","aviez","avaient","aurai","auras","aura","aurons","aurez","auront","suis","es","sommes","etes","serai","seras","sera","serons","serez","seront","ceci","cela","cet","cette","ces","celui","celle","ceux","celles","plus","moins","tres","comme","donc","ainsi","alors","car"
]);

// État global du module
let LAST_FREQS  = [];
let CURRENT_FONT = "sans-serif";
let CURRENT_BG   = "";  // vide = fond par défaut (transparent)

// --- Normalise uniquement pour la comparaison aux stopwords (sans accents, minuscules)
function normalizeForStopwords(word) {
  return word
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// --- Tokenisation : conserve les accents, met une majuscule à chaque mot
function tokenize(text) {
  if (!text.trim()) return [];
  return text
    // Garde lettres (y compris accentuées), chiffres, apostrophes, tirets
    .replace(/[^\wàâäéèêëîïôùûüÿæœçÀÂÄÉÈÊËÎÏÔÙÛÜŸÆŒÇ0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(w => w.replace(/^[-']+|[-']+$/g, ""))               // trim apostrophes/tirets
    .filter(w => w.length >= 3)
    .filter(w => !STOPWORDS_FR.has(normalizeForStopwords(w))) // stopwords insensibles aux accents
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()); // Majuscule initiale
}

function wordFrequencies(tokens) {
  const map = new Map();
  for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
  return Array.from(map, ([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

// --- Applique la couleur de fond sur les deux conteneurs
function applyBackground(color) {
  const wc = document.getElementById("wordcloud");
  const oc = document.getElementById("occurrences");
  const bg = color || "rgba(255,255,255,0.02)";
  if (wc) wc.style.background = bg;
  if (oc) oc.style.background = bg;
}

// --- Tabs UI
function setupTabs() {
  const btns     = document.querySelectorAll(".tabBtn");
  const tabCloud = document.getElementById("tab-cloud");
  const tabOcc   = document.getElementById("tab-occ");

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      btns.forEach(b => {
        b.style.background = "transparent";
        b.style.color = "#c9d1d9";
      });
      btn.style.background = "rgba(255,255,255,0.06)";
      btn.style.color = "#fff";

      if (tab === "cloud") {
        tabCloud.style.display = "block";
        tabOcc.style.display   = "none";
        if (LAST_FREQS.length) renderWordCloud(LAST_FREQS);
      } else {
        tabCloud.style.display = "none";
        tabOcc.style.display   = "block";
        if (LAST_FREQS.length) renderOccurrences(LAST_FREQS);
      }
    });
  });
}

// --- Wordcloud (d3-cloud)
function renderWordCloud(freqs) {
  const container = document.getElementById("wordcloud");
  container.innerHTML = "";

  const rect   = container.getBoundingClientRect();
  const width  = Math.max(320, Math.floor(rect.width));
  const height = Math.max(260, Math.floor(rect.height));

  const top  = freqs.slice(0, 80);
  const max  = top[0]?.count || 1;

  const size = d3.scaleLinear().domain([1, max]).range([12, 64]);

  const words = top.map(d => ({
    text:  d.word,
    size:  size(d.count),
    count: d.count
  }));

  const svg = d3.select(container)
    .append("svg")
    .attr("width",  width)
    .attr("height", height);

  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  d3.layout.cloud()
    .size([width, height])
    .words(words)
    .padding(2)
    .rotate(() => (Math.random() > 0.85 ? 90 : 0))
    .font(CURRENT_FONT)          // ← police dynamique
    .fontSize(d => d.size)
    .on("end", (drawWords) => {
      g.selectAll("text")
        .data(drawWords)
        .enter()
        .append("text")
        .style("font-size",   d => `${d.size}px`)
        .style("font-family", CURRENT_FONT)  // ← police dynamique
        .style("fill",    "currentColor")
        .style("opacity",  0.95)
        .attr("text-anchor", "middle")
        .attr("transform",   d => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
        .text(d => d.text)
        .append("title")
        .text(d => `${d.text} — ${d.count}`);
    })
    .start();
}

// --- Occurrences (bar chart D3)
function renderOccurrences(freqs) {
  const container = document.getElementById("occurrences");
  container.innerHTML = "";

  const rect   = container.getBoundingClientRect();
  const width  = Math.max(360, Math.floor(rect.width));
  const height = Math.max(260, Math.floor(rect.height));

  const data   = freqs.slice(0, 20).reverse();
  const margin = { top: 16, right: 16, bottom: 16, left: 110 };
  const w      = width  - margin.left - margin.right;
  const h      = height - margin.top  - margin.bottom;

  const svg = d3.select(container)
    .append("svg")
    .attr("width",  width)
    .attr("height", height);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.count) || 1])
    .range([0, w]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.word))
    .range([h, 0])
    .padding(0.2);

  // Axe
  g.append("g")
    .call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove())
    .selectAll("text")
    .style("fill",        "currentColor")
    .style("font-family", CURRENT_FONT)  // ← police dynamique
    .style("opacity",     0.9);

  // Barres
  g.selectAll("rect")
    .data(data)
    .enter()
    .append("rect")
    .attr("x",       0)
    .attr("y",       d => y(d.word))
    .attr("height",  y.bandwidth())
    .attr("width",   d => x(d.count))
    .attr("fill",    "currentColor")
    .attr("opacity", 0.18);

  // Valeurs
  g.selectAll("text.value")
    .data(data)
    .enter()
    .append("text")
    .attr("class", "value")
    .attr("x",     d => x(d.count) + 6)
    .attr("y",     d => (y(d.word) || 0) + y.bandwidth() / 2 + 4)
    .style("fill",        "currentColor")
    .style("font-family", CURRENT_FONT)  // ← police dynamique
    .style("opacity",     0.9)
    .text(d => d.count);
}

// --- Orchestration
function analyzeText(text) {
  const tokens = tokenize(text);
  const freqs  = wordFrequencies(tokens);
  return { tokens, freqs };
}

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();

  const input        = document.getElementById("inputText");
  const btn          = document.getElementById("analyzeBtn");
  const status       = document.getElementById("status");
  const results      = document.getElementById("results");
  const fontSelect   = document.getElementById("fontSelect");
  const bgColorPicker = document.getElementById("bgColor");
  const bgReset      = document.getElementById("bgReset");

  // --- Changement de police : re-render l'onglet actif
  fontSelect.addEventListener("change", () => {
    CURRENT_FONT = fontSelect.value;
    if (!LAST_FREQS.length) return;
    const tabOcc   = document.getElementById("tab-occ");
    const tabCloud = document.getElementById("tab-cloud");
    if (tabCloud && tabCloud.style.display !== "none") renderWordCloud(LAST_FREQS);
    if (tabOcc   && tabOcc.style.display   !== "none") renderOccurrences(LAST_FREQS);
  });

  // --- Changement de couleur de fond (live)
  bgColorPicker.addEventListener("input", () => {
    CURRENT_BG = bgColorPicker.value;
    applyBackground(CURRENT_BG);
  });

  // --- Réinitialisation du fond
  bgReset.addEventListener("click", () => {
    CURRENT_BG = "";
    bgColorPicker.value = "#0d1117";
    applyBackground("");
  });

  // --- Analyse
  btn.addEventListener("click", () => {
    const text = input.value || "";
    status.textContent = "Analyse…";

    const { tokens, freqs } = analyzeText(text);

    if (tokens.length === 0 || freqs.length === 0) {
      results.style.display = "none";
      status.textContent = "Ajoute un texte (au moins quelques mots) 🙂";
      LAST_FREQS = [];
      return;
    }

    results.style.display = "block";
    status.textContent = `${tokens.length} mots retenus — ${freqs.length} termes uniques`;

    LAST_FREQS = freqs;
    applyBackground(CURRENT_BG);
    renderWordCloud(freqs);

    document.querySelector('.tabBtn[data-tab="cloud"]').click();
  });

  // Ctrl/Cmd + Entrée pour analyser
  input.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") btn.click();
  });

  // Resize avec debounce (évite les re-renders en rafale)
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!LAST_FREQS.length) return;
      const tabOcc   = document.getElementById("tab-occ");
      const tabCloud = document.getElementById("tab-cloud");
      if (tabOcc   && tabOcc.style.display   !== "none") renderOccurrences(LAST_FREQS);
      if (tabCloud && tabCloud.style.display !== "none") renderWordCloud(LAST_FREQS);
    }, 150);
  });
});