/* ============================================================
   actors.js — the things that move: ferry, boats, gulls, clouds,
   sea sparkles and one small airplane over Athens.
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FERRY_ROUTE, agistriField, COAST, lerp, clamp } from './world.js';

const rnd = (() => { let s = 9001; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
const rr = (a, b) => a + (b - a) * rnd();

/* Optional GLTF override: drop a model into /assets/models and it replaces the procedural one. */
const gltfLoader = new GLTFLoader();
function loadOptionalModel(url, onLoad) {
  if (typeof window === 'undefined' || !/^https?:/.test(location.protocol)) return;
  gltfLoader.load(url, (g) => onLoad(g.scene), undefined, () => { /* keep procedural fallback */ });
}

/* ---------- hull shape used by all boats ---------- */
function hullGeometry(len, wid, depth) {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, -wid / 2);
  s.lineTo(len * 0.25, -wid / 2);
  s.quadraticCurveTo(len * 0.5, -wid / 2, len / 2, 0);
  s.quadraticCurveTo(len * 0.5, wid / 2, len * 0.25, wid / 2);
  s.lineTo(-len / 2, wid / 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2 });
  g.rotateX(Math.PI / 2);          // extrude was along +z → now along -y
  g.translate(0, depth * 0.55, 0);
  return g;
}

/* ---------- ferry ---------- */
export function createFerry() {
  const g = new THREE.Group();
  g.name = 'ferry';
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x1c3f6e, roughness: 0.5, metalness: 0.1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f7f4, roughness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2733, roughness: 0.2, metalness: 0.4, emissive: 0x0a1420, emissiveIntensity: 0.5 });

  const hull = new THREE.Mesh(hullGeometry(30, 8, 3), hullMat); g.add(hull);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(24, 0.5, 8.2), white); stripe.position.y = 2.2; g.add(stripe);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(20, 3.2, 6.8), white); deck.position.set(-1, 4.2, 0); g.add(deck);
  const win = new THREE.Mesh(new THREE.BoxGeometry(18, 1.0, 7.0), glass); win.position.set(-1, 4.6, 0); g.add(win);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(12, 2.6, 5.6), white); upper.position.set(2, 7.1, 0); g.add(upper);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 6.0), glass); bridge.position.set(6.5, 7.2, 0); g.add(bridge);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3, 12), hullMat); funnel.position.set(-5, 9.6, 0); g.add(funnel);
  const funnelTop = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.5, 12), white); funnelTop.position.set(-5, 10.6, 0); g.add(funnelTop);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5, 6), white); mast.position.set(8, 10.5, 0); g.add(mast);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  /* wake */
  const wakeTex = wakeTexture();
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(14, 70), new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, opacity: 0.8, depthWrite: false }));
  wake.name = 'wake';
  wake.rotation.x = -Math.PI / 2; wake.rotation.z = Math.PI / 2;
  wake.position.set(-42, 0.55, 0);
  g.add(wake);

  loadOptionalModel('assets/models/ferry.glb', (scene) => { g.clear(); g.add(scene); });

  const curve = new THREE.CatmullRomCurve3(FERRY_ROUTE.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal', 0.3);
  const state = { t: 0.5, target: 0.5, move: 1, speed: 0.016 };
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();

  function update(dt, time) {
    // slide t towards target (director tweens state.target) and then patrol if moving
    if (state.move !== 0) {
      state.target = clamp(state.target + state.move * state.speed * dt, 0.04, 0.985);
      if (state.target >= 0.985 || state.target <= 0.04) state.move *= -1;
    }
    state.t += (state.target - state.t) * Math.min(1, dt * 2.5);
    const t = clamp(state.t, 0, 1);
    curve.getPointAt(t, tmp);
    curve.getTangentAt(t, tan);
    if (state.move < 0 || (state.move === 0 && state.target < 0.5)) tan.negate();
    g.position.set(tmp.x, 0.2 + Math.sin(time * 1.3) * 0.18, tmp.z);
    g.rotation.set(Math.sin(time * 0.9) * 0.012, Math.atan2(-tan.z, tan.x), Math.sin(time * 1.1) * 0.02);
    const moving = Math.abs(state.target - state.t) > 0.002 || state.move !== 0;
    wake.material.opacity += ((moving ? 0.75 : 0.0) - wake.material.opacity) * Math.min(1, dt * 1.5);
  }
  return { group: g, state, update, curve };
}

function wakeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0.7)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 256);
  const side = ctx.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)'); side.addColorStop(0.5, 'rgba(0,0,0,0.0)'); side.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  const mask = ctx.createLinearGradient(0, 0, 64, 0);
  mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(0.35, 'rgba(0,0,0,1)'); mask.addColorStop(0.65, 'rgba(0,0,0,1)'); mask.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mask; ctx.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- small boats ---------- */
