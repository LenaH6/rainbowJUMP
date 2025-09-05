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
let boostingTime = 0;
let score = 0;
let cameraY = 0;
let prevPlayerY = 0;

const PLAYER = {
  x: 180,
  y: 600,
  w: 40,
  h: 40,
  dy: 0,
  health: 3,
  invulnerable: 0
};

// Configuración de física mejorada
let gravity = 0.35;
let jumpStrength = -12;
let maxFallSpeed = 15;

// Arrays de elementos del juego
let platforms = [];
let obstacles = [];
let blackHoles = [];
let boosters = [];
let bullets = [];

// Configuraciones
const BASE_PLATFORM_W = 90;
const PLATFORM_H = 12;

// Tipos de plataformas
const PLATFORM_TYPES = {
  NORMAL: 'normal',
  MOVING: 'moving',
  BREAKABLE: 'breakable',
  TRANSPARENT: 'transparent',
  SUPER_JUMP: 'super_jump',
  MINI_JUMP: 'mini_jump'
};

// Tipos de obstáculos
const OBSTACLE_TYPES = {
  ONE_LIFE: 1,
  TWO_LIFE: 2,
  THREE_LIFE: 3
};

// Tipos de boosters
const BOOSTER_TYPES = {
  SHORT: 'short',
  LONG: 'long'
};

// ===== MOVEMENT & INPUT =====
let mouseX = canvas.clientWidth / 2;
let targetX = canvas.clientWidth / 2;
let currentTilt = 0;

// Movimiento mejorado con inclinación
if (window.DeviceOrientationEvent) {
  window.addEventListener("deviceorientation", (e) => {
    const gamma = e.gamma || 0;
    const sensitivity = 8; // Más sensible
    const maxTilt = 30; // Límite de inclinación
    
    // Normalizar la inclinación
    const normalizedTilt = Math.max(-maxTilt, Math.min(maxTilt, gamma));
    currentTilt = (normalizedTilt / maxTilt); // -1 a 1
    
    const cw = canvas.clientWidth;
    const center = cw / 2;
    targetX = center + (currentTilt * center * 0.8); // Usar 80% del ancho
    targetX = Math.max(PLAYER.w, Math.min(cw - PLAYER.w, targetX));
  });
}

// Fallback para mouse
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  targetX = e.clientX - rect.left;
});

// ===== DIFFICULTY SYSTEM =====
function getDifficulty() {
  const level = Math.floor(score / 500);
  
  // Gaps más balanceados
  const gapMin = Math.max(80, 120 - level * 5);
  const gapMax = Math.max(gapMin + 20, 160 - level * 8);
  
  // Plataformas más angostas gradualmente
  const width = Math.max(60, BASE_PLATFORM_W - level * 4);
  
  // Más elementos especiales con la dificultad
  const moveProb = Math.min(0.4, 0.1 + level * 0.03);
  const specialProb = Math.min(0.3, 0.05 + level * 0.02);
  const obstacleProb = Math.min(0.25, level * 0.02);
  const blackHoleProb = Math.min(0.1, level * 0.01);
  const boosterProb = Math.min(0.15, 0.03 + level * 0.01);
  
  const speed = Math.min(2.5, 1.0 + level * 0.15);
  
  return { 
    level, width, gapMin, gapMax, moveProb, specialProb, 
    obstacleProb, blackHoleProb, boosterProb, speed 
  };
}

// ===== PLATFORM CREATION =====
function createInitialPlatforms() {
  platforms = [];
  obstacles = [];
  blackHoles = [];
  boosters = [];
  
  // Solo crear plataformas iniciales básicas
  let y = canvas.clientHeight - 60;
  platforms.push({
    x: canvas.clientWidth / 2 - 60,
    y: y,
    w: 120,
    h: PLATFORM_H,
    type: PLATFORM_TYPES.NORMAL,
    vx: 0
  });
}

