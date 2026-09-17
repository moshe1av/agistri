/* ============================================================
   ui.js — everything the person reads and touches:
   loader, top bar, timeline, story chapters, pins, location
   window and the info drawer. All text is Hebrew, layout is RTL.
   ============================================================ */
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { PLACES, groundHeight } from './world.js';
import { TRIP, DAYS, HERO_POSE, OUTRO_POSE, LOCATIONS, INFO } from './content.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LOC_BY_ID = Object.fromEntries(LOCATIONS.map(l => [l.id, l]));
const SHOT_TODS = [0.45, 0.72, 0.94];
const SHOT_CAPTIONS = ['צהריים', 'אחר הצהריים', 'שקיעה'];
gsap.registerPlugin(ScrollTrigger);

/* ---------- camera presets used for pins, "fly there" and the snapshot gallery ---------- */
export function shotPoses(locId) {
  const loc = LOC_BY_ID[locId];
  const p = PLACES[locId];
  if (!loc || !p) return [];
  const K = {
    city:    { dist: 1.7, height: 0.75, ty: 22 },
    harbor:  { dist: 3.0, height: 0.9,  ty: 4 },
    village: { dist: 2.4, height: 0.85, ty: 6 },
    beach:   { dist: 2.3, height: 0.55, ty: 2 },
  }[loc.shots] || { dist: 2.4, height: 0.8, ty: 5 };
  // look from the sea side first, then along the coast, then from inland
  let ox, oz;
  if (locId === 'athens' || locId === 'piraeus') { ox = -0.7; oz = 0.7; }
  else { const len = Math.hypot(p.x, p.z) || 1; ox = p.x / len; oz = p.z / len; }
  const base = Math.atan2(oz, ox);
  const angles = [base - 0.45, base + 0.95, base + 2.7];
  const heights = [1, 0.8, 1.6];
  return angles.map((a, i) => {
    const dist = p.r * K.dist * (i === 2 ? 1.25 : 1);
    const x = p.x + Math.cos(a) * dist, z = p.z + Math.sin(a) * dist;
    let y = Math.max(groundHeight(x, z) + 8, p.r * K.height * heights[i], 6);
    const ty = Math.max(groundHeight(p.x, p.z), 0) + K.ty;
    y = clearSight([x, y, z], [p.x, ty, p.z]);
    return { pos: [x, y, z], target: [p.x, ty, p.z], tod: SHOT_TODS[i] };
  });
}

/* lift the camera until the line of sight to the target clears the hills */
function clearSight(pos, target, margin = 6) {
  let y = pos[1];
  for (let t = 0.04; t < 0.86; t += 0.02) {
    const x = pos[0] + (target[0] - pos[0]) * t, z = pos[2] + (target[2] - pos[2]) * t;
    const need = (groundHeight(x, z) + margin - target[1] * t) / (1 - t);
    if (need > y) y = need;
  }
  return y;
}