export function createBoats() {
  const group = new THREE.Group();
  group.name = 'boats';
  const list = [];
  const colors = [0xffffff, 0x2c6fd6, 0xe9e3d3, 0xd9534f, 0xffffff, 0x3aa6b9];
  const moorings = [
    [170, -72], [166, -80], [180, -90], [12, -146], [26, -150], [-160, 186], [150, -20], [64, -134],
  ];
  moorings.forEach((p, i) => {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(hullGeometry(5, 1.9, 0.9), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.6 }));
    b.add(hull);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 1.1), new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.8 })); inner.position.y = 0.75; b.add(inner);
    if (i % 3 === 0) { const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.2), new THREE.MeshStandardMaterial({ color: 0xffffff })); cab.position.set(-0.6, 1.2, 0); b.add(cab); }
    b.position.set(p[0], 0, p[1]);
    b.rotation.y = rr(0, Math.PI * 2);
    b.traverse(o => { if (o.isMesh) o.castShadow = true; });
    group.add(b);
    list.push({ obj: b, phase: rr(0, 6), kind: 'moored' });
  });

  /* sailboat cruising south of the island */
  const sail = new THREE.Group();
  const shull = new THREE.Mesh(hullGeometry(9, 2.6, 1.2), new THREE.MeshStandardMaterial({ color: 0xf8f8f6, roughness: 0.5 })); sail.add(shull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 11, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd })); mast.position.set(0.5, 6, 0); sail.add(mast);
  const sailShape = new THREE.Shape(); sailShape.moveTo(0, 0); sailShape.lineTo(0, 9.5); sailShape.lineTo(-5, 0.8); sailShape.closePath();
  const sailMesh = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 }));
  sailMesh.position.set(0.5, 1.6, 0); sail.add(sailMesh);
  const jib = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), sailMesh.material); jib.scale.set(-0.7, 0.75, 1); jib.position.set(0.7, 1.6, 0); sail.add(jib);
  sail.traverse(o => { if (o.isMesh) o.castShadow = true; });
  group.add(sail);
  list.push({ obj: sail, kind: 'cruise', center: [60, 260], r: 120, speed: 0.045, phase: 0 });

  /* water taxi shuttling Skala ↔ Aegina */
  const taxi = new THREE.Group();
  const th = new THREE.Mesh(hullGeometry(7, 2.4, 1.1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })); taxi.add(th);
  const tc = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 1.8), new THREE.MeshStandardMaterial({ color: 0x1f5fb0 })); tc.position.set(-0.5, 1.4, 0); taxi.add(tc);
  taxi.traverse(o => { if (o.isMesh) o.castShadow = true; });
  group.add(taxi);
  list.push({ obj: taxi, kind: 'shuttle', a: [200, -60], b: [420, -300], speed: 0.06, phase: 0 });

  function update(dt, time) {
    for (const b of list) {
      if (b.kind === 'moored') {
        b.obj.position.y = 0.15 + Math.sin(time * 1.6 + b.phase) * 0.16;
        b.obj.rotation.x = Math.sin(time * 1.1 + b.phase) * 0.05;
        b.obj.rotation.z = Math.cos(time * 1.4 + b.phase) * 0.06;
      } else if (b.kind === 'cruise') {
        const a = time * b.speed + b.phase;
        const x = b.center[0] + Math.cos(a) * b.r * 1.4, z = b.center[1] + Math.sin(a) * b.r;
        b.obj.position.set(x, 0.1 + Math.sin(time * 1.2) * 0.15, z);
        b.obj.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a) * 1.4);
        b.obj.rotation.z = 0.12 + Math.sin(time * 0.8) * 0.04;
      } else if (b.kind === 'shuttle') {
        const u = (Math.sin(time * b.speed) + 1) / 2;
        const x = lerp(b.a[0], b.b[0], u), z = lerp(b.a[1], b.b[1], u);
        const dir = Math.cos(time * b.speed) >= 0 ? 1 : -1;
        b.obj.position.set(x, 0.1 + Math.sin(time * 2) * 0.1, z);
        b.obj.rotation.y = Math.atan2(-(b.b[1] - b.a[1]) * dir, (b.b[0] - b.a[0]) * dir);
      }
    }
  }
  return { group, update };
}

