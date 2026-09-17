/* ============================================================
   environment.js — sky, sun, fog, lights and the water shader
   ============================================================ */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { fieldGLSL, lerp, smoothstep, clamp } from './world.js';

const C = (hex) => new THREE.Color(hex);

/* palette that the time-of-day slider blends between */
const PAL = {
  day:    { zenith: C(0x2f7ac5), horizon: C(0xc9e6f5), fog: C(0xc4dff0), deep: C(0x0b3f70), shallow: C(0x38d1cc), sun: C(0xfff6e0), hemi: C(0x9fd0f0), ground: C(0x5f6f5a) },
  golden: { zenith: C(0x3f78b8), horizon: C(0xf4c9a0), fog: C(0xe9c39f), deep: C(0x0d3a64), shallow: C(0x2fbdbf), sun: C(0xffd9a3), hemi: C(0xdcb08c), ground: C(0x5a5548) },
  sunset: { zenith: C(0x2d4d86), horizon: C(0xf49a6a), fog: C(0xe7956e), deep: C(0x102c50), shallow: C(0x2a8fa3), sun: C(0xff9a5c), hemi: C(0xd58a72), ground: C(0x3f3a40) },
  dawn:   { zenith: C(0x4d6aa8), horizon: C(0xf3c2b0), fog: C(0xe8bfb0), deep: C(0x123a62), shallow: C(0x3ab3bf), sun: C(0xffd6b5), hemi: C(0xc9b6c8), ground: C(0x4c4a52) },
};

export function sunAngles(tod) {
  // elevation profile (degrees) over the day, azimuth sweeps east → south → west
  const pts = [[0, -3], [0.1, 6], [0.2, 18], [0.35, 40], [0.5, 56], [0.65, 40], [0.8, 18], [0.9, 7], [0.95, 2.5], [1, -2.5]];
  let el = -3;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (tod >= a[0] && tod <= b[0]) { el = lerp(a[1], b[1], (tod - a[0]) / (b[0] - a[0])); break; }
  }
  const az = 90 - 180 * tod;
  return { elevation: el, azimuth: az };
}

function blendPalette(tod, out) {
  const el = sunAngles(tod).elevation;
  const warm = 1 - smoothstep(4, 26, el);          // how close to the horizon
  const dusk = 1 - smoothstep(-1, 6, el);
  const isMorning = tod < 0.5;
  const low = isMorning ? PAL.dawn : PAL.sunset;
  for (const k in PAL.day) {
    out[k].copy(PAL.day[k]).lerp(PAL.golden[k], warm).lerp(low[k], warm * warm * (isMorning ? 0.6 : 1)).lerp(low[k], dusk);
  }
  return el;
}

