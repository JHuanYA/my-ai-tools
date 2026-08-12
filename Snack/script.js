const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const startBtn = document.getElementById('start-btn');
const overlay = document.getElementById('overlay');
const statusText = document.getElementById('status-text');
const dirButtons = document.querySelectorAll('.dir-btn');

const gridSize = 20;
const tileCount = canvas.width / gridSize;
const initialSpeed = 150;
const maxSpeed = 60;

let snake;
let direction;
let nextDirection;
let food;
let score;
let bestScore;
let gameLoopId = null;
let lastTime = 0;
let stepDelay = initialSpeed;
let isRunning = false;
let isGameOver = false;

const storageKey = 'snake-best-score';

// UI settings elements
const skinSelect = document.getElementById('skin-select');
const modeSelect = document.getElementById('mode-select');
const difficultySelect = document.getElementById('difficulty-select');
const soundToggle = document.getElementById('sound-toggle');
const timeSelect = document.getElementById('time-select');
const timeOpts = document.getElementById('time-opts');
const topTimerEl = document.getElementById('top-timer');

// Game mode & audio
let mode = 'classic';
let difficulty = 'normal';
let soundOn = true;
let timeLimit = 60;
let timeLeft = 0;
let timerInterval = null;

// control buttons
const pauseBtn = document.getElementById('pause-btn');
const restartBtn = document.getElementById('restart-btn');
let isPaused = false;

// Difficulty factors (higher factor => slower)
const difficultyConfig = {
  easy: { delayFactor: 1.25, speedStep: 3 },
  normal: { delayFactor: 1.0, speedStep: 4 },
  hard: { delayFactor: 0.75, speedStep: 6 },
};

// WebAudio setup (initialized on first user interaction)
let audioCtx = null;
let bgOsc = null;
let bgGain = null;

function ensureAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    audioCtx = null;
  }
}

function playBeep(freq = 440, duration = 0.08, volume = 0.08) {
  if (!soundOn) return;
  ensureAudio();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.value = volume;
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  setTimeout(() => {
    try { o.stop(); o.disconnect(); g.disconnect(); } catch (e) {}
  }, duration * 1000 + 20);
}

function startBackgroundMusic() {
  if (!soundOn) return;
  ensureAudio();
  if (!audioCtx) return;
  if (bgOsc) return; // already running
  bgOsc = audioCtx.createOscillator();
  bgGain = audioCtx.createGain();
  bgOsc.type = 'sine';
  bgOsc.frequency.value = 120;
  bgGain.gain.value = 0.02;
  bgOsc.connect(bgGain);
  bgGain.connect(audioCtx.destination);
  bgOsc.start();
}

function stopBackgroundMusic() {
  if (!bgOsc) return;
  try { bgOsc.stop(); bgOsc.disconnect(); bgGain.disconnect(); } catch (e) {}
  bgOsc = null;
  bgGain = null;
}

function applySkin(name) {
  document.documentElement.classList.remove('theme-neon', 'theme-retro');
  if (name === 'neon') document.documentElement.classList.add('theme-neon');
  if (name === 'retro') document.documentElement.classList.add('theme-retro');
}

function updateTopTimer() {
  if (!topTimerEl) return;
  if (mode === 'timed') {
    topTimerEl.textContent = `剩余: ${timeLeft}s`;
  } else {
    topTimerEl.textContent = '无限';
  }
}

function startTimer(initial = true) {
  if (timerInterval) clearInterval(timerInterval);
  if (initial) {
    timeLeft = Number(timeSelect.value) || timeLimit;
  }
  updateTopTimer();
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    updateTopTimer();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      endGame();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (!topTimerEl) return;
  if (mode === 'timed') {
    topTimerEl.textContent = '0s';
  } else {
    topTimerEl.textContent = '无限';
  }
}

function applySettings() {
  mode = modeSelect.value;
  difficulty = difficultySelect.value;
  soundOn = soundToggle.checked;
  applySkin(skinSelect.value);
  if (mode === 'timed') {
    timeOpts.classList.remove('hidden');
  } else {
    timeOpts.classList.add('hidden');
  }
  // update top timer display according to mode
  updateTopTimer();
}

