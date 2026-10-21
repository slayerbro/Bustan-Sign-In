(() => {
  // scare.mp4 opens with 0.4 s of silence and the jumpscare starts here.
  // The silent lead lets us "unlock" the video on a tap without anyone
  // hearing it (see unlock()).
  const SCARE_START = 0.47;
  const SCARE_MAX = 1.6; // safety net in case 'ended' never fires

  const $ = (s) => document.querySelector(s);
  const card = $('#card'), scare = $('#scare'), video = $('#scareVideo'), input = $('#name');

  // Play as media, so iPhones don't mute it on the silent switch.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}

  let fired = false;

  // ---------- unlocking the video ----------
  // iPhones only let a video play with sound if play() was first called
  // during a tap, and the scare fires from a keystroke instead. So on each
  // tap we play it from the silent start, pause it straight away, and park it
  // on the scare's first frame. After that, play() works from anywhere.
  function unlock() {
    if (fired) return;
    video.muted = false;
    try { video.currentTime = 0; } catch (e) {}
    const park = () => {
      if (fired) return;
      video.pause();
      try { video.currentTime = SCARE_START; } catch (e) {}
    };
    const p = video.play();
    if (p && p.then) p.then(park, () => {});
    else park();
  }

  // ---------- step 1 → step 2 ----------
  function answer(kind) {
    unlock();
    $('#nameTitle').textContent = kind === 'yes'
      ? 'Add your name to the sign in sheet'
      : 'Add your name so we can take you off the list';
    card.classList.add('is-naming');
  }

  $('#yes').addEventListener('click', () => answer('yes'));
  $('#no').addEventListener('click', () => answer('no'));
  input.addEventListener('click', unlock); // tapping the box is a tap too

  // ---------- the trigger: their first letter ----------
  // While the keyboard is up the visible height shrinks, so remember the
  // height while nothing is focused and wait for it to come back.
  const vv = window.visualViewport;
  let fullHeight = vv ? vv.height : window.innerHeight;
  if (vv) {
    vv.addEventListener('resize', () => {
      if (document.activeElement !== input) fullHeight = Math.max(fullHeight, vv.height);
    });
  }

  function fire() {
    if (fired) return;
    fired = true;

    // Put the keyboard away first so the face gets the whole screen.
    input.readOnly = true;
    input.blur();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    const t0 = performance.now();
    const waitForKeyboard = () => {
      const t = performance.now() - t0;
      const gone = !vv || vv.height >= fullHeight - 60;
      if ((t > 120 && gone) || t > 700) jump();
      else requestAnimationFrame(waitForKeyboard);
    };
    requestAnimationFrame(waitForKeyboard);
  }

  input.addEventListener('keydown', (e) => { if (e.key && e.key.length === 1) fire(); });
  input.addEventListener('input', () => { if (input.value) fire(); });

  // ---------- the jumpscare ----------
  let endTimer = 0;
  let finished = false;

  function jump() {
    window.scrollTo(0, 0);
    if (Math.abs(video.currentTime - SCARE_START) > 0.03) {
      try { video.currentTime = SCARE_START; } catch (e) {}
    }
    video.muted = false;
    const p = video.play();
    // If sound is blocked anyway, still show it rather than nothing.
    if (p && p.catch) p.catch(() => { video.muted = true; video.play().catch(() => {}); });

    scare.classList.add('on');
    if (navigator.vibrate) navigator.vibrate([400, 60, 800]);

    finished = false;
    video.onended = finish;
    endTimer = setTimeout(finish, SCARE_MAX * 1000);
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(endTimer);
    video.onended = null;
    // hard cut to black, a beat of nothing, then the reveal
    scare.classList.add('black');
    setTimeout(() => {
      $('#reveal').hidden = false;
      scare.classList.remove('on', 'black');
      video.pause();
    }, 450);
  }

  // ---------- reveal ----------
  $('#again').addEventListener('click', () => {
    $('#reveal').hidden = true;
    card.classList.remove('is-naming');
    input.value = '';
    input.readOnly = false;
    fired = false;
  });

  $('#share').addEventListener('click', async () => {
    const msg = $('#shareMsg');
    const link = location.origin + location.pathname;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Bustan Sign in', url: link });
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
