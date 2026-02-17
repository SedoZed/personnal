/* ============================================================
   Lab Explorer — client-side prototype
   - Data source: CSV (resource/database-test.csv)
   - Search: FlexSearch (full-text)
   - Graph: D3 force (thematic similarity)
============================================================ */

/**
 * GitHub Pages + "file://" gotchas:
 * - If you open index.html via file://, fetch() will likely fail.
 * - On GitHub Pages, relative paths are served correctly, as long as the file is committed.
 *
 * This loader tries multiple candidate paths so renames don't break silently.
 */
const CSV_CANDIDATE_URLS = [
  "resource/database-test.csv",
  "./resource/database-test.csv",
  // optional fallback if you move files later:
  "database-test.csv"
];

/** Columns in your CSV (observed) */
const COL = {
  code: "dcterms:title",
  name: "dcterms:alternative",
  rnsr: "valo:idRNSR",
  axes: "valo:hasAxe",
  hceres: "valo:domaineHceres",
  erc: "valo:domaineErc",
  kw: "valo:keywords",
  kwIA: "valo:keywords-ia",
  emails: "foaf:mbox"
};

const state = {
  labs: [],
  index: null,
  filters: {
    q: "",
    kw: [],
    erc: [],
    hceres: []
  },
  results: [],
  activeId: null,
  graph: {
    sim: null,
    nodes: [],
    links: []
  },
  debug: {
    loadedFrom: null
  }
};

// ------------------------ DOM ------------------------
const el = {
  homeView: document.getElementById("homeView"),
  resultsView: document.getElementById("resultsView"),
  navHome: document.getElementById("navHome"),
  navResults: document.getElementById("navResults"),

  loadStatus: document.getElementById("loadStatus"),

  qHome: document.getElementById("qHome"),
  kwInput: document.getElementById("kwInput"),
  ercSelect: document.getElementById("ercSelect"),
  hceresSelect: document.getElementById("hceresSelect"),
  btnSearch: document.getElementById("btnSearch"),
  btnSearchAdvanced: document.getElementById("btnSearchAdvanced"),
  btnReset: document.getElementById("btnReset"),

  qResults: document.getElementById("qResults"),
  btnBackHome: document.getElementById("btnBackHome"),

  kpiCount: document.getElementById("kpiCount"),
  listMeta: document.getElementById("listMeta"),
  labList: document.getElementById("labList"),

  pillErc: document.getElementById("pillErc"),
  pillHceres: document.getElementById("pillHceres"),
  pillKw: document.getElementById("pillKw"),

  toggleLabels: document.getElementById("toggleLabels"),
  toggleStrongLinks: document.getElementById("toggleStrongLinks"),

  detailBody: document.getElementById("detailBody"),
  btnCloseDetail: document.getElementById("btnCloseDetail"),

  svg: d3.select("#graph")
};

// Disable actions until data is loaded
el.btnSearch.disabled = true;
el.btnSearchAdvanced.disabled = true;
el.navResults.disabled = true;