function spawnPlatformAt(y, widthOpt) {
  if (boosting && boostingTime < 1500) return; // No spawns durante boost inicial
  
  const difficulty = getDifficulty();
  const w = widthOpt || difficulty.width;
  const cw = canvas.clientWidth;
  
  // Posición más inteligente
  let x = Math.random() * (cw - w);
  
  // Determinar tipo de plataforma
  let type = PLATFORM_TYPES.NORMAL;
  let vx = 0;
  
  if (Math.random() < difficulty.moveProb) {
    type = PLATFORM_TYPES.MOVING;
    vx = Math.random() < 0.5 ? -difficulty.speed : difficulty.speed;
  } else if (Math.random() < difficulty.specialProb) {
    const specialTypes = [
      PLATFORM_TYPES.BREAKABLE,
      PLATFORM_TYPES.TRANSPARENT,
      PLATFORM_TYPES.SUPER_JUMP,
      PLATFORM_TYPES.MINI_JUMP
    ];
    type = specialTypes[Math.floor(Math.random() * specialTypes.length)];
  }
  
  platforms.push({ x, y, w, h: PLATFORM_H, type, vx, health: type === PLATFORM_TYPES.BREAKABLE ? 1 : -1 });
  
  // Spawns adicionales basados en dificultad
  if (Math.random() < difficulty.obstacleProb) {
    spawnObstacle(y - 50);
  }
  
  if (Math.random() < difficulty.blackHoleProb) {
    spawnBlackHole(y - 60);
  }
  
  if (Math.random() < difficulty.boosterProb) {
    spawnBooster(y - 30);
  }
}

function spawnObstacle(y) {
  const cw = canvas.clientWidth;
  const lives = Math.random() < 0.6 ? 1 : (Math.random() < 0.7 ? 2 : 3);
  
  obstacles.push({
    x: Math.random() * (cw - 30),
    y: y,
    w: 30,
    h: 30,
    lives: lives,
    maxLives: lives,
    vx: lives === 1 ? (Math.random() < 0.5 ? -1.5 : 1.5) : 0
  });
}

function spawnBlackHole(y) {
  const cw = canvas.clientWidth;
  blackHoles.push({
    x: Math.random() * (cw - 40),
    y: y,
    radius: 20,
    pullRadius: 80,
    rotation: 0
  });
}

function spawnBooster(y) {
  const cw = canvas.clientWidth;
  const type = Math.random() < 0.6 ? BOOSTER_TYPES.SHORT : BOOSTER_TYPES.LONG;
  
  boosters.push({
    x: Math.random() * (cw - 25),
    y: y,
    w: 25,
    h: 25,
    type: type,
    bobOffset: Math.random() * Math.PI * 2
  });
}

function maybeSpawnNewTopPlatforms() {
  let topY = Infinity;
  for (const p of platforms) if (p.y < topY) topY = p.y;
  
  const difficulty = getDifficulty();
  while (topY > -400) {
    const nextY = topY - rand(difficulty.gapMin, difficulty.gapMax);
    spawnPlatformAt(nextY, difficulty.width);
    topY = nextY;
  }
}

function rand(min, max) { 
  return Math.floor(Math.random() * (max - min + 1)) + min; 
}

// ===== UPDATE LOGIC =====
function updatePlayer() {
  // Movimiento horizontal suavizado
  const lerpSpeed = 0.12;
  mouseX = mouseX + (targetX - mouseX) * lerpSpeed;
  
  const cw = canvas.clientWidth;
  const currentCenter = PLAYER.x + PLAYER.w / 2;
  PLAYER.x += (mouseX - currentCenter) * 0.15;
  
  // Wrap mejorado
  if (PLAYER.x + PLAYER.w < 0) {
    PLAYER.x = cw - 1;
  } else if (PLAYER.x > cw) {
    PLAYER.x = -PLAYER.w + 1;
  }
  
  // Física vertical mejorada
  if (boosting) {
    PLAYER.dy = -8.0;
    PLAYER.y += PLAYER.dy;
    boostingTime += 16; // Aproximadamente 16ms por frame
  } else {
    PLAYER.y += PLAYER.dy;
    PLAYER.dy += gravity;
    PLAYER.dy = Math.min(PLAYER.dy, maxFallSpeed);
  }
  
  // Reducir invulnerabilidad
  if (PLAYER.invulnerable > 0) {
    PLAYER.invulnerable -= 16;
  }
}

