/* ============================================================
   audio.js — a quiet Aegean: filtered noise for the swell,
   a soft detuned drone, and a gull now and then. Synthesized,
   so nothing has to be downloaded. Off until the person asks.
   ============================================================ */
export function createAudio() {
  let ctx = null, master = null, musicGain = null, running = false, gullTimer = null, musicTimer = null;
  let volume = 0.75;
  const listeners = new Set();

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.34;
    musicGain.connect(master);

    /* --- waves: brown-ish noise, low-passed, swelling with two slow LFOs --- */
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.6;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60;
    const waveGain = ctx.createGain(); waveGain.gain.value = 0.35;
    noise.connect(hp).connect(lp).connect(waveGain).connect(master);

    const lfo1 = ctx.createOscillator(); lfo1.frequency.value = 0.08;
    const lfo1g = ctx.createGain(); lfo1g.gain.value = 0.18;
    lfo1.connect(lfo1g).connect(waveGain.gain);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.031;
    const lfo2g = ctx.createGain(); lfo2g.gain.value = 260;
    lfo2.connect(lfo2g).connect(lp.frequency);

    /* --- drone: three slightly detuned sines, very quiet --- */
    const droneGain = ctx.createGain(); droneGain.gain.value = 0.045;
    droneGain.connect(master);
    for (const [f, g] of [[110, 1], [164.8, 0.5], [220.6, 0.35]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g;
      const vib = ctx.createOscillator(); vib.frequency.value = 0.11 + Math.random() * 0.1;
      const vibg = ctx.createGain(); vibg.gain.value = 0.6;
      vib.connect(vibg).connect(o.frequency);
      o.connect(og).connect(droneGain);
      o.start(); vib.start();
    }

    noise.start(); lfo1.start(); lfo2.start();
  }

  /* A small, repeating Dorian phrase gives the sea sound a gentle Greek character. */
  const melody = [293.66, 349.23, 392.00, 440.00, 392.00, 349.23, 329.63, 293.66];
  function playNote(frequency, delay = 0) {
    if (!ctx || !musicGain || !running) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(frequency, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.045);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    o.connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + 0.68);
    if (frequency === melody[0]) {
      const bass = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(frequency / 2, t);
      bassGain.gain.setValueAtTime(0.0001, t);
      bassGain.gain.exponentialRampToValueAtTime(0.07, t + 0.06);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
      bass.connect(bassGain).connect(musicGain);
      bass.start(t);
      bass.stop(t + 1.4);
    }
  }
  function scheduleMelody() {
    clearTimeout(musicTimer);
    if (!running) return;
    melody.forEach((note, i) => playNote(note, i * 0.72));
    musicTimer = setTimeout(scheduleMelody, melody.length * 720);
  }
  function notify() { listeners.forEach(listener => listener(running, volume)); }

  /* one gull cry: a pitch-bent sine with a touch of noise */
  function gull() {
    if (!ctx || !running) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle';
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = Math.random() * 1.6 - 0.8;
    o.frequency.setValueAtTime(1500 + Math.random() * 500, t);
    o.frequency.exponentialRampToValueAtTime(2400 + Math.random() * 400, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(1100, t + 0.42);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.45);
    (pan ? o.connect(g).connect(pan) : o.connect(g)).connect(master);
    o.start(t); o.stop(t + 0.5);
    if (Math.random() < 0.5) setTimeout(gull, 380 + Math.random() * 300);
  }
  function scheduleGulls() {
    clearTimeout(gullTimer);
    gullTimer = setTimeout(() => { gull(); scheduleGulls(); }, 9000 + Math.random() * 16000);
  }

  async function start() {
    if (!ctx) build();
    if (ctx.state === 'suspended') await ctx.resume();
    running = true;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 1.4);
    scheduleGulls();
    scheduleMelody();
    notify();
  }
  async function stop() {
    if (!ctx) return;
    running = false;
    clearTimeout(gullTimer);
    clearTimeout(musicTimer);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    setTimeout(() => { if (!running && ctx && ctx.state === 'running') ctx.suspend(); }, 2500);
    notify();
  }
  async function toggle() {
    if (running) { await stop(); return false; }
    await start();
    return true;
  }

  function setVolume(value) {
    volume = Math.min(1, Math.max(0, Number(value)));
    if (ctx && master) master.gain.setTargetAtTime(running ? volume * 0.9 : 0, ctx.currentTime, 0.08);
    notify();
  }
  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }

  const unlock = (event) => {
    if (event.target.closest && event.target.closest('#btn-audio')) return;
    start().catch(() => {});
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);

  document.addEventListener('visibilitychange', () => {
    if (!ctx || !running) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  return { start, stop, toggle, setVolume, subscribe, isOn: () => running, getVolume: () => volume };
}
