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

  // Horror "stinger": a dissonant string-like cluster stab plus a mid-range
  // crack. Both sit where tiny phone speakers are loud; the boom is a bonus
  // for laptops and headphones.
  function stinger(ctx, t, dest, size) {
    [311, 330, 349, 370, 740, 784].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.96, t + 1.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22 * size, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 1.35);
    });

    const crack = noiseSource(ctx, 0.35);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.7;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(1.4 * size, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    crack.connect(bp).connect(cg).connect(dest);
    crack.start(t);
    crack.stop(t + 0.35);

    const boom = ctx.createOscillator();
    boom.frequency.setValueAtTime(150, t);
    boom.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(1.3 * size, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    boom.connect(bg).connect(dest);
    boom.start(t);
    boom.stop(t + 1);
  }

  function buildScream(ctx, t0, dest) {
    const D = SCREAM;
    const end = t0 + D + 0.05;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 4;
    comp.ratio.value = 12;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    const master = ctx.createGain();
    master.gain.value = 1.2;
    comp.connect(master).connect(dest);

    // Gentle saturation only — heavy distortion is what turned into "static".
    const satIn = ctx.createGain();
    satIn.gain.value = 1.1;
    const sat = ctx.createWaveShaper();
    sat.curve = distortionCurve(2.5);
    sat.oversample = '4x';
    satIn.connect(sat).connect(comp);

    // Pitch contour of a shrill human scream (~1.1 kHz, peaking on the lunge).
    const contour = (p, k) => {
      p.setValueAtTime(700 * k, t0);
      p.exponentialRampToValueAtTime(1150 * k, t0 + 0.15);
      p.linearRampToValueAtTime(1080 * k, t0 + 0.8);
      p.linearRampToValueAtTime(1220 * k, t0 + 1.55);
      p.exponentialRampToValueAtTime(1450 * k, t0 + 1.75);
      p.linearRampToValueAtTime(1250 * k, t0 + 2.6);
      p.exponentialRampToValueAtTime(780 * k, t0 + D);
    };

    // Slow random wobble so the voice sounds strained, not synthetic.
    const jitter = noiseSource(ctx, D + 0.2);
    const jlp = ctx.createBiquadFilter();
    jlp.type = 'lowpass';
    jlp.frequency.value = 18;
    jitter.connect(jlp);
    jitter.start(t0);
    jitter.stop(end);

    // "Roughness": fast amplitude flutter (70–95 Hz). It's the acoustic
    // signature that makes real screams alarming.
    const rough = ctx.createGain();
    rough.gain.value = 0.55;
    const am = ctx.createOscillator();
    am.frequency.setValueAtTime(70, t0);
    am.frequency.linearRampToValueAtTime(95, t0 + D);
    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.45;
    am.connect(amDepth).connect(rough.gain);
    am.start(t0);
    am.stop(end);

    const voiceEnv = envelope(ctx, t0, 1, 0.03, D - 0.8, 0.8);
    rough.connect(voiceEnv);

    // "AAAAH" vowel formants
    [[1000, 6, 1], [1550, 8, 0.8], [2900, 9, 0.7], [3900, 10, 0.4]].forEach(([f, q, g]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f, t0);
      bp.frequency.linearRampToValueAtTime(f * 1.1, t0 + 1.75);
      bp.frequency.linearRampToValueAtTime(f, t0 + D);
      bp.Q.value = q;
      const gn = ctx.createGain();
      gn.gain.value = g * 2;
      voiceEnv.connect(bp).connect(gn).connect(satIn);
    });
    const dry = ctx.createGain();
    dry.gain.value = 0.25;
    voiceEnv.connect(dry).connect(satIn);

    // Voices: a shrill scream plus a demonic octave-down layer underneath.
    [
      { k: 1, cents: 0, type: 'sawtooth', g: 0.5 },
      { k: 1, cents: 9, type: 'sawtooth', g: 0.4 },
      { k: 1, cents: -11, type: 'square', g: 0.2 },
      { k: 0.5, cents: 0, type: 'sawtooth', g: 0.35 },
      { k: 0.5, cents: 100, type: 'sawtooth', g: 0.25 }, // a semitone off — wrong on purpose
    ].forEach(({ k, cents, type, g }, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      contour(o.frequency, k);
      o.detune.value = cents;

      const jg = ctx.createGain();
      jg.gain.value = 700 * k;
      jlp.connect(jg).connect(o.frequency);

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6 + i * 0.7;
      const lg = ctx.createGain();
      lg.gain.value = 30 * k;
      lfo.connect(lg).connect(o.frequency);

      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(rough);
      o.start(t0); o.stop(end);
      lfo.start(t0); lfo.stop(end);
    });

    // Piercing beating whistle around 3 kHz — where ears are most sensitive
    // and phone speakers are loudest.
    [2950, 3080].forEach((f) => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f, t0);
      o.frequency.linearRampToValueAtTime(f * 1.12, t0 + 1.75);
      o.frequency.linearRampToValueAtTime(f * 0.95, t0 + D);
      o.connect(envelope(ctx, t0, 0.16, 0.05, D - 0.9, 0.85)).connect(comp);
      o.start(t0); o.stop(end);
    });

    // A little breath on top (kept quiet this time).
    const n = noiseSource(ctx, D + 0.1);
    const nbp = ctx.createBiquadFilter();
    nbp.type = 'bandpass';
    nbp.frequency.value = 4500;
    nbp.Q.value = 1;
    n.connect(nbp).connect(envelope(ctx, t0, 0.12, 0.03, D - 0.9, 0.85)).connect(satIn);
    n.start(t0); n.stop(end);

    // Hits: one on the jumpscare, one when the face lunges closer.
    stinger(ctx, t0, comp, 1);
    stinger(ctx, t0 + 1.7, comp, 0.85);
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
    if (peak > 0) for (let i = 0; i < d.length; i++) d[i] *= 1 / peak;
    // soft-limit so it's loud all the way through, not just on the peaks
    const drive = 1.8, norm = 0.99 / Math.tanh(drive);
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * drive) * norm;
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
  const turb = $('#turb'), disp = $('#disp'), pupils = $('#pupils'), mouth = $('#mouth');
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

    // "did I just see something?" — a split-second glimpse before the real hit
    setTimeout(() => {
      scare.classList.add('peek');
      setTimeout(() => scare.classList.remove('peek'), 70);
    }, 750);

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
    scare.classList.remove('out', 'peek');
    scare.classList.add('on');
    if (navigator.vibrate) navigator.vibrate([400, 60, 600, 60, 900, 60, 1200]);

    const start = performance.now();
    let lastGlitch = 0;
    let frozenUntil = 0;
    let tilt = 0;
    let negativeDone = false;

    function frame(now) {
      const t = (now - start) / 1000;

      let s;
      if (t < 0.14) s = 0.25 + 0.9 * easeOut(t / 0.14);
      else if (t < 1.7) s = 1.15 + Math.sin(t * 40) * 0.03;
      else if (t < 1.85) s = 1.15 + 0.75 * easeOut((t - 1.7) / 0.15);
      else s = 1.9 + Math.sin(t * 50) * 0.04;

      // one negative-image hit on the lunge
      if (!negativeDone && t >= 1.7) {
        negativeDone = true;
        scare.classList.add('negative');
        setTimeout(() => scare.classList.remove('negative'), 90);
      }

      // Every so often the face freezes for a beat, then snaps — like the
      // video is choking on it. Unnatural stillness reads as creepier than motion.
      if (now >= frozenUntil) {
        if (t > 0.3 && Math.random() < 0.035) frozenUntil = now + 90 + Math.random() * 120;
        if (Math.random() < 0.025) tilt = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 12); // neck snap
        else tilt *= 0.9;

        const shake = t < 0.25 || (t > 1.7 && t < 1.95) ? 30 : 13;
        let dx = (Math.random() * 2 - 1) * shake;
        const dy = (Math.random() * 2 - 1) * shake;
        const rot = tilt + (Math.random() * 2 - 1) * (shake / 6);
        if (Math.random() < 0.06) dx += (Math.random() < 0.5 ? -1 : 1) * 80; // glitch jump
        faceWrap.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${s})`;

        // jaw stretches open, wider on the lunge
        const jaw = (t > 1.7 ? 1.25 : 1.05 + Math.min(t, 1) * 0.15) + Math.random() * 0.12;
        mouth.setAttribute('transform', `translate(200 340) scale(${1 + (jaw - 1) * 0.3} ${jaw}) translate(-200 -340)`);

        // pupils dart around, then lock onto you
        const px = t > 1.7 ? 0 : (Math.random() * 2 - 1) * 9;
        const py = t > 1.7 ? 0 : (Math.random() * 2 - 1) * 7;
        pupils.setAttribute('transform', `translate(${px} ${py})`);
      }

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
    $('#reveal').hidden = false; // sits under the scare, so it fades to black, not pink
    scare.classList.add('out');
    setTimeout(() => {
      scare.classList.remove('on', 'out');
      faceWrap.style.transform = '';
      exitFullscreen();
      if (live && live.close) live.close().catch(() => {});
      silence.pause();
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
