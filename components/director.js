/* ============================================================
   director.js — flies the camera between chapters with GSAP,
   rides along with the ferry, hands control to the person when idle.
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
import { groundHeight } from './world.js';
import { INTRO_PATH, HERO_POSE } from './content.js';

export function createDirector({ camera, canvas, env, ferry, post, reducedMotion }) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.rotateSpeed = 0.45;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.autoRotateSpeed = 0.14;
  controls.enabled = false;

  const state = {
    pos: new THREE.Vector3().fromArray(HERO_POSE.pos),
    target: new THREE.Vector3().fromArray(HERO_POSE.target),
    follow: 0,
    offset: new THREE.Vector3(60, 26, -30),
    tod: HERO_POSE.tod,
    blur: 0,
    idle: false,
    current: null,
    introDone: false,
  };
  camera.position.copy(state.pos);
  controls.target.copy(state.target);

  const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3();
  let activeTween = null;
  let onArrive = null;

  function killTweens() {
    if (activeTween) { activeTween.kill(); activeTween = null; }
    gsap.killTweensOf(state.pos); gsap.killTweensOf(state.target); gsap.killTweensOf(state);
    gsap.killTweensOf(state.offset); gsap.killTweensOf(ferry.state);
  }

  /** Fly to a pose object from content.js */
  function go(pose, opts = {}) {
    if (!pose) return;
    killTweens();
    state.current = pose;
    state.idle = false;
    controls.enabled = false;
    controls.autoRotate = false;
    // start from wherever the person left the camera
    state.pos.copy(camera.position);
    state.target.copy(controls.target);

    const dist = pose.follow ? 600 : state.pos.distanceTo(tmpP.fromArray(pose.pos));
    const dur = reducedMotion ? 0.6 : opts.duration ?? THREE.MathUtils.clamp(1.6 + dist / 420, 2.0, 4.2);
    const ease = 'power3.inOut';

    const tl = gsap.timeline({
      onComplete: () => {
        state.idle = true;
        controls.enabled = !pose.follow && !opts.lockControls;
        controls.autoRotate = !!pose.autoRotate && !reducedMotion;
        env.updateEnvMap();
        if (onArrive) onArrive(pose);
      },
    });
    activeTween = tl;

    if (pose.follow) {
      tl.to(state.offset, { x: pose.offset[0], y: pose.offset[1], z: pose.offset[2], duration: dur, ease }, 0);
      tl.to(state, { follow: 1, duration: dur, ease }, 0);
    } else {
      tl.to(state.pos, { x: pose.pos[0], y: pose.pos[1], z: pose.pos[2], duration: dur, ease }, 0);
      tl.to(state.target, { x: pose.target[0], y: pose.target[1], z: pose.target[2], duration: dur, ease }, 0);
      tl.to(state, { follow: 0, duration: dur * 0.8, ease }, 0);
    }
    tl.to(state, { tod: pose.tod, duration: dur, ease: 'power2.inOut' }, 0);
    // subtle motion blur that peaks mid-flight
    if (!reducedMotion) {
      tl.to(state, { blur: 0.72, duration: dur * 0.45, ease: 'power2.in' }, 0);
      tl.to(state, { blur: 0, duration: dur * 0.55, ease: 'power2.out' }, dur * 0.45);
    }
    // ferry position for this chapter
    if (pose.ferry !== undefined) {
      ferry.state.move = 0;
      tl.to(ferry.state, { target: pose.ferry, duration: Math.min(dur, 3), ease: 'power2.inOut',
        onComplete: () => { ferry.state.move = pose.ferryMove ?? 0; } }, 0);
    }
  }

  /** Opening flight over the island, then settle on the hero pose. */
  function intro(done) {
    const path = INTRO_PATH;
    ferry.state.target = 0.35; ferry.state.t = 0.35; ferry.state.move = 1;
    if (reducedMotion) {
      state.pos.fromArray(HERO_POSE.pos); state.target.fromArray(HERO_POSE.target); state.tod = HERO_POSE.tod;
      camera.position.copy(state.pos); controls.target.copy(state.target);
      state.idle = true; state.introDone = true; controls.enabled = true; controls.autoRotate = true;
      env.updateEnvMap(true);
      done && done();
      return;
    }
    state.pos.fromArray(path[0]);
    state.target.set(-120, 10, 80);
    state.tod = 0.55;
    camera.position.copy(state.pos); controls.target.copy(state.target);
    const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' }, onComplete: () => {
      state.idle = true; state.introDone = true; controls.enabled = true; controls.autoRotate = true; activeTween = null;
      env.updateEnvMap(true);
      done && done();
    } });
    activeTween = tl;
    tl.to(state.pos, { x: path[1][0], y: path[1][1], z: path[1][2], duration: 3.6 }, 0);
    tl.to(state.target, { x: -60, y: 8, z: 20, duration: 3.6 }, 0);
    tl.to(state.pos, { x: path[2][0], y: path[2][1], z: path[2][2], duration: 3.0, ease: 'sine.inOut' }, 3.4);
    tl.to(state.target, { x: 40, y: 6, z: -40, duration: 3.0, ease: 'sine.inOut' }, 3.4);
    tl.to(state.pos, { x: path[3][0], y: path[3][1], z: path[3][2], duration: 3.4 }, 6.2);
    tl.to(state.target, { x: HERO_POSE.target[0], y: HERO_POSE.target[1], z: HERO_POSE.target[2], duration: 3.4 }, 6.2);
    tl.to(state, { tod: HERO_POSE.tod, duration: 9.4, ease: 'sine.inOut' }, 0);
    tl.to(state, { blur: 0.6, duration: 1.2 }, 0.2).to(state, { blur: 0, duration: 2.2 }, 7.4);
    return tl;
  }

  function skipIntro() {
    if (state.introDone) return;
    killTweens();
    state.introDone = true;
    state.blur = 0;
  }

  /** Per-frame camera solve. */
  const ferryFocus = new THREE.Vector3();
  function update(dt) {
    if (state.follow > 0.001) {
      ferryFocus.copy(ferry.group.position);
      tmpP.copy(ferryFocus).add(state.offset);
      tmpT.copy(ferryFocus).addScalar(0); tmpT.y += 5;
      // blend between static pose and ride-along
      camera.position.lerpVectors(state.idle ? camera.position : state.pos, tmpP, state.follow);
      controls.target.lerpVectors(state.idle ? controls.target : state.target, tmpT, state.follow);
    } else if (!state.idle) {
      camera.position.copy(state.pos);
      controls.target.copy(state.target);
    }
    // never dip below the ground or the water
    const g = groundHeight(camera.position.x, camera.position.z);
    const minY = Math.max(g + 4, 3);
    if (camera.position.y < minY) camera.position.y = minY;
    controls.update();
    env.apply(state.tod, controls.target);
    post.setBlur(state.blur);
  }

  return { controls, state, go, intro, skipIntro, update, onArrive: (fn) => { onArrive = fn; } };
}
