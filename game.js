// ---------------- MATRIX RAIN BACKGROUND ----------------
const starCanvas = document.getElementById('stars');
const ctx = starCanvas.getContext('2d');
let bgWidth, bgHeight;
let drops = [];
const rainChars = '01アイウエオカキクケコサシスセソABCDEFGH0123456789';

function resizeCanvas() {
  starCanvas.width = window.innerWidth;
  starCanvas.height = window.innerHeight;
  bgWidth = starCanvas.width;
  bgHeight = starCanvas.height;
  const columns = Math.floor(bgWidth / 20);
  drops = Array.from({ length: columns }, () => Math.random() * -bgHeight / 20);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let rainFrameCount = 0;

function drawRain() {
  ctx.fillStyle = 'rgba(0, 5, 3, 0.08)';
  ctx.fillRect(0, 0, bgWidth, bgHeight);

  rainFrameCount++;
  if (rainFrameCount % 3 !== 0) return;

  ctx.font = '15px monospace';
  for (let i = 0; i < drops.length; i++) {
    const char = rainChars[Math.floor(Math.random() * rainChars.length)];
    const x = i * 20;
    const y = drops[i] * 20;

    ctx.fillStyle = 'rgba(0, 255, 136, 0.45)';
    ctx.fillText(char, x, y);

    if (y > bgHeight && Math.random() > 0.985) {
      drops[i] = 0;
    }
    drops[i]++;
  }
}

function animateBackground() {
  drawRain();
  requestAnimationFrame(animateBackground);
}
animateBackground();

// ---------------- SOUND ----------------
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let soundEnabled = true;

function playTone(freq, duration, type = 'sine', volume = 0.15) {
  if (!soundEnabled) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

function playHitSound() { playTone(180, 0.3, 'sawtooth', 0.2); }
function playMissSound() { playTone(600, 0.15, 'sine', 0.12); }
function playSinkSound() {
  [300, 200, 100].forEach((f, i) => setTimeout(() => playTone(f, 0.3, 'triangle', 0.2), i * 120));
}
function playWinSound() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => playTone(f, 0.25, 'triangle', 0.2), i * 150));
}

// ---------------- GAME CONSTANTS ----------------
const SIZE = 8;
const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

let playerName = "Commander";
let player2Name = "Opponent";
let aiDifficulty = 'medium';
let gameMode = 'ai'; // 'ai' or 'online'
let currentTurn = 1;

let playerGrid, enemyGrid;
let playerShips, enemyShips;
let placementOrientation = 'horizontal';
let placementShipIndex = 0;
let placementCells = [];

let moveCount = 0;
let gameSeconds = 0;
let timerInterval = null;
let gameActive = true;
let aiTargetQueue = [];
let aiLastHit = null;

// ---------------- DOM ----------------
const startScreen = document.getElementById('start-screen');
const modeScreen = document.getElementById('mode-screen');
const difficultyScreen = document.getElementById('difficulty-screen');
const nameScreen = document.getElementById('name-screen');
const nameScreen2p = document.getElementById('name-screen-2p');
const placementScreen = document.getElementById('placement-screen');
const placementScreenP2 = document.getElementById('placement-screen-p2');
const appEl = document.getElementById('app');

const placementBoardEl = document.getElementById('placement-board');
const placementHintEl = document.getElementById('placement-hint');
const confirmPlacementBtn = document.getElementById('confirm-placement-btn');

const enemyBoardEl = document.getElementById('enemy-board');
const ownBoardEl = document.getElementById('own-board');
const enemyFleetStatusEl = document.getElementById('enemy-fleet-status');
const ownFleetStatusEl = document.getElementById('own-fleet-status');
const turnIndicator = document.getElementById('turn-indicator');
const winnerOverlay = document.getElementById('winner-overlay');
const winnerText = document.getElementById('winner-text');
const winnerScore = document.getElementById('winner-score');

const moveCounterEl = document.getElementById('move-counter');
const gameTimerEl = document.getElementById('game-timer');
const soundToggleBtn = document.getElementById('sound-toggle-btn');

function showScreen(el) {
  [startScreen, modeScreen, difficultyScreen, nameScreen,
   placementScreen, appEl,
   document.getElementById('online-screen'),
   document.getElementById('join-screen'),
   document.getElementById('waiting-screen'),
   document.getElementById('waiting-placement-screen'),
  ].filter(Boolean).forEach(s => s.classList.add('hidden'));
  el.classList.remove('hidden');
}

