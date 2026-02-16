import { CSV_PATH } from "./config.js";
import { uniq } from "./utils.js";
import { state } from "./state.js";
import { buildAllNodes, computeRadius, buildLinks } from "./data.js";
import { getUI, buildChecklist, wireSearch, updateStats, updateSelectedCounts, clearSelections } from "./ui.js";
import { createGraph } from "./graph.js";

const ui = getUI();
const graph = createGraph(ui);

// UI (shortlist / recherche)
const elSearch = document.getElementById("labSearch");
const elResults = document.getElementById("resultsList");
const elResultsCount = document.getElementById("resultsCount");
const btnExportVisible = document.getElementById("exportVisible");
const btnResetFocus = document.getElementById("resetFocus");

// Modal
const howtoBtn = document.getElementById("howtoBtn");
const howtoModal = document.getElementById("howtoModal");
const howtoClose = document.getElementById("howtoClose");
function openHowto(){ if (howtoModal) howtoModal.hidden = false; }
function closeHowto(){ if (howtoModal) howtoModal.hidden = true; }
howtoBtn?.addEventListener("click", openHowto);
howtoClose?.addEventListener("click", closeHowto);
howtoModal?.addEventListener("click", (e)=>{ if (e.target?.dataset?.close) closeHowto(); });

// CSV loader robuste GitHub Pages
async function loadCsvRows(relativePath){
  const url = new URL(relativePath, document.baseURI).href;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV introuvable (${res.status} ${res.statusText}) → ${url}`);
  const text = await res.text();
  return d3.csvParse(text, d3.autoType);
}

function computeMatchScore(n){
  let score = 0;
  if (state.selected.erc.size){
    for (const v of n.erc) if (state.selected.erc.has(v)) score += 3;
  }
  if (state.selected.hceres.size){
    for (const v of n.hceres) if (state.selected.hceres.has(v)) score += 2;
  }
  if (state.selected.keywords.size){
    for (const v of n.keywords) if (state.selected.keywords.has(v)) score += 1;
  }
  return score;
}

function escapeHtmlLocal(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function renderResultsList(query=""){
  if (!elResults) return;

  const q = query.trim().toLowerCase();

  const list = [...state.nodes].map(n => ({
    ...n,
    matchScore: computeMatchScore(n)
  }));

  const filtered = q
    ? list.filter(n => {
        const hay = [
          n.title, n.alt,
          ...(n.erc||[]), ...(n.hceres||[]), ...(n.keywords||[]), ...(n.axe||[])
        ].join(" ").toLowerCase();
        return hay.includes(q);
      })
    : list;

  filtered.sort((a,b)=>{
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return (a.title||"").localeCompare(b.title||"", "fr");
  });

  elResultsCount.textContent = String(filtered.length);
  elResults.innerHTML = "";

  const max = Math.min(filtered.length, 80);
  for (let i=0; i<max; i++){
    const n = filtered[i];
    const div = document.createElement("div");
    div.className = "resultItem";
    div.innerHTML = `
      <div class="resultTitle">${escapeHtmlLocal(n.title || "(Sans titre)")}</div>
      <div class="resultMeta">
        <span class="badgeMini">score: ${n.matchScore}</span>
        <span class="badgeMini">ERC: ${(n.erc||[]).length}</span>
        <span class="badgeMini">HCERES: ${(n.hceres||[]).length}</span>
        <span class="badgeMini">KW: ${(n.keywords||[]).length}</span>
      </div>
    `;
    div.addEventListener("click", ()=>{
      graph.zoomToNode(n.id);
      graph.focusNode(n.id);
    });
    elResults.appendChild(div);
  }
}

function exportVisibleNodes(){
  const cols = ["id","title","alt","axe","erc","hceres","keywords","email"];
  const lines = [];
  lines.push(cols.join(","));

  for (const n of state.nodes){
    const row = [
      n.id,
      n.title,
      n.alt,
      (n.axe||[]).join(" | "),
      (n.erc||[]).join(" | "),
      (n.hceres||[]).join(" | "),
      (n.keywords||[]).join(" | "),
      n.email || ""
    ].map(v => `"${String(v ?? "").replaceAll('"','""')}"`);
    lines.push(row.join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "labos_visibles.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function applyFiltersAndRender(){
  const selE = state.selected.erc;
  const selH = state.selected.hceres;
  const selK = state.selected.keywords;

  state.nodes = state.nodesAll.filter(n=>{
    const okE = selE.size === 0 || n.erc.some(v => selE.has(v));
    const okH = selH.size === 0 || n.hceres.some(v => selH.has(v));
    const okK = selK.size === 0 || n.keywords.some(v => selK.has(v));
    return okE && okH && okK;
  });

  state.nodes.forEach(n => { n.r = computeRadius(n); });
  state.links = buildLinks(state.nodes, state.linkMode, state.minShared);

  updateStats(ui, state);
  graph.render(state.nodes, state.links, state.charge);

  renderResultsList(elSearch?.value || "");
}

function wireControls(){
  ui.linkMode.addEventListener("change", ()=>{
    state.linkMode = ui.linkMode.value;
    applyFiltersAndRender();
  });

  ui.minShared.addEventListener("change", ()=>{
    state.minShared = parseInt(ui.minShared.value, 10);
    applyFiltersAndRender();
  });

  ui.charge.addEventListener("change", ()=>{
    state.charge = parseInt(ui.charge.value, 10);
    applyFiltersAndRender();
  });

  ui.recenter.addEventListener("click", ()=>{
    graph.recenter();
  });

  ui.clearAll.addEventListener("click", ()=>{
    clearSelections(state);
    applyFiltersAndRender();
  });

  btnExportVisible?.addEventListener("click", exportVisibleNodes);
  btnResetFocus?.addEventListener("click", ()=> graph.clearFocus());

  elSearch?.addEventListener("input", ()=>{
    renderResultsList(elSearch.value);
  });

  elSearch?.addEventListener("keydown", (e)=>{
    if (e.key === "Escape"){
      elSearch.value = "";
      graph.clearFocus();
      renderResultsList("");
    }
    if (e.key === "Enter"){
      const q = elSearch.value.trim().toLowerCase();
      if (!q) return;

      const filtered = [...state.nodes].filter(n=>{
        const hay = [n.title, n.alt, ...(n.keywords||[]), ...(n.erc||[]), ...(n.hceres||[]), ...(n.axe||[])].join(" ").toLowerCase();
        return hay.includes(q);
      });

      if (!filtered.length) return;

      filtered.sort((a,b)=>{
        const sa = computeMatchScore(a), sb = computeMatchScore(b);
        if (sb !== sa) return sb - sa;
        return (a.title||"").localeCompare(b.title||"", "fr");
      });

      const target = filtered[0];
      graph.zoomToNode(target.id);
      graph.focusNode(target.id);
    }
  });
}

async function init(){
  graph.size();
  wireControls();

  const rows = await loadCsvRows(CSV_PATH);
  state.raw = rows;

  state.nodesAll = buildAllNodes(rows);

  state.values.erc = uniq(state.nodesAll.flatMap(n=>n.erc)).sort(d3.ascending);
  state.values.hceres = uniq(state.nodesAll.flatMap(n=>n.hceres)).sort(d3.ascending);
  state.values.keywords = uniq(state.nodesAll.flatMap(n=>n.keywords)).sort(d3.ascending);

  const onChecklistChange = () => {
    updateSelectedCounts(state);
    applyFiltersAndRender();
  };

  buildChecklist("erc", state.values.erc, state, onChecklistChange);
  buildChecklist("hceres", state.values.hceres, state, onChecklistChange);
  buildChecklist("keywords", state.values.keywords, state, onChecklistChange);

  wireSearch("erc");
  wireSearch("hceres");
  wireSearch("keywords");

  updateSelectedCounts(state);
  applyFiltersAndRender();
}

init().catch(err=>{
  console.error(err);
  alert(String(err?.message || err));
});
