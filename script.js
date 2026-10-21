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

  // ---------- the scream ----------
  // A pre-made recording (tools/make-scream.html builds it). Synthesising it
  // live came out differently per device — iPhones turned it into static —
  // so every phone now plays the exact same file. It opens with LEAD seconds
  // of silence: sound has to start inside the tap, and the silence covers the
  // cute "wait, one sec…" moment.
  //
  // iPhones mute Web Audio when the silent switch is on, but not <audio>
  // elements ("media" playback), so it plays through an <audio> element and
  // Web Audio is only a fallback.
  const SCREAM_URL = 'scream.mp3?v=3';
  const audio = new Audio(SCREAM_URL);
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');

  // iPhones ignore preload, so warm the HTTP cache for the first tap.
  let screamBytes = null;
  fetch(SCREAM_URL).then((r) => r.arrayBuffer()).then((ab) => { screamBytes = ab; }).catch(() => {});

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
      if (!screamBytes) return;
      live.decodeAudioData(screamBytes.slice(0), (buf) => {
        const src = live.createBufferSource();
        src.buffer = buf;
        src.connect(live.destination);
        src.start(0, Math.min((performance.now() - t0) / 1000, LEAD));
      }, () => {});
    };

    let usingEl = true;
    if (audio.readyState > 0) audio.currentTime = 0;
    const p = audio.play();
    if (p && p.catch) p.catch(() => { usingEl = false; playLive(); });

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
      // give a slow-loading file a moment so the face lands with the scream
      if (audioHit || elapsed >= LEAD + (usingEl ? 0.8 : 0.25)) impact(live);
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
        msg.textContent = 'sent';
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      msg.textContent = 'link copied';
    } catch (e) {
      msg.textContent = link;
    }
  });
})();