// ---------------- STATS ----------------
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer() {
  clearInterval(timerInterval);
  gameSeconds = 0;
  gameTimerEl.textContent = formatTime(gameSeconds);
  timerInterval = setInterval(() => {
    gameSeconds++;
    gameTimerEl.textContent = formatTime(gameSeconds);
  }, 1000);
}
function stopTimer() { clearInterval(timerInterval); }

function resetMoveCounter() {
  moveCount = 0;
  moveCounterEl.textContent = moveCount;
}
function incrementMoveCounter() {
  moveCount++;
  moveCounterEl.textContent = moveCount;
}

soundToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
  soundToggleBtn.classList.toggle('muted', !soundEnabled);
});

// ---------------- GRID HELPERS ----------------
function createEmptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function canPlaceShip(grid, row, col, size, orientation) {
  for (let i = 0; i < size; i++) {
    const r = orientation === 'horizontal' ? row : row + i;
    const c = orientation === 'horizontal' ? col + i : col;
    if (!inBounds(r, c)) return false;
    if (grid[r][c]) return false;
  }
  return true;
}

function placeShip(grid, row, col, size, orientation, shipId) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const r = orientation === 'horizontal' ? row : row + i;
    const c = orientation === 'horizontal' ? col + i : col;
    grid[r][c] = { shipId, hit: false };
    cells.push([r, c]);
  }
  return cells;
}

function randomPlaceAllShips(grid) {
  const ships = [];
  for (let s = 0; s < SHIPS.length; s++) {
    let placed = false;
    while (!placed) {
      const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const row = Math.floor(Math.random() * SIZE);
      const col = Math.floor(Math.random() * SIZE);
      if (canPlaceShip(grid, row, col, SHIPS[s].size, orientation)) {
        const cells = placeShip(grid, row, col, SHIPS[s].size, orientation, s);
        ships.push({ ...SHIPS[s], id: s, cells, hits: 0, sunk: false });
        placed = true;
      }
    }
  }
  return ships;
}

// ---------------- PLACEMENT SCREEN (MANUAL) ----------------
function renderPlacementBoard() {
  placementBoardEl.innerHTML = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cellEl = document.createElement('div');
      cellEl.className = 'radar-cell';
      if (playerGrid[r][c]) cellEl.classList.add('ship');
      cellEl.addEventListener('click', () => tryPlaceAtCell(r, c));
      cellEl.addEventListener('mouseenter', () => previewPlacement(r, c));
      cellEl.addEventListener('mouseleave', () => renderPlacementBoard());
      placementBoardEl.appendChild(cellEl);
    }
  }
}

function previewPlacement(row, col) {
  if (placementShipIndex >= SHIPS.length) return;
  const ship = SHIPS[placementShipIndex];
  const valid = canPlaceShip(playerGrid, row, col, ship.size, placementOrientation);
  const cells = placementBoardEl.querySelectorAll('.radar-cell');
  for (let i = 0; i < ship.size; i++) {
    const r = placementOrientation === 'horizontal' ? row : row + i;
    const c = placementOrientation === 'horizontal' ? col + i : col;
    if (inBounds(r, c)) {
      const idx = r * SIZE + c;
      cells[idx].style.background = valid ? '#1e6b3d' : '#6b1e1e';
    }
  }
}

function tryPlaceAtCell(row, col) {
  if (placementShipIndex >= SHIPS.length) return;
  const ship = SHIPS[placementShipIndex];
  if (!canPlaceShip(playerGrid, row, col, ship.size, placementOrientation)) return;

  const cells = placeShip(playerGrid, row, col, ship.size, placementOrientation, placementShipIndex);
  playerShips.push({ ...ship, id: placementShipIndex, cells, hits: 0, sunk: false });
  placementShipIndex++;

  if (placementShipIndex < SHIPS.length) {
    placementHintEl.textContent = `Placing: ${SHIPS[placementShipIndex].name} (${SHIPS[placementShipIndex].size} cells)`;
  } else {
    placementHintEl.textContent = '✅ All ships deployed! Confirm to start battle.';
    confirmPlacementBtn.disabled = false;
  }
  renderPlacementBoard();
}

