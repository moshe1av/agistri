/* ============================================================
   island.js — everything that stands still: land, pines, villages,
   harbours, lighthouse, Piraeus, Athens and the mountains behind.
   ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  COAST, agistriField, agistriHeight, aeginaHeight, aeginaField, mainlandHeight, mainlandField,
  salamisHeight, salamisField, fbm, smoothstep, clamp, VILLAGES, PLACES,
} from './world.js';

const rnd = (() => { let s = 4242; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
const rr = (a, b) => a + (b - a) * rnd();

/* ---------- generic terrain builder ---------- */
function buildTerrain({ cx, cz, w, d, seg, height, color, name }) {
  const geo = new THREE.PlaneGeometry(w, d, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(cx, 0, cz);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = height(x, z);
    pos.setY(i, h);
    const dh = Math.abs(height(x + 3, z) - height(x - 3, z)) + Math.abs(height(x, z + 3) - height(x, z - 3));
    color(x, z, h, dh, c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.0, envMapIntensity: 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = name;
  return mesh;
}

const COL = {
  sand: new THREE.Color(0xe7d6ab), sandWet: new THREE.Color(0xd9c396),
  pine: new THREE.Color(0x3d6b3c), scrub: new THREE.Color(0x7c8f4e), dry: new THREE.Color(0xa8a06e),
  rock: new THREE.Color(0x8f8676), rockDark: new THREE.Color(0x6f675c), seabed: new THREE.Color(0x3c7f7a),
  city: new THREE.Color(0xb9b3a5), mountain: new THREE.Color(0x6f7a84),
};
const tmpC = new THREE.Color();

function islandColor(beaches) {
  return (x, z, h, dh, c) => {
    if (h < -0.5) { c.copy(COL.seabed); return; }
    const n = fbm(x * 0.05 + 11, z * 0.05 + 3, 3);
    let beach = 0;
    for (const b of beaches) beach = Math.max(beach, smoothstep(b.r, b.r * 0.5, Math.hypot(x - b.x, z - b.z)));
    const lowFlat = smoothstep(3.2, 0.2, h) * smoothstep(3.5, 1.0, dh);
    const sandy = Math.max(lowFlat * 0.6, beach * smoothstep(6, 1, h));
    const steep = smoothstep(2.5, 6.5, dh);
    c.copy(COL.pine).lerp(COL.scrub, n * 0.75).lerp(COL.dry, smoothstep(0.62, 0.9, n) * 0.5);
    c.lerp(COL.rock, steep * 0.85);
    c.lerp(COL.rockDark, steep * smoothstep(0.5, 0.8, n) * 0.5);
    c.lerp(h < 0.6 ? COL.sandWet : COL.sand, sandy);
  };
}

/* ---------- pine tree geometry (vertex-coloured, one draw call per forest) ---------- */
function pineGeometry() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 1.7, 6);
  trunk.translate(0, 0.85, 0);
  const c1 = new THREE.ConeGeometry(1.65, 2.6, 7); c1.translate(0, 2.7, 0);
  const c2 = new THREE.ConeGeometry(1.25, 2.3, 7); c2.translate(0, 3.9, 0);
  const c3 = new THREE.ConeGeometry(0.8, 1.8, 7);  c3.translate(0, 5.0, 0);
  const paint = (g, col) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  };
  paint(trunk, new THREE.Color(0x6b4a2e));
  paint(c1, new THREE.Color(0x2f5e34)); paint(c2, new THREE.Color(0x37703b)); paint(c3, new THREE.Color(0x3f7c43));
  return mergeGeometries([trunk, c1, c2, c3], false);
}

