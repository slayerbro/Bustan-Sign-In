(() => {
  const LEAD = 1.4;    // seconds of cute "wait one sec…" before the scare hits
  const SCREAM = 3.4;  // length of the scream
  const SR = 44100;

  const $ = (s) => document.querySelector(s);

  // ---------- floating hearts ----------
  const HEARTS = ['💖', '💕', '💗', '💓', '🌸', '✨'];
  function spawnHeart(delay = 0) {
    const h = document.createElement('span');
    h.className = 'float-heart';
    h.textContent = HEARTS[(Math.random() * HEARTS.length) | 0];
    h.style.left = Math.random() * 100 + 'vw';
    h.style.fontSize = 14 + Math.random() * 22 + 'px';
    const dur = 6 + Math.random() * 6;
    h.style.animationDuration = dur + 's';
    h.style.animationDelay = delay + 's';
    $('#hearts').appendChild(h);
    setTimeout(() => h.remove(), (dur + delay) * 1000 + 100);
  }
  for (let i = 0; i < 12; i++) spawnHeart(Math.random() * 5);
  const heartTimer = setInterval(() => spawnHeart(), 650);

  // ---------- jagged teeth around the mouth ----------
  (function buildTeeth() {
    const g = $('#teeth');
    const NS = 'http://www.w3.org/2000/svg';
    const cx = 200, cy = 405, rx = 55, ry = 78;
    const pt = (a) => ({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    const row = (a0, a1, count) => {
      const step = (a1 - a0) / count;
      for (let i = 0; i < count; i++) {
        const a = a0 + step * (i + 0.5);
        const p1 = pt(a - step * 0.5), p2 = pt(a + step * 0.5), m = pt(a);
        const dx = cx - m.x, dy = cy - m.y, dl = Math.hypot(dx, dy);
        const len = 16 + Math.random() * 24;
        const tip = { x: m.x + (dx / dl) * len + (Math.random() - 0.5) * 6, y: m.y + (dy / dl) * len };
        const poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points', `${p1.x},${p1.y} ${p2.x},${p2.y} ${tip.x},${tip.y}`);
        g.appendChild(poly);
      }
    };
    row(Math.PI * 1.12, Math.PI * 1.88, 9); // top
    row(Math.PI * 0.15, Math.PI * 0.85, 8); // bottom
  })();

  // ---------- scream synth ----------
  function distortionCurve(k) {
    const n = 4096, c = new Float32Array(n), norm = Math.tanh(k);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = Math.tanh(k * x) / norm;
    }
    return c;
  }

  function noiseSource(ctx, secs) {
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * secs), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    return s;
  }

  function envelope(ctx, t0, peak, attack, hold, release) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.setValueAtTime(peak, t0 + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + hold + release);
    return g;
  }

  function slam(ctx, t, dest, size) {
    const boom = ctx.createOscillator();
    boom.frequency.setValueAtTime(150, t);
    boom.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(1.6 * size, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    boom.connect(bg).connect(dest);
    boom.start(t);
    boom.stop(t + 1);

    const hit = noiseSource(ctx, 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(1.3 * size, t);
    hg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    hit.connect(lp).connect(hg).connect(dest);
    hit.start(t);
    hit.stop(t + 0.4);
  }

  function buildScream(ctx, t0, dest) {
    const D = SCREAM;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 6;
    comp.ratio.value = 12;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    const master = ctx.createGain();
    master.gain.value = 1.4;
    comp.connect(master).connect(dest);

    const driveIn = ctx.createGain();
    driveIn.gain.value = 2.2;
    const drive = ctx.createWaveShaper();
    drive.curve = distortionCurve(6);
    drive.oversample = '4x';
    driveIn.connect(drive).connect(comp);

    // 1) the voice: detuned saws pushed through "AAAH" vowel formants
    const voiceEnv = envelope(ctx, t0, 1, 0.04, D - 0.9, 0.9);
    const formantBus = ctx.createGain();
    voiceEnv.connect(formantBus);
    [[900, 5, 1], [1300, 7, 0.8], [2700, 9, 0.55], [3600, 10, 0.35]].forEach(([f, q, g]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f, t0);
      bp.frequency.linearRampToValueAtTime(f * 1.08, t0 + D);
      bp.Q.value = q;
      const gn = ctx.createGain();
      gn.gain.value = g * 2.5;
      formantBus.connect(bp).connect(gn).connect(driveIn);
    });
    const body = ctx.createGain();
    body.gain.value = 0.18;
    formantBus.connect(body).connect(driveIn);

    const base = 560;
    [0, -18, 11, 27, -33, 6].forEach((cents, i) => {
      const o = ctx.createOscillator();
      o.type = i % 3 === 2 ? 'square' : 'sawtooth';
      const f = o.frequency;
      f.setValueAtTime(base * 0.55, t0);
      f.exponentialRampToValueAtTime(base * 1.55, t0 + 0.16);
      f.linearRampToValueAtTime(base * 1.4, t0 + 0.9);
      f.linearRampToValueAtTime(base * 1.75, t0 + 1.75);
      f.linearRampToValueAtTime(base * 1.5, t0 + 2.5);
      f.exponentialRampToValueAtTime(base * 0.6, t0 + D);
      o.detune.value = cents * 2;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6.5 + i * 0.9;
      const lg = ctx.createGain();
      lg.gain.value = 25 + i * 8;
      lfo.connect(lg).connect(f);

      o.connect(voiceEnv);
      o.start(t0); o.stop(t0 + D + 0.05);
      lfo.start(t0); lfo.stop(t0 + D + 0.05);
    });

    // 2) raspy breath / shriek
    const n = noiseSource(ctx, D + 0.1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.8;
    n.connect(bp).connect(envelope(ctx, t0, 0.9, 0.03, D - 0.9, 0.9)).connect(driveIn);
    n.start(t0); n.stop(t0 + D + 0.1);

    // 3) metallic FM screech on top
    const car = ctx.createOscillator();
    car.frequency.setValueAtTime(1900, t0);
    car.frequency.linearRampToValueAtTime(2600, t0 + D);
    const mod = ctx.createOscillator();
    mod.frequency.value = 317;
    const mg = ctx.createGain();
    mg.gain.value = 1400;
    mod.connect(mg).connect(car.frequency);
    car.connect(envelope(ctx, t0, 0.35, 0.05, D - 1, 1)).connect(driveIn);
    car.start(t0); car.stop(t0 + D);
    mod.start(t0); mod.stop(t0 + D);

    // 4) impact slams (second one lines up with the face lunging closer)
    slam(ctx, t0, comp, 1);
    slam(ctx, t0 + 1.7, comp, 0.8);
  }

  // iPhones mute Web Audio when the silent switch is on, but not <audio>
  // elements ("media" playback). So the scream is pre-rendered to a WAV and
  // played through an <audio> element, and Web Audio is only a fallback.
  const audio = new Audio();
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  let screamReady = false;
  let screamBuffer = null;

  function forcePlaybackSession() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  }
  forcePlaybackSession();

  // Looping a silent <audio> clip while Web Audio plays puts iPhones into
  // media mode, so even the fallback ignores the silent switch.
  const silence = new Audio(wavDataUrl(new Float32Array(SR / 10)));
  silence.loop = true;
  silence.setAttribute('playsinline', '');

  function wavDataUrl(samples) {
    const bytes = new Uint8Array(toWav(samples));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return 'data:audio/wav;base64,' + btoa(bin);
  }

  function toWav(d) {
    const n = d.length;
    const ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab);
    let p = 0;
    const str = (s) => { for (const ch of s) v.setUint8(p++, ch.charCodeAt(0)); };
    const u32 = (x) => { v.setUint32(p, x, true); p += 4; };
    const u16 = (x) => { v.setUint16(p, x, true); p += 2; };
    str('RIFF'); u32(36 + n * 2); str('WAVE');
    str('fmt '); u32(16); u16(1); u16(1); u32(SR); u32(SR * 2); u16(2); u16(16);
    str('data'); u32(n * 2);
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, d[i]));
      v.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      p += 2;
    }
    return ab;
  }

  (async function prerender() {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return;
    const ctx = new OAC(1, Math.ceil(SR * (LEAD + SCREAM + 0.3)), SR);
    buildScream(ctx, LEAD, ctx.destination);
    const buf = await new Promise((resolve, reject) => {
      ctx.oncomplete = (e) => resolve(e.renderedBuffer);
      const p = ctx.startRendering();
      if (p && p.then) p.then(resolve, reject);
    });
    // normalise to max loudness
    const d = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < d.length; i++) d[i] *= 0.99 / peak;
    screamBuffer = buf;
    // data: URL rather than blob: — some iOS versions won't play blob audio
    audio.src = wavDataUrl(d);
    audio.load();
    screamReady = true;
  })().catch(() => {});

  // ---------- TV static ----------
  const sc = $('#static'), sctx = sc.getContext('2d');
  const img = sctx.createImageData(sc.width, sc.height);
  function drawStatic() {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
  }

  // ---------- flow ----------
  const card = $('#card'), scare = $('#scare'), faceWrap = $('#faceWrap'), face = $('#face');
  const turb = $('#turb'), disp = $('#disp'), pupils = $('#pupils');
  let fired = false;

  function goFullscreen() {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return;
    try {
      const p = fn.call(el);
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }

  function exitFullscreen() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn && (document.fullscreenElement || document.webkitFullscreenElement)) {
      try {
        const p = fn.call(document);
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
    }
  }

  function answer(kind) {
    if (fired) return;
    fired = true;
    const t0 = performance.now();

    // Sound has to start inside the tap — phones block it otherwise.
    forcePlaybackSession();
    let live = null;

    // Fallback only: Web Audio plus the silent clip so iPhones stay in media mode.
    const playLive = () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        live = new AC();
        live.resume();
      } catch (e) { return; }
      const sp = silence.play();
      if (sp && sp.catch) sp.catch(() => {});
      const elapsed = (performance.now() - t0) / 1000;
      if (screamBuffer) {
        const src = live.createBufferSource();
        src.buffer = screamBuffer;
        src.connect(live.destination);
        src.start(0, Math.min(elapsed, LEAD));
      } else {
        buildScream(live, live.currentTime + Math.max(0.02, LEAD - elapsed), live.destination);
      }
    };

    let usingEl = false;
    if (screamReady) {
      usingEl = true;
      if (audio.readyState > 0) audio.currentTime = 0;
      const p = audio.play();
      if (p && p.catch) p.catch(() => { usingEl = false; playLive(); });
    } else {
      playLive();
    }

    goFullscreen();

    $('#waitText').textContent = kind === 'yes'
      ? 'yayyy!! wait, one sec… 💌'
      : 'aww okay… one last thing 🥺';
    card.classList.add('is-waiting');

    const wait = () => {
      const elapsed = (performance.now() - t0) / 1000;
      const audioHit = usingEl && !audio.paused && audio.currentTime >= LEAD - 0.03;
      if (audioHit || elapsed >= LEAD + 0.25) impact(live);
      else requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
  }

  const easeOut = (x) => 1 - Math.pow(1 - x, 3);

  function impact(live) {
    clearInterval(heartTimer);
    scare.classList.remove('out');
    scare.classList.add('on');
    if (navigator.vibrate) navigator.vibrate([400, 60, 600, 60, 900, 60, 1200]);

    const start = performance.now();
    let lastGlitch = 0;

    function frame(now) {
      const t = (now - start) / 1000;

      let s;
      if (t < 0.14) s = 0.25 + 0.9 * easeOut(t / 0.14);
      else if (t < 1.7) s = 1.15 + Math.sin(t * 40) * 0.03;
      else if (t < 1.85) s = 1.15 + 0.75 * easeOut((t - 1.7) / 0.15);
      else s = 1.9 + Math.sin(t * 50) * 0.04;

      const shake = t < 0.25 || (t > 1.7 && t < 1.95) ? 30 : 13;
      let dx = (Math.random() * 2 - 1) * shake;
      const dy = (Math.random() * 2 - 1) * shake;
      const rot = (Math.random() * 2 - 1) * (shake / 6);
      if (Math.random() < 0.06) dx += (Math.random() < 0.5 ? -1 : 1) * 80; // glitch jump
      faceWrap.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${s})`;

      if (now - lastGlitch > 60) {
        lastGlitch = now;
        const sp = 4 + Math.random() * 10;
        face.style.filter = `drop-shadow(${sp}px 0 0 rgba(255,0,40,.75)) drop-shadow(${-sp}px 0 0 rgba(0,255,255,.45))`;
        turb.setAttribute('seed', String((Math.random() * 100) | 0));
        disp.setAttribute('scale', String(10 + Math.random() * 30));
        pupils.style.opacity = Math.random() < 0.15 ? '0.2' : '1';
      }
      drawStatic();

      if (t < SCREAM - 0.2) requestAnimationFrame(frame);
      else finish(live);
    }
    requestAnimationFrame(frame);
  }

  function finish(live) {
    scare.classList.add('out');
    setTimeout(() => {
      scare.classList.remove('on', 'out');
      faceWrap.style.transform = '';
      exitFullscreen();
      if (live && live.close) live.close().catch(() => {});
      silence.pause();
      $('#reveal').hidden = false;
    }, 500);
  }

  $('#yes').addEventListener('click', () => answer('yes'));
  $('#no').addEventListener('click', () => answer('no'));

  $('#again').addEventListener('click', () => {
    $('#reveal').hidden = true;
    card.classList.remove('is-waiting');
    fired = false;
  });

  $('#share').addEventListener('click', async () => {
    const msg = $('#shareMsg');
    const link = location.origin + location.pathname;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'I have a question for you 🥺💌', url: link });
        msg.textContent = 'sent 😈';
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      msg.textContent = 'link copied 😈 send it!';
    } catch (e) {
      msg.textContent = link;
    }
  });
})();
