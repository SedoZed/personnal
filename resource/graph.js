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
      simulation.alpha(0.5).restart();
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
      <div class="k">Alternative</div>${alt}
      <div class="k">RNSR</div><div class="v">${escapeHTML(d.id)}</div>
      <div class="k">Axes</div><div class="v">${chips(d.axe, 8) || `<em style="color:var(--muted)">—</em>`}</div>
      <div class="k">ERC</div><div class="v">${chips(d.erc, 10) || `<em style="color:var(--muted)">—</em>`}</div>
      <div class="k">HCERES</div><div class="v">${chips(d.hceres, 10) || `<em style="color:var(--muted)">—</em>`}</div>
      <div class="k">Keywords</div><div class="v">${chips(d.keywords, 10) || `<em style="color:var(--muted)">—</em>`}</div>
      <div class="k">Contact</div>${email}
    `;
  }

  function render(nodes, links, chargeStrength){
    const {w,h} = size();

    if (simulation) simulation.stop();

    simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links)
        .id(d => d.id)
        .distance(d => clamp(120 - 18*(d.weight-1), 50, 160))
        .strength(d => clamp(0.10 + 0.06*d.weight, 0.10, 0.40))
      )
      .force("charge", d3.forceManyBody().strength(chargeStrength))
      .force("center", d3.forceCenter(w/2, h/2))
      .force("collide", d3.forceCollide().radius(d => d.r + 4).iterations(2));

    // LINKS
    linkSel = gLinks.selectAll("line")
      .data(links, d => `${d.source}->${d.target}`);

    linkSel.exit().remove();

    linkSel = linkSel.enter()
      .append("line")
      .attr("stroke", "rgba(255,255,255,.24)")
      .attr("stroke-width", d => 0.9 + Math.sqrt(d.weight))
      .attr("stroke-linecap","round")
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
      });

    nodeEnter.append("circle")
      .attr("r", d => d.r)
      .attr("fill", d => {
        const score = d.erc.length + d.hceres.length + d.keywords.length;
        const a = clamp(0.22 + score*0.006, 0.22, 0.55);
        return `rgba(122,162,255,${a})`;
      })
      .attr("stroke", "rgba(255,255,255,.30)")
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

  return { render, recenter, size };
}