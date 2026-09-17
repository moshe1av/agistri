/* ============================================================
   world.js — geometry of the Saronic scene
   Units: 1 unit ≈ 10 m on Agistri. Distances beyond the island are
   compressed (~3×) so Aegina, Piraeus and Athens fit inside the fog.
   Axes: +x = east, +z = south, +y = up. Sea level is y = 0.
   ============================================================ */

export const COAST = 0.42;          // field iso-value that defines the coastline
export const SEED = 17.31;

/* ---------- metaball "blobs": [cx, cz, rx, rz, weight] ---------- */
export const AGISTRI_BLOBS = [
  [  30,  -60, 170, 120, 1.0 ],   // north body (Skala ↔ Megalochori)
  [ -20,   60, 150, 120, 1.0 ],   // centre / south (Limenaria)
  [-130,  140,  75,  52, 1.0 ],   // south-west peninsula (Aponisos)
  [ 150,   10,  62,  46, 1.0 ],   // east cape (Chalikiada / lighthouse)
  [-140,   10,  62,  60, 1.0 ],   // west bulge (Dragonera)
  [-182,  186,  17,  13, 1.6 ],   // Aponisos islet
];
export const AEGINA_BLOBS = [
  [ 520, -250, 200, 150, 1.0 ],
  [ 640, -160, 120, 100, 0.9 ],
];
export const MAINLAND_BLOBS = [
  [1100, -1000, 560, 380, 1.0 ],
  [ 880,  -840, 260, 160, 1.0 ],  // Piraeus headland
  [1500, -1250, 520, 420, 1.0 ],
  [1350,  -650, 260, 220, 0.9 ],  // Attica coast to the south-east
];
export const SALAMIS_BLOBS = [
  [ 680, -1020, 190, 130, 1.0 ],
];

export function fieldOf(blobs, x, z) {
  let m = 0;
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const dx = (x - b[0]) / b[2];
    const dz = (z - b[1]) / b[3];
    m += b[4] * Math.exp(-2.2 * (dx * dx + dz * dz));
  }
  return m;
}
export function coastNoise(x, z) {
  return 0.07 * Math.sin(0.019 * x + 1.7) * Math.sin(0.023 * z - 0.4)
       + 0.045 * Math.sin(0.051 * x + 0.3) * Math.cos(0.037 * z + 2.1)
       + 0.03 * Math.sin(0.11 * x) * Math.sin(0.09 * z);
}
export const agistriField  = (x, z) => fieldOf(AGISTRI_BLOBS, x, z) + coastNoise(x, z);
export const aeginaField   = (x, z) => fieldOf(AEGINA_BLOBS, x, z) + coastNoise(x, z);
export const mainlandField = (x, z) => fieldOf(MAINLAND_BLOBS, x, z) + coastNoise(x, z);
export const salamisField  = (x, z) => fieldOf(SALAMIS_BLOBS, x, z) + coastNoise(x, z);

/* ---------- GLSL twin of the field functions (kept in sync automatically) ---------- */
export function fieldGLSL() {
  const blobs = [...AGISTRI_BLOBS, ...AEGINA_BLOBS, ...MAINLAND_BLOBS, ...SALAMIS_BLOBS];
  // (no pow() here: pow with a negative base is undefined in GLSL)
  const terms = blobs.map(b =>
    `dx = (p.x - (${b[0].toFixed(1)})) / ${b[2].toFixed(1)}; dy = (p.y - (${b[1].toFixed(1)})) / ${b[3].toFixed(1)}; m += ${b[4].toFixed(2)} * exp(-2.2 * (dx * dx + dy * dy));`
  ).join('\n    ');
  return `
  float coastField(vec2 p) {
    float m = 0.0;
    float dx = 0.0;
    float dy = 0.0;
    ${terms}
    m += 0.07 * sin(0.019 * p.x + 1.7) * sin(0.023 * p.y - 0.4)
       + 0.045 * sin(0.051 * p.x + 0.3) * cos(0.037 * p.y + 2.1)
       + 0.03 * sin(0.11 * p.x) * sin(0.09 * p.y);
    return m;
  }`;
}

