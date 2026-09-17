/* ============================================================
   main.js — renderer, scene assembly, post-processing, the loop
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { groundHeight, lerp, smoothstep } from './components/world.js';
import { createEnvironment } from './components/environment.js';
import { createLand } from './components/island.js';
import { createFerry, createBoats, createGulls, createClouds, createSparkles, createPlane } from './components/actors.js';
import { createDirector } from './components/director.js';
import { createUI } from './components/ui.js';
import { createAudio } from './components/audio.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const isMobile = isTouch || Math.min(window.innerWidth, window.innerHeight) < 700;
const cores = navigator.hardwareConcurrency || 4;

const quality = { high: !isMobile && cores >= 4, dpr: 1 };
quality.dpr = Math.min(window.devicePixelRatio || 1, quality.high ? 2 : 1.5);

const canvas = document.getElementById('scene');
const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

/* ---------- renderer ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
} catch (e) {
  failLoader('הדפדפן לא מצליח לפתוח WebGL. נסו דפדפן עדכני או הפעילו האצת חומרה.');
  throw e;
}
renderer.setPixelRatio(quality.dpr);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.7;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 8000);
scene.add(camera);

const audio = createAudio();

/* ---------- post-processing ---------- */
let composer, renderPass, ssaoPass, bloomPass, afterPass, outputPass;
const post = {
  setBlur(v) { if (afterPass) afterPass.uniforms['damp'].value = v * 0.85; },
  setBloom(v) { if (bloomPass) bloomPass.strength = v; },
};

function buildPost() {
  const w = window.innerWidth, h = window.innerHeight;
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: isMobile ? 2 : 4 });
  composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(quality.dpr);
  composer.setSize(w, h);

  renderPass = new RenderPass(scene, camera);
  ssaoPass = new SSAOPass(scene, camera, w, h, 24);
  ssaoPass.kernelRadius = 2.6;
  ssaoPass.minDistance = 0.00005;
  ssaoPass.maxDistance = 0.0022;
  // sprites, gulls and the light cone should not leave depth in the AO pass
  const aoHidden = [clouds.group, gulls.group, land.lighthouse.beam, ferry.group.getObjectByName('wake')].filter(Boolean);
  const ov = ssaoPass.overrideVisibility.bind(ssaoPass), rv = ssaoPass.restoreVisibility.bind(ssaoPass);
  ssaoPass.overrideVisibility = () => { ov(); for (const o of aoHidden) o.visible = false; };
  ssaoPass.restoreVisibility = () => { rv(); for (const o of aoHidden) o.visible = true; };

  bloomPass = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.35, 0.6, 0.9);
  afterPass = new AfterimagePass(0);
  outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(ssaoPass);
  composer.addPass(bloomPass);
  composer.addPass(afterPass);
  composer.addPass(outputPass);
  applyQuality();
}

function applyQuality() {
  renderer.setPixelRatio(quality.dpr);
  if (composer) composer.setPixelRatio(quality.dpr);
  if (ssaoPass) ssaoPass.enabled = quality.high;
  if (env) {
    const s = quality.high ? 2048 : 1024;
    env.sunLight.shadow.mapSize.set(s, s);
    if (env.sunLight.shadow.map) { env.sunLight.shadow.map.dispose(); env.sunLight.shadow.map = null; }
  }
  resize();
}

const qualityApi = {
  get: () => quality,
  toggle() {
    quality.high = !quality.high;
    quality.dpr = Math.min(window.devicePixelRatio || 1, quality.high ? 2 : 1.5);
    applyQuality();
  },
};

/* ---------- resize ---------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = w / h < 0.9 ? 64 : 50;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
}
window.addEventListener('resize', resize);

/* ---------- world ---------- */
let env, land, ferry, boats, gulls, clouds, sparkles, plane, director, ui;

function setLoader(progress, msg) {
  const f = document.getElementById('loader-fill'), m = document.getElementById('loader-msg');
  if (f) f.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
  if (m && msg) m.textContent = msg;
}

async function build() {
  setLoader(0.06, 'מכוונים את השמש');
  await wait();

  env = createEnvironment(scene, renderer, quality);
  scene.add(env.group);
  env.apply(0.6, new THREE.Vector3(0, 0, 0));
  setLoader(0.18, 'מציירים את קו החוף ושותלים אורנים');
  await wait();

  land = createLand(quality);
  scene.add(land.group);
  setLoader(0.62, 'מעלים את המעבורת על המים');
  await wait();

  ferry = createFerry(); boats = createBoats(); gulls = createGulls(16); clouds = createClouds(28); sparkles = createSparkles(quality.high ? 1400 : 800); plane = createPlane();
  scene.add(ferry.group, boats.group, gulls.group, clouds.group, sparkles.points, plane.group);
  sparkles.material.uniforms.uPixelRatio.value = quality.dpr;
  setLoader(0.8, 'מלטשים את התמונה');
  await wait();

  buildPost();
  director = createDirector({ camera, canvas, env, ferry, post, reducedMotion });
  ui = createUI({ director, camera, snapshot, audio, quality: qualityApi, reducedMotion, isTouch });
  if (isTouch) canvas.style.pointerEvents = 'none';   // scrolling is the story on touch screens
  setLoader(0.9, 'מרימים עוגן');
  await wait();

  // warm-up: compile shaders and the env map before the curtain lifts
  env.apply(0.55, new THREE.Vector3(0, 0, 0));
  env.updateEnvMap(true);
  renderer.compile(scene, camera);
  composer.render();
  setLoader(1, 'מרימים עוגן');
  await wait(120);
}