/* ---------- seagulls ---------- */
export function createGulls(count = 16) {
  const group = new THREE.Group();
  group.name = 'gulls';
  const bodyGeo = new THREE.ConeGeometry(0.22, 1.2, 6); bodyGeo.rotateX(Math.PI / 2);
  const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0); wingShape.lineTo(1.9, 0.35); wingShape.lineTo(2.2, 0.15); wingShape.lineTo(1.6, -0.25); wingShape.lineTo(0, -0.35); wingShape.closePath();
  const wingGeo = new THREE.ShapeGeometry(wingShape); wingGeo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xf7f7f5, side: THREE.DoubleSide, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0xd4d4d0, side: THREE.DoubleSide });
  const flocks = [
    { c: [150, -60], r: 70, h: 18 }, { c: [-150, 150], r: 55, h: 14 }, { c: [30, -140], r: 60, h: 16 }, { c: [850, -790], r: 90, h: 24 },
  ];
  const birds = [];
  for (let i = 0; i < count; i++) {
    const f = flocks[i % flocks.length];
    const b = new THREE.Group();
    b.add(new THREE.Mesh(bodyGeo, mat));
    const wl = new THREE.Mesh(wingGeo, i % 2 ? mat : dark); wl.position.x = 0.15;
    const wr = new THREE.Mesh(wingGeo, i % 2 ? mat : dark); wr.scale.x = -1; wr.position.x = -0.15;
    b.add(wl, wr);
    group.add(b);
    birds.push({ obj: b, wl, wr, f, phase: rr(0, 10), speed: rr(0.25, 0.45), rad: f.r * rr(0.5, 1.1), hh: f.h + rr(-4, 8), flap: rr(6, 9), dir: rnd() < 0.5 ? 1 : -1 });
  }
  function update(dt, time) {
    for (const b of birds) {
      const a = time * b.speed * b.dir + b.phase;
      const x = b.f.c[0] + Math.cos(a) * b.rad + Math.sin(a * 2.3) * 8;
      const z = b.f.c[1] + Math.sin(a) * b.rad * 0.8 + Math.cos(a * 1.7) * 6;
      const y = b.hh + Math.sin(time * 0.6 + b.phase) * 3;
      const px = b.obj.position.x, pz = b.obj.position.z;
      b.obj.position.set(x, y, z);
      if (px !== 0) b.obj.rotation.y = Math.atan2(x - px, z - pz);
      const w = Math.sin(time * b.flap + b.phase) * 0.55;
      b.wl.rotation.z = w; b.wr.rotation.z = -w;
      b.obj.rotation.z = -Math.sin(a) * 0.25 * b.dir;
    }
  }
  return { group, update };
}

/* ---------- clouds ---------- */
function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 30 + Math.random() * 196, y = 40 + Math.random() * 50, r = 18 + Math.random() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.55, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export function createClouds(count = 28) {
  const group = new THREE.Group();
  group.name = 'clouds';
  const tex = cloudTexture();
  const list = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: rr(0.55, 0.85), depthWrite: false, fog: true, color: 0xf2f4f6 });
    const s = new THREE.Sprite(mat);
    const w = rr(140, 340);
    s.scale.set(w, w * 0.45, 1);
    s.position.set(rr(-1600, 1800), rr(230, 420), rr(-1700, 900));
    group.add(s);
    list.push({ s, speed: rr(1.2, 3.0) });
  }
  function update(dt, time, tint) {
    for (const c of list) {
      c.s.position.x += c.speed * dt;
      if (c.s.position.x > 2000) c.s.position.x = -1800;
      if (tint) c.s.material.color.copy(tint);
    }
  }
  return { group, update };
}

/* ---------- sea sparkle particles ---------- */
export function createSparkles(count = 1400) {
  const pos = new Float32Array(count * 3), phase = new Float32Array(count), size = new Float32Array(count);
  let i = 0, tries = 0;
  while (i < count && tries < count * 10) {
    tries++;
    const x = rr(-520, 520), z = rr(-460, 460);
    if (agistriField(x, z) > COAST - 0.03) continue;
    pos[i * 3] = x; pos[i * 3 + 1] = 0.45; pos[i * 3 + 2] = z;
    phase[i] = rr(0, 6.28); size[i] = rr(0.6, 1.6); i++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, i * 3), 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase.slice(0, i), 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size.slice(0, i), 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xfff4d6) }, uPixelRatio: { value: 1 }, uStrength: { value: 1 } },
    vertexShader: `
      attribute float aPhase; attribute float aSize;
      uniform float uTime, uPixelRatio; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.5 + 0.5 * sin(uTime * 2.4 + aPhase * 7.0);
        vA = smoothstep(0.55, 1.0, tw);
        gl_PointSize = aSize * (30.0 * uPixelRatio) / max(1.0, -mv.z * 0.06) * (0.6 + vA);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uStrength; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vA * uStrength;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'sparkles';
  points.frustumCulled = false;
  function update(dt, time, sunColor, strength) {
    mat.uniforms.uTime.value = time;
    if (sunColor) mat.uniforms.uColor.value.copy(sunColor);
    mat.uniforms.uStrength.value = strength;
  }
  return { points, update, material: mat };
}

/* ---------- airplane climbing out of Athens ---------- */
export function createPlane() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 14, 10), mat); body.rotation.z = Math.PI / 2; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.5, 10), mat); nose.rotation.z = -Math.PI / 2; nose.position.x = 8.2; g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 16), mat); wing.position.set(0.5, -0.3, 0); g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.6, 0.25), mat); tail.position.set(-6.4, 1.8, 0); g.add(tail);
  const htail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 6), mat); htail.position.set(-6.4, 0.4, 0); g.add(htail);
  g.scale.setScalar(1.6);
  function update(dt, time) {
    const a = time * 0.08;
    const cx = 1150, cz = -900, r = 420;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.7;
    g.position.set(x, 380 + Math.sin(a * 2) * 25, z);
    g.rotation.y = Math.atan2(-Math.cos(a) * 0.7, -Math.sin(a));
    g.rotation.z = 0.12;
  }
  return { group: g, update };
}
