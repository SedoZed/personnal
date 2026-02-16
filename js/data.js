import { COLS } from "./config.js";
import { splitMulti, clamp, intersectCount } from "./utils.js";

export function buildAllNodes(rows){
  return rows.map((r, idx)=>({
    _idx: idx,
    id: (r[COLS.id] && String(r[COLS.id]).trim()) ? String(r[COLS.id]).trim() : `row-${idx}`,
    title: (r[COLS.title] || "").trim(),
    alt: (r[COLS.alt] || "").trim(),
    axe: splitMulti(r[COLS.axe]),
    erc: splitMulti(r[COLS.erc]),
    hceres: splitMulti(r[COLS.hceres]),
    keywords: splitMulti(r[COLS.keywords]),
    email: (r[COLS.email] || "").trim(),
    group: "∅"
  }));
}

export function computeRadius(node){
  const k = node.keywords.length;
  const e = node.erc.length;
  const h = node.hceres.length;
  return clamp(10 + 1.2*k + 1.6*e + 1.1*h, 12, 44);
}

export function buildLinks(nodes, mode, minShared){
  const key = mode;
  const links = [];
  for (let i=0;i<nodes.length;i++){
    for (let j=i+1;j<nodes.length;j++){
      const a = nodes[i][key];
      const b = nodes[j][key];
      const w = intersectCount(a,b);
      if (w >= minShared){
        links.push({ source: nodes[i].id, target: nodes[j].id, weight: w });
      }
    }
  }
  return links;
}

/**
 * Famille “dominante” structurelle :
 * pour chaque nœud, on choisit le domaine (du mode) qui maximise les connexions via ce domaine.
 */
export function computeDominantGroup(nodes, mode){
  const n = nodes.length;
  const perNodeScore = new Map();
  for (const node of nodes) perNodeScore.set(node.id, new Map());

  for (let i=0;i<n;i++){
    for (let j=i+1;j<n;j++){
      const A = nodes[i];
      const B = nodes[j];
      const setA = new Set(A[mode]);

      for (const d of B[mode]){
        if (!setA.has(d)) continue;
        perNodeScore.get(A.id).set(d, (perNodeScore.get(A.id).get(d)||0) + 1);
        perNodeScore.get(B.id).set(d, (perNodeScore.get(B.id).get(d)||0) + 1);
      }
    }
  }

  for (const node of nodes){
    const map = perNodeScore.get(node.id);
    if (!map || map.size === 0){
      node.group = (node[mode] && node[mode].length) ? node[mode][0] : "∅";
      continue;
    }

    let best = null;
    let bestScore = -1;
    for (const d of node[mode]){
      const s = map.get(d) || 0;
      if (s > bestScore){
        bestScore = s;
        best = d;
      }
    }
    node.group = best || ((node[mode] && node[mode].length) ? node[mode][0] : "∅");
  }
}

export function buildThemeCounts(nodesAll){
  // index global (autocomplete)
  const counts = new Map(); // themeLower -> { label, count }
  const add = (label) => {
    const t = String(label).trim();
    if (!t) return;
    const k = t.toLowerCase();
    const prev = counts.get(k);
    if (!prev) counts.set(k, { label: t, count: 1 });
    else counts.set(k, { label: prev.label, count: prev.count + 1 });
  };

  nodesAll.forEach(n=>{
    n.erc.forEach(add);
    n.hceres.forEach(add);
    n.keywords.forEach(add);
  });

  return counts;
}