function scatterForest(count, sampler, accept, heightFn, tint) {
  const geo = pineGeometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.35 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color();
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 30) {
    tries++;
    const [x, z] = sampler();
    const h = heightFn(x, z);
    if (!accept(x, z, h)) continue;
    const sc = rr(0.75, 1.35);
    p.set(x, h - 0.2, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
    s.set(sc, sc * rr(0.9, 1.25), sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    const v = rr(0.8, 1.15);
    col.setRGB(v * tint[0], v * tint[1], v * tint[2]);
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/* ---------- houses ---------- */
function houseGeometry() {
  const body = new THREE.BoxGeometry(3, 2.4, 3);
  body.translate(0, 1.2, 0);
  const roof = new THREE.ConeGeometry(2.45, 1.25, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 2.4 + 0.62, 0);
  const paint = (g, col) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  };
  paint(body, new THREE.Color(0xf7f4ec));
  paint(roof, new THREE.Color(0xb8613f));
  return mergeGeometries([body, roof], false);
}
function flatHouseGeometry() {
  const body = new THREE.BoxGeometry(2.6, 2.2, 2.6);
  body.translate(0, 1.1, 0);
  const n = body.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = 0.98; a[i * 3 + 1] = 0.98; a[i * 3 + 2] = 0.96; }
  body.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return body;
}

function village(center, count, spread, heightFn, fieldFn, opts = {}) {
  const geo = opts.flat ? flatHouseGeometry() : houseGeometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, envMapIntensity: 0.5 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color();
  let placed = 0, tries = 0;
  const base = opts.rotation ?? 0;
  while (placed < count && tries < count * 60) {
    tries++;
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * spread;
    const x = center.x + Math.cos(a) * r * (opts.sx ?? 1), z = center.z + Math.sin(a) * r * (opts.sz ?? 1);
    if (fieldFn(x, z) < COAST + 0.02) continue;
    const h = heightFn(x, z);
    if (h < 0.9 || h > (opts.maxH ?? 24)) continue;
    const slope = Math.abs(heightFn(x + 2, z) - heightFn(x - 2, z)) + Math.abs(heightFn(x, z + 2) - heightFn(x, z - 2));
    if (slope > 2.6) continue;
    const sc = rr(0.8, 1.25);
    p.set(x, h - 0.15, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), base + rr(-0.35, 0.35) + (rnd() < 0.5 ? 0 : Math.PI / 2));
    s.set(sc, rr(0.9, 1.3), sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    const v = rr(0.92, 1.0);
    col.setRGB(v, v, v * rr(0.96, 1));
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

function cityGrid(center, nx, nz, step, heightFn, fieldFn, opts = {}) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, envMapIntensity: 0.4 });
  const mesh = new THREE.InstancedMesh(geo, mat, nx * nz);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = center.x + (i - nx / 2) * step + rr(-step * 0.2, step * 0.2);
    const z = center.z + (j - nz / 2) * step + rr(-step * 0.2, step * 0.2);
    if (fieldFn(x, z) < COAST + 0.03) continue;
    const h = heightFn(x, z);
    if (h < 0.8 || h > (opts.maxH ?? 40)) continue;
    if (opts.exclude && opts.exclude(x, z)) continue;
    const bw = step * rr(0.45, 0.8), bd = step * rr(0.45, 0.8);
    const bh = rr(opts.minH ?? 3, opts.maxBuild ?? 9) * (opts.tall && rnd() < 0.08 ? 2.2 : 1);
    p.set(x, h - 0.2, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.rotation ?? 0);
    s.set(bw, bh, bd);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    const v = rr(0.78, 0.96);
    col.setRGB(v, v * rr(0.97, 1), v * rr(0.92, 0.98));
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/* ---------- small built pieces ---------- */
const WHITE = new THREE.MeshStandardMaterial({ color: 0xfaf8f2, roughness: 0.75, envMapIntensity: 0.5 });
const BLUE = new THREE.MeshStandardMaterial({ color: 0x2b64b8, roughness: 0.55, envMapIntensity: 0.6 });
const STONE = new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.95 });
const CONCRETE = new THREE.MeshStandardMaterial({ color: 0xb9b4a8, roughness: 0.9 });
const RED = new THREE.MeshStandardMaterial({ color: 0xc8402f, roughness: 0.6 });

function church(x, z, h, rot = 0) {
  const g = new THREE.Group();
  const nave = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 4.2), WHITE); nave.position.y = 1.7; g.add(nave);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.7, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), BLUE); dome.position.set(1.2, 3.4, 0); g.add(dome);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.9, 18), WHITE); drum.position.set(1.2, 3.4, 0); g.add(drum);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 5.6, 1.5), WHITE); tower.position.set(-2.4, 2.8, 0); g.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.2, 4), BLUE); cap.rotation.y = Math.PI / 4; cap.position.set(-2.4, 6.2, 0); g.add(cap);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, h - 0.1, z);
  g.rotation.y = rot;
  return g;
}