document.getElementById('rotate-btn').addEventListener('click', () => {
  placementOrientation = placementOrientation === 'horizontal' ? 'vertical' : 'horizontal';
});

document.getElementById('random-place-btn').addEventListener('click', () => {
  playerGrid = createEmptyGrid();
  playerShips = randomPlaceAllShips(playerGrid);
  placementShipIndex = SHIPS.length;
  placementHintEl.textContent = '✅ All ships auto-deployed! Confirm to start battle.';
  confirmPlacementBtn.disabled = false;
  renderPlacementBoard();
});

// (confirm-placement-btn listener is in SCREEN NAVIGATION section below)

// ---------------- BATTLE LOGIC ----------------
function beginBattle() {
  enemyGrid = createEmptyGrid();
  enemyShips = randomPlaceAllShips(enemyGrid);
  gameActive = true;
  currentTurn = 1;
  aiTargetQueue = [];
  aiLastHit = null;
  resetMoveCounter();
  startTimer();
  updateTurnIndicator(true);
  renderBattleBoards();
}

function getShipById(ships, id) {
  return ships.find(s => s.id === id);
}

function fireAt(grid, ships, row, col) {
  const cell = grid[row][col];
  if (cell === 'miss' || (cell && cell.hit)) return null; // already fired here

  if (cell === null) {
    grid[row][col] = 'miss';
    return { result: 'miss' };
  }

  cell.hit = true;
  const ship = getShipById(ships, cell.shipId);
  ship.hits++;
  if (ship.hits >= ship.size) ship.sunk = true;
  return { result: 'hit', sunk: ship.sunk, shipName: ship.name };
}

function isAllSunk(ships) {
  return ships.every(s => s.sunk);
}

function playerFire(row, col) {
  if (!gameActive) return;

  if (gameMode === 'online') {
    if (!onlineMyTurn) return;
    const existing = enemyGrid[row][col];
    if (existing === 'miss' || (existing && existing.hit)) return;
    onlineMyTurn = false;
    turnIndicator.textContent = `⏳ Waiting for result...`;
    sendOnlineMessage({ type: 'fire', row, col });
    return;
  }

  const existing = enemyGrid[row][col];
  if (existing === 'miss' || (existing && existing.hit)) return;

  const outcome = fireAt(enemyGrid, enemyShips, row, col);
  if (!outcome) return;

  incrementMoveCounter();

  if (outcome.result === 'hit') {
    playHitSound();
    if (outcome.sunk) {
      playSinkSound();
      setTimeout(() => showToast(`💥 Enemy ${outcome.shipName} sunk!`), 100);
    }
  } else {
    playMissSound();
  }

  renderBattleBoards();

  if (isAllSunk(enemyShips)) {
    gameActive = false;
    setTimeout(() => endGame(true), 500);
    return;
  }

  gameActive = false;
  updateTurnIndicator(false);
  setTimeout(aiTurn, 700);
}

