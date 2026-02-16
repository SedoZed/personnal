import { escapeHTML, hash } from "./utils.js";

export function getUI(){
  return {
    svg: d3.select("#svg"),
    viz: document.getElementById("viz"),
    tooltip: document.getElementById("tooltip"),
    statNodes: document.getElementById("statNodes"),
    statLinks: document.getElementById("statLinks"),
    statMode: document.getElementById("statMode"),

    minShared: document.getElementById("minShared"),
    charge: document.getElementById("charge"),
    recenter: document.getElementById("recenter"),
    clearAll: document.getElementById("clearAll"),

    expertSearch: document.getElementById("expertSearch"),
    expertClear: document.getElementById("expertClear"),
    suggestions: document.getElementById("suggestions"),
    resultsList: document.getElementById("resultsList"),
    resultsMeta: document.getElementById("resultsMeta"),
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
  ui.statMode.textContent = "KEYWORDS IA";
}

export function updateSelectedCounts(state){
  const n = state.selected.kwia.size;
  const el = document.querySelector(`[data-count-for="kwia"]`);
  if (el) el.textContent = `${n} sélection${n>1?"s":""}`;
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
  state.selected.kwia.clear();

  document.querySelectorAll('.checklist input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('.checklist input[type="text"]').forEach(t => t.value = "");
  document.querySelectorAll(".checklist .item").forEach(row=> row.style.display = "flex");

  updateSelectedCounts(state);
}

export function buildChecklistKWIA(values, state, onChange){
  const kind = "kwia";
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
      if (e.target.checked) state.selected.kwia.add(v);
      else state.selected.kwia.delete(v);
      onChange();
    });

    container.appendChild(wrap);
  });

  // Affiche combien de labos portent chaque mot-clé IA
  const mapCount = new Map();
  state.nodesAll.forEach(n => n.kwia.forEach(x => mapCount.set(x, (mapCount.get(x)||0)+1)));
  container.querySelectorAll(".item").forEach(row=>{
    const main = row.querySelector(".txt")?.childNodes?.[0]?.textContent?.trim() || "";
    const sub = row.querySelector(".sub");
    const c = mapCount.get(main);
    if (sub) sub.textContent = (typeof c === "number") ? `${c} labo(s)` : "";
  });
}

/* ---------- Recherche “humaine” UI ---------- */

export function renderSuggestions(ui, items){
  if (!items || items.length === 0){
    ui.suggestions.hidden = true;
    ui.suggestions.innerHTML = "";
    return;
  }
  ui.suggestions.hidden = false;
  ui.suggestions.innerHTML = items.map(it => `
    <div class="sug-item" data-sug="${escapeHTML(it.label)}">
      <b>${escapeHTML(it.label)}</b>
      <span>${it.count} labo(s)</span>
    </div>
  `).join("");

  ui.suggestions.querySelectorAll(".sug-item").forEach(el=>{
    el.addEventListener("click", ()=>{
      const v = el.getAttribute("data-sug") || "";
      ui.expertSearch.value = v;
      ui.suggestions.hidden = true;
      ui.suggestions.innerHTML = "";
      ui.expertSearch.dispatchEvent(new Event("input"));
      ui.expertSearch.focus();
    });
  });
}

export function renderResults(ui, results, totalMatches){
  if (!results || results.length === 0){
    ui.resultsMeta.textContent = totalMatches ? `${totalMatches} match(s)` : "—";
    ui.resultsList.innerHTML = `<div class="results-empty">Aucun résultat. Essaie un autre mot-clé IA.</div>`;
    return;
  }

  ui.resultsMeta.textContent = `${results.length} affiché(s) · ${totalMatches} match(s)`;

  ui.resultsList.innerHTML = results.map(r => `
    <div class="result" data-id="${escapeHTML(r.id)}">
      <div class="title">${escapeHTML(r.title || r.id)}</div>
      <div class="meta">
        <span class="badge-mini">score ${r.score.toFixed(1)}</span>
        <span class="badge-mini">liens ${r.degree}</span>
        <span class="badge-mini">${escapeHTML(r.group || "∅")}</span>
      </div>
    </div>
  `).join("");
}
