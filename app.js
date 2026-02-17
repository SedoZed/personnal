/* ============================================================
   Lab Explorer — Robust version
   - CSV load (relative URL + diagnostic + file import fallback)
   - Search: FlexSearch
   - Similarity: TF-IDF + cosine with inverted index (efficient)
   - Clustering: Louvain (graphology)
   - Rendering: D3 force graph
============================================================ */

const DEFAULT_DATA_PATH = "data/database-test.csv";

/** Columns in your CSV */
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

  tfidf: {
    // per lab: { w: Map(term->weight), norm: number }
    vectors: new Map(),
    // inverted index: term -> Array<{id, w}>
    inv: new Map(),
    // idf: term -> number
    idf: new Map()
  },

  graph: {
    sim: null,
    nodes: [],
    links: [],
    clusters: new Map(), // id -> community
    palette: null,
    _d3: null
  }
};

// ------------------------ DOM ------------------------
const el = {
  homeView: document.getElementById("homeView"),
  resultsView: document.getElementById("resultsView"),
  navHome: document.getElementById("navHome"),
  navResults: document.getElementById("navResults"),

  loadStatus: document.getElementById("loadStatus"),
  loadDiag: document.getElementById("loadDiag"),

  qHome: document.getElementById("qHome"),
  kwInput: document.getElementById("kwInput"),
  ercSelect: document.getElementById("ercSelect"),
  hceresSelect: document.getElementById("hceresSelect"),
  btnSearch: document.getElementById("btnSearch"),
  btnSearchAdvanced: document.getElementById("btnSearchAdvanced"),
  btnReset: document.getElementById("btnReset"),

  btnImport: document.getElementById("btnImport"),
  fileInput: document.getElementById("fileInput"),

  qResults: document.getElementById("qResults"),
  btnBackHome: document.getElementById("btnBackHome"),

  kpiCount: document.getElementById("kpiCount"),
  listMeta: document.getElementById("listMeta"),
  labList: document.getElementById("labList"),

  pillErc: document.getElementById("pillErc"),
  pillHceres: document.getElementById("pillHceres"),
  pillKw: document.getElementById("pillKw"),

  toggleLabels: document.getElementById("toggleLabels"),
  toggleCluster: document.getElementById("toggleCluster"),
  simThreshold: document.getElementById("simThreshold"),
  simThresholdVal: document.getElementById("simThresholdVal"),
  topK: document.getElementById("topK"),
  topKVal: document.getElementById("topKVal"),

  detailBody: document.getElementById("detailBody"),
  btnCloseDetail: document.getElementById("btnCloseDetail"),

  svg: d3.select("#graph")
};

// ------------------------ Utils ------------------------
function norm(s) { return (s ?? "").toString().trim(); }
function splitPipe(s) {
  const t = norm(s);
  if (!t) return [];
  return t.split("|").map(x => x.trim()).filter(Boolean);
}
function uniq(arr) {
  return Array.from(new Set(arr)).sort((a,b)=>a.localeCompare(b, "fr"));
}
function escapeHtml(str) {
  return (str ?? "").toString()
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function parseKwInput(s) {
  const t = norm(s);
  if (!t) return [];
  return t.split(",").map(x => x.trim()).filter(Boolean);
}
function readSelected(selectEl) {
  return Array.from(selectEl.selectedOptions).map(o => o.value);
}
function containsAllTokens(haystack, tokens) {
  if (!tokens.length) return true;
  const h = haystack.toLowerCase();
  return tokens.every(t => h.includes(t.toLowerCase()));
}
function tokenize(s) {
  const t = norm(s).toLowerCase();
  return t
    .replace(/[’']/g, " ")
    .replace(/[^a-zàâäçéèêëîïôöùûüÿñæœ0-9\s-]/gi, " ")
    .split(/\s+/)
    .map(x => x.trim())
    .filter(x => x.length >= 2);
}
function showDiag(msg) {
  el.loadDiag.style.display = "block";
  el.loadDiag.textContent = msg;
}

// ------------------------ CSV loading (fix path + fallback import) ------------------------
function resolveUrl(relPath) {
  // Works on GitHub Pages under /repo/ and with index.html
  return new URL(relPath, window.location.href).href;
}

async function loadCsvFromUrl(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return await r.text();
}

function loadCsvFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.onload = () => resolve(reader.result);
    reader.readAsText(file);
  });
}

