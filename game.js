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
let gameStarted = false;

const PLAYER = {
  x: 180,
  y: 600,
  w: 40,
  h: 40,
  dy: 0,
};

// Configuración de física
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
  MOVING_HORIZONTAL: 'moving_horizontal',
  MOVING_VERTICAL: 'moving_vertical',
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

// ===== IMPROVED MOBILE MOVEMENT =====
let mouseX = canvas.clientWidth / 2;
let targetX = canvas.clientWidth / 2;
let smoothMouseX = canvas.clientWidth / 2;
let calibrationOffset = 0;
let isCalibrated = false;

// Sistema de calibración automática para inclinación
let tiltHistory = [];
const TILT_HISTORY_SIZE = 10;

// Movimiento perfeccionado con inclinación
if (window.DeviceOrientationEvent) {
  window.addEventListener("deviceorientation", (e) => {
    const rawGamma = e.gamma || 0;
    
    // Auto-calibración: tomar promedio de primeras lecturas como centro
    if (!isCalibrated) {
      tiltHistory.push(rawGamma);
      if (tiltHistory.length >= TILT_HISTORY_SIZE) {
        calibrationOffset = tiltHistory.reduce((a, b) => a + b, 0) / tiltHistory.length;
        isCalibrated = true;
        console.log("Calibrado con offset:", calibrationOffset);
      }
      return;
    }
    
    // Aplicar calibración
    const gamma = rawGamma - calibrationOffset;
    
    // Configuración ultra-fluida
    const sensitivity = 15; // Muy responsivo
    const deadzone = 1; // Zona muerta mínima
    const maxTilt = 20; // Rango más natural
    const smoothing = 0.85; // Suavizado agresivo
    
    // Aplicar zona muerta
    let adjustedGamma = Math.abs(gamma) < deadzone ? 0 : gamma;
    
    // Normalizar con límites suaves
    const normalizedTilt = Math.max(-maxTilt, Math.min(maxTilt, adjustedGamma));
    let tiltRatio = (normalizedTilt / maxTilt);
    
    // Aplicar curva exponencial suave para mejor control
    const sign = tiltRatio >= 0 ? 1 : -1;
    tiltRatio = sign * Math.pow(Math.abs(tiltRatio), 0.8); // Curva suave
    
    const cw = canvas.clientWidth;
    const center = cw / 2;
    const newTargetX = center + (tiltRatio * center * 0.85);
    
    // Suavizado ultra-fluido
    targetX = targetX * smoothing + newTargetX * (1 - smoothing);
    targetX = Math.max(PLAYER.w, Math.min(cw - PLAYER.w, targetX));
  });
}

// Botón de recalibración para depuración
window.recalibrateTilt = function() {
  isCalibrated = false;
  tiltHistory = [];
  calibrationOffset = 0;
};

// Fallback para mouse con suavizado
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const newTarget = e.clientX - rect.left;
  targetX = targetX * 0.7 + newTarget * 0.3; // Suavizado también en mouse
});

// ===== PROGRESSIVE DIFFICULTY SYSTEM =====
function getDifficulty() {
  // Progresión muy gradual cada 200 puntos (más frecuente)
  const rawLevel = score / 200;
  const level = Math.floor(rawLevel);
  const progress = rawLevel - level; // 0 to 1 dentro del nivel
  
  // Interpolación suave entre niveles
  const lerp = (start, end, t) => start + (end - start) * Math.min(1, t);
  
  // Configuración base (nivel 0)
  const base = {
    gapMin: 120,
    gapMax: 190,
    width: BASE_PLATFORM_W,
    moveProb: 0.08,
    specialProb: 0.05,
    obstacleProb: 0.03,
    blackHoleProb: 0.01,
    boosterProb: 0.06,
    speed: 1.0,
    verticalMoveProb: 0.1,
    complexPatternProb: 0.05
  };
  
  // Cambios por nivel (más agresivos para mayor dificultad)
  const perLevel = {
    gapMin: -3,
    gapMax: -4,
    width: -2,
    moveProb: 0.02,
    specialProb: 0.015,
    obstacleProb: 0.012,
    blackHoleProb: 0.008,
    boosterProb: 0.008,
    speed: 0.1,
    verticalMoveProb: 0.025,
    complexPatternProb: 0.04
  };
  
  // Calcular valores actuales con interpolación suave
  const current = {};
  for (const key in base) {
    const levelValue = base[key] + (perLevel[key] * level);
    const nextLevelValue = base[key] + (perLevel[key] * (level + 1));
    current[key] = lerp(levelValue, nextLevelValue, progress);
  }
  
  // Aplicar límites
  current.gapMin = Math.max(60, current.gapMin);
  current.gapMax = Math.max(current.gapMin + 20, current.gapMax);
  current.width = Math.max(45, current.width);
  current.moveProb = Math.min(0.6, current.moveProb);
  current.specialProb = Math.min(0.4, current.specialProb);
  current.obstacleProb = Math.min(0.35, current.obstacleProb);
  current.blackHoleProb = Math.min(0.15, current.blackHoleProb);
  current.boosterProb = Math.min(0.25, current.boosterProb);
  current.speed = Math.min(3.5, current.speed);
  current.verticalMoveProb = Math.min(0.5, current.verticalMoveProb);
  current.complexPatternProb = Math.min(0.8, current.complexPatternProb);
  
  return { level, progress, ...current };
}

