// ===== GAME CORE =====
const canvas = document.getElementById("gameCanvas");
if (!canvas) { console.error("[RJ] #gameCanvas no está en el DOM"); }
const ctx = canvas ? canvas.getContext("2d") : null;

function resizeCanvasToContainer() {
  if (!canvas || !ctx) return;
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
window.addEventListener("resize", resizeCanvasToContainer);
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
// ===== PAUSE & CONTINUE STATE =====
let isPaused = false;
let isAwaitingContinue = false;
let deathCount = 0;
let continuePriceWLD = 0.11;
let continueDeadline = 0;  // timestamp ms
let continueTimerId = null;
// Sistema de cadenas (si aún no lo usas, igual decláralo para evitar errores)
let breakableChain = [];
let activeChainIndex = -1;
let isChainActive = false;


// Helper UI refs
const $pauseBtn = document.getElementById('btn-pause');
const $overlayPause = document.getElementById('overlay-pause');
const $overlayContinue = document.getElementById('overlay-continue');
const $overlayGameOver = document.getElementById('overlay-gameover');
const $continuePrice = document.getElementById('continue-price');
const $pie = document.getElementById('pie-timer');
const $pieLabel = document.getElementById('pie-label');
const $finalScore = document.getElementById('final-score');
const $finalCoins = document.getElementById('final-coins');

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
let mouseX = 200, targetX = 200, smoothMouseX = 200; // se corrigen en startGame()
// Input normalizado de inclinación (-1..1). Usado SOLO en móvil.
let tiltInput = 0;
let calibrationOffset = 0;
let isCalibrated = false;

// Sistema de calibración automática para inclinación
let tiltHistory = [];
const TILT_HISTORY_SIZE = 10;

  if (window.DeviceOrientationEvent) {
  window.addEventListener("deviceorientation", (e) => {
    const rawGamma = e.gamma ?? 0;

    // auto-calibración (usa tus mismas variables)
    if (!isCalibrated) {
      tiltHistory.push(rawGamma);
      if (tiltHistory.length >= TILT_HISTORY_SIZE) {
        calibrationOffset = tiltHistory.reduce((a,b)=>a+b,0) / tiltHistory.length;
        isCalibrated = true;
      }
      return;
    }

    // curva rápida y con poca latencia
    const gamma = rawGamma - calibrationOffset; // grados
    const deadzone = 1;
    const maxTilt  = 20;
    let g = Math.abs(gamma) < deadzone ? 0 : gamma;
    g = Math.max(-maxTilt, Math.min(maxTilt, g));
    let ratio = g / maxTilt;                    // -1..1
    const sgn = ratio >= 0 ? 1 : -1;
    ratio = sgn * Math.pow(Math.abs(ratio), 0.8);

    // guardamos input de tilt para la física
    tiltInput = Math.max(-1, Math.min(1, ratio));
  });
}


// Botón de recalibración para depuración
window.recalibrateTilt = function() {
  isCalibrated = false;
  tiltHistory = [];
  calibrationOffset = 0;
};
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
// ===== MOVIMIENTO HORIZONTAL (tilt o mouse) =====
{
  const w = canvas.clientWidth;

  // En PC: seguir al mouse suavizado (lo ya existente)
  if (IS_DESKTOP) {
    const minCenter = PLAYER.w / 2;
    const maxCenter = w - PLAYER.w / 2;
    const clampedTarget = Math.max(minCenter, Math.min(maxCenter, targetX));
    smoothMouseX = smoothMouseX * 0.85 + clampedTarget * 0.15;
    PLAYER.x = smoothMouseX - PLAYER.w / 2;
  } else {
    // En móvil: física con inclinación (rápida y fluida)
    // Acel. proporcional al ancho: más grande → más “road”
    const accel = 0.0035 * w;   // sensibilidad (sube/baja si quieres)
    const friction = 0.88;      // 0.85 más suelto / 0.93 más pegado

    // Asegúrate de tener vx en tu PLAYER
    if (typeof PLAYER.vx !== 'number') PLAYER.vx = 0;

    // aplica aceleración por tilt
    PLAYER.vx += accel * tiltInput;
    PLAYER.vx *= friction;

    // avanza
    PLAYER.x += PLAYER.vx;
  }

  // ===== WRAP-AROUND (sin paredes) =====
  if (PLAYER.x > w) {
    PLAYER.x = -PLAYER.w + 1;
  } else if (PLAYER.x + PLAYER.w < 0) {
    PLAYER.x = w - 1;
  }
}

  // Pausa dura: no avanzar simulación, solo mantener overlay visible
if (isPaused || isAwaitingContinue){
  // Dibuja elementos mínimos si quieres (opcional)
  // No avanza física ni spawns
  if (isGameRunning) requestAnimationFrame(update);
  return;
}

  updatePlayer();
  updateCamera();
  updatePlatforms();
  updateObstacles();
  updateBlackHoles();
  updateBoosters();
  updateBullets();
  cleanupElements();
  
 if (PLAYER.y > canvas.clientHeight + 60) {
  onPlayerDeath('fall');
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
  // Tomar referencias locales y validar
  const c = canvas;
  const context = ctx;
  if (!c || !context) {
    console.error('[RJ] Canvas no disponible al iniciar');
    return;
  }

  // Ajustar dimensiones HiDPI ahora que el canvas existe
  resizeCanvasToContainer();
// iOS pide permiso explícito para deviceorientation
if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
  try { DeviceOrientationEvent.requestPermission().catch(()=>{}); } catch(_e) {}
}

  // ===== Reset de continues WLD por partida =====
  deathCount = 0;
  continuePriceWLD = 0.11;
  isPaused = false;
  isAwaitingContinue = false;
  $overlayPause?.classList.add('hidden');
  $overlayContinue?.classList.add('hidden');
  $overlayGameOver?.classList.add('hidden');

  // ===== Estado base del juego =====
  isGameRunning = true;
  boosting = true;
  initialBoost = true;
  boostingTime = 0;
  score = 0;
  cameraY = 0;
  gameStarted = false;

  // UI score
  const scoreElement = document.getElementById("score");
  if (scoreElement) scoreElement.innerText = "Score: 0";

  // Reset inclinación
  isCalibrated = false;
  tiltHistory = [];
  calibrationOffset = 0;

  // Posición inicial del jugador (USAR 'c', NO 'canvas')
  PLAYER.x = c.clientWidth  / 2 - PLAYER.w / 2;
  PLAYER.y = c.clientHeight - 100;
  PLAYER.dy = 0;
  prevPlayerY = PLAYER.y;

  // Objetivos de movimiento (USAR 'c', NO 'canvas')
  mouseX       = c.clientWidth / 2;
  targetX      = c.clientWidth / 2;
  smoothMouseX = c.clientWidth / 2;

  // Mundo
  bullets = [];
  createInitialPlatforms();

  // Fin del booster inicial y primer spawn
  setTimeout(() => {
    boosting = false;
    boostingTime = 0;
    initialBoost = false;
    gameStarted = true;
    maybeSpawnNewTopPlatforms();
  }, 1800);

  update();
}