function pier(x, z, dir, len, w = 4, mat = CONCRETE) {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 1.3, len), mat);
  deck.position.set(0, 0.7, -len / 2);
  deck.castShadow = true; deck.receiveShadow = true;
  g.add(deck);
  const postGeo = new THREE.CylinderGeometry(0.28, 0.32, 2.6, 6);
  for (let i = 0; i < len; i += 8) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, STONE);
      post.position.set(side * (w / 2 - 0.5), -0.3, -i - 3);
      g.add(post);
    }
  }
  const bollGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8);
  for (let i = 6; i < len; i += 10) { const b = new THREE.Mesh(bollGeo, STONE); b.position.set(w / 2 - 0.6, 1.6, -i); g.add(b); }
  g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(dir[0], dir[1]) + Math.PI;
  return g;
}

function breakwater(points, mat = STONE) {
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], 0, p[1])));
  const n = Math.floor(curve.getLength() / 1.6);
  const mesh = new THREE.InstancedMesh(rockGeo, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const p = curve.getPoint(i / (n - 1));
    p.x += rr(-1, 1); p.z += rr(-1, 1); p.y = rr(-0.5, 1.2);
    e.set(rnd() * 3, rnd() * 3, rnd() * 3);
    q.setFromEuler(e);
    const sc = rr(1.3, 2.4);
    s.set(sc, sc * 0.8, sc);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function lighthouse(x, z, h) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 1.6, 12), WHITE); base.position.y = 0.8; g.add(base);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.0, 12, 14), WHITE); tower.position.y = 7.6; g.add(tower);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.9, 2.2, 14), RED); band.position.y = 6.4; g.add(band);
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.5, 14), STONE); gallery.position.y = 13.7; g.add(gallery);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd27a, emissiveIntensity: 2.2, roughness: 0.2 }));
  lamp.position.y = 14.8; g.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 12), RED); cap.position.y = 16.4; g.add(cap);
  const light = new THREE.PointLight(0xffd7a0, 0, 120, 1.6); light.position.y = 14.8; g.add(light);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 140, 12, 1, true), beamMat);
  beam.rotation.z = Math.PI / 2; beam.position.set(70, 14.8, 0);
  const beamPivot = new THREE.Group(); beamPivot.position.y = 0; beamPivot.add(beam); g.add(beamPivot);
  g.traverse(o => { if (o.isMesh && o !== beam) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, h - 0.2, z);
  return { group: g, light, beam, beamPivot };
}

/* Athens' rock with a temple on top */
function acropolis(x, z, baseH) {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(34, 44, 34, 7, 1), new THREE.MeshStandardMaterial({ color: 0xa9a08c, roughness: 0.95, flatShading: true }));
  rock.position.y = 17; g.add(rock);
  const top = 34;
  const marble = new THREE.MeshStandardMaterial({ color: 0xf3ecdc, roughness: 0.6 });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(30, 1.6, 13), marble); platform.position.set(0, top + 0.8, 0); g.add(platform);
  const colGeo = new THREE.CylinderGeometry(0.75, 0.85, 8, 10);
  for (let i = 0; i < 8; i++) for (const zz of [-5.2, 5.2]) {
    const c = new THREE.Mesh(colGeo, marble); c.position.set(-13.3 + i * 3.8, top + 5.6, zz); g.add(c);
  }
  for (const xx of [-13.3, 13.3]) for (let j = 1; j < 3; j++) {
    const c = new THREE.Mesh(colGeo, marble); c.position.set(xx, top + 5.6, -5.2 + j * 3.47); g.add(c);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(30.5, 1.4, 13.5), marble); roof.position.set(0, top + 10.3, 0); g.add(roof);
  const tri = new THREE.Shape(); tri.moveTo(-6.75, 0); tri.lineTo(6.75, 0); tri.lineTo(0, 3); tri.closePath();
  const pedGeo = new THREE.ExtrudeGeometry(tri, { depth: 30.5, bevelEnabled: false });
  pedGeo.rotateY(Math.PI / 2); pedGeo.translate(-15.25, 0, 0);
  const ped = new THREE.Mesh(pedGeo, marble); ped.position.set(0, top + 11, 0); g.add(ped);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(x, baseH - 2, z);
  return g;
}