// ===== INTELLIGENT PLATFORM PATTERNS =====
function createInitialPlatforms() {
  platforms = [];
  obstacles = [];
  blackHoles = [];
  boosters = [];
  
  // Resetear sistema de cadenas
  breakableChain = [];
  activeChainIndex = -1;
  isChainActive = false;
  
  let y = canvas.clientHeight - 60;
  platforms.push({
    x: canvas.clientWidth / 2 - 60,
    y: y,
    w: 120,
    h: PLATFORM_H,
    type: PLATFORM_TYPES.NORMAL,
    vx: 0,
    vy: 0,
    baseY: y
  });
}

function spawnComplexPattern(y, difficulty) {
  const cw = canvas.clientWidth;
  const w = difficulty.width;
  
  // Patrones más complejos y desafiantes
  const patterns = [
    // Patrón: Zigzag de plataformas móviles
    () => {
      for (let i = 0; i < 3; i++) {
        const x = (i % 2 === 0) ? 20 : cw - w - 20;
        const platformY = y - (i * 25);
        platforms.push({
          x: x, y: platformY, w: w * 0.8, h: PLATFORM_H,
          type: PLATFORM_TYPES.MOVING_HORIZONTAL,
          vx: (i % 2 === 0) ? difficulty.speed : -difficulty.speed,
          vy: 0, baseY: platformY
        });
      }
    },
    
    // Patrón: Plataforma transparente con obstáculo y alternativa
    () => {
      const mainX = cw * 0.3;
      const altX = cw * 0.7;
      platforms.push({
        x: mainX, y: y, w: w, h: PLATFORM_H,
        type: PLATFORM_TYPES.TRANSPARENT, vx: 0, vy: 0, baseY: y
      });
      platforms.push({
        x: altX, y: y - 20, w: w, h: PLATFORM_H,
        type: PLATFORM_TYPES.NORMAL, vx: 0, vy: 0, baseY: y - 20
      });
      // Añadir obstáculo en la transparente
      obstacles.push({
        x: mainX + w/2 - 15, y: y - 35, w: 30, h: 30,
        lives: 1, maxLives: 1, vx: 0
      });
    },
    
    // Patrón: Escalera ascendente con diferentes tipos
    () => {
      const types = [PLATFORM_TYPES.NORMAL, PLATFORM_TYPES.GREAT_JUMP, PLATFORM_TYPES.MOVING_HORIZONTAL];
      for (let i = 0; i < 4; i++) {
        const x = 30 + (i * (cw - 60 - w) / 3);
        const platformY = y - (i * 15);
        const type = types[i % types.length];
        platforms.push({
          x: x, y: platformY, w: w * 0.9, h: PLATFORM_H,
          type: type,
          vx: type === PLATFORM_TYPES.MOVING_HORIZONTAL ? (i % 2 === 0 ? difficulty.speed : -difficulty.speed) : 0,
          vy: 0, baseY: platformY
        });
      }
    },
    
    // Patrón: Doble vertical con obstáculos móviles
    () => {
      platforms.push({
        x: cw * 0.2, y: y, w: w, h: PLATFORM_H,
        type: PLATFORM_TYPES.MOVING_VERTICAL,
        vx: 0, vy: difficulty.speed * 0.8, baseY: y
      });
      platforms.push({
        x: cw * 0.8 - w, y: y, w: w, h: PLATFORM_H,
        type: PLATFORM_TYPES.MOVING_VERTICAL,
        vx: 0, vy: -difficulty.speed * 0.8, baseY: y
      });
      // Obstáculos móviles entre ellas
      obstacles.push({
        x: cw * 0.5 - 15, y: y - 40, w: 30, h: 30,
        lives: 2, maxLives: 2, vx: difficulty.speed * 1.5
      });
    },
    
    // Patrón: Super jump con landing challenge
    () => {
      platforms.push({
        x: cw * 0.15, y: y, w: w * 0.7, h: PLATFORM_H,
        type: PLATFORM_TYPES.SUPER_JUMP, vx: 0, vy: 0, baseY: y
      });
      // Plataforma de aterrizaje lejana y pequeña
      platforms.push({
        x: cw * 0.8, y: y - 60, w: w * 0.6, h: PLATFORM_H,
        type: PLATFORM_TYPES.NORMAL, vx: 0, vy: 0, baseY: y - 60
      });
      // Agujero negro entre ellas
      blackHoles.push({
        x: cw * 0.5, y: y - 30, radius: 18, pullRadius: 50, rotation: 0
      });
    },
    
    // Patrón: Laberinto de plataformas rotas
    () => {
      for (let i = 0; i < 5; i++) {
        const x = 20 + Math.random() * (cw - w - 40);
        const platformY = y - (i * 18);
        platforms.push({
          x: x, y: platformY, w: w * 0.6, h: PLATFORM_H,
          type: PLATFORM_TYPES.BREAKABLE,
          vx: 0, vy: 0, baseY: platformY, health: 1
        });
      }
    }
  ];
  
  // Elegir patrón basado en dificultad con mayor variedad
  const maxPatterns = Math.min(patterns.length, 3 + Math.floor(difficulty.level / 2));
  const availablePatterns = patterns.slice(0, maxPatterns);
  const pattern = availablePatterns[Math.floor(Math.random() * availablePatterns.length)];
  pattern();
}

