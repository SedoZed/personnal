import { CSV_PATH } from "./config.js";
import { uniq, tokenizeQuery } from "./utils.js";
import { state } from "./state.js";
import { buildAllNodes, computeRadius, buildLinks, computeDominantGroup, buildThemeCounts } from "./data.js";
import {
  getUI, initCollapsibles, buildChecklist, wireSearch,
  updateStats, updateSelectedCounts, clearSelections,
  renderSuggestions, renderResults
} from "./ui.js";
import { createGraph } from "./graph.js";

const ui = getUI();
const graph = createGraph(ui);

function applyFiltersAndRender(){
  const selK = state.selected.keywords;

  state.nodes = state.nodesAll.filter(n=>{
    const okK = selK.size === 0 || n.keywords.some(v => selK.has(v));
    return okK;
  });

  state.nodes.forEach(n => { n.r = computeRadius(n); });

  // liens uniquement sur keywords-ia
  state.links = buildLinks(state.nodes, state.minShared);

  // groupe dominant structurel sur keywords-ia
  computeDominantGroup(state.nodes);

  updateStats(ui, state);
  graph.render(state.nodes, state.links, state.charge);

  // réapplique recherche si active
  updateHumanSearch(ui.expertSearch.value);
}

/* ---------- Recherche “humaine” : scoring + suggestions + résultats ---------- */

function nodeMatchesTokens(node, tokens){
  if (tokens.length === 0) return { score: 0, hits: 0 };

  const title = (node.title || "").toLowerCase();
  const fields = node.keywords.map(x=>x.toLowerCase());

  let score = 0;
  let hits = 0;

  for (const t of tokens){
    let hit = false;

    // titre : bonus (humain)
    if (title.includes(t)){
      score += 1.2;
      hits += 1;
      hit = true;
    }

    // keywords-ia
    if (fields.some(v => v.includes(t))){
      score += 1.0;
      hits += 1;
      hit = true;
    }

    if (!hit){
      // pas de hit pour ce token
    }
  }

  return { score, hits };
}

function buildAdjacency(links){
  const adj = new Map();
  const touch = (a,b)=>{
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };
  links.forEach(l=>{
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    touch(s,t); touch(t,s);
  });
  return adj;
}

function updateHumanSearch(query){
  const q = (query || "").trim();
  const tokens = tokenizeQuery(q);

  // Suggestions : uniquement si 1 token
  if (tokens.length === 1 && tokens[0].length >= 2){
    const t = tokens[0];
    const cand = [];
    for (const [k, v] of state.themeCounts.entries()){
      if (k.includes(t)) cand.push(v);
      if (cand.length > 120) break;
    }
    cand.sort((a,b)=>b.count-a.count || a.label.localeCompare(b.label));
    renderSuggestions(ui, cand.slice(0, 7));
  } else {
    renderSuggestions(ui, []);
  }

  // Requête vide : reset résultat + pas de dimming
  if (tokens.length === 0){
    ui.resultsMeta.textContent = "—";
    ui.resultsList.innerHTML = `<div class="results-empty">Tape un terme (ex: “laser”, “AI”, “materials”…)</div>`;
    ui.suggestions.hidden = true;
    ui.suggestions.innerHTML = "";
    return;
  }

  const adj = buildAdjacency(state.links);
  const scored = [];

  for (const n of state.nodes){
    const { score, hits } = nodeMatchesTokens(n, tokens);
    if (hits === 0) continue;

    const degree = (adj.get(n.id)?.size) || 0;

    // bonus humain : labo plus connecté (réseau d’expertise)
    const finalScore = score + Math.min(1.5, Math.log1p(degree) * 0.6);

    scored.push({
      id: n.id,
      title: n.title || n.id,
      group: n.group || "∅",
      score: finalScore,
      degree
    });
  }

  scored.sort((a,b)=> b.score - a.score || b.degree - a.degree || a.title.localeCompare(b.title));

  const top = scored.slice(0, 20);
  renderResults(ui, top, scored.length);

  // Highlight : match + voisins des match
  const matchedIds = new Set(top.map(x=>x.id));
  const expanded = new Set(matchedIds);

  matchedIds.forEach(id=>{
    const neigh = adj.get(id);
    if (neigh) neigh.forEach(x => expanded.add(x));
  });

  const nodesSel = d3.select("#svg").select("g").select(".nodes").selectAll("g.node");
  const linksSel = d3.select("#svg").select("g").select(".links").selectAll("line");

  nodesSel
    .classed("selected", d => matchedIds.has(d.id))
    .classed("highlight", d => expanded.has(d.id))
    .classed("dimmed", d => !expanded.has(d.id));

  linksSel
    .classed("highlight", l => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return expanded.has(s) && expanded.has(t) && (matchedIds.has(s) || matchedIds.has(t));
    })
    .classed("dimmed", l => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return !(expanded.has(s) && expanded.has(t));
    });

  // Click résultat -> focus/zoom + sélection
  ui.resultsList.querySelectorAll(".result").forEach(el=>{
    el.addEventListener("click", ()=>{
      const id = el.getAttribute("data-id");
      graph.focusOnNode(id, state.nodes, state.links);
    });
  });
}