/* ---------- assemble ---------- */
export function createLand(quality) {
  const group = new THREE.Group();
  group.name = 'land';

  const beaches = [
    { x: PLACES.aponisos.x - 8, z: PLACES.aponisos.z, r: 22 },
    { x: PLACES.dragonera.x, z: PLACES.dragonera.z, r: 20 },
    { x: 128, z: -104, r: 18 },          // Skala beach
    { x: PLACES.chalikiada.x, z: PLACES.chalikiada.z, r: 12 },
    { x: 78, z: -114, r: 12 },           // Skliri
    { x: 30, z: -130, r: 12 },           // Megalochori
  ];

  /* Agistri */
  const agistri = buildTerrain({ cx: 0, cz: 0, w: 620, d: 560, seg: quality.high ? 240 : 170, height: agistriHeight, color: islandColor(beaches), name: 'agistri' });
  group.add(agistri);

  /* Aegina (neighbour to the east) */
  const aegina = buildTerrain({ cx: 560, cz: -230, w: 720, d: 560, seg: 110, height: aeginaHeight, color: (x, z, h, dh, c) => {
    if (h < -0.5) { c.copy(COL.seabed); return; }
    const n = fbm(x * 0.03, z * 0.03, 3);
    c.copy(COL.scrub).lerp(COL.dry, n * 0.6).lerp(COL.pine, smoothstep(0.55, 0.9, n) * 0.6).lerp(COL.rock, smoothstep(4, 9, dh) * 0.8);
    c.lerp(COL.sand, smoothstep(3, 0.3, h) * 0.6);
  }, name: 'aegina' });
  group.add(aegina);

  /* Attica mainland with Piraeus and Athens */
  const mainland = buildTerrain({ cx: 1180, cz: -1020, w: 1900, d: 1400, seg: 150, height: mainlandHeight, color: (x, z, h, dh, c) => {
    if (h < -0.5) { c.copy(COL.seabed); return; }
    const n = fbm(x * 0.01, z * 0.01, 3);
    const dx = (x - 1010) / 330, dz = (z + 905) / 210;
    const cityF = 1 - smoothstep(0.9, 1.5, Math.sqrt(dx * dx + dz * dz));
    c.copy(COL.dry).lerp(COL.scrub, n * 0.5).lerp(COL.mountain, smoothstep(40, 160, h)).lerp(COL.rock, smoothstep(5, 12, dh) * 0.6);
    c.lerp(COL.city, cityF * 0.8);
    c.lerp(COL.sand, smoothstep(3, 0.3, h) * 0.5);
  }, name: 'attica' });
  group.add(mainland);

  const salamis = buildTerrain({ cx: 680, cz: -1020, w: 520, d: 380, seg: 60, height: salamisHeight, color: (x, z, h, dh, c) => {
    if (h < -0.5) { c.copy(COL.seabed); return; }
    c.copy(COL.dry).lerp(COL.scrub, fbm(x * 0.02, z * 0.02, 2) * 0.6);
  }, name: 'salamis' });
  group.add(salamis);

  /* distant mountains (Peloponnese, Methana, Attica ridges) */
  const mtnMat = new THREE.MeshStandardMaterial({ color: 0x6b7787, roughness: 1, flatShading: true });
  const mtnGeo = new THREE.ConeGeometry(1, 1, 7, 1);
  const mtn = new THREE.InstancedMesh(mtnGeo, mtnMat, 46);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let i = 0;
    const put = (x, z, r, h) => { p.set(x, -h * 0.1, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 3); s.set(r, h, r * rr(0.7, 1.2)); m.compose(p, q, s); mtn.setMatrixAt(i++, m); };
    for (let a = 150; a <= 300; a += 6) {
      const rad = THREE.MathUtils.degToRad(a), R = rr(1900, 2500);
      put(Math.cos(rad) * R, Math.sin(rad) * R, rr(260, 460), rr(180, 420));
    }
    for (let a = -60; a <= 40; a += 8) {
      const rad = THREE.MathUtils.degToRad(a), R = rr(2300, 2700);
      put(1300 + Math.cos(rad) * R * 0.7, -1000 + Math.sin(rad) * R * 0.5, rr(320, 520), rr(220, 460));
    }
    mtn.count = i;
    mtn.instanceMatrix.needsUpdate = true;
  }
  group.add(mtn);

  /* forests */
  const exclusions = Object.values(VILLAGES).map(v => ({ x: v.x, z: v.z, r: v.r * 0.75 }));
  const isClear = (x, z) => exclusions.some(e => Math.hypot(x - e.x, z - e.z) < e.r);
  const forest = scatterForest(quality.high ? 2600 : 1400,
    () => [rr(-300, 300), rr(-270, 270)],
    (x, z, h) => h > 2.4 && agistriField(x, z) > COAST + 0.02 && !isClear(x, z) && fbm(x * 0.03 + 5, z * 0.03 + 9, 3) > 0.32 - h * 0.004,
    agistriHeight, [1, 1, 1]);
  group.add(forest);

  const aeginaForest = scatterForest(quality.high ? 600 : 300,
    () => [rr(300, 820), rr(-440, -20)],
    (x, z, h) => h > 3 && h < 110 && aeginaField(x, z) > COAST + 0.03 && fbm(x * 0.02, z * 0.02, 2) > 0.45,
    aeginaHeight, [1.05, 1.0, 0.85]);
  group.add(aeginaForest);

  /* villages */
  const add = (o) => group.add(o);
  add(village(VILLAGES.skala, 150, 34, agistriHeight, agistriField, { rotation: 0.4, sx: 1.25 }));
  add(village(VILLAGES.megalochori, 120, 30, agistriHeight, agistriField, { rotation: -0.2, sx: 1.3 }));
  add(village(VILLAGES.limenaria, 40, 18, agistriHeight, agistriField, {}));
  add(village(VILLAGES.metochi, 22, 12, agistriHeight, agistriField, { flat: true }));
  add(village(VILLAGES.aponisos, 5, 10, agistriHeight, agistriField, { maxH: 4 }));
  add(village({ x: 640, z: -300 }, 160, 60, aeginaHeight, aeginaField, { maxH: 30 }));   // Aegina town (west coast)
  add(village({ x: 470, z: -330 }, 70, 40, aeginaHeight, aeginaField, { maxH: 30 }));

  /* Skala church on the beach */
  add(church(131, -101, Math.max(agistriHeight(131, -101), 1.2), -0.35));
  /* Megalochori church */
  add(church(38, -118, Math.max(agistriHeight(38, -118), 1.4), 0.2));

  /* harbours */
  add(pier(150, -84, [0.55, -0.83], 42, 6));                // Skala ferry pier
  add(breakwater([[176, -66], [190, -78], [200, -96]]));
  add(pier(24, -134, [-0.2, -0.98], 26, 4));                 // Milos (Megalochori) pier
  add(breakwater([[4, -150], [18, -160], [40, -162]]));
  add(pier(-152, 178, [-0.9, 0.44], 12, 3));                 // Aponisos jetty
  /* bridge to the islet */
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 20), CONCRETE);
  bridge.position.set(-168, 1.1, 177); bridge.rotation.y = -0.55; bridge.castShadow = true; add(bridge);

  /* lighthouse on the east cape */
  const lh = lighthouse(PLACES.lighthouse.x, PLACES.lighthouse.z, Math.max(agistriHeight(PLACES.lighthouse.x, PLACES.lighthouse.z), 1.2));
  add(lh.group);

  /* Piraeus: dense blocks, long breakwaters, big pier */
  const pir = { x: 880, z: -840 };
  add(cityGrid(pir, 26, 18, 11, mainlandHeight, mainlandField, { minH: 5, maxBuild: 14, tall: true, exclude: (x, z) => Math.hypot(x - 845, z + 790) < 55 }));
  add(pier(852, -800, [-0.6, 0.8], 70, 12, CONCRETE));
  add(pier(872, -818, [-0.6, 0.8], 60, 10, CONCRETE));
  add(breakwater([[790, -760], [770, -800], [780, -850]]));
  add(breakwater([[900, -720], [860, -735], [830, -760]]));
  /* container cranes */
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.BoxGeometry(4, 22, 4), craneMat); legs.position.y = 11; c.add(legs);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 30), craneMat); arm.position.set(0, 23, -8); c.add(arm);
    c.position.set(905 + i * 14, mainlandHeight(905 + i * 14, -862), -862);
    c.traverse(o => { if (o.isMesh) o.castShadow = true; });
    add(c);
  }

  /* Athens: sprawling blocks, the rock and a temple, a cone hill with a chapel */
  const ath = { x: 1150, z: -1000 };
  add(cityGrid(ath, 60, 46, 9, mainlandHeight, mainlandField, { minH: 3, maxBuild: 8, exclude: (x, z) => Math.hypot(x - 1150, z + 1000) < 52 || Math.hypot(x - 1228, z + 1078) < 50 }));
  add(acropolis(1150, -1000, mainlandHeight(1150, -1000)));
  const lyc = new THREE.Mesh(new THREE.ConeGeometry(46, 92, 9), new THREE.MeshStandardMaterial({ color: 0x8b9470, roughness: 1, flatShading: true }));
  lyc.position.set(1228, mainlandHeight(1228, -1078) + 40, -1078); lyc.castShadow = true; add(lyc);
  const chapel = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), WHITE); chapel.position.set(1228, mainlandHeight(1228, -1078) + 86, -1078); add(chapel);

  return { group, lighthouse: lh, forest };
}