function aiTurn() {
  if (!gameActive) return;
  let row, col;

  // Drain queue of already-fired cells
  while (aiTargetQueue.length > 0) {
    const [r, c] = aiTargetQueue[0];
    if (playerGrid[r][c] !== 'miss' && !(playerGrid[r][c] && playerGrid[r][c].hit)) break;
    aiTargetQueue.shift();
  }

  if (aiTargetQueue.length > 0) {
    [row, col] = aiTargetQueue.shift();
  } else {
    // Build list of all valid unfired cells
    const unfired = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (playerGrid[r][c] !== 'miss' && !(playerGrid[r][c] && playerGrid[r][c].hit)) {
          unfired.push([r, c]);
        }
      }
    }
    if (unfired.length === 0) return; // no moves left

    if (aiDifficulty === 'hard') {
      // Checkerboard: prefer cells where (r+c) % 2 === 0
      const checker = unfired.filter(([r, c]) => (r + c) % 2 === 0);
      const pool = checker.length > 0 ? checker : unfired;
      [row, col] = pool[Math.floor(Math.random() * pool.length)];
    } else {
      [row, col] = unfired[Math.floor(Math.random() * unfired.length)];
    }
  }

  const outcome = fireAt(playerGrid, playerShips, row, col);
  if (!outcome) {
    // Cell was already fired (race condition) — just move on
    gameActive = true;
    updateTurnIndicator(true);
    return;
  }

  if (outcome.result === 'hit') {
    playHitSound();
    if (outcome.sunk) {
      playSinkSound();
      showToast(`⚠️ Your ${outcome.shipName} was sunk!`);
      aiTargetQueue = [];
      aiLastHit = null;
    } else if (aiDifficulty !== 'easy') {
      if (aiLastHit !== null && aiDifficulty === 'hard') {
        // Direction locking: continue along hit axis, also try reverse
        const dr = row - aiLastHit[0];
        const dc = col - aiLastHit[1];
        aiTargetQueue = [];
        if (dr !== 0 || dc !== 0) {
          const fwd = [row + dr, col + dc];
          const bck = [aiLastHit[0] - dr, aiLastHit[1] - dc];
          if (inBounds(fwd[0], fwd[1]) && playerGrid[fwd[0]][fwd[1]] !== 'miss' && !(playerGrid[fwd[0]][fwd[1]] && playerGrid[fwd[0]][fwd[1]].hit))
            aiTargetQueue.push(fwd);
          if (inBounds(bck[0], bck[1]) && playerGrid[bck[0]][bck[1]] !== 'miss' && !(playerGrid[bck[0]][bck[1]] && playerGrid[bck[0]][bck[1]].hit))
            aiTargetQueue.push(bck);
        }
        // fallback: if queue still empty, add all neighbors
        if (aiTargetQueue.length === 0) {
          for (const [nr, nc] of [[row-1,col],[row+1,col],[row,col-1],[row,col+1]]) {
            if (inBounds(nr, nc) && playerGrid[nr][nc] !== 'miss' && !(playerGrid[nr][nc] && playerGrid[nr][nc].hit))
              aiTargetQueue.push([nr, nc]);
          }
        }
      } else {
        // First hit on this ship: queue all 4 neighbors
        for (const [nr, nc] of [[row-1,col],[row+1,col],[row,col-1],[row,col+1]]) {
          if (inBounds(nr, nc) && playerGrid[nr][nc] !== 'miss' && !(playerGrid[nr][nc] && playerGrid[nr][nc].hit))
            aiTargetQueue.push([nr, nc]);
        }
      }
      aiLastHit = [row, col];
    }
  } else {
    playMissSound();
  }

  renderBattleBoards();

  if (isAllSunk(playerShips)) {
    gameActive = false;
    setTimeout(() => endGame(false), 500);
    return;
  }

  gameActive = true;
  updateTurnIndicator(true);
}