function updateCamera() {
  if (!boosting) {
    const mid = canvas.clientHeight * 0.45;
    if (PLAYER.y < mid) {
      const delta = mid - PLAYER.y;
      PLAYER.y = mid;
      
      // Mover todos los elementos
      for (const p of platforms) p.y += delta;
      for (const o of obstacles) o.y += delta;
      for (const bh of blackHoles) bh.y += delta;
      for (const bs of boosters) bs.y += delta;
      for (const b of bullets) b.y += delta;
      
      cameraY += delta;
      score = Math.max(score, Math.floor(cameraY));
      document.getElementById("score").innerText = "Score: " + score;
      maybeSpawnNewTopPlatforms();
    }
  }
}

function updatePlatforms() {
  for (const p of platforms) {
    // Movimiento de plataformas móviles
    if (p.vx) {
      p.x += p.vx;
      if (p.x <= 0 || p.x + p.w >= canvas.clientWidth) {
        p.vx *= -1;
      }
    }
    
    // Colisiones con plataformas
    if (!boosting && PLAYER.dy > 0) {
      const prevBottom = prevPlayerY + PLAYER.h;
      const nowBottom = PLAYER.y + PLAYER.h;
      
      if (prevBottom <= p.y && nowBottom >= p.y) {
        const overlapX = (PLAYER.x < p.x + p.w) && (PLAYER.x + PLAYER.w > p.x);
        
        if (overlapX) {
          // Diferentes comportamientos según el tipo
          if (p.type === PLATFORM_TYPES.TRANSPARENT) {
            continue; // No hay colisión
          }
          
          PLAYER.y = p.y - PLAYER.h;
          
          switch (p.type) {
            case PLATFORM_TYPES.SUPER_JUMP:
              PLAYER.dy = jumpStrength * 1.8; // Salto súper alto
              break;
            case PLATFORM_TYPES.MINI_JUMP:
              PLAYER.dy = jumpStrength * 0.6; // Salto bajo
              break;
            case PLATFORM_TYPES.BREAKABLE:
              PLAYER.dy = jumpStrength;
              p.health--;
              if (p.health <= 0) {
                platforms.splice(platforms.indexOf(p), 1);
              }
              break;
            default:
              PLAYER.dy = jumpStrength;
          }
        }
      }
    }
  }
}

function updateObstacles() {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    
    // Movimiento del obstáculo tipo 1
    if (o.lives === 1 && o.maxLives === 1) {
      o.x += o.vx;
      if (o.x <= 0 || o.x + o.w >= canvas.clientWidth) {
        o.vx *= -1;
      }
    }
    
    // Colisión con jugador
    if (PLAYER.invulnerable <= 0 && 
        PLAYER.x < o.x + o.w && 
        PLAYER.x + PLAYER.w > o.x &&
        PLAYER.y < o.y + o.h && 
        PLAYER.y + PLAYER.h > o.y) {
      
      PLAYER.health--;
      PLAYER.invulnerable = 1000; // 1 segundo de invulnerabilidad
      
      if (PLAYER.health <= 0) {
        endGame();
        return;
      }
    }
    
    // Colisión con balas
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (b.x > o.x && b.x < o.x + o.w && 
          b.y > o.y && b.y < o.y + o.h) {
        
        bullets.splice(j, 1);
        o.lives--;
        
        if (o.lives <= 0) {
          obstacles.splice(i, 1);
          break;
        }
      }
    }
  }
}

function updateBlackHoles() {
  for (const bh of blackHoles) {
    bh.rotation += 0.1;
    
    // Calcular distancia al jugador
    const playerCenterX = PLAYER.x + PLAYER.w / 2;
    const playerCenterY = PLAYER.y + PLAYER.h / 2;
    const distance = Math.sqrt(
      Math.pow(playerCenterX - bh.x, 2) + 
      Math.pow(playerCenterY - bh.y, 2)
    );
    
    // Succión
    if (distance < bh.pullRadius) {
      const pullStrength = (bh.pullRadius - distance) / bh.pullRadius * 2;
      const angle = Math.atan2(bh.y - playerCenterY, bh.x - playerCenterX);
      
      PLAYER.x += Math.cos(angle) * pullStrength;
      PLAYER.y += Math.sin(angle) * pullStrength;
    }
    
    // Colisión fatal
    if (distance < bh.radius) {
      endGame();
      return;
    }
  }
}