/* ---------- snapshots for the location window ---------- */
const shotCanvas = document.createElement('canvas');
shotCanvas.width = 800; shotCanvas.height = 500;
const shotCtx = shotCanvas.getContext('2d');
const tmpV = new THREE.Vector3();

async function snapshot(poses, onEach) {
  const out = [];
  for (let i = 0; i < poses.length; i++) {
    await nextFrame();
    const url = renderShot(poses[i]);
    out.push(url);
    if (onEach) onEach(i, url);
  }
  return out;
}

function renderShot(p) {
  const controls = director.controls;
  const savedPos = camera.position.clone(), savedTarget = controls.target.clone();
  const savedTod = env.state.tod, savedBloom = bloomPass.strength, savedDamp = afterPass.uniforms['damp'].value;

  camera.position.fromArray(p.pos);
  const minY = Math.max(groundHeight(camera.position.x, camera.position.z) + 8, 5);
  if (camera.position.y < minY) camera.position.y = minY;
  tmpV.fromArray(p.target);
  camera.lookAt(tmpV);
  camera.updateMatrixWorld();
  env.apply(p.tod, tmpV);
  bloomPass.strength = env.state.bloom;
  afterPass.uniforms['damp'].value = 0;
  composer.render();

  const src = renderer.domElement;
  const sw = src.width, sh = src.height, ar = 1.6;
  let cw = sw, ch = sw / ar;
  if (ch > sh) { ch = sh; cw = sh * ar; }
  shotCtx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, shotCanvas.width, shotCanvas.height);
  const url = shotCanvas.toDataURL('image/jpeg', 0.86);

  camera.position.copy(savedPos);
  controls.target.copy(savedTarget);
  camera.lookAt(savedTarget);
  env.apply(savedTod, savedTarget);
  bloomPass.strength = savedBloom;
  afterPass.uniforms['damp'].value = savedDamp;
  return url;
}

/* ---------- loop ---------- */
const clock = new THREE.Clock();
let time = 0;
const white = new THREE.Color(0xffffff), cloudTint = new THREE.Color();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  ferry.update(dt, time);
  boats.update(dt, time);
  gulls.update(dt, time);
  cloudTint.copy(env.palette.horizon).lerp(white, 0.55);
  clouds.update(dt, time, cloudTint);
  plane.update(dt, time);

  director.update(dt);

  const el = env.state.elevation;
  const sunUp = smoothstep(-2, 10, el);
  const warm = 1 - smoothstep(4, 26, el);
  sparkles.update(dt, time, env.palette.sun, lerp(0.25, 1, sunUp) * (1 + warm * 0.7));

  const night = 1 - smoothstep(-1, 9, el);
  const lh = land.lighthouse;
  lh.light.intensity = night * 60;
  lh.beam.material.opacity = night * 0.32;
  lh.beamPivot.rotation.y += dt * 0.9;

  env.tick(time);
  bloomPass.strength = env.state.bloom;
  composer.render();
  ui.updatePins(camera);
}

/* ---------- boot ---------- */
function failLoader(msg) {
  const m = document.getElementById('loader-msg');
  if (m) m.textContent = msg;
  const f = document.getElementById('loader-fill');
  if (f) f.style.background = '#ff9a6b';
}

async function boot() {
  try {
    await build();
  } catch (e) {
    console.error(e);
    failLoader('משהו השתבש בבניית האי. רעננו את הדף; אם זה חוזר, נסו דפדפן אחר.');
    return;
  }

  renderer.setAnimationLoop(frame);
  document.body.classList.remove('is-loading');
  await ui.hideLoader();

  let scrollReady = false;
  const finishIntro = (settled) => {
    if (scrollReady) return;
    scrollReady = true;
    ui.showHero();
    ui.initScroll({ settled });
  };
  const skip = () => { if (scrollReady) return; director.skipIntro(); finishIntro(false); };
  window.addEventListener('wheel', skip, { passive: true });
  window.addEventListener('touchmove', skip, { passive: true });
  window.addEventListener('keydown', (e) => { if (['ArrowDown', 'PageDown', ' ', 'End'].includes(e.key)) skip(); });

  director.intro(() => finishIntro(true));
  if (!reducedMotion) setTimeout(() => { if (!scrollReady) ui.showHero(); }, 4200);
}

boot();