function updateTurnIndicator(isPlayerTurn) {
  if (gameMode === 'online') {
    turnIndicator.textContent = isPlayerTurn
      ? `${playerName}'s Turn — Fire at Enemy Waters`
      : `⏳ ${player2Name}'s Turn`;
  } else {
    turnIndicator.textContent = isPlayerTurn
      ? `${playerName}'s Turn — Fire at Enemy Waters`
      : `AI Commander is targeting...`;
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'skip-toast';
  toast.textContent = msg;
  toast.style.position = 'fixed';
  toast.style.top = '20px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.background = '#0a1810';
  toast.style.border = '1px solid #00ff8855';
  toast.style.color = '#7dffc0';
  toast.style.padding = '10px 20px';
  toast.style.borderRadius = '8px';
  toast.style.fontSize = '0.85rem';
  toast.style.fontWeight = '600';
  toast.style.zIndex = '30';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function renderFleetStatus(ships, el) {
  el.innerHTML = '';
  for (const ship of ships) {
    const span = document.createElement('span');
    span.textContent = `${ship.name} (${ship.size})`;
    if (ship.sunk) span.classList.add('sunk-ship');
    el.appendChild(span);
  }
}

function renderBattleBoards() {
  if (gameMode === 'online') {
    // Enemy board: show hit/miss tracking of opponent's grid
    enemyBoardEl.innerHTML = '';
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cellEl = document.createElement('div');
        cellEl.className = 'radar-cell';
        const cell = enemyGrid[r][c];
        if (cell === 'miss') cellEl.classList.add('miss');
        else if (cell && cell.hit) cellEl.classList.add('hit');
        else if (onlineMyTurn && gameActive) {
          cellEl.addEventListener('click', () => playerFire(r, c));
        }
        enemyBoardEl.appendChild(cellEl);
      }
    }

    // Own board: show our ships + hits received
    ownBoardEl.innerHTML = '';
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cellEl = document.createElement('div');
        cellEl.className = 'radar-cell disabled';
        const cell = playerGrid[r][c];
        if (cell === 'miss') cellEl.classList.add('miss');
        else if (cell && cell.hit) {
          const ship = getShipById(playerShips, cell.shipId);
          cellEl.classList.add(ship && ship.sunk ? 'sunk' : 'hit');
        } else if (cell) {
          cellEl.classList.add('ship');
        }
        ownBoardEl.appendChild(cellEl);
      }
    }

    renderFleetStatus([], enemyFleetStatusEl);
    renderFleetStatus(playerShips, ownFleetStatusEl);
    return;
  }

  // enemy/opponent board (hide ships, show only hit/miss)
  enemyBoardEl.innerHTML = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cellEl = document.createElement('div');
      cellEl.className = 'radar-cell';
      const cell = enemyGrid[r][c];
      if (cell === 'miss') cellEl.classList.add('miss');
      else if (cell && cell.hit) {
        const ship = getShipById(enemyShips, cell.shipId);
        cellEl.classList.add(ship.sunk ? 'sunk' : 'hit');
      } else {
        cellEl.addEventListener('click', () => playerFire(r, c));
      }
      enemyBoardEl.appendChild(cellEl);
    }
  }

  // own board (show ships + hits taken)
  ownBoardEl.innerHTML = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cellEl = document.createElement('div');
      cellEl.className = 'radar-cell disabled';
      const cell = playerGrid[r][c];
      if (cell === 'miss') cellEl.classList.add('miss');
      else if (cell && cell.hit) {
        const ship = getShipById(playerShips, cell.shipId);
        cellEl.classList.add(ship.sunk ? 'sunk' : 'hit');
      } else if (cell) {
        cellEl.classList.add('ship');
      }
      ownBoardEl.appendChild(cellEl);
    }
  }

  renderFleetStatus(enemyShips, enemyFleetStatusEl);
  renderFleetStatus(playerShips, ownFleetStatusEl);
}

function endGame(playerWon) {
  stopTimer();
  if (gameMode === 'online') {
    winnerText.textContent = playerWon ? `🏆 ${playerName} Wins!` : `💀 ${player2Name} Wins!`;
  } else {
    winnerText.textContent = playerWon ? `🏆 ${playerName} Wins!` : `💀 AI Commander Wins!`;
  }
  winnerScore.textContent = `${moveCount} shots fired · ${formatTime(gameSeconds)}`;
  winnerOverlay.classList.remove('hidden');
  if (playerWon) playWinSound();
}

function newGame() {
  stopTimer();
  gameActive = false;
  playerGrid = createEmptyGrid();
  playerShips = [];
  enemyGrid = createEmptyGrid();
  enemyShips = [];
  aiTargetQueue = [];
  aiLastHit = null;
  placementShipIndex = 0;
  placementOrientation = 'horizontal';
  iAmReady = false;
  opponentReady = false;
  confirmPlacementBtn.disabled = true;
  document.getElementById('placement-title').textContent =
    gameMode === 'online' ? `🚢 ${playerName} — Deploy Your Fleet` : '🚢 Deploy Your Fleet';
  placementHintEl.textContent = `Placing: ${SHIPS[0].name} (${SHIPS[0].size} cells)`;
  winnerOverlay.classList.add('hidden');
  showScreen(placementScreen);
  renderPlacementBoard();
}

// ---------------- HOW-TO-PLAY MINI DEMO ----------------
const demoBoardEl = document.getElementById('demo-board');
const demoCaptionEl = document.getElementById('demo-caption');
let demoInterval = null;

function renderDemoBoard(state) {
  demoBoardEl.innerHTML = '';
  state.forEach((cell) => {
    const cellEl = document.createElement('div');
    cellEl.className = 'demo-cell';
    if (cell === 'ship') cellEl.style.background = '#1e6b3d';
    if (cell === 'hit') cellEl.textContent = '🔥';
    if (cell === 'miss') { cellEl.textContent = '•'; cellEl.style.color = '#4fa8ff'; }
    demoBoardEl.appendChild(cellEl);
  });
}

