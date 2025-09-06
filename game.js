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
let initialBoost = true;
let boostingTime = 0;
let score = 0;
let cameraY = 0;
let prevPlayerY = 0;
let gameStarted = false; // Para controlar cuando empezar a contar score

const PLAYER = {
  x: 180,
  y: 600,
  w: 40,
  h: 40,
  dy: 0,
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
  GREAT_JUMP: 'great_jump',
  MINI_JUMP: 'mini_jump'
};

// Tipos de obstáculos
const OBSTACLE_TYPES = {
  ONE_LIFE: 1,
  TWO_LIFE: 2
};

// Tipos de boosters
const BOOSTER_TYPES = {
  SHORT: 'short',
  LONG: 'long'
};

// ===== MOVEMENT & INPUT =====
let mouseX = canvas.clientWidth / 2;
let targetX = canvas.clientWidth / 2;

// Movimiento mejorado con inclinación más sensible y natural
if (window.DeviceOrientationEvent) {
  window.addEventListener("deviceorientation", (e) => {
    const gamma = e.gamma || 0;
    
    // Configuración más sensible y natural
    const sensitivity = 12; // Más sensible
    const deadzone = 2; // Zona muerta pequeña para estabilidad
    const maxTilt = 25; // Rango más estrecho para mejor control
    
    // Aplicar zona muerta
    let adjustedGamma = Math.abs(gamma) < deadzone ? 0 : gamma;
    
    // Normalizar la inclinación con curva suave
    const normalizedTilt = Math.max(-maxTilt, Math.min(maxTilt, adjustedGamma));
    const tiltRatio = (normalizedTilt / maxTilt);
    
    // Aplicar curva para hacer el movimiento más intuitivo
    const curvedTilt = tiltRatio * Math.abs(tiltRatio); // Curva cuadrática suave
    
    const cw = canvas.clientWidth;
    const center = cw / 2;
    targetX = center + (curvedTilt * center * 0.9); // 90% del ancho
    targetX = Math.max(PLAYER.w, Math.min(cw - PLAYER.w, targetX));
  });
}

// Fallback para mouse con movimiento más natural
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  targetX = e.clientX - rect.left;
});

// ===== DIFFICULTY SYSTEM =====
function getDifficulty() {
  const level = Math.floor(score / 800); // Progresión más gradual
  
  // Gaps más balanceados y progresivos
  const gapMin = Math.max(85, 130 - level * 3); // Cambio más gradual
  const gapMax = Math.max(gapMin + 25, 170 - level * 4);
  
  // Plataformas más angostas muy gradualmente
  const width = Math.max(65, BASE_PLATFORM_W - level * 2);
  
  // Probabilidades más graduales y balanceadas
  const moveProb = Math.min(0.25, 0.08 + level * 0.015); // Más gradual
  const specialProb = Math.min(0.2, 0.03 + level * 0.012);
  const obstacleProb = Math.min(0.15, level * 0.008); // Obstáculos más graduales
  const blackHoleProb = Math.min(0.06, level * 0.004); // Más raros
  const boosterProb = Math.min(0.12, 0.04 + level * 0.008);
  
  const speed = Math.min(2.2, 0.8 + level * 0.08); // Velocidad más gradual
  
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
  if (initialBoost) return; // No spawns durante boost inicial
  
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
      PLATFORM_TYPES.GREAT_JUMP,
      PLATFORM_TYPES.MINI_JUMP
    ];
    type = specialTypes[Math.floor(Math.random() * specialTypes.length)];
  }
  
  platforms.push({ 
    x, y, w, h: PLATFORM_H, type, vx, 
    health: type === PLATFORM_TYPES.BREAKABLE ? 1 : -1 
  });
  
  // Si es mini_jump, asegurarse de que haya otra plataforma cerca
  if (type === PLATFORM_TYPES.MINI_JUMP) {
    const companionY = y - rand(60, 90); // Plataforma compañera arriba
    let companionX = Math.random() * (cw - w);
    // Asegurarse de que no esté demasiado lejos horizontalmente
    if (Math.abs(companionX - x) > 100) {
      companionX = x + (Math.random() < 0.5 ? -80 : 80);
      companionX = Math.max(0, Math.min(cw - w, companionX));
    }
    
    platforms.push({
      x: companionX, y: companionY, w, h: PLATFORM_H,
      type: PLATFORM_TYPES.NORMAL, vx: 0, health: -1
    });
  }
  
  // Spawns adicionales basados en dificultad (más graduales)
  if (Math.random() < difficulty.obstacleProb) {
    spawnObstacle(y - rand(40, 70));
  }
  
  if (Math.random() < difficulty.blackHoleProb) {
    spawnBlackHole(y - rand(50, 80));
  }
  
  if (Math.random() < difficulty.boosterProb) {
    spawnBooster(y - rand(25, 45));
  }
}