function updateBoosters() {
  for (let i = boosters.length - 1; i >= 0; i--) {
    const bs = boosters[i];
    
    // Animación de flotación
    bs.bobOffset += 0.1;
    const originalY = bs.y;
    bs.y = originalY + Math.sin(bs.bobOffset) * 3;
    
    // Colisión con jugador
    if (PLAYER.x < bs.x + bs.w && 
        PLAYER.x + PLAYER.w > bs.x &&
        PLAYER.y < bs.y + bs.h && 
        PLAYER.y + PLAYER.h > bs.y) {
      
      // Aplicar efecto del booster
      if (bs.type === BOOSTER_TYPES.SHORT) {
        boosting = true;
        boostingTime = 0;
        setTimeout(() => { 
          boosting = false; 
          boostingTime = 0; 
        }, 800);
      } else {
        boosting = true;
        boostingTime = 0;
        setTimeout(() => { 
          boosting = false; 
          boostingTime = 0; 
        }, 1500);
      }
      
      boosters.splice(i, 1);
    }
    
    bs.y = originalY; // Restaurar posición original
  }
}

function updateBullets() {
  for (const b of bullets) {
    b.x += b.dx;
    b.y += b.dy;
  }
  bullets = bullets.filter(b => 
    b.x > -10 && b.x < canvas.clientWidth + 10 && 
    b.y > -10 && b.y < canvas.clientHeight + 10
  );
}

function cleanupElements() {
  const screenBottom = canvas.clientHeight + 100;
  platforms = platforms.filter(p => p.y < screenBottom);
  obstacles = obstacles.filter(o => o.y < screenBottom);
  blackHoles = blackHoles.filter(bh => bh.y < screenBottom);
  boosters = boosters.filter(bs => bs.y < screenBottom);
}

// ===== DRAWING =====
function drawPlayer() {
  ctx.save();
  
  // Parpadeo cuando está invulnerable
  if (PLAYER.invulnerable > 0 && Math.floor(PLAYER.invulnerable / 100) % 2) {
    ctx.globalAlpha = 0.5;
  }
  
  ctx.fillStyle = "#5b8cff";
  ctx.fillRect(PLAYER.x, PLAYER.y, PLAYER.w, PLAYER.h);
  
  // Dibujar vidas
  for (let i = 0; i < PLAYER.health; i++) {
    ctx.fillStyle = "#ff4444";
    ctx.fillRect(10 + i * 15, 10, 10, 10);
  }
  
  ctx.restore();
}

