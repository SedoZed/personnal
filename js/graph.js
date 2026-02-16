import { clamp, shortTitle, escapeHTML } from "./utils.js";

export function createGraph(ui){
  const gRoot = ui.svg.append("g");
  const gLinks = gRoot.append("g").attr("class","links");
  const gNodes = gRoot.append("g").attr("class","nodes");

  const zoom = d3.zoom()
    .scaleExtent([0.25, 5])
    .on("zoom", (event) => gRoot.attr("transform", event.transform));
  ui.svg.call(zoom);

  let simulation = null;
  let linkSel = null;
  let nodeSel = null;

  let selectedId = null;

  // couleurs par groupe
  const color = d3.scaleOrdinal(d3.schemeTableau10);

  function size(){
    const rect = ui.viz.getBoundingClientRect();
    ui.svg.attr("viewBox", `0 0 ${rect.width} ${rect.height}`);
    return {w: rect.width, h: rect.height};
  }

  function recenter(){
    ui.svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity);
    const {w,h} = size();
    if (simulation){
      simulation.force("center", d3.forceCenter(w/2,h/2));
      simulation.alpha(0.6).restart();
    }
  }

  function tooltipHTML(d){
    const chips = (arr, max=10) => {
      const a = arr.slice(0, max);
      const more = arr.length > max ? ` <span class="chip">+${arr.length-max}</span>` : "";
      return a.map(x => `<span class="chip">${escapeHTML(x)}</span>`).join("") + more;
    };
    const alt = d.alt ? `<div class="v">${escapeHTML(d.alt)}</div>` : `<div class="v"><em style="color:var(--muted)">—</em></div>`;
    const email = d.email ? `<div class="v">${escapeHTML(d.email)}</div>` : `<div class="v"><em style="color:var(--muted)">—</em></div>`;

    return `
      <div class="t">${escapeHTML(d.title || "(Sans titre)")}</div>
      <div class="k">Famille (dominante)</div><div class="v">${escapeHTML(d.group || "∅")}</div>
      <div class="k">Alternative</div>${alt}
      <div class="k">RNSR</div><div class="v">${escapeHTML(d.id)}</div>
      <div class="k">Axes</div><div class="v">${chips(d.axe, 8) || `<em style="color:var(--muted)">—</em>`}</div>
      <div class="k">ERC</div><div class="v">${chips(d.erc, 10) || `<em style="color:var(--muted)">—</em>`}</div>
      <div class="k">HCERES</div><div class="v">${chips(d.hceres, 10) || `<em style="color:var(--muted)">—</em>`}</div>
      <div class="k">Keywords</div><div class="v">${chips(d.keywords, 10) || `<em style="color:var(--muted)">—</em>`}</div>
      <div class="k">Contact</div>${email}
    `;
  }

  function computeClusterCenters(nodes, w, h){
    const groups = Array.from(new Set(nodes.map(n => n.group || "∅")));
    const cx = w/2, cy = h/2;
    const R = Math.min(w, h) * 0.28;

    const centers = new Map();
    const m = Math.max(groups.length, 1);
    groups.forEach((g, i) => {
      const a = (i / m) * Math.PI * 2;
      centers.set(g, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    });
    return centers;
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

  function clearSelectionAndHighlight(){
    selectedId = null;
    if (nodeSel) nodeSel.classed("dimmed", false).classed("highlight", false).classed("selected", false);
    if (linkSel) linkSel.classed("dimmed", false).classed("highlight", false);
  }

  // sélection (clic) : niveau 1 + niveau 2
  function applySelectionHighlight(adj){
    if (!selectedId){
      nodeSel.classed("dimmed", false).classed("highlight", false).classed("selected", false);
      linkSel.classed("dimmed", false).classed("highlight", false);
      return;
    }

    const lvl1 = adj.get(selectedId) || new Set();
    const lvl2 = new Set();
    lvl1.forEach(n => {
      const sub = adj.get(n);
      if (sub) sub.forEach(x => lvl2.add(x));
    });

    nodeSel
      .classed("selected", d => d.id === selectedId)
      .classed("highlight", d => d.id === selectedId || lvl1.has(d.id))
      .classed("dimmed", d => !(d.id === selectedId || lvl1.has(d.id) || lvl2.has(d.id)));

    linkSel
      .classed("highlight", l => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return s === selectedId || t === selectedId;
      })
      .classed("dimmed", l => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return !(s === selectedId || t === selectedId);
      });
  }

  // Recherche expertise : match + voisins (niveau 1)
  function highlightByExpertise(nodes, links, query){
    const q = query.trim().toLowerCase();
    if (!q){
      // revient à l’état normal (ou à la sélection si existe)
      const adj = buildAdjacency(links);
      applySelectionHighlight(adj);
      return;
    }

    const matched = new Set(
      nodes.filter(n=>{
        const inE = n.erc.some(v => v.toLowerCase().includes(q));
        const inH = n.hceres.some(v => v.toLowerCase().includes(q));
        const inK = n.keywords.some(v => v.toLowerCase().includes(q));
        const inT = (n.title || "").toLowerCase().includes(q);
        return inE || inH || inK || inT;
      }).map(n=>n.id)
    );

    const adj = buildAdjacency(links);
    const expanded = new Set(matched);
    matched.forEach(id=>{
      const neigh = adj.get(id);
      if (neigh) neigh.forEach(x => expanded.add(x));
    });

    // Dim tout ce qui n’est pas match ou voisin
    nodeSel
      .classed("selected", d => matched.has(d.id))
      .classed("highlight", d => expanded.has(d.id))
      .classed("dimmed", d => !expanded.has(d.id));

    // Liens : montrer seulement ceux qui touchent le set expanded (sinon spaghetti)
    linkSel
      .classed("highlight", l => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return expanded.has(s) && expanded.has(t) && (matched.has(s) || matched.has(t));
      })
      .classed("dimmed", l => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return !(expanded.has(s) && expanded.has(t));
      });
  }

  function render(nodes, links, baseChargeStrength){
    const {w,h} = size();
    const cx = w/2, cy = h/2;

    if (simulation) simulation.stop();

    // clusters (sur group)
    const centers = computeClusterCenters(nodes, w, h);

    // densité -> ajuste forces
    const n = nodes.length || 1;
    const maxLinks = (n * (n - 1)) / 2;
    const density = maxLinks > 0 ? (links.length / maxLinks) : 0;
    const d = clamp(density * 6, 0, 1);

    // charge adoucie si peu de liens
    const chargeStrength = Math.round(baseChargeStrength * (0.35 + 0.65 * d));
    const gravity = 0.08 + (1 - d) * 0.12;

    // plus aéré : distance de lien + strength plus faible
    const linkDistance = (wgt) => clamp(130 - 12*(wgt-1), 70, 170);

    simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links)
        .id(d => d.id)
        .distance(d => linkDistance(d.weight))
        .strength(d => clamp(0.07 + 0.04*d.weight, 0.07, 0.25))
      )
      .force("charge", d3.forceManyBody().strength(chargeStrength))
      .force("center", d3.forceCenter(cx, cy))
      .force("x", d3.forceX(cx).strength(gravity))
      .force("y", d3.forceY(cy).strength(gravity))
      // clustering doux (aération par familles)
      .force("clusterX", d3.forceX(d => (centers.get(d.group || "∅")?.x ?? cx)).strength(0.18))
      .force("clusterY", d3.forceY(d => (centers.get(d.group || "∅")?.y ?? cy)).strength(0.18))
      .force("collide", d3.forceCollide().radius(d => d.r + 3).iterations(2));

    // fond svg -> désélection
    ui.svg.on("click", (event) => {
      // si clic direct sur svg (fond), on clear
      if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === "svg"){
        clearSelectionAndHighlight();
      }
    });

    // LINKS (discrets par défaut)
    linkSel = gLinks.selectAll("line")
      .data(links, d => `${d.source}->${d.target}`);

    linkSel.exit().remove();

    linkSel = linkSel.enter()
      .append("line")
      .attr("stroke", "rgba(255,255,255,.22)")
      .attr("stroke-width", d => 0.7 + Math.sqrt(d.weight))
      .attr("stroke-linecap","round")
      .attr("opacity", 0.10)
      .merge(linkSel);

    // NODES
    nodeSel = gNodes.selectAll("g.node")
      .data(nodes, d => d.id);

    nodeSel.exit().remove();

    const nodeEnter = nodeSel.enter()
      .append("g")
      .attr("class","node")
      .call(d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded)
      )
      .on("mouseenter", (event, d) => {
        ui.tooltip.style.opacity = 1;
        ui.tooltip.style.transform = "translateY(0px)";
        ui.tooltip.innerHTML = tooltipHTML(d);
      })
      .on("mousemove", (event) => {
        const pad = 14;
        const rect = ui.viz.getBoundingClientRect();
        const tt = ui.tooltip.getBoundingClientRect();
        let x = event.clientX - rect.left + 14;
        let y = event.clientY - rect.top + 14;
        x = Math.min(x, rect.width - tt.width - pad);
        y = Math.min(y, rect.height - tt.height - pad);
        ui.tooltip.style.left = `${x}px`;
        ui.tooltip.style.top = `${y}px`;
      })
      .on("mouseleave", () => {
        ui.tooltip.style.opacity = 0;
        ui.tooltip.style.transform = "translateY(6px)";
      })
      .on("click", (event, d) => {
        event.stopPropagation(); // évite que le clic remonte au svg (désélection)
        selectedId = (selectedId === d.id) ? null : d.id;
        const adj = buildAdjacency(links);
        applySelectionHighlight(adj);
      });

    nodeEnter.append("circle")
      .attr("r", d => d.r)
      .attr("fill", d => {
        const g = d.group || "∅";
        const c = d3.color(color(g));
        return `rgba(${c.r},${c.g},${c.b},0.35)`;
      })
      .attr("stroke", "rgba(255,255,255,.26)")
      .attr("stroke-width", 1.1);

    nodeEnter.append("text")
      .attr("text-anchor","middle")
      .attr("dominant-baseline","central")
      .attr("pointer-events","none")
      .attr("fill","rgba(231,236,255,.95)")
      .style("font-weight", 800)
      .style("font-size", "10px")
      .text(d => shortTitle(d.title));

    nodeSel = nodeEnter.merge(nodeSel);

    // (re)applique sélection si existe
    const adjAtStart = buildAdjacency(links);
    applySelectionHighlight(adjAtStart);

    simulation.on("tick", ()=>{
      linkSel
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    simulation.alpha(1).restart();
  }

  function dragStarted(event, d){
    if (!event.active) simulation.alphaTarget(0.25).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event, d){
    d.fx = event.x; d.fy = event.y;
  }
  function dragEnded(event, d){
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
  }

  window.addEventListener("resize", ()=>{
    const {w,h} = size();
    if (simulation){
      simulation.force("center", d3.forceCenter(w/2, h/2));
      simulation.alpha(0.25).restart();
    }
  });

  return {
    render,
    recenter,
    size,
    clearSelectionAndHighlight,
    highlightByExpertise,
  };
}
