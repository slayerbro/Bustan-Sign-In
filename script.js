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

  const card = $('#card'), scare = $('#scare'), faceWrap = $('#faceWrap'), face = $('#face');
  const turb = $('#turb'), disp = $('#disp'), pupils = $('#pupils'), mouth = $('#mouth');
  let fired = false;

  // ---------- TV static: a few pre-made noise frames we flip between ----------
  const staticFrames = [];
  for (let k = 0; k < 3; k++) {
    const c = document.createElement('canvas');
    c.width = 90;
    c.height = 160;
    const x = c.getContext('2d');
    const im = x.createImageData(c.width, c.height);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    $('#static').appendChild(c);
    staticFrames.push(c);
  }

  // ---------- face frames ----------
  // Live SVG filters (warp, blur, grain) are far too slow to redraw every
  // frame on a phone; that's what made the scare freeze. So the face is
  // rendered into a handful of bitmaps while the cute page is showing, and
  // the scare only flips between them and moves them with GPU transforms.
  const frames = { normal: [], lunge: [], negative: null };
  const FRAME_W = 760, FRAME_H = Math.round(FRAME_W * 1.3), PAD = Math.round(FRAME_W * 0.04);

  function setPose(jaw, px, py) {
    turb.setAttribute('seed', String((Math.random() * 100) | 0));
    disp.setAttribute('scale', String(10 + Math.random() * 30));
    mouth.setAttribute('transform', `translate(200 340) scale(${1 + (jaw - 1) * 0.3} ${jaw}) translate(-200 -340)`);
    pupils.setAttribute('transform', `translate(${px} ${py})`);
  }

  function svgImage() {
    return new Promise((resolve, reject) => {
      const clone = face.cloneNode(true);
      clone.setAttribute('width', FRAME_W);
      clone.setAttribute('height', FRAME_H);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    });
  }

  // One reused scratch canvas: iOS Safari caps total canvas memory and is
  // slow to free throwaway canvases.
  const tintCanvas = document.createElement('canvas');
  function tinted(img, color) {
    const c = tintCanvas;
    c.width = FRAME_W; // also clears it
    c.height = FRAME_H;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, FRAME_W, FRAME_H);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, FRAME_W, FRAME_H);
    return c;
  }

  // Bakes the red/cyan glitch split into the bitmap too.
  async function renderFrame(jaw, px, py, negative) {
    setPose(jaw, px, py);
    const img = await svgImage();
    const c = document.createElement('canvas');
    c.width = FRAME_W + PAD * 2;
    c.height = FRAME_H;
    c.className = 'frame';
    const x = c.getContext('2d');
    const sp = PAD * (0.3 + Math.random() * 0.7);
    x.globalAlpha = 0.75;
    x.drawImage(tinted(img, 'rgb(255,0,40)'), PAD + sp, 0);
    x.globalAlpha = 0.45;
    x.drawImage(tinted(img, 'rgb(0,255,255)'), PAD - sp, 0);
    x.globalAlpha = 1;
    x.drawImage(img, PAD, 0, FRAME_W, FRAME_H);
    if (negative) {
      x.globalCompositeOperation = 'difference';
      x.fillStyle = '#fff';
      x.fillRect(0, 0, c.width, c.height);
    }
    faceWrap.appendChild(c);
    return c;
  }

  const rnd = (a) => (Math.random() * 2 - 1) * a;
  const nextTick = () => new Promise((r) => setTimeout(r, 30)); // let the page breathe between renders

  (async function prerenderFrames() {
    await new Promise((r) => setTimeout(r, 300));
    try {
      for (let i = 0; i < 5; i++) {
        frames.normal.push(await renderFrame(1.05 + Math.random() * 0.25, rnd(9), rnd(7), false));
        faceWrap.classList.add('baked'); // first bitmap is ready: stop showing the live SVG
        await nextTick();
      }
      for (let i = 0; i < 3; i++) {
        frames.lunge.push(await renderFrame(1.25 + Math.random() * 0.12, 0, 0, false));
        await nextTick();
      }
      frames.negative = await renderFrame(1.3, 0, 0, true);
    } catch (e) {
      // keep whatever rendered; the live SVG stays as a still fallback
    }
    tintCanvas.width = tintCanvas.height = 1;
    setPose(1.1, 0, 0);
  })();

  let shown = null;
  function showFrame(c) {
    if (!c || c === shown) return;
    if (shown) shown.classList.remove('on');
    c.classList.add('on');
    shown = c;
  }
  const pick = (list) => list[(Math.random() * list.length) | 0];

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
      showFrame(frames.normal[0]);
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
    let lastSwap = 0;
    let frozenUntil = 0;
    let tilt = 0;
    let negativeUntil = 0;
    let staticIdx = 0;

    showFrame(frames.normal[0]);

    function frame(now) {
      const t = (now - start) / 1000;

      let s;
      if (t < 0.14) s = 0.25 + 0.9 * easeOut(t / 0.14);
      else if (t < 1.7) s = 1.15 + Math.sin(t * 40) * 0.03;
      else if (t < 1.85) s = 1.15 + 0.75 * easeOut((t - 1.7) / 0.15);
      else s = 1.9 + Math.sin(t * 50) * 0.04;

      // one negative-image hit on the lunge
      if (!negativeUntil && t >= 1.7 && frames.negative) {
        negativeUntil = now + 90;
        scare.classList.add('negative');
        showFrame(frames.negative);
      } else if (negativeUntil && now >= negativeUntil && scare.classList.contains('negative')) {
        scare.classList.remove('negative');
        lastSwap = 0; // swap off the negative frame right away
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
        faceWrap.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rot}deg) scale(${s})`;

        // Swap to another baked pose: the warp, jaw, pupils and glitch split
        // all change together. Wider jaw and locked-on eyes after the lunge.
        if (now - lastSwap > 70 && now >= negativeUntil) {
          lastSwap = now;
          const pool = t > 1.7 && frames.lunge.length ? frames.lunge : frames.normal;
          if (pool.length > 1) {
            let next;
            do next = pick(pool); while (next === shown);
            showFrame(next);
          } else {
            showFrame(pool[0]);
          }
        }
      }

      staticFrames[staticIdx].classList.remove('on');
      staticIdx = (staticIdx + 1) % staticFrames.length;
      staticFrames[staticIdx].classList.add('on');

      if (t < SCREAM - 0.2) requestAnimationFrame(frame);
      else finish(live);
    }
    requestAnimationFrame(frame);
  }

  function finish(live) {
    $('#reveal').hidden = false; // sits under the scare, so it fades to black, not pink
    scare.classList.add('out');
    setTimeout(() => {
      scare.classList.remove('on', 'out', 'negative');
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