// Attach simple listeners to update settings
if (skinSelect) skinSelect.addEventListener('change', () => applySkin(skinSelect.value));
if (modeSelect) modeSelect.addEventListener('change', () => { applySettings(); });
if (difficultySelect) difficultySelect.addEventListener('change', () => { applySettings(); resetGame(); draw(); });
if (soundToggle) soundToggle.addEventListener('change', () => { soundOn = soundToggle.checked; if (!soundOn) stopBackgroundMusic(); });
if (timeSelect) timeSelect.addEventListener('change', () => { timeLimit = Number(timeSelect.value); });

applySettings();

function loadBestScore() {
  const savedValue = Number(window.localStorage.getItem(storageKey) || '0');
  bestScore = Number.isFinite(savedValue) ? savedValue : 0;
  bestScoreEl.textContent = String(bestScore);
}

function randomFoodPosition() {
  let pos;
  do {
    pos = {
      x: Math.floor(Math.random() * tileCount),
      y: Math.floor(Math.random() * tileCount),
    };
  } while (snake.some((segment) => segment.x === pos.x && segment.y === pos.y));
  return pos;
}

function resetGame() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  food = randomFoodPosition();
  score = 0;
  // Apply difficulty base delay
  const cfg = difficultyConfig[difficulty] || difficultyConfig.normal;
  stepDelay = Math.round(initialSpeed * cfg.delayFactor);
  isGameOver = false;
  scoreEl.textContent = '0';
  overlay.classList.add('hidden');
  statusText.textContent = '游戏中';
  // Timer UI - top timer
  if (mode === 'timed') {
    timeLeft = Number(timeSelect.value || timeLimit);
    updateTopTimer();
  } else {
    if (topTimerEl) topTimerEl.textContent = '无限';
  }
}

function updateBestScore() {
  if (score > bestScore) {
    bestScore = score;
    window.localStorage.setItem(storageKey, String(bestScore));
    bestScoreEl.textContent = String(bestScore);
  }
}

function pauseGame() {
  if (!isRunning) return;
  isRunning = false;
  isPaused = true;
  cancelAnimationFrame(gameLoopId);
  gameLoopId = null;
  // pause timer but keep timeLeft
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  // pause audio element if present
  const bgAudio = document.getElementById('bg-audio');
  if (bgAudio && !bgAudio.paused) try { bgAudio.pause(); } catch (e) {}
  overlay.classList.remove('hidden');
  statusText.textContent = '已暂停';
  if (pauseBtn) pauseBtn.textContent = '继续';
  // keep time selection disabled during pause
}

function resumeGame() {
  if (!isPaused) return;
  isPaused = false;
  isRunning = true;
  overlay.classList.add('hidden');
  statusText.textContent = '游戏中';
  if (mode === 'timed') {
    startTimer(false); // resume without resetting timeLeft
  }
  // resume background audio if available
  const bgAudio = document.getElementById('bg-audio');
  if (bgAudio && soundOn) {
    try { bgAudio.play().catch(()=>{}); } catch(e){}
  }
  if (pauseBtn) pauseBtn.textContent = '暂停';
  if (!gameLoopId) gameLoopId = requestAnimationFrame(gameLoop);
}

// Pause button handler
if (pauseBtn) {
  pauseBtn.addEventListener('click', () => {
    if (isPaused) {
      resumeGame();
    } else {
      pauseGame();
    }
  });
}

// Restart button handler
if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    // start a new round regardless of current state
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
    resetGame();
    startGame();
  });
}

function setDirection(newDir) {
  const isOpposite =
    newDir.x === -direction.x && newDir.y === -direction.y;

  if (!isOpposite) {
    nextDirection = newDir;
  }
}

