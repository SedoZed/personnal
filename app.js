/* ============================================================
   Lab Explorer — anti-freeze build
============================================================ */

const CSV_RELATIVE_PATH = "resource/database-test.csv"; // <- ton nouveau dossier

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
  filters: { q: "", kw: [], erc: [], hceres: [] },
  results: [],
  activeId: null,
  graph: { sim: null, nodes: [], links: [], _d3: null },
  debug: { csvUrl: null }
};

function $(id) { return document.getElementById(id); }

function setStatus(msg, isError = false) {
  const s = $("loadStatus");
  if (!s) return;
  s.textContent = msg;
  s.style.color = isError ? "#ff4d6d" : "";
}

function assertLibs() {
  const missing = [];
  if (typeof Papa === "undefined") missing.push("PapaParse");
  if (typeof FlexSearch === "undefined") missing.push("FlexSearch");
  if (typeof d3 === "undefined") missing.push("D3");
  if (missing.length) {
    throw new Error(
      `Librairies non chargées: ${missing.join(", ")}. ` +
      `Cause probable: CDN bloqué ou offline.`
    );
  }
}

function norm(s) { return (s ?? "").toString().trim(); }
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
function escapeHtml(str) {
  return (str ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function readSelected(selectEl) {
  return Array.from(selectEl.selectedOptions).map(o => o.value);
}

async function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Critical fix for GitHub Pages subpath:
 * Use document.baseURI to resolve absolute URL correctly.
 */
function resolveCsvUrl() {
  const url = new URL(CSV_RELATIVE_PATH, document.baseURI).toString();
  state.debug.csvUrl = url;
  return url;
}

// ------------------------ DOM refs (after libs are present) ------------------------
let el = null;

function bindDom() {
  el = {
    homeView: $("homeView"),
    resultsView: $("resultsView"),
    navHome: $("navHome"),
    navResults: $("navResults"),

    qHome: $("qHome"),
    kwInput: $("kwInput"),
    ercSelect: $("ercSelect"),
    hceresSelect: $("hceresSelect"),
    btnSearch: $("btnSearch"),
    btnSearchAdvanced: $("btnSearchAdvanced"),
    btnReset: $("btnReset"),

    qResults: $("qResults"),
    btnBackHome: $("btnBackHome"),

    kpiCount: $("kpiCount"),
    listMeta: $("listMeta"),
    labList: $("labList"),

    pillErc: $("pillErc"),
    pillHceres: $("pillHceres"),
    pillKw: $("pillKw"),

    toggleLabels: $("toggleLabels"),
    toggleStrongLinks: $("toggleStrongLinks"),

    detailBody: $("detailBody"),
    btnCloseDetail: $("btnCloseDetail"),

    svg: d3.select("#graph")
  };

  // disable until loaded
  el.btnSearch.disabled = true;
  el.btnSearchAdvanced.disabled = true;
  el.navResults.disabled = true;
}

// ------------------------ CSV load ------------------------
async function loadData() {
  setStatus("Chargement des données…");

  const csvUrl = resolveCsvUrl();
  setStatus(`Chargement des données… (source: ${csvUrl})`);

  const res = await fetchWithTimeout(csvUrl, 15000);
  if (!res.ok) {
    throw new Error(`CSV introuvable (HTTP ${res.status}). URL: ${csvUrl}`);
  }

  const csvText = await res.text();

  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  if (parsed.errors?.length) console.warn("PapaParse errors:", parsed.errors);

  const rows = parsed.data || [];
  if (!rows.length) {
    throw new Error(`CSV chargé mais vide (ou parsing KO). URL: ${csvUrl}`);
  }

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

    const themes = uniq([...kwIA, ...kw, ...erc, ...hceres].filter(Boolean));

    return {
      id, code, name,
      rnsr: norm(r[COL.rnsr]),
      axes, erc, hceres, kw, kwIA, emails,
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

  setStatus(`Données chargées : ${state.labs.length} labos.`);
  el.btnSearch.disabled = false;
  el.btnSearchAdvanced.disabled = false;
  el.navResults.disabled = false;
}

// ------------------------ Facets ------------------------
function fillMultiSelect(selectEl, options) {
  selectEl.innerHTML = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    selectEl.appendChild(o);
  }
}
function buildFacets() {
  const allErc = uniq(state.labs.flatMap(l => l.erc));
  const allHceres = uniq(state.labs.flatMap(l => l.hceres));
  fillMultiSelect(el.ercSelect, allErc);
  fillMultiSelect(el.hceresSelect, allHceres);
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

// ------------------------ Render list ------------------------
function renderResults() {
  el.kpiCount.textContent = String(state.results.length);
  el.listMeta.textContent = `${state.results.length} résultat(s)`;
  el.labList.innerHTML = "";

  const frag = document.createDocumentFragment();

  for (const lab of state.results) {
    const li = document.createElement("li");
    li.className = "labItem";
    li.dataset.id = lab.id;

    li.innerHTML = `
      <div class="labCode">${escapeHtml(lab.code || lab.id)}</div>
      <div class="labName">${escapeHtml(lab.name || "—")}</div>
      <div class="tags">
        ${uniq([...lab.kwIA.slice(0,2), ...lab.erc.slice(0,1), ...lab.hceres.slice(0,1)])
          .slice(0,5)
          .map(t => `<span class="tag">${escapeHtml(t)}</span>`)
          .join("")}
      </div>
    `;

    li.addEventListener("click", () => setActiveLab(lab.id));
    frag.appendChild(li);
  }

  el.labList.appendChild(frag);
}

// ------------------------ Detail ------------------------
function setActiveLab(id) {
  state.activeId = id;
  document.querySelectorAll(".labItem").forEach(x => {
    x.classList.toggle("is-active", x.dataset.id === id);
  });

  const lab = state.labs.find(l => l.id === id);
  if (!lab) return;

  el.detailBody.innerHTML = `
    <div class="detailTitle">${escapeHtml(lab.code || lab.id)}</div>
    <div class="detailSubtitle">${escapeHtml(lab.name || "—")}</div>

    <div class="detailSection">
      <h3>Domaines</h3>
      <div class="badgeList">
        ${(lab.erc || []).map(x => `<span class="badge">${escapeHtml(x)}</span>`).join("")}
        ${(lab.hceres || []).map(x => `<span class="badge alt">${escapeHtml(x)}</span>`).join("")}
      </div>
    </div>

    <div class="detailSection">
      <h3>Mots-clés (IA)</h3>
      <div class="badgeList">
        ${(lab.kwIA || []).slice(0,18).map(x => `<span class="badge alt">${escapeHtml(x)}</span>`).join("") || `<span class="muted">—</span>`}
      </div>
    </div>
  `;
}

// ------------------------ Views ------------------------
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
  setTimeout(() => renderGraph(), 50);
}

// ------------------------ Pills ------------------------
function renderPills() {
  el.pillErc.textContent = `ERC: ${state.filters.erc.length ? `${state.filters.erc.length} sélection` : "—"}`;
  el.pillHceres.textContent = `HCERES: ${state.filters.hceres.length ? `${state.filters.hceres.length} sélection` : "—"}`;
  el.pillKw.textContent = `Mots-clés: ${state.filters.kw.length ? state.filters.kw.join(", ") : "—"}`;
}

// ------------------------ Graph (D3) ------------------------
function intersect(a, b) {
  if (!a?.length || !b?.length) return [];
  const sb = new Set(b);
  const out = [];
  for (const x of a) if (sb.has(x)) out.push(x);
  return out;
}

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
      const shared = intersect(nodes[i].themes, nodes[j].themes);
      const w = shared.length;
      if (w >= minShared) links.push({ source: nodes[i].id, target: nodes[j].id, weight: w });
    }
  }

  state.graph.nodes = nodes;
  state.graph.links = links;
}