// ------------------------ Utils ------------------------
function norm(s) {
  return (s ?? "").toString().trim();
}
function splitPipe(s) {
  const t = norm(s);
  if (!t) return [];
  return t.split("|").map(x => x.trim()).filter(Boolean);
}
function uniq(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b, "fr"));
}
function parseKwInput(s) {
  const t = norm(s);
  if (!t) return [];
  return t.split(",").map(x => x.trim()).filter(Boolean);
}
function containsAllTokens(haystack, tokens) {
  if (!tokens.length) return true;
  const h = haystack.toLowerCase();
  return tokens.every(t => h.includes(t.toLowerCase()));
}
function shortenPipeString(s, n = 3) {
  const a = splitPipe(s);
  return a.slice(0, n);
}
function readSelected(selectEl) {
  return Array.from(selectEl.selectedOptions).map(o => o.value);
}
function escapeHtml(str) {
  return (str ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------------------------ Robust CSV loader ------------------------
async function fetchTextWithFallback(urls) {
  let lastErr = null;

  for (const url of urls) {
    try {
      // Important on GH Pages: avoid stale cache during iteration
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} on ${url}`);
        continue;
      }
      const txt = await res.text();
      state.debug.loadedFrom = url;
      return txt;
    } catch (e) {
      lastErr = e;
    }
  }

  // Detect file:// usage -> helpful hint
  const isFile = window.location.protocol === "file:";
  const hint = isFile
    ? "Tu ouvres sûrement le fichier en file:// (double-clic). Dans ce cas fetch() échoue. Lance un mini serveur local (ex: `python -m http.server`) ou teste via GitHub Pages."
    : "Vérifie que le CSV est bien commité dans le repo et que le chemin est correct (resource/database-test.csv).";

  const tried = urls.map(u => `- ${u}`).join("\n");
  const msg =
    `Impossible de charger le CSV.\n\nChemins testés:\n${tried}\n\nDernière erreur: ${lastErr}\n\nAstuce: ${hint}`;
  throw new Error(msg);
}

// ------------------------ Load CSV ------------------------
async function loadData() {
  el.loadStatus.textContent = "Chargement des données…";

  const csvText = await fetchTextWithFallback(CSV_CANDIDATE_URLS);

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true
  });

  if (parsed.errors?.length) {
    console.warn("PapaParse errors:", parsed.errors);
  }

  const rows = parsed.data || [];

  state.labs = rows.map((r, i) => {
    const code = norm(r[COL.code]);
    const name = norm(r[COL.name]);
    const id = code || `lab_${i}`;

    const erc = splitPipe(r[COL.erc]);
    const hceres = splitPipe(r[COL.hceres]);
    const kw = splitPipe(r[COL.kw]);
    const kwIA = splitPipe(r[COL.kwIA]);
    const axes = splitPipe(r[COL.axes]);
    const emails = splitPipe(r[COL.emails]);

    // Themes used to create links (first version: intersection-based)
    const themes = uniq([...kwIA, ...kw, ...erc, ...hceres].map(x => x.trim()).filter(Boolean));

    return {
      id,
      code,
      name,
      rnsr: norm(r[COL.rnsr]),
      axes,
      erc,
      hceres,
      kw,
      kwIA,
      emails,
      themes,
      corpus: [
        code, name,
        axes.join(" "),
        erc.join(" "),
        hceres.join(" "),
        kw.join(" "),
        kwIA.join(" "),
        norm(r[COL.rnsr])
      ].join(" ")
    };
  });

  buildFacets();
  buildSearchIndex();

  el.loadStatus.textContent = `Données chargées : ${state.labs.length} labos. (source: ${state.debug.loadedFrom})`;

  el.btnSearch.disabled = false;
  el.btnSearchAdvanced.disabled = false;
  el.navResults.disabled = false;
}

// ------------------------ Facets ------------------------
function buildFacets() {
  const allErc = uniq(state.labs.flatMap(l => l.erc));
  const allHceres = uniq(state.labs.flatMap(l => l.hceres));

  fillMultiSelect(el.ercSelect, allErc);
  fillMultiSelect(el.hceresSelect, allHceres);
}

function fillMultiSelect(selectEl, options) {
  selectEl.innerHTML = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    selectEl.appendChild(o);
  }
}

// ------------------------ Search (FlexSearch) ------------------------
function buildSearchIndex() {
  const { Document } = FlexSearch;

  state.index = new Document({
    document: {
      id: "id",
      index: [
        { field: "code", tokenize: "forward" },
        { field: "name", tokenize: "forward" },
        { field: "corpus", tokenize: "full" }
      ],
      store: ["id"]
    }
  });

  for (const lab of state.labs) {
    state.index.add({
      id: lab.id,
      code: lab.code,
      name: lab.name,
      corpus: lab.corpus
    });
  }
}

function searchIds(query) {
  const q = norm(query);
  if (!q) return state.labs.map(l => l.id);

  const results = state.index.search(q, { enrich: true });
  const ids = new Set();

  for (const group of results) {
    for (const r of group.result) ids.add(r.id);
  }
  return Array.from(ids);
}

// ------------------------ Filtering ------------------------
function applyFilters() {
  const { q, kw, erc, hceres } = state.filters;

  const idsFromText = new Set(searchIds(q));
  const kwTokens = kw.map(k => k.toLowerCase());

  state.results = state.labs.filter(l => {
    if (!idsFromText.has(l.id)) return false;
    if (erc.length && !erc.some(x => l.erc.includes(x))) return false;
    if (hceres.length && !hceres.some(x => l.hceres.includes(x))) return false;
    if (kwTokens.length && !containsAllTokens(l.corpus, kwTokens)) return false;
    return true;
  });

  state.activeId = null;

  renderResults();
  buildGraphForResults();
  renderGraph();
  renderPills();
}

// ------------------------ Rendering list ------------------------
function renderResults() {
  el.kpiCount.textContent = String(state.results.length);
  el.listMeta.textContent = `${state.results.length} résultat(s)`;

  el.labList.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const lab of state.results) {
    const li = document.createElement("li");
    li.className = "labItem";
    li.dataset.id = lab.id;

    const top = document.createElement("div");
    top.className = "labCode";
    top.textContent = lab.code || lab.id;

    const name = document.createElement("div");
    name.className = "labName";
    name.textContent = lab.name || "—";

    const tags = document.createElement("div");
    tags.className = "tags";

    const tagVals = uniq([
      ...shortenPipeString(lab.kwIA.join("|"), 2),
      ...shortenPipeString(lab.erc.join("|"), 1),
      ...shortenPipeString(lab.hceres.join("|"), 1),
    ]).slice(0, 5);

    for (const t of tagVals) {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      tags.appendChild(span);
    }

    li.appendChild(top);
    li.appendChild(name);
    li.appendChild(tags);

    li.addEventListener("click", () => setActiveLab(lab.id));
    li.addEventListener("mouseenter", () => highlightNode(lab.id, true));
    li.addEventListener("mouseleave", () => highlightNode(lab.id, false));

    frag.appendChild(li);
  }

  el.labList.appendChild(frag);
}

// ------------------------ Detail panel ------------------------
function setActiveLab(id) {
  state.activeId = id;

  document.querySelectorAll(".labItem").forEach(x => {
    x.classList.toggle("is-active", x.dataset.id === id);
  });

  highlightNode(id, true, true);

  const lab = state.labs.find(l => l.id === id);
  if (!lab) return;

  el.detailBody.innerHTML = renderLabDetailHTML(lab);

  const neighbors = neighborsOf(id).slice(0, 8);
  const container = el.detailBody.querySelector("#neighbors");
  if (!container) return;

  if (!neighbors.length) {
    container.innerHTML = `<div class="muted">Aucun voisin thématique dans cette vue.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="badgeList">
      ${neighbors.map(n => `
        <button class="badge alt" data-nid="${n.id}" title="${escapeHtml(n.shared.join(" • "))}">
          ${escapeHtml(n.code)}
        </button>
      `).join("")}
    </div>
    <div class="hint" style="margin-top:8px;">Clic = ouvrir la fiche du voisin.</div>
  `;

  container.querySelectorAll("button[data-nid]").forEach(btn => {
    btn.addEventListener("click", () => setActiveLab(btn.dataset.nid));
  });
}

function neighborsOf(id) {
  const labById = new Map(state.labs.map(l => [l.id, l]));
  const links = state.graph.links || [];
  const out = [];

  for (const lk of links) {
    const s = typeof lk.source === "object" ? lk.source.id : lk.source;
    const t = typeof lk.target === "object" ? lk.target.id : lk.target;
    if (s !== id && t !== id) continue;

    const other = s === id ? t : s;
    const otherLab = labById.get(other);
    if (!otherLab) continue;

    out.push({
      id: otherLab.id,
      code: otherLab.code || otherLab.id,
      weight: lk.weight || 0,
      shared: lk.shared || []
    });
  }

  out.sort((a, b) => b.weight - a.weight);
  return out;
}

function renderLabDetailHTML(lab) {
  return `
    <div class="detailTitle">${escapeHtml(lab.code || lab.id)}</div>
    <div class="detailSubtitle">${escapeHtml(lab.name || "—")}</div>

    <div class="detailSection">
      <h3>Identifiants</h3>
      <div class="kv">
        <div class="k">RNSR</div><div class="v">${escapeHtml(lab.rnsr || "—")}</div>
      </div>
    </div>

    <div class="detailSection">
      <h3>Domaines</h3>
      <div class="badgeList">
        ${(lab.erc || []).map(x => `<span class="badge">${escapeHtml(x)}</span>`).join("")}
        ${(lab.hceres || []).map(x => `<span class="badge alt">${escapeHtml(x)}</span>`).join("")}
      </div>
    </div>

    <div class="detailSection">
      <h3>Axes</h3>
      <div class="badgeList">
        ${(lab.axes || []).map(x => `<span class="badge">${escapeHtml(x)}</span>`).join("") || `<span class="muted">—</span>`}
      </div>
    </div>

    <div class="detailSection">
      <h3>Mots-clés (IA)</h3>
      <div class="badgeList">
        ${(lab.kwIA || []).slice(0, 18).map(x => `<span class="badge alt">${escapeHtml(x)}</span>`).join("") || `<span class="muted">—</span>`}
      </div>
    </div>

    <div class="detailSection">
      <h3>Emails</h3>
      <div class="badgeList">
        ${(lab.emails || []).slice(0, 10).map(e => `<span class="badge">${escapeHtml(e)}</span>`).join("") || `<span class="muted">—</span>`}
      </div>
    </div>

    <div class="detailSection">
      <h3>Voisins thématiques</h3>
      <div id="neighbors"></div>
    </div>
  `;
}

// ------------------------ View switching ------------------------
function showHome() {
  el.homeView.classList.add("is-visible");
  el.resultsView.classList.remove("is-visible");
  el.navHome.classList.add("is-active");
  el.navResults.classList.remove("is-active");
}
function showResults() {
  el.homeView.classList.remove("is-visible");
  el.resultsView.classList.add("is-visible");
  el.navHome.classList.remove("is-active");
  el.navResults.classList.add("is-active");

  // Ensure graph layout is correct after view change
  window.setTimeout(() => {
    buildGraphForResults();
    renderGraph();
    if (state.activeId) highlightNode(state.activeId, true, true);
  }, 50);
}

// ------------------------ Pills ------------------------
function renderPills() {
  const erc = state.filters.erc.length ? `${state.filters.erc.length} sélection` : "—";
  const h = state.filters.hceres.length ? `${state.filters.hceres.length} sélection` : "—";
  const kw = state.filters.kw.length ? state.filters.kw.join(", ") : "—";

  el.pillErc.textContent = `ERC: ${erc}`;
  el.pillHceres.textContent = `HCERES: ${h}`;
  el.pillKw.textContent = `Mots-clés: ${kw}`;
}

// ------------------------ Graph (D3 force) ------------------------
function buildGraphForResults() {
  const labs = state.results;
  const strongOnly = el.toggleStrongLinks.checked;
  const minShared = strongOnly ? 2 : 1;

  const nodes = labs.map(l => ({
    id: l.id,
    code: l.code || l.id,
    name: l.name || "",
    themes: l.themes || []
  }));

  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const shared = intersect(a.themes, b.themes);
      const w = shared.length;
      if (w >= minShared) {
        links.push({
          source: a.id,
          target: b.id,
          weight: w,
          shared: shared.slice(0, 10)
        });
      }
    }
  }

  state.graph.nodes = nodes;
  state.graph.links = links;
}

function intersect(a, b) {
  if (!a?.length || !b?.length) return [];
  const sb = new Set(b);
  const out = [];
  for (const x of a) if (sb.has(x)) out.push(x);
  return out;
}

function renderGraph() {
  const svg = el.svg;
  svg.selectAll("*").remove();

  const wrap = document.querySelector(".graphWrap");
  const width = wrap.clientWidth || 800;
  const height = wrap.clientHeight || 520;

  svg.attr("viewBox", [0, 0, width, height]);

  // defs first (safe)
  const defs = svg.append("defs");
  const grad = defs.append("linearGradient")
    .attr("id", "grad")
    .attr("x1", "0%").attr("y1", "0%")
    .attr("x2", "100%").attr("y2", "100%");
  grad.append("stop").attr("offset", "0%").attr("stop-color", "#7c5cff");
  grad.append("stop").attr("offset", "100%").attr("stop-color", "#2de2e6");

  const nodes = state.graph.nodes;
  const links = state.graph.links;

  const g = svg.append("g");

  svg.call(
    d3.zoom()
      .scaleExtent([0.4, 3])
      .on("zoom", (event) => g.attr("transform", event.transform))
  );

  const link = g.append("g")
    .attr("stroke", "rgba(255,255,255,.22)")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", d => Math.min(1 + d.weight * 0.7, 6))
    .attr("opacity", d => Math.min(0.15 + d.weight * 0.12, 0.75));

  const node = g.append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", 8)
    .attr("fill", "url(#grad)")
    .attr("stroke", "rgba(255,255,255,.15)")
    .attr("stroke-width", 1);

  const labelsOn = el.toggleLabels.checked;
  const label = g.append("g")
    .selectAll("text")
    .data(labelsOn ? nodes : [])
    .join("text")
    .text(d => d.code)
    .attr("font-size", 11)
    .attr("fill", "rgba(231,233,238,.85)")
    .attr("paint-order", "stroke")
    .attr("stroke", "rgba(11,13,18,.75)")
    .attr("stroke-width", 4)
    .attr("stroke-linejoin", "round");

  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(d => 110 - Math.min(d.weight, 6) * 8))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(18));

  node.call(
    d3.drag()
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.25).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x; d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      })
  );

  node
    .on("mouseenter", (_, d) => highlightNode(d.id, true))
    .on("mouseleave", (_, d) => highlightNode(d.id, false))
    .on("click", (_, d) => setActiveLab(d.id));

  node.append("title").text(d => `${d.code}\n${d.name}`);

  sim.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    label
      .attr("x", d => d.x + 10)
      .attr("y", d => d.y + 4);
  });

  state.graph.sim = sim;
  state.graph._d3 = { node, link, label };
}

function highlightNode(id, on, sticky = false) {
  const d3ref = state.graph._d3;
  if (!d3ref) return;

  const { node, link, label } = d3ref;
  const active = sticky ? id : state.activeId;

  node
    .attr("stroke", d => {
      const isThis = d.id === id;
      const isActive = active && d.id === active;
      return (isThis && on) || isActive ? "rgba(45,226,230,.95)" : "rgba(255,255,255,.15)";
    })
    .attr("stroke-width", d => {
      const isThis = d.id === id;
      const isActive = active && d.id === active;
      return (isThis && on) || isActive ? 3 : 1;
    })
    .attr("r", d => {
      const isThis = d.id === id;
      const isActive = active && d.id === active;
      return (isThis && on) || isActive ? 11 : 8;
    });

  link
    .attr("stroke", d => {
      const s = typeof d.source === "object" ? d.source.id : d.source;
      const t = typeof d.target === "object" ? d.target.id : d.target;
      const touch = s === id || t === id;
      const touchActive = active && (s === active || t === active);
      return (touch && on) || touchActive ? "rgba(45,226,230,.5)" : "rgba(255,255,255,.22)";
    })
    .attr("opacity", d => {
      const s = typeof d.source === "object" ? d.source.id : d.source;
      const t = typeof d.target === "object" ? d.target.id : d.target;
      const touch = s === id || t === id;
      const touchActive = active && (s === active || t === active);
      return (touch && on) || touchActive ? 0.9 : Math.min(0.15 + (d.weight || 1) * 0.12, 0.75);
    });

  label.attr("fill", d => {
    const isThis = d.id === id;
    const isActive = active && d.id === active;
    return (isThis && on) || isActive ? "rgba(231,233,238,1)" : "rgba(231,233,238,.85)";
  });

  if (!sticky) {
    document.querySelectorAll(".labItem").forEach(x => {
      if (x.dataset.id === id) x.classList.toggle("is-active", on);
      else if (!state.activeId) x.classList.remove("is-active");
    });
  }
}

// ------------------------ Events ------------------------
function wireUI() {
  el.navHome.addEventListener("click", showHome);

  el.navResults.addEventListener("click", () => {
    showResults();
  });

  // Home search (simple)
  el.btnSearch.addEventListener("click", () => {
    state.filters.q = norm(el.qHome.value);
    state.filters.kw = [];
    state.filters.erc = [];
    state.filters.hceres = [];
    applyFilters();
    showResults();
  });

  // Advanced search
  el.btnSearchAdvanced.addEventListener("click", () => {
    state.filters.q = norm(el.qHome.value);
    state.filters.kw = parseKwInput(el.kwInput.value);
    state.filters.erc = readSelected(el.ercSelect);
    state.filters.hceres = readSelected(el.hceresSelect);

    applyFilters();
    showResults();
  });

  // Reset
  el.btnReset.addEventListener("click", () => {
    el.qHome.value = "";
    el.kwInput.value = "";
    Array.from(el.ercSelect.options).forEach(o => o.selected = false);
    Array.from(el.hceresSelect.options).forEach(o => o.selected = false);
    state.filters = { q: "", kw: [], erc: [], hceres: [] };
  });

  // Results quick filter
  el.qResults.addEventListener("input", () => {
    state.filters.q = norm(el.qResults.value);
    applyFilters();
  });

  el.btnBackHome.addEventListener("click", showHome);

  el.toggleLabels.addEventListener("change", () => {
    renderGraph();
    if (state.activeId) highlightNode(state.activeId, true, true);
  });

  el.toggleStrongLinks.addEventListener("change", () => {
    buildGraphForResults();
    renderGraph();
    if (state.activeId) highlightNode(state.activeId, true, true);
  });

  el.btnCloseDetail.addEventListener("click", () => {
    state.activeId = null;
    el.detailBody.innerHTML = `<div class="muted">Clique un labo (liste ou graphe).</div>`;
    document.querySelectorAll(".labItem").forEach(x => x.classList.remove("is-active"));
    highlightNode("", false);
  });

  window.addEventListener("resize", () => {
    if (el.resultsView.classList.contains("is-visible")) {
      renderGraph();
      if (state.activeId) highlightNode(state.activeId, true, true);
    }
  });
}

// ------------------------ Boot ------------------------
(async function main() {
  wireUI();
  try {
    await loadData();
    state.filters = { q: "", kw: [], erc: [], hceres: [] };
    applyFilters();
  } catch (err) {
    console.error(err);
    el.loadStatus.textContent = err.message;
    el.loadStatus.style.color = "#ff4d6d";
  }
})();