/* ---------- Controls ---------- */

function wireControls(){
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
    ui.expertSearch.value = "";
    ui.suggestions.hidden = true;
    ui.suggestions.innerHTML = "";
    ui.resultsMeta.textContent = "—";
    ui.resultsList.innerHTML = `<div class="results-empty">Tape un terme (ex: “laser”, “AI”, “materials”…)</div>`;
    graph.clearSelectionAndHighlight();
    applyFiltersAndRender();
  });

  ui.expertSearch.addEventListener("input", ()=>{
    updateHumanSearch(ui.expertSearch.value);
  });

  ui.expertClear.addEventListener("click", ()=>{
    ui.expertSearch.value = "";
    ui.expertSearch.dispatchEvent(new Event("input"));
    ui.suggestions.hidden = true;
    ui.suggestions.innerHTML = "";
    ui.resultsMeta.textContent = "—";
    ui.resultsList.innerHTML = `<div class="results-empty">Tape un terme (ex: “laser”, “AI”, “materials”…)</div>`;

    // reset dimming
    const nodesSel = d3.select("#svg").select("g").select(".nodes").selectAll("g.node");
    const linksSel = d3.select("#svg").select("g").select(".links").selectAll("line");
    nodesSel.classed("dimmed", false).classed("highlight", false).classed("selected", false);
    linksSel.classed("dimmed", false).classed("highlight", false);

    ui.expertSearch.focus();
  });

  document.addEventListener("click", (e)=>{
    const inBox = ui.suggestions.contains(e.target) || ui.expertSearch.contains(e.target);
    if (!inBox) ui.suggestions.hidden = true;
  });
}

async function init(){
  graph.size();
  initCollapsibles();
  wireControls();

  const rows = await d3.csv(CSV_PATH, d3.autoType);
  state.raw = rows;

  state.nodesAll = buildAllNodes(rows);

  // autocomplete (keywords-ia)
  state.themeCounts = buildThemeCounts(state.nodesAll);

  // checklist values (keywords-ia)
  state.values.keywords = uniq(state.nodesAll.flatMap(n=>n.keywords)).sort(d3.ascending);

  const onChecklistChange = () => {
    updateSelectedCounts(state);
    applyFiltersAndRender();
  };

  buildChecklist("keywords", state.values.keywords, state, onChecklistChange);
  wireSearch("keywords");

  updateSelectedCounts(state);
  applyFiltersAndRender();
}

init().catch(err=>{
  console.error(err);
  alert("Erreur au chargement du CSV. Vérifie que database-test.csv est à la racine et servi via HTTP (GitHub Pages).");
});
