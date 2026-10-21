(() => {
  // Timeline in seconds from the tap. Must match tools/make-scream.html,
  // which bakes the music box and scream into scream.mp3 on the same clock.
  const LEAD = 8.6;   // the calm part: music box while the letter types out
  const SCARE = 3.2;  // how long the face stays up
  // Put the face up a hair before the scream: picture-first reads as one hit,
  // sound-first reads as a lag.
  const CUT_EARLY = 0.06;
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

  // ---------- the sound ----------
  // scream.mp3 (built by tools/make-scream.html) is one clip on the same clock
  // as the page: a soft music box for LEAD seconds, then the scream. It has to
  // start inside the tap (phones block sound otherwise), and the letter and the
  // cut are timed off its playback position so they stay in sync.
  //
  // iPhones mute Web Audio when the silent switch is on, but not <audio>
  // elements ("media" playback), so it plays through an <audio> element and
  // Web Audio is only a fallback.
  const SCREAM_URL = 'scream.mp3?v=7';
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

  // ---------- the face ----------
  // Decode the photo up front so the cut is instant, with no half-loaded frame.
  const card = $('#card'), scare = $('#scare');
  const photo = $('#photo');
  if (photo.decode) photo.decode().catch(() => {});

  // ---------- the letter ----------
  // Calm, sweet, and small enough that they bring the phone closer to read it.
  // The last line types slowly so the cut lands mid-sentence.
  const LETTER = [
    { at: 0.9, text: "i've never been good at saying this out loud,", size: 17, cps: 28 },
    { at: 2.7, text: 'so i wrote it down for you instead.', size: 17, cps: 28 },
    { at: 4.2, text: "there's something about me you don't know yet…", size: 15.5, cps: 26 },
    { at: 6.0, text: 'come a little closer, it’s a secret', size: 14, cps: 22 },
    { at: 7.6, text: 'the truth is, i’m not really', size: 12.5, cps: 11 },
  ];

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
    let liveStart = 0;

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
        const offset = Math.min((performance.now() - t0) / 1000, LEAD);
        src.start(0, offset);
        liveStart = performance.now() - offset * 1000;
      }, () => {});
    };

    let usingEl = true;
    if (audio.readyState > 0) audio.currentTime = 0;
    const p = audio.play();
    if (p && p.catch) p.catch(() => { usingEl = false; playLive(); });

    goFullscreen();

    $('#letterTitle').textContent = kind === 'yes'
      ? 'yayyy 🥹 okay wait, i wrote you something'
      : 'okay… but read this first? 🥺';
    const body = $('#letterBody');
    body.textContent = '';
    const lines = LETTER.map((l) => {
      const el = document.createElement('p');
      el.style.fontSize = l.size + 'px';
      body.appendChild(el);
      return { ...l, el, shown: -1 };
    });
    card.classList.add('is-reading');

    // One clock for everything: the audio's position when it's playing, so
    // the letter and the cut stay locked to the music; wall time otherwise.
    // iPhones report currentTime in coarse steps, so instead of reading it
    // raw (which made typing stutter and the cut land late) we anchor it to
    // the wall clock and run smoothly from there. The earliest anchor is the
    // freshest reading; re-anchor only if playback has clearly stalled.
    let anchor = null;
    const clock = () => {
      if (usingEl && !audio.paused && audio.currentTime > 0) {
        const a = performance.now() - audio.currentTime * 1000;
        if (anchor === null || a < anchor || a - anchor > 400) anchor = a;
        return (performance.now() - anchor) / 1000;
      }
      if (liveStart) return (performance.now() - liveStart) / 1000;
      return (performance.now() - t0) / 1000;
    };

    const tick = () => {
      const t = clock();
      let active = -1;
      lines.forEach((l, i) => { if (t >= l.at) active = i; });
      lines.forEach((l, i) => {
        const n = Math.max(0, Math.min(l.text.length, Math.floor((t - l.at) * l.cps)));
        if (t >= l.at && n !== l.shown) {
          l.shown = n;
          l.el.textContent = l.text.slice(0, n);
        }
        l.el.classList.toggle('typing', i === active); // caret on the line being written
      });
      // If the audio is slow to start, give it a moment so the face lands
      // with the scream; then go anyway.
      const wall = (performance.now() - t0) / 1000;
      if (t >= LEAD - CUT_EARLY || wall >= LEAD + 1.2) impact(live);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function impact(live) {
    clearInterval(heartTimer);
    scare.classList.add('on');
    if (navigator.vibrate) navigator.vibrate([600, 80, 900, 80, 1200]);
    setTimeout(() => finish(live), SCARE * 1000);
  }

  function finish(live) {
    // hard cut to black, a beat of nothing, then the reveal
    scare.classList.add('black');
    setTimeout(() => {
      $('#reveal').hidden = false;
      scare.classList.remove('on', 'black');
      exitFullscreen();
      if (live && live.close) live.close().catch(() => {});
      silence.pause();
    }, 450);
  }

  $('#yes').addEventListener('click', () => answer('yes'));
  $('#no').addEventListener('click', () => answer('no'));

  $('#again').addEventListener('click', () => {
    $('#reveal').hidden = true;
    card.classList.remove('is-reading');
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
