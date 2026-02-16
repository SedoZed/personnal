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
  }));
}

export function computeRadius(node){
  // plus homogène => réseau moins “éclaté”
  const k = node.keywords.length;
  const e = node.erc.length;
  const h = node.hceres.length;
  return clamp(8 + 0.9*k + 1.1*e + 0.8*h, 10, 30);
}

export function buildLinks(nodes, mode, minShared){
  const key = mode; // "erc" | "hceres" | "keywords"
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