function playDemoAnimation() {
  const step0 = [null,null,null,null, 'ship','ship','ship',null, null,null,null,null, null,null,null,null];
  const step1 = [null,null,null,null, 'hit','ship','ship',null, null,null,null,null, null,null,null,null];
  const step2 = [null,null,null,null, 'hit','hit','ship',null, null,null,null,null, null,null,null,null];
  const step3 = [null,null,null,null, 'hit','hit','hit',null, null,null,null,null, null,null,null,null];
  const step4 = [null,'miss',null,null, 'hit','hit','hit',null, null,null,null,null, null,null,null,null];

  const steps = [
    { board: step0, caption: '① Enemy ship hidden on the grid' },
    { board: step1, caption: '② You fire — 🔥 Hit!' },
    { board: step2, caption: '③ Keep firing at adjacent cells' },
    { board: step3, caption: '④ All cells hit — Ship sunk! 💥' },
    { board: step4, caption: '⑤ Some shots miss — 💧 Miss' },
  ];

  let step = 0;
  clearInterval(demoInterval);
  function runStep() {
    const current = steps[step % steps.length];
    renderDemoBoard(current.board);
    demoCaptionEl.textContent = current.caption;
    step++;
  }
  runStep();
  demoInterval = setInterval(runStep, 1000);
}

// ---------------- SCREEN NAVIGATION ----------------
const onlineScreen = document.getElementById('online-screen');
const joinScreen = document.getElementById('join-screen');
const waitingScreen = document.getElementById('waiting-screen');
const waitingPlacementScreen = document.getElementById('waiting-placement-screen');

document.getElementById('start-btn').addEventListener('click', () => showScreen(modeScreen));
document.getElementById('back-to-start-btn').addEventListener('click', () => showScreen(startScreen));

// AI mode
document.getElementById('mode-ai-btn').addEventListener('click', () => {
  gameMode = 'ai';
  showScreen(difficultyScreen);
});
document.getElementById('back-to-mode-from-diff-btn').addEventListener('click', () => showScreen(modeScreen));

function selectDifficulty(diff) {
  aiDifficulty = diff;
  showScreen(nameScreen);
}
document.getElementById('diff-easy-btn').addEventListener('click', () => selectDifficulty('easy'));
document.getElementById('diff-medium-btn').addEventListener('click', () => selectDifficulty('medium'));
document.getElementById('diff-hard-btn').addEventListener('click', () => selectDifficulty('hard'));

document.getElementById('back-to-mode-btn').addEventListener('click', () => showScreen(modeScreen));

document.getElementById('confirm-names-btn').addEventListener('click', () => {
  playerName = document.getElementById('player1-name').value.trim() || "Commander";
  newGame();
});

// Online mode
document.getElementById('mode-online-btn').addEventListener('click', () => {
  gameMode = 'online';
  showScreen(onlineScreen);
});
document.getElementById('back-to-mode-from-online-btn').addEventListener('click', () => showScreen(modeScreen));

document.getElementById('create-room-btn').addEventListener('click', () => {
  playerName = document.getElementById('online-name').value.trim() || "Commander";
  onlineRole = 'host';
  createOnlineRoom();
});

document.getElementById('join-room-btn').addEventListener('click', () => {
  playerName = document.getElementById('online-name').value.trim() || "Commander";
  onlineRole = 'joiner';
  showScreen(joinScreen);
});

document.getElementById('back-to-online-btn').addEventListener('click', () => showScreen(onlineScreen));

document.getElementById('confirm-join-btn').addEventListener('click', () => {
  const code = document.getElementById('room-code-input').value.trim();
  if (!code) return;
  joinOnlineRoom(code);
});

document.getElementById('copy-code-btn').addEventListener('click', () => {
  const code = document.getElementById('room-code-display').textContent;
  navigator.clipboard.writeText(code).then(() => showToast('📋 Room code copied!'));
});

// Placement confirm
document.getElementById('confirm-placement-btn').addEventListener('click', () => {
  if (gameMode === 'online') {
    onlinePlacementDone();
  } else {
    showScreen(appEl);
    beginBattle();
  }
});

document.getElementById('new-game-btn').addEventListener('click', () => {
  if (peer) { peer.destroy(); peer = null; conn = null; }
  showScreen(modeScreen);
});
document.getElementById('play-again-btn').addEventListener('click', () => {
  if (peer) { peer.destroy(); peer = null; conn = null; }
  showScreen(modeScreen);
});

