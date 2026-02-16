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

  // Famille dominante structurelle -> clusters/couleurs
  computeDominantGroup(state.nodes, state.linkMode);

  updateStats(ui, state);
  graph.render(state.nodes, state.links, state.charge);

  // réapplique recherche (si active)
  updateHumanSearch(ui.expertSearch.value);
}

/* ---------- Recherche “humaine” : scoring + suggestions + résultats ---------- */

function nodeMatchesTokens(node, tokens){
  if (tokens.length === 0) return { score: 0, hits: 0 };

  const title = (node.title || "").toLowerCase();
  const fields = [
    ...node.erc.map(x=>x.toLowerCase()),
    ...node.hceres.map(x=>x.toLowerCase()),
    ...node.keywords.map(x=>x.toLowerCase())
  ];

  let score = 0;
  let hits = 0;

  for (const t of tokens){
    let hit = false;

    // titre : léger bonus (souvent plus “humain”)
    if (title.includes(t)){
      score += 1.2;
      hits += 1;
      hit = true;
    }

    // exact (valeur qui contient token)
    if (fields.some(v => v.includes(t))){
      score += 1.0;
      hits += 1;
      hit = true;
    }

    // si pas de hit, score 0 pour ce token
    if (!hit) {
      // rien
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

  // Suggestions : uniquement si 1 token (sinon c’est souvent une requête composée)
  if (tokens.length === 1 && tokens[0].length >= 2){
    const t = tokens[0];
    const cand = [];
    for (const [k, v] of state.themeCounts.entries()){
      if (k.includes(t)) cand.push(v);
      if (cand.length > 80) break;
    }
    cand.sort((a,b)=>b.count-a.count || a.label.localeCompare(b.label));
    renderSuggestions(ui, cand.slice(0, 7));
  } else {
    renderSuggestions(ui, []);
  }

  // Pas de requête : reset UI + highlights
  if (tokens.length === 0){
    ui.resultsMeta.textContent = "—";
    ui.resultsList.innerHTML = `<div class="results-empty">Tape un terme (ex: “laser”, “AI”, “materials”…)</div>`;
    ui.suggestions.hidden = true;

    // revient à l’état normal (on laisse la sélection utilisateur telle quelle)
    // => pas de dimming global ici
    return;
  }

  // Score des nœuds
  const adj = buildAdjacency(state.links);
  const scored = [];

  for (const n of state.nodes){
    const { score, hits } = nodeMatchesTokens(n, tokens);
    if (hits === 0) continue;

    const degree = (adj.get(n.id)?.size) || 0;

    // bonus humain : un labo plus connecté + légèrement prioritaire (expertise “réseau”)
    // (léger pour ne pas écraser la pertinence textuelle)
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

  // Highlight “humain” :
  // - nœuds match = selected
  // - voisins des match = highlight
  // - le reste dimmed
  // - liens : uniquement dans le sous-graphe utile
  const matchedIds = new Set(top.map(x=>x.id));
  const expanded = new Set(matchedIds);

  matchedIds.forEach(id=>{
    const neigh = adj.get(id);
    if (neigh) neigh.forEach(x => expanded.add(x));
  });

  // On applique via classes D3 directement depuis ici :
  // (on profite des selections globales dans graph via setSelected quand clic résultat)
  // => on utilise une approche simple : sélectionner un “pseudo” premier match si aucun selected.
  // Mais on ne force pas la sélection : on ne change que l’apparence.
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

  // Click sur résultat => focus/zoom + sélection
  ui.resultsList.querySelectorAll(".result").forEach(el=>{
    el.addEventListener("click", ()=>{
      const id = el.getAttribute("data-id");
      graph.focusOnNode(id, state.nodes, state.links);
    });
  });
}

/* ---------- Controls ---------- */

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

  // fermer suggestions si clic ailleurs
  document.addEventListener("click", (e)=>{
    if (!ui.suggestions) return;
    const inBox = ui.suggestions.contains(e.target) || ui.expertSearch.contains(e.target);
    if (!inBox){
      ui.suggestions.hidden = true;
    }
  });
}

async function init(){
  graph.size();
  initCollapsibles();
  wireControls();

  const rows = await d3.csv(CSV_PATH, d3.autoType);
  state.raw = rows;

  state.nodesAll = buildAllNodes(rows);

  // index autocomplete
  state.themeCounts = buildThemeCounts(state.nodesAll);

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
  alert("Erreur au chargement du CSV. Vérifie que database-test.csv est à la racine et servi via HTTP (GitHub Pages).");
});
