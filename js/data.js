import { COLS } from "./config.js";
import { splitMulti, clamp, intersectCount } from "./utils.js";

export function buildAllNodes(rows){
  return rows.map((r, idx)=>({
    _idx: idx,
    id: (r[COLS.id] && String(r[COLS.id]).trim()) ? String(r[COLS.id]).trim() : `row-${idx}`,
    title: (r[COLS.title] || "").trim(),
    alt: (r[COLS.alt] || "").trim(),
    axe: splitMulti(r[COLS.axe]),
    // IMPORTANT : keywords = keywords-ia (on garde le nom "keywords" pour minimiser les changements)
    keywords: splitMulti(r[COLS.keywordsIA]),
    email: (r[COLS.email] || "").trim(),
    group: "∅"
  }));
}

// Taille des bulles : uniquement keywords-ia (+ un petit bonus axes si tu veux)
export function computeRadius(node){
  const k = node.keywords.length;
  const a = node.axe.length;
  return clamp(12 + 1.8*k + 0.6*a, 12, 52);
}

export function buildLinks(nodes, minShared){
  const links = [];
  for (let i=0;i<nodes.length;i++){
    for (let j=i+1;j<nodes.length;j++){
      const a = nodes[i].keywords;
      const b = nodes[j].keywords;
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
 * pour chaque nœud, choisir le mot-clé IA qui maximise les connexions via ce mot-clé.
 */
export function computeDominantGroup(nodes){
  const n = nodes.length;
  const perNodeScore = new Map();
  for (const node of nodes) perNodeScore.set(node.id, new Map());

  for (let i=0;i<n;i++){
    for (let j=i+1;j<n;j++){
      const A = nodes[i];
      const B = nodes[j];
      const setA = new Set(A.keywords);

      for (const d of B.keywords){
        if (!setA.has(d)) continue;
        perNodeScore.get(A.id).set(d, (perNodeScore.get(A.id).get(d)||0) + 1);
        perNodeScore.get(B.id).set(d, (perNodeScore.get(B.id).get(d)||0) + 1);
      }
    }
  }

  for (const node of nodes){
    const map = perNodeScore.get(node.id);

    // pas de connexions -> fallback = premier keyword-ia si dispo
    if (!map || map.size === 0){
      node.group = node.keywords.length ? node.keywords[0] : "∅";
      continue;
    }

    let best = null;
    let bestScore = -1;
    for (const d of node.keywords){
      const s = map.get(d) || 0;
      if (s > bestScore){
        bestScore = s;
        best = d;
      }
    }
    node.group = best || (node.keywords.length ? node.keywords[0] : "∅");
  }
}

export function buildThemeCounts(nodesAll){
  // index global (autocomplete) uniquement sur keywords-ia
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
    n.keywords.forEach(add);
  });

  return counts;
}