function spawnPlatformAt(y, widthOpt) {
  if (initialBoost) return;
  
  const difficulty = getDifficulty();
  const cw = canvas.clientWidth;
  
  // Decidir si usar patrón complejo (más frecuente en niveles altos)
  if (Math.random() < difficulty.complexPatternProb) {
    spawnComplexPattern(y, difficulty);
    return;
  }
  
  // Plataforma simple
  const w = widthOpt || difficulty.width;
  let x = Math.random() * (cw - w);
  
  let type = PLATFORM_TYPES.NORMAL;
  let vx = 0, vy = 0;
  
  // Determinar tipo con mayor variedad
  if (Math.random() < difficulty.moveProb) {
    if (Math.random() < difficulty.verticalMoveProb) {
      type = PLATFORM_TYPES.MOVING_VERTICAL;
      vy = Math.random() < 0.5 ? -difficulty.speed * 0.7 : difficulty.speed * 0.7;
    } else {
      type = PLATFORM_TYPES.MOVING_HORIZONTAL;
      vx = Math.random() < 0.5 ? -difficulty.speed : difficulty.speed;
    }
  } else if (Math.random() < difficulty.specialProb) {
    const specialTypes = [
      PLATFORM_TYPES.BREAKABLE,
      PLATFORM_TYPES.TRANSPARENT,
      PLATFORM_TYPES.SUPER_JUMP,
      PLATFORM_TYPES.GREAT_JUMP,
      PLATFORM_TYPES.MINI_JUMP
    ];
    type = specialTypes[Math.floor(Math.random() * specialTypes.length)];
    
    // Si es transparente, añadir plataforma alternativa
    if (type === PLATFORM_TYPES.TRANSPARENT) {
      const altX = x > cw/2 ? 30 : cw - w - 30;
      platforms.push({
        x: altX, y: y + rand(-20, 20), w: w, h: PLATFORM_H,
        type: PLATFORM_TYPES.NORMAL, vx: 0, vy: 0, baseY: y + rand(-20, 20)
      });
    }
  }
  
  platforms.push({ 
    x, y, w, h: PLATFORM_H, type, vx, vy, baseY: y,
    health: type === PLATFORM_TYPES.BREAKABLE ? 1 : -1 
  });
  
  // Spawns adicionales más frecuentes
  if (Math.random() < difficulty.obstacleProb) {
    spawnObstacle(y - rand(30, 60));
  }
  
  if (Math.random() < difficulty.blackHoleProb) {
    spawnBlackHole(y - rand(40, 70));
  }
  
  if (Math.random() < difficulty.boosterProb) {
    spawnBooster(y - rand(20, 40));
  }
}