function handleKeydown(event) {
  const keyMap = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    d: { x: 1, y: 0 },
  };

  const dir = keyMap[event.key] || keyMap[event.key.toLowerCase()];
  if (dir) {
    event.preventDefault();
    setDirection(dir);
    if (!isRunning && !isGameOver) {
      startGame();
    }
  }

  if (event.code === 'Space') {
    event.preventDefault();
    if (!isRunning) {
      startGame();
    }
  }
}

function startGame() {
  if (isGameOver) {
    resetGame();
  }

  // Ensure audio context is available after a user gesture
  ensureAudio();
  const bgAudio = document.getElementById('bg-audio');
  if (soundOn) startBackgroundMusic();
  if (bgAudio && soundOn) {
    // try to play; browsers require user gesture (start button) - handled elsewhere
    try { bgAudio.play().catch(()=>{}); } catch(e){}
  }

  isRunning = true;
  isPaused = false;
  // disable changing time during an active round
  if (timeSelect) timeSelect.disabled = true;

  lastTime = 0;
  overlay.classList.add('hidden');
  statusText.textContent = '游戏中';
  if (mode === 'timed') {
    startTimer(true);
  } else {
    if (topTimerEl) topTimerEl.textContent = '无限';
  }
  // enable pause button
  if (pauseBtn) { pauseBtn.disabled = false; pauseBtn.textContent = '暂停'; }

  if (!gameLoopId) {
    gameLoopId = requestAnimationFrame(gameLoop);
  }
}

function endGame() {
  isRunning = false;
  isGameOver = true;
  isPaused = false;
  updateBestScore();
  statusText.textContent = '游戏结束';
  overlay.classList.remove('hidden');
  cancelAnimationFrame(gameLoopId);
  gameLoopId = null;
  stopTimer();
  stopBackgroundMusic();
  if (soundOn) playBeep(120, 0.25, 0.12);
  // re-enable time selection after round
  if (timeSelect) timeSelect.disabled = false;
  if (pauseBtn) pauseBtn.disabled = true;
}

function moveSnake() {
  direction = nextDirection;
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  const hitWall =
    head.x < 0 ||
    head.x >= tileCount ||
    head.y < 0 ||
    head.y >= tileCount;

  const ateFood = head.x === food.x && head.y === food.y;
  const bodyToCheck = ateFood ? snake : snake.slice(0, -1);
  const hitSelf = bodyToCheck.some((segment) => segment.x === head.x && segment.y === head.y);

  if (hitWall || hitSelf) {
    endGame();
    return;
  }

  snake.unshift(head);

  if (ateFood) {
    score += 1;
    scoreEl.textContent = String(score);
    const cfg = difficultyConfig[difficulty] || difficultyConfig.normal;
    stepDelay = Math.max(maxSpeed, stepDelay - cfg.speedStep);
    // spawn particles at food pixel position
    const px = (food.x + 0.5) * gridSize;
    const py = (food.y + 0.5) * gridSize;
    const cs = getComputedStyle(document.documentElement);
    const fcol = (cs.getPropertyValue('--food') || '#f59e0b').trim();
    spawnParticles(px, py, fcol);

    // attempt to use bg audio element when provided
    if (soundOn) {
      playBeep(900 - Math.min(600, score * 12), 0.08, 0.09);
      const bgAudio = document.getElementById('bg-audio');
      if (bgAudio && bgAudio.paused) {
        // don't force-play; only attempt to resume if already unlocked
        try { bgAudio.play().catch(()=>{}); } catch(e){}
      }
    }

    food = randomFoodPosition();
  } else {
    snake.pop();
  }
}

function drawCell(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * gridSize, y * gridSize, gridSize, gridSize);
}

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < tileCount; row += 1) {
    for (let col = 0; col < tileCount; col += 1) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#111827' : '#0f172a';
      ctx.fillRect(col * gridSize, row * gridSize, gridSize, gridSize);
    }
  }
}