function finalizeGameOver() {
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
  // Mostrar overlay final (quedarse en game view hasta que el usuario vuelva)
  $finalScore && ($finalScore.textContent = String(score));
  $finalCoins && ($finalCoins.textContent = String(Math.floor(score/100)));
  $overlayGameOver?.classList.remove('hidden');
}
// ===== SOFT GAME OVER (¿Continuar?) =====
function endGame(){
  onPlayerDeath('generic');
}

function onPlayerDeath(reason){
  if (!isGameRunning) return;
  isAwaitingContinue = true;
  isGameRunning = false; // pausamos el loop, reanudamos tras continue
  setPaused(false);

  deathCount += 1;
  continuePriceWLD = 0.11 + 0.05 * (deathCount - 1);
  if ($continuePrice) $continuePrice.textContent = `${continuePriceWLD.toFixed(2)} WLD`;

  // Mostrar overlay y arrancar cuenta 5s
  $overlayContinue?.classList.remove('hidden');
  startPieCountdown(5); // segundos
}

function startPieCountdown(seconds){
  clearInterval(continueTimerId);
  const total = seconds * 1000;
  continueDeadline = Date.now() + total;

  continueTimerId = setInterval(()=>{
    const left = Math.max(0, continueDeadline - Date.now());
    const pct = 1 - left / total;                 // 0..1
    const angle = Math.floor(360 * pct) + 'deg';  // 0..360
    if ($pie) $pie.style.setProperty('--angle', angle);
    if ($pieLabel) $pieLabel.textContent = String(Math.ceil(left/1000));
    if (left <= 0){
      clearInterval(continueTimerId);
      $overlayContinue?.classList.add('hidden');
      showFinalGameOver();
    }
  }, 100);
}

async function applyContinue(){
  // Cobro simulado en WLD
  const ok = typeof window.payForContinueWLD === 'function'
    ? await window.payForContinueWLD(continuePriceWLD)
    : true;

  if (!ok){
    // No se pagó
    $overlayContinue?.classList.add('hidden');
    showFinalGameOver();
    return;
  }

  // Reubicación segura
  safeRespawn();
  // Cerrar overlay y reanudar
  clearInterval(continueTimerId);
  $overlayContinue?.classList.add('hidden');
  isAwaitingContinue = false;
  isGameRunning = true;
  update(); // retomar loop
}

