// datas/viz3.js — CLEAN FULL
// - date basis: birth / death / mid-career
// - metrics: totalPaintings / artistCount / avgPaintings
// - view: line OR stacked area by movement
// - brush zoom on X + double click reset
// - hover tooltip + click panel with clickable wiki links

const CSV_PATH = new URL("datas/artists.csv", window.location.href).href;
const ALL = "__ALL__";

function parseList(raw) {
  if (!raw) return [];
  return String(raw).split(",").map(s => s.trim()).filter(Boolean);
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function parseYears(yearsRaw) {
  const m = String(yearsRaw ?? "").match(/(\d{4}).*?(\d{4})/);
  if (m) return { birth: +m[1], death: +m[2] };
  const one = String(yearsRaw ?? "").match(/(\d{4})/);
  return one ? { birth: +one[1], death: null } : { birth: null, death: null };
}
function binYear(y, step) {
  return Math.floor(y / step) * step;
}
function metricLabel(key) {
  if (key === "artistCount") return "Nombre d’artistes";
  if (key === "avgPaintings") return "Moyenne d’œuvres / artiste";
  return "Total d’œuvres";
}

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("timeViz");
  if (!container) return;

  const dateBasis = document.getElementById("dateBasis");
  const viewType = document.getElementById("viewType");
  const metricSelect = document.getElementById("metricSelect");
  const binSelect = document.getElementById("binSelect");
  const topNSelect = document.getElementById("topN");
  const movementSelect = document.getElementById("movementSelect");
  const resetBtn = document.getElementById("resetBtn3");
  const stats = document.getElementById("stats3");

  // Hover tooltip (si tu as déjà .dv-tooltip dans styles.css, c'est parfait)
  const tooltip = document.createElement("div");
  tooltip.className = "dv-tooltip";
  tooltip.style.display = "none";
  document.body.appendChild(tooltip);

  // Click panel (cliquable)
  const panel = document.createElement("div");
  panel.className = "dv-panel";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const hideTooltip = () => { tooltip.style.display = "none"; };
  const hidePanel = () => { panel.style.display = "none"; };

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { hideTooltip(); hidePanel(); }
  });

  const getSize = () => {
    const r = container.getBoundingClientRect();
    return { width: Math.max(320, Math.floor(r.width)), height: Math.max(380, Math.floor(r.height)) };
  };

  function moveFloating(el, evt) {
    const pad = 14;
    const w = el.offsetWidth || 300;
    const h = el.offsetHeight || 140;
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;

    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  // SVG scaffold
  const svg = d3.select(container).append("svg");
  const g = svg.append("g");
  const gPlot = g.append("g");
  const gAxes = g.append("g");
  const gBrush = g.append("g");

  const margin = { top: 18, right: 22, bottom: 46, left: 56 };

  // State zoom (✅ déclaré UNE seule fois)
  let zoomDomain = null; // [minYear,maxYear] ou null

  // Load CSV with UI error message
  let raw = [];
  try {
    raw = await d3.csv(CSV_PATH, d => {
      const y = parseYears(d.years);
      const genres = parseList(d.genre);
      const birth = y.birth;
      const death = y.death;
      return {
        id: d.id,
        name: d.name,
        years: d.years,
        birth,
        death,
        mid: (birth && death) ? Math.round((birth + death) / 2) : birth,
        paintings: +d.paintings || 0,
        wikipedia: d.wikipedia,
        genres,
        primaryGenre: genres[0] || "Unknown"
      };
    });
  } catch (err) {
    console.error("Erreur chargement CSV:", err);
    container.innerHTML = `
      <div style="padding:14px; font-size:13px; opacity:.95; border-radius:12px;
                  background:rgba(255,80,80,0.08); border:1px solid rgba(255,80,80,0.25);">
        ❌ Impossible de charger <code>datas/artists.csv</code>.<br>
        Vérifie le chemin, le nom du fichier et la casse.
      </div>
    `;
    return;
  }

  // Fill movement dropdown (for LINE view filtering)
  const movementDomain = Array.from(new Set(raw.map(d => d.primaryGenre))).sort(d3.ascending);
  movementSelect.innerHTML =
    `<option value="${ALL}">Tous</option>` +
    movementDomain.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");

  function getBasisKey() { return dateBasis.value; }       // birth|death|mid
  function getMetricKey() { return metricSelect.value; }   // totalPaintings|artistCount|avgPaintings

  function filteredRowsForLine(rows) {
    const movement = movementSelect.value;
    return rows.filter(d => movement === ALL ? true : d.primaryGenre === movement);
  }

  function computeBins(rows, step, basisKey) {
    const usable = rows
      .map(d => ({ ...d, year: d[basisKey] }))
      .filter(d => Number.isFinite(d.year));

    const grouped = d3.group(usable, d => binYear(d.year, step));
    const bins = Array.from(grouped, ([b, arr]) => {
      const totalPaintings = d3.sum(arr, x => x.paintings);
      const artistCount = arr.length;
      const avgPaintings = artistCount ? totalPaintings / artistCount : 0;
      const top = [...arr].sort((a, b2) => b2.paintings - a.paintings).slice(0, 10);
      return { bin: +b, totalPaintings, artistCount, avgPaintings, artists: arr, top };
    }).sort((a, b) => a.bin - b.bin);

    return { bins, usableCount: usable.length };
  }

  function computeStack(rows, step, basisKey, topN) {
    const usable = rows
      .map(d => ({ ...d, year: d[basisKey] }))
      .filter(d => Number.isFinite(d.year));

    // Totals per movement (for choosing topN)
    const totalsByMove = d3.rollups(
      usable,
      v => d3.sum(v, d => d.paintings),
      d => d.primaryGenre
    ).sort((a, b) => b[1] - a[1]);

    const keep = new Set(
      totalsByMove.slice(0, topN >= 999 ? totalsByMove.length : topN).map(d => d[0])
    );

    const keyFor = (d) => keep.has(d.primaryGenre) ? d.primaryGenre : "Other";

    const grouped = d3.group(usable, d => binYear(d.year, step));
    const bins = Array.from(grouped, ([b, arr]) => {
      const byMove = d3.rollups(arr,
        v => ({
          totalPaintings: d3.sum(v, d => d.paintings),
          artistCount: v.length
        }),
        d => keyFor(d)
      );

      const record = { bin: +b, artists: arr };
      byMove.forEach(([k, v]) => { record[k] = v; });
      return record;
    }).sort((a, b) => a.bin - b.bin);

    const keys = Array.from(keep).sort(d3.ascending);
    if (usable.some(d => !keep.has(d.primaryGenre))) keys.push("Other");

    return { bins, keys, usableCount: usable.length };
  }

  function render() {
    hideTooltip();
    hidePanel();

    const { width, height } = getSize();
    svg.attr("width", width).attr("height", height);

    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    g.attr("transform", `translate(${margin.left},${margin.top})`);

    gPlot.selectAll("*").remove();
    gAxes.selectAll("*").remove();
    gBrush.selectAll("*").remove();

    const step = +binSelect.value;
    const basisKey = getBasisKey();
    const metricKey = getMetricKey();
    const view = viewType.value;

    // avgPaintings + stack = pas pertinent -> on force line
    const effectiveView = (view === "stack" && metricKey === "avgPaintings") ? "line" : view;

    // Data prep
    let bins = [];
    let usableCount = 0;

    if (effectiveView === "line") {
      const out = computeBins(filteredRowsForLine(raw), step, basisKey);
      bins = out.bins;
      usableCount = out.usableCount;
    } else {
      const topN = +topNSelect.value;
      const out = computeStack(raw, step, basisKey, topN);
      bins = out.bins;
      usableCount = out.usableCount;
      render.stackKeys = out.keys;
    }

    stats.textContent = `${usableCount} artistes — pas: ${step} ans — date: ${basisKey}${zoomDomain ? " — zoom actif" : ""}`;

    if (!bins.length) {
      gPlot.append("text")
        .attr("x", 0).attr("y", 16)
        .attr("fill", "currentColor")
        .attr("opacity", 0.9)
        .text("Aucune donnée pour ces filtres.");
      return;
    }

    const fullXDomain = d3.extent(bins, d => d.bin);
    const domain = zoomDomain || fullXDomain;

    const x = d3.scaleLinear().domain(domain).range([0, innerW]);

    let yMax = 1;
    if (effectiveView === "line") {
      yMax = d3.max(bins, d => d[metricKey]) || 1;
    } else {
      const keys = render.stackKeys;
      const useMetric = (metricKey === "artistCount") ? "artistCount" : "totalPaintings";
      yMax = d3.max(bins, d => {
        let sum = 0;
        keys.forEach(k => { sum += (d[k]?.[useMetric] || 0); });
        return sum;
      }) || 1;
    }

    const y = d3.scaleLinear().domain([0, yMax]).nice().range([innerH, 0]);

    // Axes
    gAxes.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(10).tickFormat(d3.format("d")))
      .call(s => s.selectAll("text").attr("opacity", 0.85));

    gAxes.append("g")
      .call(d3.axisLeft(y).ticks(7))
      .call(s => s.selectAll("text").attr("opacity", 0.85));

    gAxes.append("text")
      .attr("x", innerW)
      .attr("y", innerH + 38)
      .attr("text-anchor", "end")
      .attr("fill", "currentColor")
      .attr("opacity", 0.75)
      .attr("font-size", 12)
      .text("Année (groupée)");

    gAxes.append("text")
      .attr("x", 0)
      .attr("y", -6)
      .attr("text-anchor", "start")
      .attr("fill", "currentColor")
      .attr("opacity", 0.9)
      .attr("font-size", 12)
      .text(metricLabel(metricKey) + (effectiveView === "stack" ? " (empilé)" : ""));

    // Brush zoom
    const brush = d3.brushX()
      .extent([[0, 0], [innerW, innerH]])
      .on("end", (event) => {
        if (!event.selection) return;
        const [x0, x1] = event.selection;
        const d0 = Math.round(x.invert(x0));
        const d1 = Math.round(x.invert(x1));
        if (Math.abs(d1 - d0) < step) return;
        zoomDomain = [Math.min(d0, d1), Math.max(d0, d1)];
        render();
      });

    gBrush.call(brush);

    // Double click reset zoom
    svg.on("dblclick", () => {
      zoomDomain = null;
      render();
    });

    // === LINE ===
    if (effectiveView === "line") {
      const shown = bins.filter(d => d.bin >= domain[0] && d.bin <= domain[1]);

      const line = d3.line()
        .x(d => x(d.bin))
        .y(d => y(d[metricKey]))
        .curve(d3.curveMonotoneX);

      gPlot.append("path")
        .datum(shown)
        .attr("fill", "none")
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.55)
        .attr("stroke-width", 2)
        .attr("d", line);

      const pts = gPlot.selectAll("circle.pt")
        .data(shown)
        .enter()
        .append("circle")
        .attr("class", "pt")
        .attr("cx", d => x(d.bin))
        .attr("cy", d => y(d[metricKey]))
        .attr("r", 4)
        .attr("fill", "currentColor")
        .attr("opacity", 0.75);

      pts.on("mouseenter", (evt, d) => {
        tooltip.innerHTML = `
          <div style="font-weight:900; margin-bottom:6px;">
            ${escapeHtml(d.bin)} – ${escapeHtml(d.bin + step - 1)}
          </div>
          <div><b>${escapeHtml(metricLabel(metricKey))} :</b> ${
            metricKey === "avgPaintings" ? escapeHtml(d[metricKey].toFixed(1)) : escapeHtml(d[metricKey])
          }</div>
          <div style="margin-top:8px; opacity:.85;">Clic = liste cliquable</div>
        `;
        tooltip.style.display = "block";
        moveFloating(tooltip, evt);
      });

      pts.on("mousemove", (evt) => moveFloating(tooltip, evt));
      pts.on("mouseleave", hideTooltip);

      pts.on("click", (evt, d) => {
        const list = [...d.top].map(a => `
          <div style="margin:6px 0;">
            <a href="${escapeHtml(a.wikipedia)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(a.name)}
            </a>
            <span style="opacity:.75;"> — ${escapeHtml(a.paintings)} œuvres</span>
          </div>
        `).join("");

        panel.innerHTML = `
          <button class="close" type="button">Fermer</button>
          <div style="font-weight:900; margin-bottom:8px;">
            ${escapeHtml(d.bin)} – ${escapeHtml(d.bin + step - 1)}
          </div>
          <div style="opacity:.9; margin-bottom:10px;">
            <b>${escapeHtml(metricLabel(metricKey))} :</b> ${
              metricKey === "avgPaintings" ? escapeHtml(d[metricKey].toFixed(1)) : escapeHtml(d[metricKey])
            }
          </div>
          <div style="font-weight:800; margin-bottom:6px;">Top artistes (Wikipedia)</div>
          ${list || "<div style='opacity:.8;'>—</div>"}
          <div style="margin-top:10px; opacity:.75; font-size:12px;">
            Astuce : brush = zoom, double-clic = reset.
          </div>
        `;
        panel.querySelector(".close").addEventListener("click", hidePanel);
        panel.style.display = "block";
        moveFloating(panel, evt);
      });

      movementSelect.disabled = false;
      topNSelect.disabled = true;
    }

    // === STACKED AREA ===
    if (effectiveView === "stack") {
      const keys = render.stackKeys;
      const useMetric = (metricKey === "artistCount") ? "artistCount" : "totalPaintings";

      const shown = bins
        .filter(d => d.bin >= domain[0] && d.bin <= domain[1])
        .map(d => {
          const obj = { bin: d.bin, artists: d.artists };
          keys.forEach(k => { obj[k] = d[k]?.[useMetric] || 0; });
          return obj;
        });

      const stack = d3.stack().keys(keys);
      const layers = stack(shown);

      const palette = d3.schemeTableau10.concat(d3.schemeSet3, d3.schemePaired).flat();
      const c = d3.scaleOrdinal().domain(keys).range(palette.slice(0, keys.length));

      const area = d3.area()
        .x(d => x(d.data.bin))
        .y0(d => y(d[0]))
        .y1(d => y(d[1]))
        .curve(d3.curveMonotoneX);

      const layerSel = gPlot.selectAll("path.layer")
        .data(layers, d => d.key)
        .enter()
        .append("path")
        .attr("class", "layer")
        .attr("d", area)
        .attr("fill", d => c(d.key))
        .attr("opacity", 0.22)
        .attr("stroke", d => c(d.key))
        .attr("stroke-opacity", 0.35)
        .attr("stroke-width", 1);

      layerSel.on("mouseenter", function(evt, layer) {
        d3.selectAll("path.layer").attr("opacity", 0.08);
        d3.select(this).attr("opacity", 0.35);
        tooltip.innerHTML = `<div style="font-weight:900;">${escapeHtml(layer.key)}</div>`;
        tooltip.style.display = "block";
        moveFloating(tooltip, evt);
      });
      layerSel.on("mousemove", (evt) => moveFloating(tooltip, evt));
      layerSel.on("mouseleave", () => {
        d3.selectAll("path.layer").attr("opacity", 0.22);
        hideTooltip();
      });

      // overlay for bin-level tooltip + click panel
      const overlay = gPlot.append("rect")
        .attr("x", 0).attr("y", 0)
        .attr("width", innerW).attr("height", innerH)
        .attr("fill", "transparent");

      function nearestBin(mx) {
        const year = x.invert(mx);
        let best = shown[0];
        let bestDist = Math.abs(best.bin - year);
        for (const b of shown) {
          const dist = Math.abs(b.bin - year);
          if (dist < bestDist) { best = b; bestDist = dist; }
        }
        return best;
      }

      overlay.on("mousemove", (evt) => {
        const [mx] = d3.pointer(evt);
        const b = nearestBin(mx);
        const total = keys.reduce((acc, k) => acc + (b[k] || 0), 0);

        tooltip.innerHTML = `
          <div style="font-weight:900; margin-bottom:6px;">
            ${escapeHtml(b.bin)} – ${escapeHtml(b.bin + step - 1)}
          </div>
          <div><b>${escapeHtml(metricLabel(metricKey))} :</b> ${escapeHtml(total)}</div>
          <div style="margin-top:8px; opacity:.85;">Clic = liste cliquable</div>
        `;
        tooltip.style.display = "block";
        moveFloating(tooltip, evt);
      });
      overlay.on("mouseleave", hideTooltip);

      overlay.on("click", (evt) => {
        const [mx] = d3.pointer(evt);
        const b = nearestBin(mx);

        const top = [...(b.artists || [])]
          .sort((a, b2) => b2.paintings - a.paintings)
          .slice(0, 12);

        const list = top.map(a => `
          <div style="margin:6px 0;">
            <a href="${escapeHtml(a.wikipedia)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(a.name)}
            </a>
            <span style="opacity:.75;"> — ${escapeHtml(a.paintings)} œuvres — ${escapeHtml(a.primaryGenre)}</span>
          </div>
        `).join("");

        panel.innerHTML = `
          <button class="close" type="button">Fermer</button>
          <div style="font-weight:900; margin-bottom:8px;">
            ${escapeHtml(b.bin)} – ${escapeHtml(b.bin + step - 1)}
          </div>
          <div style="opacity:.9; margin-bottom:10px;">
            <b>${escapeHtml(metricLabel(metricKey))} :</b>
            ${escapeHtml(keys.reduce((acc, k) => acc + (b[k] || 0), 0))}
          </div>
          <div style="font-weight:800; margin-bottom:6px;">Artistes (Wikipedia)</div>
          ${list || "<div style='opacity:.8;'>—</div>"}
          <div style="margin-top:10px; opacity:.75; font-size:12px;">
            Astuce : brush = zoom, double-clic = reset.
          </div>
        `;
        panel.querySelector(".close").addEventListener("click", hidePanel);
        panel.style.display = "block";
        moveFloating(panel, evt);
      });

      movementSelect.disabled = true; // stack = tous mouvements
      topNSelect.disabled = false;
    }
  }

  // Events
  const rerender = () => render();

  dateBasis.addEventListener("change", rerender);
  viewType.addEventListener("change", rerender);
  metricSelect.addEventListener("change", rerender);
  binSelect.addEventListener("change", rerender);
  topNSelect.addEventListener("change", rerender);
  movementSelect.addEventListener("change", rerender);

  resetBtn.addEventListener("click", () => {
    dateBasis.value = "mid";
    viewType.value = "line";
    metricSelect.value = "totalPaintings";
    binSelect.value = "10";
    topNSelect.value = "8";
    movementSelect.value = ALL;
    zoomDomain = null;        // ✅ reset zoom ici
    render();
  });

  window.addEventListener("resize", rerender);

  // Ferme le panneau si clic en dehors
  document.addEventListener("click", (e) => {
    if (panel.style.display !== "none" && !panel.contains(e.target)) {
      const isOnViz = e.target.closest("#timeViz");
      if (!isOnViz) hidePanel();
    }
  });

  render();
});