async function loadData() {
  el.loadStatus.textContent = "Chargement des données…";
  el.loadDiag.style.display = "none";

  const url = resolveUrl(DEFAULT_DATA_PATH);

  try {
    const csvText = await loadCsvFromUrl(url);
    parseAndBuild(csvText);
    el.loadStatus.textContent = `Données chargées : ${state.labs.length} laboratoires.`;
  } catch (err) {
    console.error(err);
    el.loadStatus.textContent = "CSV introuvable via fetch.";
    el.loadStatus.style.color = "#ff4d6d";
    showDiag(
      `Diagnostic:
- Chemin tenté: ${url}
- Vérifie que le CSV est bien dans /data/database-test.csv
- Sur GitHub Pages, évite les chemins absolus "/data/..."
- En local, lance un serveur (ex: "python -m http.server") au lieu de file://
Tu peux aussi cliquer "Importer un CSV".`
    );
    throw err;
  }
}

function parseAndBuild(csvText) {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data;

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

    // themes text used in tf-idf: prioritize keywords-ia + keywords + domains + axes
    const themesText = [
      ...kwIA, ...kw, ...erc, ...hceres, ...axes
    ].join(" ");

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
      themesText,
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
  buildTfidf(); // precompute once on full dataset

  el.btnSearch.disabled = false;
  el.btnSearchAdvanced.disabled = false;
  el.navResults.disabled = false;

  // initial view
  state.filters = { q:"", kw:[], erc:[], hceres:[] };
  applyFilters();
}

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
    state.index.add({ id: lab.id, code: lab.code, name: lab.name, corpus: lab.corpus });
  }
}

function searchIds(query) {
  const q = norm(query);
  if (!q) return state.labs.map(l => l.id);

  const results = state.index.search(q, { enrich: true });
  const ids = new Set();
  for (const group of results) for (const r of group.result) ids.add(r.id);
  return Array.from(ids);
}

// ------------------------ TF-IDF + cosine ------------------------
function buildTfidf() {
  // Build document frequencies
  const df = new Map(); // term -> count docs containing
  const docsTokens = new Map(); // id -> tokens array (unique per doc)

  for (const lab of state.labs) {
    const tokens = tokenize(lab.themesText);
    const uniqueTokens = Array.from(new Set(tokens));
    docsTokens.set(lab.id, uniqueTokens);

    for (const t of uniqueTokens) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }

  const N = state.labs.length;
  state.tfidf.idf = new Map();
  for (const [t, c] of df.entries()) {
    // smooth idf
    const idf = Math.log((N + 1) / (c + 1)) + 1;
    state.tfidf.idf.set(t, idf);
  }

  // Build per-doc vectors + inverted index
  state.tfidf.vectors = new Map();
  state.tfidf.inv = new Map();

  for (const lab of state.labs) {
    const tokens = tokenize(lab.themesText);
    if (!tokens.length) {
      state.tfidf.vectors.set(lab.id, { w: new Map(), norm: 0 });
      continue;
    }

    // term frequencies
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

    // tf-idf weights
    const w = new Map();
    let norm2 = 0;
    for (const [t, c] of tf.entries()) {
      const idf = state.tfidf.idf.get(t);
      if (!idf) continue;
      const weight = (1 + Math.log(c)) * idf;
      w.set(t, weight);
      norm2 += weight * weight;
    }
    const v = { w, norm: Math.sqrt(norm2) };
    state.tfidf.vectors.set(lab.id, v);

    // inverted index for cosine dot products
    for (const [t, weight] of w.entries()) {
      if (!state.tfidf.inv.has(t)) state.tfidf.inv.set(t, []);
      state.tfidf.inv.get(t).push({ id: lab.id, w: weight });
    }
  }
}

function cosineSim(idA, idB, accumDot) {
  const vA = state.tfidf.vectors.get(idA);
  const vB = state.tfidf.vectors.get(idB);
  if (!vA || !vB || !vA.norm || !vB.norm) return 0;
  return accumDot / (vA.norm * vB.norm);
}

