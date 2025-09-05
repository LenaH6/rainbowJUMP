// ===== GAME CORE =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// HiDPI scaling to container
function resizeCanvasToContainer() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
window.addEventListener('resize', resizeCanvasToContainer);
resizeCanvasToContainer();

// ===== WORLD STATE =====
let isGameRunning = false;
let boosting = false;
let score = 0;
let cameraY = 0;        // distancia ascendente acumulada
let prevPlayerY = 0;

const PLAYER = {
  x: 180,
  y: 600,
  w: 40,
  h: 40,
  dy: 0,
};

let gravity = 0.42;
let jumpStrength = -10.5;

// Platforms
let platforms = [];
const BASE_PLATFORM_W = 90;
const PLATFORM_H = 12;

// ===== Difficulty (gaps basados en el alcance real del salto) =====
function maxJumpReachPx() {
  // Altura máxima ≈ v^2 / (2*g)
  const v = Math.abs(jumpStrength);      // ej. 10.5
  const g = gravity;                      // ej. 0.42
  return (v * v) / (2 * g);               // ≈ 131 px con valores actuales
}

function getDifficulty() {
  const reach = maxJumpReachPx();         // altura alcanzable con un salto
  const level = Math.floor(score / 300);  // sube cada 300 px

  // Mantén SIEMPRE los gaps por debajo del alcance, con margen de seguridad
  const safeMax = Math.max(90, Math.floor(reach * 0.85)); // 85% del alcance
  const safeMin = Math.max(60, Math.floor(reach * 0.55)); // 55% del alcance

  // Endurecer con el nivel (pero nunca pasar el safeMax)
  const gapMin = Math.max(60, safeMin - level * 4);
  const gapMax = Math.max(gapMin + 10, Math.min(safeMax, safeMax - level * 2));

  // Plataformas más angostas con la altura, pero sin pasarte
  const width = Math.max(55, BASE_PLATFORM_W - level * 6);

  // Móviles: más probabilidad y velocidad, limitados
  const moveProb = Math.min(0.35, 0.08 + level * 0.04);
  const speed = Math.min(2.8, 1.2 + level * 0.25);

  return { level, width, gapMin, gapMax, moveProb, speed };
}


function createInitialPlatforms() {
  platforms = [];
  let y = canvas.clientHeight - 60;
  const { gapMin, gapMax, width } = getDifficulty();
  while (y > -600) {
    spawnPlatformAt(y, width);
    y -= rand(gapMin, gapMax);
  }
}

function spawnPlatformAt(y, widthOpt) {
  const { moveProb, speed, width } = getDifficulty();
  const w = widthOpt || width;

  // Intenta colocar la plataforma en una zona "alcanzable" horizontalmente
  // respecto al jugador actual (mitad de pantalla, zonas centrales).
  const cw = canvas.clientWidth;
  const targetZones = [
    Math.max(10, PLAYER.x - 40),
    Math.min(cw - w - 10, PLAYER.x - 10),
    Math.min(cw - w - 10, PLAYER.x + 10),
    Math.min(cw - w - 10, PLAYER.x + 40),
    (cw - w) * Math.random(), // comodín
  ];
  let x = targetZones[Math.floor(Math.random() * targetZones.length)];
  x = Math.max(0, Math.min(cw - w, x));

  const moving = Math.random() < moveProb;
  const vx = moving ? (Math.random() < 0.5 ? -speed : speed) : 0;
  platforms.push({ x, y, w, h: PLATFORM_H, vx });
}

function maybeSpawnNewTopPlatforms() {
  let topY = Infinity;
  for (const p of platforms) if (p.y < topY) topY = p.y;
  const { gapMin, gapMax, width } = getDifficulty();
  while (topY > -200) {
    const nextY = topY - rand(gapMin, gapMax);
    spawnPlatformAt(nextY, width);
    topY = nextY;
  }
}

function rand(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }

// ===== DRAW =====
function drawPlayer() { ctx.fillStyle = "#5b8cff"; ctx.fillRect(PLAYER.x, PLAYER.y, PLAYER.w, PLAYER.h); }
function drawPlatforms() { ctx.fillStyle = "#40b66b"; for (const p of platforms) ctx.fillRect(p.x, p.y, p.w, p.h); }
function drawBullets() { ctx.fillStyle = "#ff5555"; for (const b of bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI*2); ctx.fill(); } }

// ===== BULLETS (simple) =====
let bullets = [];
function updateBullets() {
  for (const b of bullets) { b.x += b.dx; b.y += b.dy; }
  bullets = bullets.filter(b => b.x>0 && b.x<canvas.clientWidth && b.y>0 && b.y<canvas.clientHeight);
}