export function createEnvironment(scene, renderer, quality) {
  const group = new THREE.Group();
  group.name = 'environment';

  /* --- sky --- */
  const sky = new Sky();
  sky.scale.setScalar(9000);
  group.add(sky);
  const sun = new THREE.Vector3();

  /* --- lights --- */
  const sunLight = new THREE.DirectionalLight(0xffffff, 3);
  sunLight.castShadow = true;
  const sm = quality.high ? 2048 : 1024;
  sunLight.shadow.mapSize.set(sm, sm);
  sunLight.shadow.camera.near = 20;
  sunLight.shadow.camera.far = 1600;
  const S = 300;
  sunLight.shadow.camera.left = -S; sunLight.shadow.camera.right = S;
  sunLight.shadow.camera.top = S; sunLight.shadow.camera.bottom = -S;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.6;
  group.add(sunLight, sunLight.target);

  const hemi = new THREE.HemisphereLight(0x9fd0f0, 0x5f6f5a, 0.9);
  group.add(hemi);

  /* --- fog --- */
  scene.fog = new THREE.Fog(0xc4dff0, 500, 2900);

  /* --- water --- */
  const water = createWater();
  group.add(water.mesh);

  /* --- env map from the sky (updated when the sun moves a lot) --- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const skyClone = new Sky();
  skyClone.scale.setScalar(9000);
  skyScene.add(skyClone);
  let envTarget = null;
  let lastEnvTod = -1;

  const pal = {};
  for (const k in PAL.day) pal[k] = new THREE.Color();

  const state = { tod: 0.6, sunDir: new THREE.Vector3(0, 1, 0), elevation: 30, bloom: 0.3 };

  function apply(tod, focus) {
    state.tod = tod;
    const { elevation, azimuth } = sunAngles(tod);
    state.elevation = elevation;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    state.sunDir.copy(sun);

    const u = sky.material.uniforms;
    const warm = 1 - smoothstep(3, 30, elevation);
    u.turbidity.value = lerp(3.2, 9, warm);
    u.rayleigh.value = lerp(1.1, 3.4, warm);
    u.mieCoefficient.value = lerp(0.004, 0.02, warm);
    u.mieDirectionalG.value = lerp(0.8, 0.93, warm);
    u.sunPosition.value.copy(sun);

    blendPalette(tod, pal);

    const strength = smoothstep(-2, 12, elevation);
    sunLight.intensity = lerp(0.25, 3.2, strength) * lerp(1, 0.75, warm);
    sunLight.color.copy(pal.sun);
    hemi.color.copy(pal.hemi);
    hemi.groundColor.copy(pal.ground);
    hemi.intensity = lerp(0.5, 0.95, strength);

    if (focus) {
      sunLight.target.position.copy(focus);
      sunLight.position.copy(focus).addScaledVector(sun, 700);
    }

    scene.fog.color.copy(pal.fog);
    scene.fog.near = lerp(420, 300, warm);
    scene.fog.far = lerp(3000, 2300, warm);

    const w = water.uniforms;
    w.uSunDir.value.copy(sun);
    w.uSunColor.value.copy(pal.sun);
    w.uSunStrength.value = lerp(0.35, 1.0, strength) * (1 + warm * 0.8);
    w.uDeepColor.value.copy(pal.deep);
    w.uShallowColor.value.copy(pal.shallow);
    w.uZenithColor.value.copy(pal.zenith);
    w.uHorizonColor.value.copy(pal.horizon);

    state.bloom = lerp(0.22, 0.6, warm);
    renderer.toneMappingExposure = lerp(0.72, 0.62, warm);
  }

  function updateEnvMap(force = false) {
    if (!force && Math.abs(state.tod - lastEnvTod) < 0.06) return;
    lastEnvTod = state.tod;
    const src = sky.material.uniforms, dst = skyClone.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) dst[k].value = src[k].value;
    dst.sunPosition.value.copy(src.sunPosition.value);
    const old = envTarget;
    envTarget = pmrem.fromScene(skyScene, 0, 1, 20000);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.55;
    if (old) old.dispose();
  }

  function tick(t) { water.uniforms.uTime.value = t; }

  return { group, sunLight, hemi, water, state, apply, updateEnvMap, tick, palette: pal };
}

/* ------------------------------------------------------------
   Water: analytic Gerstner-style waves, fresnel, sun glitter,
   depth-tinted shallows and foam lines computed from the coast field.
   ------------------------------------------------------------ */
function createWater() {
  const size = 6400, seg = 260;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff2d0) },
      uSunStrength: { value: 1 },
      uDeepColor: { value: new THREE.Color(0x0b3f70) },
      uShallowColor: { value: new THREE.Color(0x38d1cc) },
      uZenithColor: { value: new THREE.Color(0x2f7ac5) },
      uHorizonColor: { value: new THREE.Color(0xc9e6f5) },
    },
  ]);

  const waveFn = `
    float wave(vec2 p, float t) {
      float h = 0.0;
      h += 0.34 * sin(dot(p, vec2(0.71, 0.70)) * 0.19 + t * 1.10);
      h += 0.22 * sin(dot(p, vec2(-0.55, 0.83)) * 0.31 + t * 1.55 + 1.3);
      h += 0.14 * sin(dot(p, vec2(0.95, -0.30)) * 0.47 + t * 2.10 + 2.6);
      h += 0.09 * sin(dot(p, vec2(-0.20, -0.98)) * 0.83 + t * 2.70 + 0.4);
      h += 0.045 * sin(dot(p, vec2(0.60, 0.80)) * 1.90 + t * 3.60);
      h += 0.030 * sin(dot(p, vec2(-0.80, 0.60)) * 2.70 + t * 4.30 + 1.9);
      return h;
    }`;

  const vertexShader = `
    uniform float uTime;
    varying vec3 vWorldPos;
    #include <fog_pars_vertex>
    ${waveFn}
    void main() {
      vec3 p = position;
      p.y += wave(p.xz, uTime);
      vec4 worldPosition = modelMatrix * vec4(p, 1.0);
      vWorldPos = worldPosition.xyz;
      vec4 mvPosition = viewMatrix * worldPosition;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;

  const fragmentShader = `
    uniform float uTime;
    uniform vec3 uSunDir, uSunColor, uDeepColor, uShallowColor, uZenithColor, uHorizonColor;
    uniform float uSunStrength;
    varying vec3 vWorldPos;
    #include <fog_pars_fragment>
    ${waveFn}
    ${fieldGLSL()}
    void main() {
      vec2 p = vWorldPos.xz;
      float t = uTime;
      float e = 0.6;
      vec3 n = normalize(vec3(
        wave(p - vec2(e, 0.0), t) - wave(p + vec2(e, 0.0), t),
        2.0 * e,
        wave(p - vec2(0.0, e), t) - wave(p + vec2(0.0, e), t)));

      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float ndv = max(dot(n, viewDir), 0.0);
      float fres = pow(1.0 - ndv, 3.2);

      float m = coastField(p);
      float shallow = smoothstep(0.10, 0.41, m);
      float foam = smoothstep(0.30, 0.42, m) * (0.55 + 0.45 * sin(m * 95.0 - t * 1.7 + sin(p.x * 0.35 + p.y * 0.27) * 1.5));
      foam *= smoothstep(0.33, 0.40, m);

      vec3 base = mix(uDeepColor, uShallowColor, shallow);
      vec3 refl = reflect(-viewDir, n);
      vec3 skyCol = mix(uHorizonColor, uZenithColor, smoothstep(0.0, 0.55, refl.y));
      vec3 col = mix(base, skyCol, clamp(fres * 0.8 + 0.08, 0.0, 1.0));

      vec3 h = normalize(uSunDir + viewDir);
      float ndh = max(dot(n, h), 0.0);
      float spec = pow(ndh, 240.0) * 2.4 + pow(ndh, 18.0) * 0.16;
      col += uSunColor * spec * uSunStrength;

      col = mix(col, vec3(0.96, 0.99, 1.0), foam * 0.55);
      gl_FragColor = vec4(col, 1.0);
      #include <fog_fragment>
    }`;

  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'sea';
  mesh.receiveShadow = false;
  return { mesh, uniforms };
}