function renderGraph() {
  const svg = el.svg;
  svg.selectAll("*").remove();

  const wrap = document.querySelector(".graphWrap");
  const width = wrap?.clientWidth || 800;
  const height = wrap?.clientHeight || 520;

  svg.attr("viewBox", [0, 0, width, height]);

  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "grad").attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "100%");
  grad.append("stop").attr("offset", "0%").attr("stop-color", "#7c5cff");
  grad.append("stop").attr("offset", "100%").attr("stop-color", "#2de2e6");

  const nodes = state.graph.nodes;
  const links = state.graph.links;

  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([0.4, 3]).on("zoom", (event) => g.attr("transform", event.transform)));

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
    .attr("stroke-width", 1)
    .on("click", (_, d) => setActiveLab(d.id));

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

  sim.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node.attr("cx", d => d.x).attr("cy", d => d.y);
    label.attr("x", d => d.x + 10).attr("y", d => d.y + 4);
  });

  state.graph.sim = sim;
  state.graph._d3 = { node, link, label };
}

// ------------------------ Events ------------------------
function wireUI() {
  el.navHome.addEventListener("click", showHome);
  el.navResults.addEventListener("click", showResults);

  el.btnSearch.addEventListener("click", () => {
    state.filters = { q: norm(el.qHome.value), kw: [], erc: [], hceres: [] };
    applyFilters();
    showResults();
  });

  el.btnSearchAdvanced.addEventListener("click", () => {
    state.filters = {
      q: norm(el.qHome.value),
      kw: parseKwInput(el.kwInput.value),
      erc: readSelected(el.ercSelect),
      hceres: readSelected(el.hceresSelect)
    };
    applyFilters();
    showResults();
  });

  el.btnReset.addEventListener("click", () => {
    el.qHome.value = "";
    el.kwInput.value = "";
    Array.from(el.ercSelect.options).forEach(o => (o.selected = false));
    Array.from(el.hceresSelect.options).forEach(o => (o.selected = false));
    state.filters = { q: "", kw: [], erc: [], hceres: [] };
  });

  el.qResults.addEventListener("input", () => {
    state.filters.q = norm(el.qResults.value);
    applyFilters();
  });

  el.btnBackHome.addEventListener("click", showHome);

  el.toggleLabels.addEventListener("change", () => renderGraph());
  el.toggleStrongLinks.addEventListener("change", () => {
    buildGraphForResults();
    renderGraph();
  });

  el.btnCloseDetail.addEventListener("click", () => {
    state.activeId = null;
    el.detailBody.innerHTML = `<div class="muted">Clique un labo (liste ou graphe).</div>`;
    document.querySelectorAll(".labItem").forEach(x => x.classList.remove("is-active"));
  });
}

// ------------------------ Boot ------------------------
(async function boot() {
  try {
    assertLibs();
    bindDom();
    wireUI();

    await loadData();
    applyFilters();

  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
  }
})();
