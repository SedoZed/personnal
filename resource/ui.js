import { escapeHTML, hash } from "./utils.js";

export function getUI(){
  return {
    svg: d3.select("#svg"),
    viz: document.getElementById("viz"),
    tooltip: document.getElementById("tooltip"),
    statNodes: document.getElementById("statNodes"),
    statLinks: document.getElementById("statLinks"),
    statMode: document.getElementById("statMode"),
    linkMode: document.getElementById("linkMode"),
    minShared: document.getElementById("minShared"),
    charge: document.getElementById("charge"),
    recenter: document.getElementById("recenter"),
    clearAll: document.getElementById("clearAll")
  };
}

export function initCollapsibles(){
  document.querySelectorAll(".section").forEach(sec=>{
    const head = sec.querySelector(".section-head");
    const body = sec.querySelector(".section-body");
    if (!head || !body) return;
    if (sec.dataset.collapsible === "false") return;
    head.addEventListener("click", ()=>{
      const isHidden = body.style.display === "none";
      body.style.display = isHidden ? "block" : "none";
    });
  });
}

export function updateStats(ui, state){
  ui.statNodes.textContent = String(state.nodes.length);
  ui.statLinks.textContent = String(state.links.length);
  ui.statMode.textContent =
    state.linkMode === "erc" ? "ERC" :
    state.linkMode === "hceres" ? "HCERES" : "KEYWORDS";
}

export function updateSelectedCounts(state){
  ["erc","hceres","keywords"].forEach(k=>{
    const n = state.selected[k].size;
    const el = document.querySelector(`[data-count-for="${k}"]`);
    if (el) el.textContent = `${n} sélection${n>1?"s":""}`;
  });
}

export function wireSearch(kind){
  const input = document.querySelector(`[data-search="${kind}"]`);
  const items = document.querySelector(`[data-items="${kind}"]`);
  if (!input || !items) return;

  input.addEventListener("input", ()=>{
    const q = input.value.trim().toLowerCase();
    items.querySelectorAll(".item").forEach(row=>{
      const text = row.innerText.toLowerCase();
      row.style.display = text.includes(q) ? "flex" : "none";
    });
  });
}

export function clearSelections(state){
  state.selected.erc.clear();
  state.selected.hceres.clear();
  state.selected.keywords.clear();

  document.querySelectorAll('.checklist input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('.checklist input[type="text"]').forEach(t => t.value = "");
  document.querySelectorAll(".checklist .item").forEach(row=> row.style.display = "flex");

  updateSelectedCounts(state);
}

export function buildChecklist(kind, values, state, onChange){
  const container = document.querySelector(`[data-items="${kind}"]`);
  container.innerHTML = "";

  values.forEach(v=>{
    const id = `${kind}-${hash(v)}`;
    const wrap = document.createElement("label");
    wrap.className = "item";
    wrap.htmlFor = id;

    wrap.innerHTML = `
      <input type="checkbox" id="${id}" data-kind="${kind}" />
      <div class="txt">
        ${escapeHTML(v)}
        <span class="sub"></span>
      </div>
    `;

    const cb = wrap.querySelector("input");
    cb.addEventListener("change", (e)=>{
      if (e.target.checked) state.selected[kind].add(v);
      else state.selected[kind].delete(v);
      onChange();
    });

    container.appendChild(wrap);
  });

  // Bonus : afficher combien de labos portent chaque valeur
  const mapCount = new Map();
  state.nodesAll.forEach(n => n[kind].forEach(x => mapCount.set(x, (mapCount.get(x)||0)+1)));
  container.querySelectorAll(".item").forEach(row=>{
    const main = row.querySelector(".txt")?.childNodes?.[0]?.textContent?.trim() || "";
    const sub = row.querySelector(".sub");
    const c = mapCount.get(main);
    if (sub) sub.textContent = (typeof c === "number") ? `${c} labo(s)` : "";
  });
}
