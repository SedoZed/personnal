export function splitMulti(v){
  if (!v) return [];
  const s = String(v).replace(/\uFEFF/g,"").trim();
  if (!s) return [];
  return s.split(/\s*\|\s*/g).map(x => x.trim()).filter(Boolean);
}

export function uniq(arr){
  return Array.from(new Set(arr));
}

export function intersectCount(a, b){
  if (!a?.length || !b?.length) return 0;
  const setA = new Set(a);
  let c = 0;
  for (const x of b) if (setA.has(x)) c++;
  return c;
}

export function clamp(x, a, b){
  return Math.max(a, Math.min(b, x));
}

export function shortTitle(t){
  const s = (t || "").trim();
  if (s.length <= 12) return s;
  return s.slice(0, 10) + "…";
}

export function escapeHTML(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function hash(s){
  let h = 0;
  for (let i=0;i<s.length;i++) h = ((h<<5)-h) + s.charCodeAt(i) | 0;
  return Math.abs(h);
}