function spawnObstacle(y) {
  const cw = canvas.clientWidth;
  const lives = Math.random() < 0.6 ? 1 : 2;
  
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
    pullRadius: 70,
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
    spawnPlatformAt(nextY);
    topY = nextY;
  }
}

function rand(min, max) { 
  return Math.floor(Math.random() * (max - min + 1)) + min; 
}

// ===== UPDATE LOGIC =====
function updatePlayer() {
  // Movimiento horizontal ultra-fluido
  const lerpSpeed = 0.25; // Muy responsivo
  smoothMouseX = smoothMouseX + (targetX - smoothMouseX) * lerpSpeed;
  
  const cw = canvas.clientWidth;
  const currentCenter = PLAYER.x + PLAYER.w / 2;
  const targetCenter = smoothMouseX;
  
  // Movimiento más natural
  PLAYER.x += (targetCenter - currentCenter) * 0.3;
  
  // Wrap mejorado - sin paredes invisibles
  if (PLAYER.x + PLAYER.w < 0) {
    PLAYER.x = cw;
  } else if (PLAYER.x > cw) {
    PLAYER.x = -PLAYER.w;
  }
  
  // Física vertical
  if (boosting) {
    const boostPower = initialBoost ? -6.5 : -7.5;
    PLAYER.dy = PLAYER.dy * 0.7 + boostPower * 0.3;
    PLAYER.y += PLAYER.dy;
    boostingTime += 16;
  } else {
    PLAYER.y += PLAYER.dy;
    PLAYER.dy += gravity;
    PLAYER.dy = Math.min(PLAYER.dy, maxFallSpeed);
  }
}

function updateCamera() {
  if (!boosting || !initialBoost) {
    const mid = canvas.clientHeight * 0.45;
    if (PLAYER.y < mid) {
      const delta = mid - PLAYER.y;
      PLAYER.y = mid;
      
      // Mover todos los elementos
      for (const p of platforms) {
        p.y += delta;
        p.baseY += delta;
      }
      for (const o of obstacles) o.y += delta;
      for (const bh of blackHoles) bh.y += delta;
      for (const bs of boosters) bs.y += delta;
      for (const b of bullets) b.y += delta;
      
      cameraY += delta;
      
      // Actualizar score correctamente
      if (gameStarted) {
        const newScore = Math.floor(cameraY / 5); // Más granular
        if (newScore > score) {
          score = newScore;
          // Actualizar UI si existe
          const scoreElement = document.getElementById("score");
          if (scoreElement) {
            scoreElement.innerText = "Score: " + score;
          }
        }
      }
      
      maybeSpawnNewTopPlatforms();
    }
  }
}