// Build edges among current results efficiently using inverted index
function buildGraphForResults() {
  const labs = state.results;
  const ids = new Set(labs.map(l => l.id));
  const threshold = Number(el.simThreshold.value);
  const topK = Number(el.topK.value);

  // nodes
  const nodes = labs.map(l => ({
    id: l.id,
    code: l.code || l.id,
    name: l.name || ""
  }));

  // accumulate dot products using terms
  const dots = new Map(); // key "a|b" -> dot
  const sharedTopTerms = new Map(); // key -> array of {t, contrib}

  // for each term, consider docs in results containing term
  for (const [term, postings] of state.tfidf.inv.entries()) {
    const filtered = postings.filter(p => ids.has(p.id));
    if (filtered.length < 2) continue;

    // pairwise within this term (can be heavy if term is extremely common; idf smooth reduces its effect)
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const a = filtered[i], b = filtered[j];
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const contrib = a.w * b.w;

        dots.set(key, (dots.get(key) || 0) + contrib);

        // track top contributing terms (for tooltip)
        if (!sharedTopTerms.has(key)) sharedTopTerms.set(key, []);
        const arr = sharedTopTerms.get(key);
        arr.push({ t: term, c: contrib });
      }
    }
  }

  // compute cosine and keep topK per node
  const candidateLinks = [];
  for (const [key, dot] of dots.entries()) {
    const [a, b] = key.split("|");
    const sim = cosineSim(a, b, dot);
    if (sim >= threshold) {
      const terms = (sharedTopTerms.get(key) || [])
        .sort((x,y)=>y.c-x.c)
        .slice(0, 8)
        .map(x => x.t);

      candidateLinks.push({ source: a, target: b, weight: sim, terms });
    }
  }

  // enforce topK neighbors per node (by similarity)
  const byNode = new Map(); // id -> links
  for (const lk of candidateLinks) {
    if (!byNode.has(lk.source)) byNode.set(lk.source, []);
    if (!byNode.has(lk.target)) byNode.set(lk.target, []);
    byNode.get(lk.source).push(lk);
    byNode.get(lk.target).push(lk);
  }

  const keep = new Set();
  for (const [id, arr] of byNode.entries()) {
    arr.sort((a,b)=>b.weight-a.weight);
    for (const lk of arr.slice(0, topK)) {
      const key = lk.source < lk.target ? `${lk.source}|${lk.target}` : `${lk.target}|${lk.source}`;
      keep.add(key);
    }
  }

  const links = candidateLinks.filter(lk => {
    const key = lk.source < lk.target ? `${lk.source}|${lk.target}` : `${lk.target}|${lk.source}`;
    return keep.has(key);
  });

  state.graph.nodes = nodes;
  state.graph.links = links;

  // clustering
  computeClustersIfEnabled();
}

function computeClustersIfEnabled() {
  state.graph.clusters = new Map();

  if (!el.toggleCluster.checked) return;

  const Graph = graphology.Graph;
  const g = new Graph({ type: "undirected" });

  for (const n of state.graph.nodes) g.addNode(n.id);
  for (const e of state.graph.links) {
    const key = `${e.source}->${e.target}`;
    if (!g.hasEdge(e.source, e.target)) g.addEdge(e.source, e.target, { weight: e.weight, key });
  }

  const communities = graphologyCommunitiesLouvain.louvain(g, { weightAttribute: "weight" });
  for (const [id, c] of Object.entries(communities)) state.graph.clusters.set(id, c);

  const uniqClusters = Array.from(new Set(state.graph.clusters.values()));
  state.graph.palette = d3.scaleOrdinal(uniqClusters, d3.schemeTableau10.concat(d3.schemeSet3));
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

    const tagVals = uniq([...(lab.kwIA||[]).slice(0,3), ...(lab.erc||[]).slice(0,1), ...(lab.hceres||[]).slice(0,1)]).slice(0,5);
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

  const neighbors = neighborsOf(id).slice(0, 10);
  const container = el.detailBody.querySelector("#neighbors");
  if (container) {
    if (!neighbors.length) container.innerHTML = `<div class="muted">Aucun voisin au seuil actuel.</div>`;
    else {
      container.innerHTML = `
        <div class="badgeList">
          ${neighbors.map(n => `
            <button class="badge alt" data-nid="${n.id}" title="${escapeHtml(n.terms.join(" • "))}">
              ${escapeHtml(n.code)} <span style="opacity:.7;">(${n.weight.toFixed(2)})</span>
            </button>
          `).join("")}
        </div>
        <div class="hint" style="margin-top:8px;">Clic = ouvrir la fiche du voisin.</div>
      `;
      container.querySelectorAll("button[data-nid]").forEach(btn => {
        btn.addEventListener("click", () => setActiveLab(btn.dataset.nid));
      });
    }
  }
}

