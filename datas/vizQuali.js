// datas/vizQuali.js

// --- Stopwords FR minimalistes (à enrichir selon tes besoins)
const STOPWORDS_FR = new Set([
  "a","à","au","aux","avec","ce","ces","dans","de","des","du","elle","en","et","eux","il","je","la","le","les","leur","lui","ma","mais","me","même","mes","moi","mon","ne","nos","notre","nous","on","ou","par","pas","pour","qu","que","qui","sa","se","ses","son","sur","ta","te","tes","toi","ton","tu","un","une","vos","votre","vous","c","d","j","l","n","s","t","y","été","être","fait","ça","ici","est","sont","etait","etaient","ete","etre","ai","as","a","avons","avez","ont","avais","avait","avions","aviez","avaient","aurai","auras","aura","aurons","aurez","auront","suis","es","sommes","etes","serai","seras","sera","serons","serez","seront","ceci","cela","cet","cette","ces","celui","celle","ceux","celles","plus","moins","tres","comme","donc","ainsi","alors","car"

]);

// ✅ stocke les dernières fréquences pour pouvoir (re)rendre quand l’onglet devient visible
let LAST_FREQS = [];

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // retire accents
    .replace(/[^a-z0-9\s'-]/g, " ")                  // garde lettres/chiffres/espaces/'/-
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const clean = normalizeText(text);
  if (!clean) return [];
  return clean
    .split(" ")
    .map(w => w.replace(/^[-']+|[-']+$/g, "")) // trim apostrophes/tirets
    .filter(w => w.length >= 3)
    .filter(w => !STOPWORDS_FR.has(w));
}

function wordFrequencies(tokens) {
  const map = new Map();
  for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
  return Array.from(map, ([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

// --- Tabs UI
function setupTabs() {
  const btns = document.querySelectorAll(".tabBtn");
  const tabCloud = document.getElementById("tab-cloud");
  const tabOcc = document.getElementById("tab-occ");

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      // reset styles
      btns.forEach(b => {
        b.style.background = "transparent";
        b.style.color = "#c9d1d9";
      });

      // active style
      btn.style.background = "rgba(255,255,255,0.06)";
      btn.style.color = "#fff";

      if (tab === "cloud") {
        tabCloud.style.display = "block";
        tabOcc.style.display = "none";

        // optionnel : rerender cloud si besoin
        if (LAST_FREQS.length) renderWordCloud(LAST_FREQS);
      } else {
        tabCloud.style.display = "none";
        tabOcc.style.display = "block";

        // ✅ IMPORTANT : le conteneur est visible => dimensions correctes
        if (LAST_FREQS.length) renderOccurrences(LAST_FREQS);
      }
    });
  });
}

// --- Wordcloud (d3-cloud)
function renderWordCloud(freqs) {
  const container = document.getElementById("wordcloud");
  container.innerHTML = "";

  const rect = container.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(260, Math.floor(rect.height));

  const top = freqs.slice(0, 80);
  const max = top[0]?.count || 1;

  const size = d3.scaleLinear()
    .domain([1, max])
    .range([12, 64]);

  const words = top.map(d => ({
    text: d.word,
    size: size(d.count),
    count: d.count
  }));

  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  d3.layout.cloud()
    .size([width, height])
    .words(words)
    .padding(2)
    .rotate(() => (Math.random() > 0.85 ? 90 : 0))
    .font("sans-serif")
    .fontSize(d => d.size)
    .on("end", (drawWords) => {
      g.selectAll("text")
        .data(drawWords)
        .enter()
        .append("text")
        .style("font-size", d => `${d.size}px`)
        .style("font-family", "sans-serif")
        .style("fill", "currentColor")
        .style("opacity", 0.95)
        .attr("text-anchor", "middle")
        .attr("transform", d => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
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

  const rect = container.getBoundingClientRect();
  const width = Math.max(360, Math.floor(rect.width));
  const height = Math.max(260, Math.floor(rect.height));

  const data = freqs.slice(0, 20).reverse(); // top 20, affiché du bas vers le haut

  const margin = { top: 16, right: 16, bottom: 16, left: 110 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;

  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
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

  // Axes
  g.append("g")
    .call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove())
    .selectAll("text")
    .style("fill", "currentColor")
    .style("opacity", 0.9);

  // Bars
  g.selectAll("rect")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", 0)
    .attr("y", d => y(d.word))
    .attr("height", y.bandwidth())
    .attr("width", d => x(d.count))
    .attr("fill", "currentColor")
    .attr("opacity", 0.18);

  // Values
  g.selectAll("text.value")
    .data(data)
    .enter()
    .append("text")
    .attr("class", "value")
    .attr("x", d => x(d.count) + 6)
    .attr("y", d => (y(d.word) || 0) + y.bandwidth() / 2 + 4)
    .style("fill", "currentColor")
    .style("opacity", 0.9)
    .text(d => d.count);
}

// --- Orchestration
function analyzeText(text) {
  const tokens = tokenize(text);
  const freqs = wordFrequencies(tokens);
  return { tokens, freqs };
}

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();

  const input = document.getElementById("inputText");
  const btn = document.getElementById("analyzeBtn");
  const status = document.getElementById("status");
  const results = document.getElementById("results");

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

    // ✅ mémorise pour l’onglet occurrences
    LAST_FREQS = freqs;

    // ✅ nuage direct (visible)
    renderWordCloud(freqs);

    // ✅ ne pas rendre occurrences ici (souvent caché => width/height = 0)
    // renderOccurrences(freqs);

    // Remet sur l'onglet nuage
    document.querySelector('.tabBtn[data-tab="cloud"]').click();
  });

  // Option UX : Ctrl+Enter / Cmd+Enter pour analyser
  input.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") btn.click();
  });

  // ✅ rerender au resize si l’onglet est visible
  window.addEventListener("resize", () => {
    const tabOcc = document.getElementById("tab-occ");
    const tabCloud = document.getElementById("tab-cloud");

    if (LAST_FREQS.length) {
      if (tabOcc && tabOcc.style.display !== "none") renderOccurrences(LAST_FREQS);
      if (tabCloud && tabCloud.style.display !== "none") renderWordCloud(LAST_FREQS);
    }
  });
});