document.getElementById('how-to-play-btn').addEventListener('click', () => {
  document.getElementById('how-to-play-modal').classList.remove('hidden');
  playDemoAnimation();
});
document.getElementById('close-modal-btn').addEventListener('click', () => {
  document.getElementById('how-to-play-modal').classList.add('hidden');
  clearInterval(demoInterval);
});

// ---------------- PEERJS ONLINE MULTIPLAYER ----------------
let peer = null;
let conn = null;
let onlineRole = 'host'; // 'host' or 'joiner'
let onlineMyTurn = false;
let opponentReady = false;
let iAmReady = false;

function generateRoomCode() {
  const words = ['ALPHA','BRAVO','DELTA','ECHO','FOXTROT','SIERRA','TANGO','VICTOR','ZULU'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${num}`;
}

function createOnlineRoom() {
  document.getElementById('room-code-display').textContent = '⏳ Getting room code...';
  document.getElementById('waiting-status').textContent = '⏳ Connecting to server...';
  showScreen(waitingScreen);

  peer = new Peer(); // Let PeerJS auto-generate a reliable ID

  peer.on('open', (id) => {
    // Display the auto-generated ID as the room code
    document.getElementById('room-code-display').textContent = id;
    document.getElementById('waiting-status').textContent = '⏳ Waiting for opponent to join...';
    console.log('Room code (peer ID):', id);
  });

  peer.on('connection', (connection) => {
    conn = connection;
    document.getElementById('waiting-status').textContent = '✅ Opponent connected! Deploying fleets...';
    setupConnectionHandlers();
    setTimeout(() => {
      newGame();
    }, 800);
  });

  peer.on('error', (err) => {
    document.getElementById('waiting-status').textContent = '❌ Server error: ' + err.type;
    showToast('⚠️ Connection error: ' + err.type);
  });
}

function joinOnlineRoom(code) {
  const peerId = code.trim();
  document.getElementById('join-status').textContent = '⏳ Connecting...';

  peer = new Peer();

  peer.on('open', () => {
    conn = peer.connect(peerId);

    conn.on('open', () => {
      document.getElementById('join-status').textContent = '✅ Connected!';
      setupConnectionHandlers();
      setTimeout(() => {
        newGame();
      }, 600);
    });

    conn.on('error', () => {
      document.getElementById('join-status').textContent = '❌ Could not connect. Check the code.';
    });
  });

  peer.on('error', (err) => {
    document.getElementById('join-status').textContent = '❌ Connection failed: ' + err.type;
  });
}

function setupConnectionHandlers() {
  conn.on('data', (data) => {
    handleOnlineMessage(data);
  });

  conn.on('close', () => {
    if (gameActive) {
      showToast('⚠️ Opponent disconnected.');
      gameActive = false;
    }
  });
}

function sendOnlineMessage(msg) {
  if (conn && conn.open) {
    conn.send(msg);
  }
}

function onlinePlacementDone() {
  iAmReady = true;
  sendOnlineMessage({ type: 'ready', name: playerName });

  // Host fires first
  onlineMyTurn = (onlineRole === 'host');

  if (opponentReady) {
    startOnlineBattle();
  } else {
    showScreen(waitingPlacementScreen);
  }
}

function startOnlineBattle() {
  showScreen(appEl);
  gameActive = true;
  resetMoveCounter();
  startTimer();
  renderBattleBoards();
  document.getElementById('online-status-bar').textContent =
    `🌐 Online · vs ${player2Name}`;
  updateTurnIndicator(onlineMyTurn);
  if (!onlineMyTurn) {
    turnIndicator.textContent = `⏳ ${player2Name}'s Turn`;
  }
}