/* ============================================================ */
export function createUI({ director, camera, snapshot, audio, quality, reducedMotion, isTouch }) {

  const POSES = { hero: HERO_POSE, outro: OUTRO_POSE };
  for (const d of DAYS) { POSES['day:' + d.id] = d.pose; for (const m of d.moments) POSES[m.id] = m.pose; }

  const dom = {
    loader: $('#loader'), loaderFill: $('#loader-fill'), loaderMsg: $('#loader-msg'),
    topbar: $('#topbar'), story: $('#story'), timeline: $('#timeline'), pins: $('#pins'),
    hint: $('#scroll-hint'), drawer: $('#drawer'), modal: $('#modal'),
    btnAudio: $('#btn-audio'), btnInfo: $('#btn-info'), btnQuality: $('#btn-quality'),
  };
  document.documentElement.classList.toggle('is-touch', isTouch);

  /* ---------------- loader ---------------- */
  function setLoader(progress, msg) {
    dom.loaderFill.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
    if (msg) dom.loaderMsg.textContent = msg;
  }
  function hideLoader() {
    return new Promise((res) => {
      dom.loader.classList.add('is-done');
      setTimeout(() => { dom.loader.remove(); res(); }, reducedMotion ? 50 : 900);
    });
  }

  /* ---------------- story ---------------- */
  function renderStory() {
    const root = dom.story;
    root.innerHTML = '';

    const hero = el('section', 'hero', `
      <div class="hero__inner">
        <p class="hero__dates">${esc(TRIP.dates)}</p>
        <h1 class="hero__title">${esc(TRIP.title)}</h1>
        <p class="hero__sub">${esc(TRIP.subtitle)}</p>
        <button class="btn btn--primary" type="button" data-scroll="day-d1">התחילו את המסע</button>
      </div>`);
    hero.id = 'top';
    hero.dataset.pose = 'hero';
    root.appendChild(hero);

    DAYS.forEach((d, i) => {
      const day = el('section', 'day', `
        <div class="day__inner">
          <div class="day__date">${esc(d.date)}</div>
          <div class="day__weekday">${esc(d.weekday)}</div>
          <h2 class="day__title">${esc(d.title)}</h2>
          <p class="day__lead">${esc(d.lead)}</p>
          <div class="day__count">יום ${i + 1} מתוך ${DAYS.length}</div>
        </div>`);
      day.id = 'day-' + d.id;
      day.dataset.pose = 'day:' + d.id;
      day.dataset.day = d.id;
      root.appendChild(day);

      d.moments.forEach((m) => {
        const loc = LOC_BY_ID[m.loc];
        const sec = el('section', 'moment');
        sec.dataset.pose = m.id;
        sec.dataset.day = d.id;
        sec.innerHTML = `
          <article class="card">
            <div class="card__head">
              <span class="card__emoji" aria-hidden="true">${m.emoji}</span>
              <span class="card__loc">${loc ? esc(loc.name) : ''}</span>
            </div>
            <h3 class="card__title">${esc(m.title)}</h3>
            <p class="card__text">${esc(m.text)}</p>
            <ul class="chips">${m.meta.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
            <div class="card__actions">
              <button class="btn btn--ghost" type="button" data-loc="${esc(m.loc)}">${loc ? 'על ' + esc(loc.name) : 'פתח מידע'}</button>
            </div>
          </article>`;
        root.appendChild(sec);
      });
    });

    const outro = el('section', 'outro', `
      <div class="outro__inner">
        <h2 class="outro__title">עד הפעם הבאה, אגיסטרי</h2>
        <p class="outro__lead">חמישה ימים, שתי הפלגות של 37 ק״מ, ארבעה חופים, שני כפרים, ושקיעות שנצבעו בוורוד־זהב.</p>
        <div class="outro__actions">
          <button class="btn btn--primary" type="button" data-scroll="top">חזרה להתחלה</button>
          <button class="btn btn--ghost" type="button" data-open-drawer>מדריך האי</button>
        </div>
      </div>`);
    outro.dataset.pose = 'outro';
    root.appendChild(outro);

    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.scroll) scrollToId(b.dataset.scroll);
      else if (b.dataset.loc) openLocation(b.dataset.loc, b);
      else if (b.hasAttribute('data-open-drawer')) openDrawer();
    });
  }

  function scrollToId(id) {
    const t = document.getElementById(id);
    if (!t) return;
    window.scrollTo({ top: t.offsetTop, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  /* ---------------- timeline ---------------- */
  function renderTimeline() {
    const root = dom.timeline;
    root.innerHTML = `<div class="tl__track"><span class="tl__fill" id="tl-fill"></span></div><ol class="tl__list"></ol>`;
    const list = $('.tl__list', root);
    DAYS.forEach((d) => {
      const li = el('li', 'tl__item');
      li.dataset.day = d.id;
      li.innerHTML = `<button type="button" class="tl__btn" aria-label="${esc(d.weekday)} ${esc(d.date)} — ${esc(d.title)}">
          <span class="tl__dot"></span>
          <span class="tl__date">${esc(d.date)}</span>
          <span class="tl__day">${esc(d.weekday.replace('יום ', ''))}</span>
        </button>`;
      li.addEventListener('click', () => scrollToId('day-' + d.id));
      list.appendChild(li);
    });
  }

  function setActiveDay(id) {
    for (const li of dom.timeline.querySelectorAll('.tl__item')) {
      const on = li.dataset.day === id;
      li.classList.toggle('is-active', on);
      if (on) li.querySelector('.tl__btn').setAttribute('aria-current', 'step');
      else li.querySelector('.tl__btn').removeAttribute('aria-current');
    }
    dom.timeline.classList.toggle('is-visible', !!id);
  }

  /* ---------------- scroll wiring ---------------- */
  let currentPoseId = null;
  const sections = [];

  function flyToSection(sec) {
    const id = sec.dataset.pose;
    if (id === currentPoseId) return;
    currentPoseId = id;
    director.go(POSES[id]);
    for (const s of sections) s.classList.toggle('is-active', s === sec);
    setActiveDay(sec.dataset.day || null);
    dom.hint.classList.toggle('is-hidden', id !== 'hero');
  }

  function initScroll({ settled = false } = {}) {
    sections.push(...dom.story.querySelectorAll('[data-pose]'));
    if (settled && window.scrollY < window.innerHeight * 0.3) {
      // the intro already parked the camera on the hero pose: no flight needed
      currentPoseId = 'hero';
      sections[0].classList.add('is-active');
    }
    for (const sec of sections) {
      ScrollTrigger.create({
        trigger: sec, start: 'top 58%', end: 'bottom 58%',
        onEnter: () => flyToSection(sec),
        onEnterBack: () => flyToSection(sec),
      });
    }
    // timeline progress
    const first = document.getElementById('day-d1');
    const last = sections[sections.length - 1];
    ScrollTrigger.create({
      trigger: first, endTrigger: last, start: 'top 58%', end: 'top 58%',
      onUpdate: (self) => { $('#tl-fill').style.transform = `scaleY(${self.progress})`; },
    });
    ScrollTrigger.refresh();
    // whichever section is under the reading line right now
    flyToSection(sectionAtLine());
  }

  function sectionAtLine() {
    const line = window.scrollY + window.innerHeight * 0.58;
    let best = sections[0];
    for (const s of sections) if (s.offsetTop <= line) best = s;
    return best;
  }

  /* ---------------- pins ---------------- */
  const pins = [];
  const v = new THREE.Vector3();
  function createPins() {
    for (const loc of LOCATIONS) {
      if (!loc.pin) continue;
      const p = PLACES[loc.id];
      const b = el('button', 'pin');
      b.type = 'button';
      b.dataset.loc = loc.id;
      b.innerHTML = `<span class="pin__dot"></span><span class="pin__label">${esc(loc.name)}</span>`;
      b.setAttribute('aria-label', `${loc.name} — פתח מידע`);
      b.addEventListener('click', () => openLocation(loc.id, b));
      dom.pins.appendChild(b);
      const lift = loc.shots === 'city' ? 46 : loc.shots === 'harbor' ? 14 : 12;
      pins.push({ el: b, world: new THREE.Vector3(p.x, groundHeight(p.x, p.z) + lift, p.z), r: p.r, visible: true });
    }
  }

  function updatePins(cam) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const pin of pins) {
      const dist = cam.position.distanceTo(pin.world);
      v.copy(pin.world).project(cam);
      const onScreen = v.z < 1 && v.x > -1.05 && v.x < 1.05 && v.y > -1.05 && v.y < 1.05;
      const maxDist = pin.r > 100 ? 2600 : 1500;
      const show = onScreen && dist < maxDist;
      if (show !== pin.visible) { pin.visible = show; pin.el.classList.toggle('is-off', !show); }
      if (!show) continue;
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const s = THREE.MathUtils.clamp(1.15 - dist / 2200, 0.62, 1);
      pin.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${s.toFixed(3)})`;
      pin.el.style.opacity = THREE.MathUtils.clamp(1.25 - dist / maxDist, 0.35, 1).toFixed(2);
    }
  }

  /* ---------------- location window ---------------- */
  let lastFocus = null;
  const shotCache = new Map();
  function renderModal() {
    dom.modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button class="modal__close" type="button" data-close aria-label="סגור">✕</button>
        <div class="modal__scroll">
          <div class="modal__kind" id="modal-kind"></div>
          <h2 class="modal__title" id="modal-title"></h2>
          <div class="modal__en" id="modal-en"></div>
          <p class="modal__tagline" id="modal-tagline"></p>
          <div class="gallery" id="modal-gallery"></div>
          <p class="modal__text" id="modal-text"></p>
          <div class="modal__cols">
            <section><h3>מה לראות</h3><ul id="modal-highlights"></ul></section>
            <section><h3>טיפים</h3><ul id="modal-tips"></ul></section>
          </div>
          <dl class="facts">
            <div><dt>זמן מומלץ לביקור</dt><dd id="modal-best"></dd></div>
            <div><dt>איך מגיעים</dt><dd id="modal-access"></dd></div>
          </dl>
          <div class="modal__actions">
            <button class="btn btn--primary" type="button" id="modal-fly">טוס לשם</button>
            <button class="btn btn--ghost" type="button" data-close>סגור</button>
          </div>
        </div>
      </div>`;
    dom.modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
    $('#modal-fly').addEventListener('click', () => {
      const id = dom.modal.dataset.loc;
      closeModal();
      const pose = shotPoses(id)[0];
      if (pose) director.go({ ...pose, tod: director.state.tod, autoRotate: true }, { duration: 2.6 });
    });
  }

  async function openLocation(id, opener) {
    const loc = LOC_BY_ID[id];
    if (!loc) return;
    lastFocus = opener || document.activeElement;
    dom.modal.dataset.loc = id;
    $('#modal-kind').textContent = loc.kind;
    $('#modal-title').textContent = loc.name;
    $('#modal-en').textContent = loc.en;
    $('#modal-tagline').textContent = loc.tagline;
    $('#modal-text').textContent = loc.text;
    $('#modal-highlights').innerHTML = loc.highlights.map(x => `<li>${esc(x)}</li>`).join('');
    $('#modal-tips').innerHTML = loc.tips.map(x => `<li>${esc(x)}</li>`).join('');
    $('#modal-best').textContent = loc.best;
    $('#modal-access').textContent = loc.access;

    const gal = $('#modal-gallery');
    gal.innerHTML = SHOT_CAPTIONS.map((c, i) => `<figure class="shot is-loading"><img alt="${esc(loc.name)} — ${esc(c)}" data-i="${i}"><figcaption>${esc(c)}</figcaption></figure>`).join('');
    dom.modal.classList.add('is-open');
    document.body.classList.add('has-modal');
    $('.modal__close').focus();

    let urls = shotCache.get(id);
    if (!urls) {
      urls = await snapshot(shotPoses(id), (i, url) => setShot(gal, i, url));
      shotCache.set(id, urls);
    } else {
      urls.forEach((u, i) => setShot(gal, i, u));
    }
  }
  function setShot(gal, i, url) {
    const fig = gal.children[i];
    if (!fig) return;
    const img = fig.querySelector('img');
    img.src = url;
    fig.classList.remove('is-loading');
  }
  function closeModal() {
    if (!dom.modal.classList.contains('is-open')) return;
    dom.modal.classList.remove('is-open');
    document.body.classList.remove('has-modal');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------------- info drawer ---------------- */
  const TABS = [
    { id: 'routes', label: 'הפלגות ומרחקים' },
    { id: 'beaches', label: 'חופים' },
    { id: 'food', label: 'מסעדות' },
    { id: 'sunsets', label: 'שקיעות' },
    { id: 'tips', label: 'טיפים' },
  ];
  function renderDrawer() {
    dom.drawer.innerHTML = `
      <div class="drawer__backdrop" data-close></div>
      <aside class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header class="drawer__head">
          <h2 id="drawer-title">מדריך האי</h2>
          <button class="drawer__close" type="button" data-close aria-label="סגור">✕</button>
        </header>
        <nav class="tabs" role="tablist">${TABS.map((t, i) => `<button type="button" role="tab" class="tab${i === 0 ? ' is-active' : ''}" data-tab="${t.id}" aria-selected="${i === 0}">${t.label}</button>`).join('')}</nav>
        <div class="drawer__body">
          ${TABS.map((t, i) => `<section class="panel${i === 0 ? ' is-active' : ''}" data-panel="${t.id}" role="tabpanel">${renderPanel(t.id)}</section>`).join('')}
        </div>
      </aside>`;
    dom.drawer.addEventListener('click', (e) => {
      const close = e.target.closest('[data-close]');
      if (close) { closeDrawer(); return; }
      const tab = e.target.closest('[data-tab]');
      if (tab) { selectTab(tab.dataset.tab); return; }
      const fly = e.target.closest('[data-fly]');
      if (fly) { closeDrawer(); openLocation(fly.dataset.fly, fly); }
    });
  }
  function selectTab(id) {
    for (const t of dom.drawer.querySelectorAll('.tab')) { const on = t.dataset.tab === id; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); }
    for (const p of dom.drawer.querySelectorAll('.panel')) p.classList.toggle('is-active', p.dataset.panel === id);
  }
  function renderPanel(id) {
    if (id === 'routes') {
      return `<p class="panel__intro">כל המעברים של הטיול, עם מרחק, זמן משוער ומחיר לנוסע.</p>
        <table class="routes"><thead><tr><th>מ</th><th>אל</th><th>איך</th><th>מרחק</th><th>זמן</th><th>מחיר</th></tr></thead>
        <tbody>${INFO.routes.map(r => `<tr><td>${esc(r.from)}</td><td>${esc(r.to)}</td><td>${esc(r.how)}</td><td>${esc(r.dist)}</td><td>${esc(r.time)}</td><td>${esc(r.cost)}</td></tr>`).join('')}</tbody></table>`;
    }
    if (id === 'beaches') {
      return `<ul class="rows">${INFO.beaches.map(b => `<li class="row">
        <div class="row__main"><strong>${esc(b.name)}</strong><span>${esc(b.type)}</span></div>
        <div class="row__sub">${esc(b.facilities)}</div>
        <div class="row__foot"><span>הכי טוב: ${esc(b.best)}</span>${b.loc ? `<button type="button" class="link" data-fly="${esc(b.loc)}">הצג במפה</button>` : ''}</div></li>`).join('')}</ul>`;
    }
    if (id === 'food') {
      return `<ul class="rows">${INFO.food.map(f => `<li class="row">
        <div class="row__main"><strong>${esc(f.name)}</strong><span>${esc(f.where)}</span></div>
        <div class="row__sub">${esc(f.dish)}</div>
        <div class="row__foot"><span>מתי: ${esc(f.when)}</span></div></li>`).join('')}</ul>`;
    }
    if (id === 'sunsets') {
      return `<p class="panel__intro">באמצע אוקטובר השמש שוקעת בין 18:52 ל־18:46. השעון ביוון זהה לשעון בישראל.</p>
        <ul class="rows">${INFO.sunsets.map(s => `<li class="row">
        <div class="row__main"><strong>${esc(s.name)}</strong><span class="row__time">${esc(s.time)}</span></div>
        <div class="row__sub">${esc(s.why)}</div></li>`).join('')}</ul>`;
    }
    return `<ul class="tips">${INFO.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
  }
  function openDrawer() {
    lastFocus = document.activeElement;
    dom.drawer.classList.add('is-open');
    document.body.classList.add('has-drawer');
    dom.btnInfo.setAttribute('aria-expanded', 'true');
    $('.drawer__close').focus();
  }
  function closeDrawer() {
    if (!dom.drawer.classList.contains('is-open')) return;
    dom.drawer.classList.remove('is-open');
    document.body.classList.remove('has-drawer');
    dom.btnInfo.setAttribute('aria-expanded', 'false');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------------- top bar ---------------- */
  function initTopbar() {
    dom.btnInfo.addEventListener('click', () => dom.drawer.classList.contains('is-open') ? closeDrawer() : openDrawer());
    dom.btnAudio.addEventListener('click', async () => {
      const on = await audio.toggle();
      dom.btnAudio.setAttribute('aria-pressed', on);
      dom.btnAudio.querySelector('span').textContent = on ? 'צליל פועל' : 'צליל כבוי';
    });
    const qLabel = () => dom.btnQuality.querySelector('span').textContent = quality.get().high ? 'איכות גבוהה' : 'איכות מאוזנת';
    qLabel();
    dom.btnQuality.addEventListener('click', () => { quality.toggle(); qLabel(); });
    $('.brand').addEventListener('click', (e) => { e.preventDefault(); scrollToId('top'); });
  }

  /* ---------------- global keys / scroll ---------------- */
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeDrawer(); }
  });

  function showHero() {
    dom.story.classList.add('is-ready');
    dom.topbar.classList.add('is-visible');
    dom.hint.classList.add('is-visible');
    dom.pins.classList.add('is-visible');
  }

  /* ---------------- build ---------------- */
  renderStory();
  renderTimeline();
  renderModal();
  renderDrawer();
  createPins();
  initTopbar();

  return { setLoader, hideLoader, showHero, initScroll, updatePins, openLocation, closeModal, openDrawer, closeDrawer, shotPoses };
}