function spawnObstacle(y) {
  const cw = canvas.clientWidth;
  // Solo 1 y 2 vidas, sin el de 3
  const lives = Math.random() < 0.7 ? 1 : 2;
  
  obstacles.push({
    x: Math.random() * (cw - 30),
    y: y,
    w: 30,
    h: 30,
    lives: lives,
    maxLives: lives,
    vx: lives === 1 ? (Math.random() < 0.5 ? -1.2 : 1.2) : 0 // Más lento
  });
}

function spawnBlackHole(y) {
  const cw = canvas.clientWidth;
  blackHoles.push({
    x: Math.random() * (cw - 40),
    y: y,
    radius: 20,
    pullRadius: 70, // Radio de succión más pequeño
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
  // Movimiento horizontal mucho más fluido
  const lerpSpeed = 0.20; // Más rápido y responsivo
  mouseX = mouseX + (targetX - mouseX) * lerpSpeed;
  
  const cw = canvas.clientWidth;
  const currentCenter = PLAYER.x + PLAYER.w / 2;
  PLAYER.x += (mouseX - currentCenter) * 0.25; // Más responsivo
  
  // Wrap mejorado
  if (PLAYER.x + PLAYER.w < 0) {
    PLAYER.x = cw - 1;
  } else if (PLAYER.x > cw) {
    PLAYER.x = -PLAYER.w + 1;
  }
  
  // Física vertical mejorada - efecto cohete suave
  if (boosting) {
    // Efecto cohete más suave
    const boostPower = initialBoost ? -6.5 : -7.5; // Inicial más suave
    PLAYER.dy = PLAYER.dy * 0.7 + boostPower * 0.3; // Transición suave
    PLAYER.y += PLAYER.dy;
    boostingTime += 16;
  } else {
    PLAYER.y += PLAYER.dy;
    PLAYER.dy += gravity;
    PLAYER.dy = Math.min(PLAYER.dy, maxFallSpeed);
  }
}

function updateCamera() {
  if (!boosting || !initialBoost) { // Solo contar score después del boost inicial
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
      
      // Solo contar score si ya empezó el juego real
      if (gameStarted) {
        score = Math.max(score, Math.floor(cameraY));
        document.getElementById("score").innerText = "Score: " + score;
      }
      
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
          // Marcar que el juego realmente empezó
          if (initialBoost) {
            gameStarted = true;
            initialBoost = false;
          }
          
          // Diferentes comportamientos según el tipo
          if (p.type === PLATFORM_TYPES.TRANSPARENT) {
            continue; // No hay colisión
          }
          
          PLAYER.y = p.y - PLAYER.h;
          
          // Detectar si tocó el botón (esquina derecha) para saltos especiales
          const playerCenter = PLAYER.x + PLAYER.w / 2;
          const platformRight = p.x + p.w;
          const buttonZone = platformRight - 15; // Zona del botón
          const touchedButton = PLAYER.x + PLAYER.w > buttonZone;
          
          switch (p.type) {
            case PLATFORM_TYPES.SUPER_JUMP:
              PLAYER.dy = touchedButton ? jumpStrength * 2.2 : jumpStrength;
              break;
            case PLATFORM_TYPES.GREAT_JUMP:
              PLAYER.dy = touchedButton ? jumpStrength * 1.6 : jumpStrength;
              break;
            case PLATFORM_TYPES.MINI_JUMP:
              PLAYER.dy = touchedButton ? jumpStrength * 0.6 : jumpStrength;
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
    
    // Colisión con jugador - GAME OVER inmediato
    if (PLAYER.x < o.x + o.w && 
        PLAYER.x + PLAYER.w > o.x &&
        PLAYER.y < o.y + o.h && 
        PLAYER.y + PLAYER.h > o.y) {
      
      endGame();
      return;
    }
    
    // Colisión con balas
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (b.x > o.x - 5 && b.x < o.x + o.w + 5 && 
          b.y > o.y - 5 && b.y < o.y + o.h + 5) {
        
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
    bh.rotation += 0.08;
    
    // Calcular distancia al jugador
    const playerCenterX = PLAYER.x + PLAYER.w / 2;
    const playerCenterY = PLAYER.y + PLAYER.h / 2;
    const distance = Math.sqrt(
      Math.pow(playerCenterX - bh.x, 2) + 
      Math.pow(playerCenterY - bh.y, 2)
    );
    
    // Succión más suave
    if (distance < bh.pullRadius) {
      const pullStrength = (bh.pullRadius - distance) / bh.pullRadius * 1.5;
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
    bs.bobOffset += 0.08;
    const originalY = bs.y;
    bs.y = originalY + Math.sin(bs.bobOffset) * 2;
    
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
        }, 700);
      } else {
        boosting = true;
        boostingTime = 0;
        setTimeout(() => { 
          boosting = false; 
          boostingTime = 0; 
        }, 1200);
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
  ctx.fillStyle = "#5b8cff";
  ctx.fillRect(PLAYER.x, PLAYER.y, PLAYER.w, PLAYER.h);
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
        ctx.fillStyle = "rgba(64, 182, 107, 0.4)";
        break;
      case PLATFORM_TYPES.SUPER_JUMP:
        ctx.fillStyle = "#ff1493";
        break;
      case PLATFORM_TYPES.GREAT_JUMP:
        ctx.fillStyle = "#ff69b4";
        break;
      case PLATFORM_TYPES.MINI_JUMP:
        ctx.fillStyle = "#87ceeb";
        break;
      default:
        ctx.fillStyle = "#40b66b";
    }
    ctx.fillRect(p.x, p.y, p.w, p.h);
    
    // Dibujar botones para plataformas especiales
    if (p.type === PLATFORM_TYPES.SUPER_JUMP || 
        p.type === PLATFORM_TYPES.GREAT_JUMP || 
        p.type === PLATFORM_TYPES.MINI_JUMP) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      const buttonSize = p.type === PLATFORM_TYPES.SUPER_JUMP ? 10 : 
                        p.type === PLATFORM_TYPES.GREAT_JUMP ? 8 : 6;
      ctx.fillRect(p.x + p.w - buttonSize - 2, p.y - buttonSize, buttonSize, buttonSize);
    }
  }
}

function drawObstacles() {
  for (const o of obstacles) {
    // Color según las vidas
    if (o.lives === 1) ctx.fillStyle = "#ff4757";
    else ctx.fillStyle = "#ff6348";
    
    ctx.fillRect(o.x, o.y, o.w, o.h);
    
    // Mostrar vidas restantes
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(o.lives.toString(), o.x + o.w/2, o.y + o.h/2 + 5);
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
    gradient.addColorStop(0.6, "#1a1a2e");
    gradient.addColorStop(1, "#16213e");
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, bh.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Efecto de succión más sutil
    ctx.strokeStyle = "rgba(22, 33, 62, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, bh.pullRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  }
}

function drawBoosters() {
  for (const bs of boosters) {
    const y = bs.y + Math.sin(bs.bobOffset) * 2;
    
    if (bs.type === BOOSTER_TYPES.SHORT) {
      ctx.fillStyle = "#2ecc71";
    } else {
      ctx.fillStyle = "#3498db";
    }
    
    ctx.fillRect(bs.x, y, bs.w, bs.h);
    
    // Efecto de brillo
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fillRect(bs.x + 3, y + 3, bs.w - 6, bs.h - 6);
  }
}

function drawBullets() {
  ctx.fillStyle = "#e74c3c";
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
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
  initialBoost = true;
  boostingTime = 0;
  score = 0;
  cameraY = 0;
  gameStarted = false;
  
  // Reset player
  PLAYER.x = canvas.clientWidth/2 - PLAYER.w/2;
  PLAYER.y = canvas.clientHeight - 100;
  PLAYER.dy = 0;
  prevPlayerY = PLAYER.y;
  
  // Reset mouse position
  mouseX = canvas.clientWidth / 2;
  targetX = canvas.clientWidth / 2;
  
  // Clear arrays
  bullets = [];
  
  createInitialPlatforms();
  
  // Boost inicial más suave
  setTimeout(() => { 
    boosting = false; 
    boostingTime = 0;
    initialBoost = false;
    maybeSpawnNewTopPlatforms(); // Ahora sí empezar a spawnear
  }, 1800); // Un poco más largo para que sea más suave
  
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
// Disparo mejorado con dirección basada en posición del jugador
function shootBullet(clickX) {
  if (!isGameRunning) return;
  
  const playerCenterX = PLAYER.x + PLAYER.w / 2;
  const cw = canvas.clientWidth;
  
  // Calcular dirección basada en posición relativa
  const relativeClick = clickX / cw; // 0 a 1
  const relativePlayer = playerCenterX / cw; // 0 a 1
  
  let bullet = { 
    x: playerCenterX, 
    y: PLAYER.y, 
    dx: 0, 
    dy: -14 
  };
  
  // Dirección diagonal basada en donde tocó relativo al jugador
  if (relativeClick < 0.33) { // Izquierda
    bullet.dx = -7;
  } else if (relativeClick > 0.67) { // Derecha
    bullet.dx = 7;
  }
  // Centro se mantiene con dx = 0
  
  bullets.push(bullet);
}

// Disparo con tap (móvil)
canvas.addEventListener("touchend", (e) => {
  if (!isGameRunning) return;
  const rect = canvas.getBoundingClientRect();
  const touch = e.changedTouches[0];
  const touchX = touch.clientX - rect.left;
  shootBullet(touchX);
  e.preventDefault();
}, { passive: false });

// Disparo con click (PC)
canvas.addEventListener("click", (e) => {
  if (!isGameRunning) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  shootBullet(clickX);
});