// ===== UPDATE LOOP =====
function update() {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  // Horizontal follow con slack en los bordes
{
  const cw = canvas.clientWidth;
  const desiredCenter = desiredCenterXWithSlack(mouseX); // puede ser <0 o >cw
  const currentCenter = PLAYER.x + PLAYER.w/2;
  PLAYER.x += (desiredCenter - currentCenter) * 0.14;

  // Wrap duro cuando cruza completamente
  if (PLAYER.x + PLAYER.w < 0) {
    PLAYER.x = cw - 1; // entrar por la derecha
  } else if (PLAYER.x > cw) {
    PLAYER.x = -PLAYER.w + 1; // entrar por la izquierda
  }
}

  // Vertical
  if (boosting) { PLAYER.dy = -8.0; PLAYER.y += PLAYER.dy; }
  else { PLAYER.y += PLAYER.dy; PLAYER.dy += gravity; }

  // Score by height ascended
  if (!boosting) {
    const mid = canvas.clientHeight * 0.45;
    if (PLAYER.y < mid) {
      const delta = mid - PLAYER.y;
      PLAYER.y = mid;
      for (const p of platforms) p.y += delta;
      for (const b of bullets) b.y += delta;
      cameraY += delta;
      score = Math.max(score, Math.floor(cameraY));
      document.getElementById("score").innerText = "Score: " + score;
      maybeSpawnNewTopPlatforms();
    }
  }

  // Plataformas: movimiento + colisión
  for (const p of platforms) {
    if (p.vx) {
      p.x += p.vx;
      if (p.x <= 0 || p.x + p.w >= canvas.clientWidth) p.vx *= -1;
    }
    // colisión desde arriba (prevY -> y cruza p.y)
    if (!boosting && PLAYER.dy > 0) {
      const prevBottom = prevPlayerY + PLAYER.h;
      const nowBottom  = PLAYER.y + PLAYER.h;
      if (prevBottom <= p.y && nowBottom >= p.y) {
        const overlapX = (PLAYER.x < p.x + p.w) && (PLAYER.x + PLAYER.w > p.x);
        if (overlapX) {
          PLAYER.y = p.y - PLAYER.h;
          PLAYER.dy = jumpStrength;
        }
      }
    }
  }

  // Descartar plataformas por abajo y mantener densidad
  platforms = platforms.filter(p => p.y < canvas.clientHeight + 30);
  maybeSpawnNewTopPlatforms();

  // Actualizar balas
  updateBullets();

  // Game Over
  if (PLAYER.y > canvas.clientHeight + 60) {
    endGame();
    return;
  }

  // DRAW
  drawPlayer();
  drawPlatforms();
  drawBullets();

  prevPlayerY = PLAYER.y;
  if (isGameRunning) requestAnimationFrame(update);
}

// ===== START / END =====
function startGame() {
  resizeCanvasToContainer();
  isGameRunning = true;
  boosting = true;
  score = 0; cameraY = 0;
  PLAYER.x = canvas.clientWidth/2 - PLAYER.w/2;
  PLAYER.y = canvas.clientHeight - 100;
  PLAYER.dy = 0;
  prevPlayerY = PLAYER.y;
  bullets = [];
  createInitialPlatforms();
  setTimeout(()=>{ boosting = false; }, 1000);
  update();
}
window.startGame = startGame;

function endGame() {
  isGameRunning = false;
  if (window.uiState) {
    const s = window.uiState;
    if (score > s.highScore) s.highScore = score;
    const total = s.avgScore * s.games + score;
    s.games += 1;
    s.avgScore = total / s.games;
    s.coins += Math.floor(score / 100);
    s.levelXP += Math.floor(score / 50);
    while (s.levelXP >= 100) { s.levelXP -= 100; s.level += 1; }
    if (typeof window.renderTop === 'function') window.renderTop();
    if (typeof window.saveProgress === 'function') window.saveProgress();
  }
  document.getElementById('game-container').classList.add('hidden');
  document.getElementById('home-screen').classList.remove('hidden');
}

// ===== INPUT + HARD WRAP =====
let mouseX = 200;

// Este helper transforma el mouse en un "objetivo virtual" con slack en bordes
function desiredCenterXWithSlack(rawX) {
  const cw = canvas.clientWidth;
  const slack = 60; // margen virtual para “salirse”
  if (rawX >= cw - 1) return cw + slack;   // empuja a la derecha para que envuelva
  if (rawX <= 1)      return -slack;       // empuja a la izquierda para que envuelva
  return rawX;
}

// Mouse
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
});

// Touch
canvas.addEventListener("touchstart", (e) => {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches[0];
  mouseX = t.clientX - rect.left;
  e.preventDefault();
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches[0];
  mouseX = t.clientX - rect.left;
  e.preventDefault();
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  if (!isGameRunning) return;
  bullets.push({ x: PLAYER.x + PLAYER.w/2, y: PLAYER.y, dx: 0, dy: -8 });
  e.preventDefault();
}, { passive: false });

// Click para disparar
canvas.addEventListener("click", (e) => {
  if (!isGameRunning) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  let bullet = { x: PLAYER.x + PLAYER.w/2, y: PLAYER.y, dx: 0, dy: -8 };
  if (clickX < canvas.clientWidth / 3) { bullet.dx = -5; bullet.dy = -8; }
  else if (clickX > (canvas.clientWidth * 2) / 3) { bullet.dx = 5; bullet.dy = -8; }
  bullets.push(bullet);
});
