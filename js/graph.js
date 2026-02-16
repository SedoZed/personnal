function tooltipHTML(d){
  const chips = (arr, max=14) => {
    const a = arr.slice(0, max);
    const more = arr.length > max ? ` <span class="chip">+${arr.length-max}</span>` : "";
    return a.map(x => `<span class="chip">${escapeHTML(x)}</span>`).join("") + more;
  };

  const email = d.email ? `<div class="v">${escapeHTML(d.email)}</div>` : `<div class="v"><em style="color:var(--muted)">—</em></div>`;
  const alt = d.alt ? `<div class="v">${escapeHTML(d.alt)}</div>` : `<div class="v"><em style="color:var(--muted)">—</em></div>`;

  return `
    <div class="t">${escapeHTML(d.title || "(Sans titre)")}</div>
    <div class="k">Famille (dominante IA)</div><div class="v">${escapeHTML(d.group || "∅")}</div>
    <div class="k">Alternative</div>${alt}
    <div class="k">Keywords IA</div><div class="v">${chips(d.kwia, 14) || `<em style="color:var(--muted)">—</em>`}</div>
    <div class="k">Contact</div>${email}
  `;
}