function showFinalGameOver(){
  finalizeGameOver();
}

function safeRespawn(){
  // Plataformita de rescate en 60% inferior
  const y = canvas.clientHeight * 0.6;
  const w = 100;
  const x = (canvas.clientWidth - w)/2;
  platforms.push({ x, y, w, h: PLATFORM_H, type: 'normal', vx:0, vy:0, baseY:y });

  // Colocar al jugador sobre esa plataforma y pequeño boost
  PLAYER.x = x + (w - PLAYER.w)/2;
  PLAYER.y = y - PLAYER.h - 1;
  PLAYER.dy = jumpStrength * 0.9;

  // Limpieza básica alrededor
  obstacles = obstacles.filter(o => o.y < y - 40 || o.y > y + 80);
  blackHoles = blackHoles.filter(bh => bh.y < y - 80 || bh.y > y + 120);
}


window.startGame = startGame;
// ===== PAUSE HANDLERS =====
function setPaused(v){
  isPaused = !!v;
  if (isPaused){ $overlayPause?.classList.remove('hidden'); }
  else { $overlayPause?.classList.add('hidden'); }
}
$pauseBtn?.addEventListener('click', ()=> setPaused(!isPaused));

document.getElementById('btn-resume')?.addEventListener('click', ()=> setPaused(false));
// ===== OVERLAY BUTTONS =====
document.getElementById('btn-continue')?.addEventListener('click', applyContinue);
document.getElementById('btn-no-continue')?.addEventListener('click', ()=>{
  clearInterval(continueTimerId);
  $overlayContinue?.classList.add('hidden');
  showFinalGameOver();
});
document.getElementById('btn-back-menu')?.addEventListener('click', ()=>{
  // Volver al Home (cerrar overlays y mostrar Home)
  $overlayGameOver?.classList.add('hidden');
  const gameContainer = document.getElementById('game-container');
  const homeScreen = document.getElementById('home-screen');
  if (gameContainer) gameContainer.classList.add('hidden');
  if (homeScreen) homeScreen.classList.remove('hidden');
});

// Dispara desde el "cuerno" del jugador. La bala sale hacia ARRIBA
// con ángulo a izq/centro/der según la X tocada en el canvas.
function shootBulletAtX(touchX) {
  if (!isGameRunning || isPaused || isAwaitingContinue) return;

  const cw = canvas.clientWidth;

  // 1) Punto de salida = cuerno (ajusta el offset si tu sprite no está centrado)
  const hornX = PLAYER.x + PLAYER.w * 0.5; // centro del jugador
  const hornY = PLAYER.y + 4;

  // 2) Ángulo de disparo según dónde tocaste respecto del cuerno
  //    Máximo ±60° respecto de vertical.
  const maxAngle = Math.PI / 3; // 60°
  const rel = (Math.max(0, Math.min(cw, touchX)) - hornX) / (cw * 0.5); // ~[-1..1]
  const angle = Math.max(-maxAngle, Math.min(maxAngle, rel * maxAngle));

  // 3) Velocidad: siempre hacia ARRIBA (dy negativo), con dx según el ángulo
  const speed = 12;
  const dx = Math.sin(angle) * speed;      // derecha/izquierda
  const dy = -Math.cos(angle) * speed;     // siempre hacia ARRIBA

  bullets.push({ x: hornX, y: hornY, dx, dy, r: 4 });
}



// ===== INPUT (PC vs Móvil) =====
const IS_DESKTOP = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

// En PC: mover con mouse
if (IS_DESKTOP) {
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const newTarget = e.clientX - rect.left;
    // suavizado
    targetX = targetX * 0.7 + newTarget * 0.3;
  });
}
// CLICK = SOLO DISPARAR HACIA ARRIBA, EN LA X DEL CLICK
canvas.addEventListener("click", (e) => {
  if (!isGameRunning) return;
  const rect = canvas.getBoundingClientRect();
  shootBulletAtX(e.clientX - rect.left);
});

// TOUCH = SOLO DISPARAR HACIA ARRIBA, EN LA X DEL TOUCH
canvas.addEventListener("touchend", (e) => {
  if (!isGameRunning) return;
  const rect = canvas.getBoundingClientRect();
  const t = e.changedTouches[0];
  shootBulletAtX(t.clientX - rect.left);
  e.preventDefault();
}, { passive: false });


