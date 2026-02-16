import { COLS } from "./config.js";
import { splitMulti, clamp, intersectCount } from "./utils.js";

export function buildAllNodes(rows){
  return rows.map((r, idx)=>({
    _idx: idx,
    id: (r[COLS.id] && String(r[COLS.id]).trim()) ? String(r[COLS.id]).trim() : `row-${idx}`,
    title: (r[COLS.title] || "").trim(),
    alt: (r[COLS.alt] || "").trim(),
    axe: splitMulti(r[COLS.axe]),

    // on garde au besoin, mais non utilisés par la dataviz “IA”
    erc: splitMulti(r[COLS.erc]),
    hceres: splitMulti(r[COLS.hceres]),
    keywords: splitMulti(r[COLS.keywords]),

    // >>> SOURCE PRINCIPALE <<<
    kwia: splitMulti(r[COLS.keywordsIA]),

    email: (r[COLS.email] || "").trim(),

    group: "∅"
  }));
}

export function computeRadius(node){
  // Taille basée sur le nombre de keywords IA (plus lisible)
  const k = node.kwia.length;
  return clamp(12 + 2.2*k, 12, 44);
}

export function buildLinks(nodes, minShared){
  // liens = intersection sur kwia uniquement
  const links = [];
  for (let i=0;i<nodes.length;i++){
    for (let j=i+1;j<nodes.length;j++){
      const a = nodes[i].kwia;
      const b = nodes[j].kwia;
      const w = intersectCount(a,b);
      if (w >= minShared){
        links.push({ source: nodes[i].id, target: nodes[j].id, weight: w });
      }
    }
  }
  return links;
}

/**
 * Groupe dominant structurel (sur kwia):
 * pour chaque nœud, choisir le keyword IA qui génère le plus de connexions.
 */
export function computeDominantGroupKWIA(nodes){
  const n = nodes.length;
  const perNodeScore = new Map();
  for (const node of nodes) perNodeScore.set(node.id, new Map());

  for (let i=0;i<n;i++){
    for (let j=i+1;j<n;j++){
      const A = nodes[i];
      const B = nodes[j];
      const setA = new Set(A.kwia);

      for (const d of B.kwia){
        if (!setA.has(d)) continue;
        perNodeScore.get(A.id).set(d, (perNodeScore.get(A.id).get(d)||0) + 1);
        perNodeScore.get(B.id).set(d, (perNodeScore.get(B.id).get(d)||0) + 1);
      }
    }
  }

  for (const node of nodes){
    const map = perNodeScore.get(node.id);
    if (!map || map.size === 0){
      node.group = (node.kwia && node.kwia.length) ? node.kwia[0] : "∅";
      continue;
    }

    let best = null;
    let bestScore = -1;
    for (const d of node.kwia){
      const s = map.get(d) || 0;
      if (s > bestScore){
        bestScore = s;
        best = d;
      }
    }
    node.group = best || ((node.kwia && node.kwia.length) ? node.kwia[0] : "∅");
  }
}

export function buildThemeCountsKWIA(nodesAll){
  const counts = new Map();
  const add = (label) => {
    const t = String(label).trim();
    if (!t) return;
    const k = t.toLowerCase();
    const prev = counts.get(k);
    if (!prev) counts.set(k, { label: t, count: 1 });
    else counts.set(k, { label: prev.label, count: prev.count + 1 });
  };

  nodesAll.forEach(n => n.kwia.forEach(add));
  return counts;
}