/* ---------- noise ---------- */
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7 + SEED) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    norm += amp; amp *= 0.5; f *= 2.07;
  }
  return s / norm;
}
export const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- villages (gentle ground) ---------- */
export const VILLAGES = {
  skala:       { x: 118, z: -92, r: 36, lo: 1.4, hi: 6.5 },
  megalochori: { x:  34, z: -122, r: 32, lo: 1.4, hi: 6.5 },
  limenaria:   { x:   0, z:  128, r: 20, lo: 1.4, hi: 6.0 },
  aponisos:    { x: -148, z: 168, r: 18, lo: 1.0, hi: 3.5 },
  metochi:     { x: 100, z:  -60, r: 14, lo: 8.0, hi: 16.0 },
  /* beaches: kept low and gentle */
  dragonera:   { x: -172, z:  30, r: 26, lo: 0.8, hi: 3.5 },
  chalikiada:  { x: 158, z: -36, r: 16, lo: 0.8, hi: 4.0 },
  skliri:      { x:  78, z: -112, r: 14, lo: 0.8, hi: 3.0 },
  islet:       { x: -182, z: 186, r: 26, lo: 1.0, hi: 8.0 },
};

/* ---------- heights ---------- */
export function agistriHeight(x, z) {
  const m = agistriField(x, z);
  const base = (m - COAST) * 28;
  const inland = smoothstep(COAST, COAST + 0.34, m);
  const hills = fbm(x * 0.011 + 3.1, z * 0.011 + 7.7, 4);
  const px = (x + 20) / 110, pz = (z - 60) / 90;
  const peak = Math.exp(-(px * px + pz * pz));
  const sharp = Math.pow(hills, 1.6);
  let h = base + inland * (5 + 30 * sharp + 30 * peak);
  // flatten around villages/beaches so they sit on gentle ground near the sea (land only)
  const land = smoothstep(COAST, COAST + 0.02, m);
  if (land > 0) {
    for (const k in VILLAGES) {
      const v = VILLAGES[k];
      const d = Math.hypot(x - v.x, z - v.z);
      const f = smoothstep(v.r, v.r * 0.45, d) * land;
      if (f > 0) h = lerp(h, clamp(h, v.lo, v.hi), f);
    }
  }
  return h;
}
export function aeginaHeight(x, z) {
  const m = aeginaField(x, z);
  const base = (m - COAST) * 30;
  const inland = smoothstep(COAST, COAST + 0.3, m);
  const hills = fbm(x * 0.006 + 1.3, z * 0.006 + 2.2, 4);
  const px = (x - 560) / 120, pz = (z + 230) / 95;
  const peak = Math.exp(-(px * px + pz * pz));
  return base + inland * (18 + 80 * hills + 110 * peak);
}
export function salamisHeight(x, z) {
  const m = salamisField(x, z);
  const base = (m - COAST) * 30;
  const inland = smoothstep(COAST, COAST + 0.3, m);
  return base + inland * (14 + 45 * fbm(x * 0.008, z * 0.008, 3));
}
export function mainlandHeight(x, z) {
  const m = mainlandField(x, z);
  const base = (m - COAST) * 30;
  const inland = smoothstep(COAST, COAST + 0.28, m);
  const dx = (x - 1010) / 330, dz = (z + 905) / 210;
  const d = Math.sqrt(dx * dx + dz * dz);
  const mount = smoothstep(1.0, 1.9, d) * (70 + 190 * fbm(x * 0.0045 + 9.1, z * 0.0045 + 4.4, 4));
  return base + inland * (5 + mount);
}

/** Highest solid ground at a point (for camera clamping and placement). */
export function groundHeight(x, z) {
  let h = -30;
  if (x > -320 && x < 320 && z > -280 && z < 300) h = Math.max(h, agistriHeight(x, z));
  if (x > 250 && x < 850 && z > -480 && z < 40) h = Math.max(h, aeginaHeight(x, z));
  if (x > 420 && x < 2200 && z < -420) h = Math.max(h, mainlandHeight(x, z), salamisHeight(x, z));
  return h;
}

/* ---------- named places (world coordinates) ---------- */
export const PLACES = {
  athens:      { x: 1150, z: -1000, r: 260 },
  piraeus:     { x:  845, z:  -790, r: 120 },
  port:        { x:  150, z:  -82, r:  36 },   // Skala harbour pier
  skala:       { x:  118, z:  -92, r:  55 },
  megalochori: { x:   34, z: -122, r:  50 },
  aponisos:    { x: -150, z:  168, r:  46 },
  dragonera:   { x: -174, z:   30, r:  44 },
  limenaria:   { x:    0, z:  128, r:  38 },
  chalikiada:  { x:  158, z:  -36, r:  28 },
  lighthouse:  { x:  193, z:   15, r:  20 },
};

/* Ferry lane Piraeus → Skala (world XZ) */
export const FERRY_ROUTE = [
  [ 832, -772 ], [ 786, -716 ], [ 600, -560 ], [ 350, -336 ], [ 230, -150 ], [ 176, -74 ],
];