function updatePlatforms() {
  for (const p of platforms) {
    // Movimiento horizontal
    if (p.vx) {
      p.x += p.vx;
      if (p.x <= 0 || p.x + p.w >= canvas.clientWidth) {
        p.vx *= -1;
      }
    }
    
    // Movimiento vertical (oscilación)
    if (p.vy) {
      p.y += p.vy;
      // Oscilar arriba y abajo desde posición base
      if (Math.abs(p.y - p.baseY) > 35) {
        p.vy *= -1;
      }
    }
    
    // Colisiones
    if (!boosting && PLAYER.dy > 0) {
      const prevBottom = prevPlayerY + PLAYER.h;
      const nowBottom = PLAYER.y + PLAYER.h;
      
      if (prevBottom <= p.y && nowBottom >= p.y) {
        const overlapX = (PLAYER.x < p.x + p.w) && (PLAYER.x + PLAYER.w > p.x);
        
        if (overlapX) {
          if (initialBoost) {
            gameStarted = true;
            initialBoost = false;
          }
          
          if (p.type === PLATFORM_TYPES.TRANSPARENT) {
            continue;
          }
          
          PLAYER.y = p.y - PLAYER.h;
          
          // Detectar botón
          const playerCenter = PLAYER.x + PLAYER.w / 2;
          const platformRight = p.x + p.w;
          const buttonZone = platformRight - 15;
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
    
    // Movimiento de obstáculos de 1 vida
    if (o.lives === 1 && o.maxLives === 1) {
      o.x += o.vx;
      if (o.x <= 0 || o.x + o.w >= canvas.clientWidth) {
        o.vx *= -1;
      }
    }
    
    // NUEVA FUNCIONALIDAD: Matar obstáculos pisándolos desde arriba
    const playerBottom = PLAYER.y + PLAYER.h;
    const playerTop = PLAYER.y;
    const playerLeft = PLAYER.x;
    const playerRight = PLAYER.x + PLAYER.w;
    
    const obstacleTop = o.y;
    const obstacleBottom = o.y + o.h;
    const obstacleLeft = o.x;
    const obstacleRight = o.x + o.w;
    
    // Verificar si el jugador está cayendo sobre el obstáculo
    if (PLAYER.dy > 0 && // Cayendo
        prevPlayerY + PLAYER.h <= obstacleTop && // Estaba arriba en el frame anterior
        playerBottom >= obstacleTop && // Ahora está tocando la parte superior
        playerRight > obstacleLeft && // Overlap horizontal
        playerLeft < obstacleRight) {
      
      // Matar el obstáculo instantáneamente
      obstacles.splice(i, 1);
      
      // Dar impulso de salto alto como recompensa
      PLAYER.dy = jumpStrength * 1.5;
      PLAYER.y = obstacleTop - PLAYER.h; // Posicionar correctamente
      continue; // Saltar al siguiente obstáculo
    }
    
    // Colisión normal (lateral o por abajo)
    if (playerLeft < obstacleRight && 
        playerRight > obstacleLeft &&
        playerTop < obstacleBottom && 
        playerBottom > obstacleTop) {
      endGame();
      return;
    }
    
    // Colisión con balas
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (b.x > obstacleLeft - 5 && b.x < obstacleRight + 5 && 
          b.y > obstacleTop - 5 && b.y < obstacleBottom + 5) {
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
    
    const playerCenterX = PLAYER.x + PLAYER.w / 2;
    const playerCenterY = PLAYER.y + PLAYER.h / 2;
    const distance = Math.sqrt(
      Math.pow(playerCenterX - bh.x, 2) + 
      Math.pow(playerCenterY - bh.y, 2)
    );
    
    if (distance < bh.pullRadius) {
      const pullStrength = (bh.pullRadius - distance) / bh.pullRadius * 1.4;
      const angle = Math.atan2(bh.y - playerCenterY, bh.x - playerCenterX);
      
      PLAYER.x += Math.cos(angle) * pullStrength;
      PLAYER.y += Math.sin(angle) * pullStrength;
    }
    
    if (distance < bh.radius) {
      endGame();
      return;
    }
  }
}

function updateBoosters() {
  for (let i = boosters.length - 1; i >= 0; i--) {
    const bs = boosters[i];
    
    bs.bobOffset += 0.08;
    const originalY = bs.y;
    bs.y = originalY + Math.sin(bs.bobOffset) * 2;
    
    if (PLAYER.x < bs.x + bs.w && 
        PLAYER.x + PLAYER.w > bs.x &&
        PLAYER.y < bs.y + bs.h && 
        PLAYER.y + PLAYER.h > bs.y) {
      
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
    
    bs.y = originalY;
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
      case PLATFORM_TYPES.MOVING_HORIZONTAL:
        ctx.fillStyle = "#ffa500";
        break;
      case PLATFORM_TYPES.MOVING_VERTICAL:
        ctx.fillStyle = "#ff8c42";
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
    
    // Dibujar botones
    if (p.type === PLATFORM_TYPES.SUPER_JUMP || 
        p.type === PLATFORM_TYPES.GREAT_JUMP || 
        p.type === PLATFORM_TYPES.MINI_JUMP) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      const buttonSize = p.type === PLATFORM_TYPES.SUPER_JUMP ? 10 : 
                        p.type === PLATFORM_TYPES.GREAT_JUMP ? 8 : 6;
      ctx.fillRect(p.x + p.w - buttonSize - 2, p.y - buttonSize, buttonSize, buttonSize);
    }
  }
}

function drawObstacles() {
  for (const o of obstacles) {
    if (o.lives === 1) ctx.fillStyle = "#ff4757";
    else ctx.fillStyle = "#ff6348";
    
    ctx.fillRect(o.x, o.y, o.w, o.h);
    
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
    
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, bh.radius);
    gradient.addColorStop(0, "#000000");
    gradient.addColorStop(0.6, "#1a1a2e");
    gradient.addColorStop(1, "#16213e");
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, bh.radius, 0, Math.PI * 2);
    ctx.fill();
    
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

function drawDifficultyInfo() {
  const difficulty = getDifficulty();
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = "14px Arial";
  ctx.textAlign = "left";
  
  // Información más detallada
  const progressPercent = Math.floor(difficulty.progress * 100);
  ctx.fillText(`Nivel: ${difficulty.level} (${progressPercent}%)`, 10, canvas.clientHeight - 50);
  ctx.fillText(`Score: ${score}`, 10, canvas.clientHeight - 30);
  
  // Barra de progreso visual
  const barWidth = 150;
  const barHeight = 8;
  const barX = 10;
  const barY = canvas.clientHeight - 15;
  
  // Fondo de la barra
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.fillRect(barX, barY, barWidth, barHeight);
  
  // Progreso de la barra
  ctx.fillStyle = "#3498db";
  ctx.fillRect(barX, barY, barWidth * difficulty.progress, barHeight);
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
  drawDifficultyInfo();
  
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
  
  // Actualizar score en UI inmediatamente
  const scoreElement = document.getElementById("score");
  if (scoreElement) {
    scoreElement.innerText = "Score: 0";
  }
  
  // Reset calibración
  isCalibrated = false;
  tiltHistory = [];
  calibrationOffset = 0;
  
  PLAYER.x = canvas.clientWidth/2 - PLAYER.w/2;
  PLAYER.y = canvas.clientHeight - 100;
  PLAYER.dy = 0;
  prevPlayerY = PLAYER.y;
  
  mouseX = canvas.clientWidth / 2;
  targetX = canvas.clientWidth / 2;
  smoothMouseX = canvas.clientWidth / 2;
  
  bullets = [];
  
  createInitialPlatforms();
  
  setTimeout(() => { 
    boosting = false; 
    boostingTime = 0;
    initialBoost = false;
    gameStarted = true; // IMPORTANTE: Activar gameStarted aquí
    maybeSpawnNewTopPlatforms();
  }, 1800);
  
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
  
  // Actualizar elementos de UI si existen
  const gameContainer = document.getElementById('game-container');
  const homeScreen = document.getElementById('home-screen');
  
  if (gameContainer) gameContainer.classList.add('hidden');
  if (homeScreen) homeScreen.classList.remove('hidden');
}

window.startGame = startGame;

// ===== INPUT HANDLING =====
function shootBullet(clickX) {
  if (!isGameRunning) return;
  
  const playerCenterX = PLAYER.x + PLAYER.w / 2;
  const cw = canvas.clientWidth;
  
  const relativeClick = clickX / cw;
  
  let bullet = { 
    x: playerCenterX, 
    y: PLAYER.y, 
    dx: 0, 
    dy: -16 // Balas más rápidas
  };
  
  if (relativeClick < 0.33) {
    bullet.dx = -8;
  } else if (relativeClick > 0.67) {
    bullet.dx = 8;
  }
  
  bullets.push(bullet);
}

canvas.addEventListener("touchend", (e) => {
  if (!isGameRunning) return;
  const rect = canvas.getBoundingClientRect();
  const touch = e.changedTouches[0];
  const touchX = touch.clientX - rect.left;
  shootBullet(touchX);
  e.preventDefault();
}, { passive: false });

canvas.addEventListener("click", (e) => {
  if (!isGameRunning) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  shootBullet(clickX);
});