function drawFood() {
  const cs = getComputedStyle(document.documentElement);
  const foodColor = (cs.getPropertyValue('--food') || '#f59e0b').trim();
  ctx.beginPath();
  ctx.arc((food.x + 0.5) * gridSize, (food.y + 0.5) * gridSize, gridSize * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = foodColor;
  ctx.fill();
  ctx.closePath();
}

// Particle system for eat effect
const particles = [];
function spawnParticles(px, py, color) {
  const count = 18;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.6 + Math.random() * 2.2;
    particles.push({
      x: px,
      y: py,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 40 + Math.random() * 30,
      size: 1 + Math.random() * 3,
      color,
    });
  }
}

function updateAndDrawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.06; // gravity
    p.life -= 1;
    const alpha = Math.max(0, p.life / 70);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color || '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
    ctx.globalAlpha = 1;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function lerpColor(a, b, amount) {
  const ah = a.replace('#', '');
  const bh = b.replace('#', '');
  const ar = parseInt(ah.substring(0, 2), 16);
  const ag = parseInt(ah.substring(2, 4), 16);
  const ab = parseInt(ah.substring(4, 6), 16);
  const br = parseInt(bh.substring(0, 2), 16);
  const bg = parseInt(bh.substring(2, 4), 16);
  const bb = parseInt(bh.substring(4, 6), 16);
  const rr = Math.round(ar + (br - ar) * amount);
  const gg = Math.round(ag + (bg - ag) * amount);
  const bbv = Math.round(ab + (bb - ab) * amount);
  return '#' + rr.toString(16).padStart(2, '0') + gg.toString(16).padStart(2, '0') + bbv.toString(16).padStart(2, '0');
}

function drawSnake() {
  const cs = getComputedStyle(document.documentElement);
  const headColor = (cs.getPropertyValue('--snake-head') || '#10b981').trim();
  const bodyColor = (cs.getPropertyValue('--snake') || '#34d399').trim();

  // draw body with gradient tail
  for (let i = snake.length - 1; i >= 0; i--) {
    const segment = snake[i];
    if (i === 0) continue; // head drawn later
    const t = i / Math.max(1, snake.length - 1);
    const color = lerpColor(bodyColor, headColor, 1 - t * 0.6);
    drawCell(segment.x, segment.y, color);
  }

  // draw head as square (same cell style as body but using headColor)
  const head = snake[0];
  drawCell(head.x, head.y, headColor);
}

function draw() {
  drawGrid();
  drawFood();
  drawSnake();
  updateAndDrawParticles();
}

function gameLoop(timestamp) {
  if (!isRunning) {
    return;
  }

  if (timestamp - lastTime >= stepDelay) {
    lastTime = timestamp;
    moveSnake();
    draw();
    if (!isRunning) {
      return;
    }
  }

  gameLoopId = requestAnimationFrame(gameLoop);
}

startBtn.addEventListener('click', () => {
  if (isRunning) {
    return;
  }
  // Try to unlock audio and <audio> element on first user gesture
  ensureAudio();
  const bgAudio = document.getElementById('bg-audio');
  if (bgAudio && soundOn) {
    bgAudio.volume = 0.18;
    bgAudio.play().catch(()=>{});
  }
  startGame();
});


// Touch swipe support
let touchStartX = 0;
let touchStartY = 0;
let touchActive = false;

canvas.addEventListener('touchstart', (e) => {
  if (!e.touches || e.touches.length === 0) return;
  touchActive = true;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
});
canvas.addEventListener('touchmove', (e) => {
  // prevent page scrolling while playing
  if (touchActive) e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
  if (!touchActive) return;
  touchActive = false;
  const touch = e.changedTouches && e.changedTouches[0];
  if (!touch) return;
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  const absX = Math.abs(dx), absY = Math.abs(dy);
  const threshold = 30; // px
  if (Math.max(absX, absY) < threshold) return;
  let dir = null;
  if (absX > absY) {
    dir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  } else {
    dir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }
  if (dir) {
    setDirection(dir);
    if (!isRunning && !isGameOver) startGame();
  }
});

dirButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const map = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };

    const next = map[button.dataset.direction];
    if (next) {
      setDirection(next);
      if (!isRunning && !isGameOver) {
        startGame();
      }
    }
  });
});

document.addEventListener('keydown', handleKeydown);

loadBestScore();
resetGame();
draw();