function drawPlatforms() {
  for (const p of platforms) {
    switch (p.type) {
      case PLATFORM_TYPES.MOVING:
        ctx.fillStyle = "#ffa500";
        break;
      case PLATFORM_TYPES.BREAKABLE:
        ctx.fillStyle = "#8b4513";
        break;
      case PLATFORM_TYPES.TRANSPARENT:
        ctx.fillStyle = "rgba(64, 182, 107, 0.5)";
        break;
      case PLATFORM_TYPES.SUPER_JUMP:
        ctx.fillStyle = "#ff69b4";
        // Dibujar indicador
        ctx.fillRect(p.x + p.w - 8, p.y - 8, 8, 8);
        break;
      case PLATFORM_TYPES.MINI_JUMP:
        ctx.fillStyle = "#87ceeb";
        // Dibujar indicador
        ctx.fillRect(p.x + p.w - 6, p.y - 6, 6, 6);
        break;
      default:
        ctx.fillStyle = "#40b66b";
    }
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
}

function drawObstacles() {
  for (const o of obstacles) {
    // Color según las vidas
    if (o.lives === 1) ctx.fillStyle = "#ff6b6b";
    else if (o.lives === 2) ctx.fillStyle = "#ffa500";
    else ctx.fillStyle = "#8b0000";
    
    ctx.fillRect(o.x, o.y, o.w, o.h);
    
    // Mostrar vidas restantes
    ctx.fillStyle = "white";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(o.lives.toString(), o.x + o.w/2, o.y + o.h/2 + 4);
  }
}

function drawBlackHoles() {
  for (const bh of blackHoles) {
    ctx.save();
    ctx.translate(bh.x, bh.y);
    ctx.rotate(bh.rotation);
    
    // Dibujar agujero negro con efecto de espiral
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, bh.radius);
    gradient.addColorStop(0, "#000000");
    gradient.addColorStop(0.7, "#330033");
    gradient.addColorStop(1, "#660066");
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, bh.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Efecto de succión
    ctx.strokeStyle = "rgba(102, 0, 102, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, bh.pullRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  }
}

function drawBoosters() {
  for (const bs of boosters) {
    const y = bs.y + Math.sin(bs.bobOffset) * 3;
    
    if (bs.type === BOOSTER_TYPES.SHORT) {
      ctx.fillStyle = "#00ff00";
    } else {
      ctx.fillStyle = "#00ffff";
    }
    
    ctx.fillRect(bs.x, y, bs.w, bs.h);
    
    // Efecto de brillo
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillRect(bs.x + 2, y + 2, bs.w - 4, bs.h - 4);
  }
}

function drawBullets() {
  ctx.fillStyle = "#ff5555";
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===== MAIN UPDATE LOOP =====
function update() {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  
  updatePlayer();
  updateCamera();
  updatePlatforms();
  updateObstacles();
  updateBlackHoles();
  updateBoosters();
  updateBullets();
  cleanupElements();
  
  // Game Over por caída
  if (PLAYER.y > canvas.clientHeight + 60) {
    endGame();
    return;
  }
  
  // Drawing
  drawPlayer();
  drawPlatforms();
  drawObstacles();
  drawBlackHoles();
  drawBoosters();
  drawBullets();
  
  prevPlayerY = PLAYER.y;
  if (isGameRunning) requestAnimationFrame(update);
}

// ===== GAME START/END =====
function startGame() {
  resizeCanvasToContainer();
  isGameRunning = true;
  boosting = true;
  boostingTime = 0;
  score = 0;
  cameraY = 0;
  
  // Reset player
  PLAYER.x = canvas.clientWidth/2 - PLAYER.w/2;
  PLAYER.y = canvas.clientHeight - 100;
  PLAYER.dy = 0;
  PLAYER.health = 3;
  PLAYER.invulnerable = 0;
  prevPlayerY = PLAYER.y;
  
  // Reset mouse position
  mouseX = canvas.clientWidth / 2;
  targetX = canvas.clientWidth / 2;
  
  // Clear arrays
  bullets = [];
  
  createInitialPlatforms();
  
  // Boost inicial más largo y después spawn normal
  setTimeout(() => { 
    boosting = false; 
    boostingTime = 0;
    maybeSpawnNewTopPlatforms(); // Ahora sí empezar a spawnear
  }, 1500);
  
  update();
}

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
    while (s.levelXP >= 100) { 
      s.levelXP -= 100; 
      s.level += 1; 
    }
    if (typeof window.renderTop === 'function') window.renderTop();
    if (typeof window.saveProgress === 'function') window.saveProgress();
  }
  document.getElementById('game-container').classList.add('hidden');
  document.getElementById('home-screen').classList.remove('hidden');
}

// Export startGame function
window.startGame = startGame;

// ===== INPUT HANDLING =====
// Disparo con tap (móvil)
canvas.addEventListener("touchend", (e) => {
  if (!isGameRunning) return;
  bullets.push({ 
    x: PLAYER.x + PLAYER.w/2, 
    y: PLAYER.y, 
    dx: 0, 
    dy: -12 
  });
  e.preventDefault();
}, { passive: false });

// Disparo con click (PC)
canvas.addEventListener("click", (e) => {
  if (!isGameRunning) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  
  let bullet = { 
    x: PLAYER.x + PLAYER.w/2, 
    y: PLAYER.y, 
    dx: 0, 
    dy: -12 
  };
  
  // Dirección según donde se haga click
  if (clickX < canvas.clientWidth / 3) {
    bullet.dx = -6;
  } else if (clickX > (canvas.clientWidth * 2) / 3) {
    bullet.dx = 6;
  }
  
  bullets.push(bullet);
});