function neighborsOf(id) {
  const labById = new Map(state.labs.map(l => [l.id, l]));
  const out = [];

  for (const lk of state.graph.links || []) {
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
      terms: lk.terms || []
    });
  }

  out.sort((a,b)=>b.weight-a.weight);
  return out;
}

function renderLabDetailHTML(lab) {
  const comm = state.graph.clusters.get(lab.id);
  return `
    <div class="detailTitle">${escapeHtml(lab.code || lab.id)}</div>
    <div class="detailSubtitle">${escapeHtml(lab.name || "—")}</div>

    <div class="detailSection">
      <h3>Identifiants</h3>
      <div class="kv">
        <div class="k">RNSR</div><div class="v">${escapeHtml(lab.rnsr || "—")}</div>
        <div class="k">Cluster</div><div class="v">${comm !== undefined ? escapeHtml(String(comm)) : "—"}</div>
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
      <h3>Voisins thématiques (TF-IDF)</h3>
      <div id="neighbors"></div>
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

// ------------------------ Graph rendering (D3) ------------------------
function nodeColor(d) {
  if (!el.toggleCluster.checked) return "#7c5cff";
  const c = state.graph.clusters.get(d.id);
  return state.graph.palette ? state.graph.palette(c) : "#7c5cff";
}

function renderGraph() {
  const svg = el.svg;
  svg.selectAll("*").remove();

  const wrap = document.querySelector(".graphWrap");
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  svg.attr("viewBox", [0, 0, width, height]);

  const nodes = state.graph.nodes;
  const links = state.graph.links;

  const g = svg.append("g");
  svg.call(
    d3.zoom().scaleExtent([0.35, 3]).on("zoom", (event) => g.attr("transform", event.transform))
  );

  const link = g.append("g")
    .attr("stroke", "rgba(255,255,255,.22)")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke-width", d => 1 + Math.min(d.weight * 6, 5))
    .attr("opacity", d => Math.min(0.12 + d.weight * 1.4, 0.85));

  const node = g.append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", 8)
    .attr("fill", d => nodeColor(d))
    .attr("stroke", "rgba(255,255,255,.18)")
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

  node.append("title").text(d => d.name ? `${d.code}\n${d.name}` : d.code);

  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(d => 130 - Math.min(d.weight * 90, 70)))
    .force("charge", d3.forceManyBody().strength(-280))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius(18));

  node.call(
    d3.drag()
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.25).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      })
  );

  node
    .on("mouseenter", (_, d) => highlightNode(d.id, true))
    .on("mouseleave", (_, d) => highlightNode(d.id, false))
    .on("click", (_, d) => setActiveLab(d.id));

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

function highlightNode(id, on, sticky=false) {
  const d3ref = state.graph._d3;
  if (!d3ref) return;

  const { node, link, label } = d3ref;
  const active = sticky ? id : state.activeId;

  node
    .attr("stroke", d => ((d.id === id && on) || (active && d.id === active)) ? "rgba(45,226,230,.95)" : "rgba(255,255,255,.18)")
    .attr("stroke-width", d => ((d.id === id && on) || (active && d.id === active)) ? 3 : 1)
    .attr("r", d => ((d.id === id && on) || (active && d.id === active)) ? 11 : 8)
    .attr("fill", d => nodeColor(d));

  link
    .attr("stroke", d => {
      const s = typeof d.source === "object" ? d.source.id : d.source;
      const t = typeof d.target === "object" ? d.target.id : d.target;
      const touch = (s === id || t === id);
      const touchActive = active && (s === active || t === active);
      return (touch && on) || touchActive ? "rgba(45,226,230,.55)" : "rgba(255,255,255,.22)";
    })
    .attr("opacity", d => {
      const s = typeof d.source === "object" ? d.source.id : d.source;
      const t = typeof d.target === "object" ? d.target.id : d.target;
      const touch = (s === id || t === id);
      const touchActive = active && (s === active || t === active);
      return (touch && on) || touchActive ? 0.95 : Math.min(0.12 + d.weight * 1.4, 0.85);
    });

  label.attr("fill", d => ((d.id === id && on) || (active && d.id === active)) ? "rgba(231,233,238,1)" : "rgba(231,233,238,.85)");

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
    window.setTimeout(() => {
      buildGraphForResults();
      renderGraph();
    }, 60);
  });

  el.btnSearch.addEventListener("click", () => {
    state.filters.q = norm(el.qHome.value);
    state.filters.kw = [];
    state.filters.erc = [];
    state.filters.hceres = [];
    applyFilters();
    showResults();
  });

  el.btnSearchAdvanced.addEventListener("click", () => {
    state.filters.q = norm(el.qHome.value);
    state.filters.kw = parseKwInput(el.kwInput.value);
    state.filters.erc = readSelected(el.ercSelect);
    state.filters.hceres = readSelected(el.hceresSelect);
    applyFilters();
    showResults();
  });

  el.btnReset.addEventListener("click", () => {
    el.qHome.value = "";
    el.kwInput.value = "";
    Array.from(el.ercSelect.options).forEach(o => o.selected = false);
    Array.from(el.hceresSelect.options).forEach(o => o.selected = false);
    state.filters = { q:"", kw:[], erc:[], hceres:[] };
  });

  el.qResults.addEventListener("input", () => {
    state.filters.q = norm(el.qResults.value);
    applyFilters();
  });

  el.btnBackHome.addEventListener("click", showHome);

  // graph controls
  function refreshGraphControls() {
    el.simThresholdVal.textContent = Number(el.simThreshold.value).toFixed(2);
    el.topKVal.textContent = String(el.topK.value);
    buildGraphForResults();
    renderGraph();
    if (state.activeId) highlightNode(state.activeId, true, true);
  }

  el.simThreshold.addEventListener("input", refreshGraphControls);
  el.topK.addEventListener("input", refreshGraphControls);
  el.toggleLabels.addEventListener("change", refreshGraphControls);
  el.toggleCluster.addEventListener("change", refreshGraphControls);

  el.btnCloseDetail.addEventListener("click", () => {
    state.activeId = null;
    el.detailBody.innerHTML = `<div class="muted">Clique un labo (liste ou graphe).</div>`;
    document.querySelectorAll(".labItem").forEach(x => x.classList.remove("is-active"));
    highlightNode("", false);
  });

  // Import CSV fallback
  el.btnImport.addEventListener("click", () => el.fileInput.click());
  el.fileInput.addEventListener("change", async () => {
    const file = el.fileInput.files?.[0];
    if (!file) return;
    try {
      const txt = await loadCsvFromFile(file);
      // reset error style
      el.loadStatus.style.color = "";
      parseAndBuild(txt);
      el.loadStatus.textContent = `Données chargées depuis fichier : ${state.labs.length} laboratoires.`;
    } catch (e) {
      el.loadStatus.textContent = "Impossible d’importer ce CSV.";
      el.loadStatus.style.color = "#ff4d6d";
      showDiag(String(e));
    }
  });

  window.addEventListener("resize", () => {
    if (el.resultsView.classList.contains("is-visible")) {
      renderGraph();
      if (state.activeId) highlightNode(state.activeId, true, true);
    }
  });
}

// ------------------------ Boot ------------------------
(async function main(){
  wireUI();
  try {
    await loadData();
  } catch {
    // user can import manually if fetch fails
  }
})();
