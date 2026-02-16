import { CSV_PATH } from "./config.js";
import { uniq } from "./utils.js";
import { state } from "./state.js";
import { buildAllNodes, computeRadius, buildLinks } from "./data.js";
import { getUI, initCollapsibles, buildChecklist, wireSearch, updateStats, updateSelectedCounts, clearSelections } from "./ui.js";
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

  updateStats(ui, state);
  graph.render(state.nodes, state.links, state.charge);
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
}

async function init(){
  graph.size();
  initCollapsibles();
  wireControls();

  const rows = await d3.csv(CSV_PATH, d3.autoType);
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
  alert("Erreur au chargement du CSV. Vérifie que database-test.csv est bien à la racine et que tu es servi via HTTP (GitHub Pages ou serveur local).");
});