function handleOnlineMessage(data) {
  if (data.type === 'ready') {
    player2Name = data.name || "Opponent";
    opponentReady = true;
    if (iAmReady) {
      startOnlineBattle();
    }
  }

  else if (data.type === 'fire') {
    // Opponent fired at my grid — resolve and send result
    const { row, col } = data;
    const outcome = fireAt(playerGrid, playerShips, row, col);
    renderBattleBoards();

    if (outcome.result === 'hit') {
      playHitSound();
      if (outcome.sunk) playSinkSound();
    } else {
      playMissSound();
    }

    const gameOver = isAllSunk(playerShips);
    sendOnlineMessage({
      type: 'fire-result',
      row, col,
      result: outcome.result,
      sunk: outcome.sunk || false,
      shipName: outcome.shipName || null,
      gameOver,
    });

    if (gameOver) {
      gameActive = false;
      setTimeout(() => endGame(false), 400);
    } else {
      onlineMyTurn = true;
      updateTurnIndicator(true);
      renderBattleBoards(); // re-add click listeners now it's my turn
    }
  }

  else if (data.type === 'fire-result') {
    // I fired, got result back — update my enemy board view
    const { row, col, result, sunk, shipName, gameOver } = data;

    // Apply result onto enemyGrid locally for rendering
    if (result === 'hit') {
      // Find or create hit marker on enemyGrid
      if (!enemyGrid[row][col] || enemyGrid[row][col] === null) {
        enemyGrid[row][col] = { hit: true, shipId: -1 };
      } else {
        enemyGrid[row][col].hit = true;
      }
      playHitSound();
      if (sunk) {
        playSinkSound();
        showToast(`💥 Enemy ${shipName} sunk!`);
        // Mark all cells of sunk ship — we'll do it visually via a separate sunk flag
        sendOnlineMessage({ type: 'ack' }); // no-op, just in case
      }
    } else {
      enemyGrid[row][col] = 'miss';
      playMissSound();
    }

    incrementMoveCounter();
    renderBattleBoards();

    if (gameOver) {
      gameActive = false;
      setTimeout(() => endGame(true), 400);
    } else {
      onlineMyTurn = false;
      turnIndicator.textContent = `⏳ ${player2Name}'s Turn`;
    }
  }
}

// ---------------- INIT ----------------
showScreen(startScreen);

// ---------------- RADAR LINE OVERLAY ----------------
function createRadarLineOverlay(boardElement, color) {
  const overlay = document.createElement('canvas');
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '3';
  boardElement.style.position = 'relative';
  boardElement.appendChild(overlay);

  const octx = overlay.getContext('2d');
  let angle = 0;

  function resize() {
    overlay.width = boardElement.clientWidth;
    overlay.height = boardElement.clientHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    const w = overlay.width;
    const h = overlay.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(w, h) * 0.75;
    octx.clearRect(0, 0, w, h);
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);
    const grad = octx.createLinearGradient(cx, cy, x2, y2);
    grad.addColorStop(0, color.bright);
    grad.addColorStop(1, color.fade);
    octx.beginPath();
    octx.moveTo(cx, cy);
    octx.lineTo(x2, y2);
    octx.strokeStyle = grad;
    octx.lineWidth = 1.5;
    octx.stroke();
    octx.beginPath();
    octx.arc(cx, cy, 2, 0, Math.PI * 2);
    octx.fillStyle = color.bright;
    octx.fill();
    angle += 0.032;
    requestAnimationFrame(draw);
  }
  draw();
}

document.addEventListener('DOMContentLoaded', () => {
  const enemyBoard = document.getElementById('enemy-board');
  const ownBoard = document.getElementById('own-board');
  if (enemyBoard) createRadarLineOverlay(enemyBoard, { bright: 'rgba(200, 225, 255, 0.95)', fade: 'rgba(59, 130, 246, 0)' });
  if (ownBoard) createRadarLineOverlay(ownBoard, { bright: 'rgba(180, 255, 220, 0.9)', fade: 'rgba(0, 255, 136, 0)' });
});

function createRadarLineOverlay(boardElement, color) {
  const overlay = document.createElement('canvas');
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '3';
  boardElement.style.position = 'relative';
  boardElement.appendChild(overlay);

  const octx = overlay.getContext('2d');
  let angle = 0;

  function resize() {
    overlay.width = boardElement.clientWidth;
    overlay.height = boardElement.clientHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    const w = overlay.width;
    const h = overlay.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(w, h) * 0.75;

    octx.clearRect(0, 0, w, h);

    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);

    const grad = octx.createLinearGradient(cx, cy, x2, y2);
    grad.addColorStop(0, color.bright);
    grad.addColorStop(1, color.fade);

    octx.beginPath();
    octx.moveTo(cx, cy);
    octx.lineTo(x2, y2);
    octx.strokeStyle = grad;
    octx.lineWidth = 1.5;
    octx.stroke();

    octx.beginPath();
    octx.arc(cx, cy, 2, 0, Math.PI * 2);
    octx.fillStyle = color.bright;
    octx.fill();

    angle += 0.032;
    requestAnimationFrame(draw);
  }
  draw();
}

