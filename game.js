// ===== GAME CORE =====
const canvas = document.getElementById("gameCanvas");
if (!canvas) { console.error("[GAME] #gameCanvas no está en el DOM"); }
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
let continueDeadline = 0;
let continueTimerId = null;

// Sistema de cadenas
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

// ===== PLAYER OBJECT =====
const PLAYER = {
  x: 180,
  y: 600,
  w: 40,
  h: 40,
  dy: 0,
  vx: 0,
  glowIntensity: 0,
  trailParticles: []
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
let particles = [];

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

// ===== SISTEMA DE MOVIMIENTO MÓVIL PROFESIONAL =====
let tiltInput = 0;
let calibrationOffset = 0;
let isCalibrated = false;
let lastTiltReading = 0;
let smoothTilt = 0;
let calibrationSamples = [];

// Detección de dispositivo mejorada
const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                 ('ontouchstart' in window) || 
                 (navigator.maxTouchPoints > 0);
const IS_DESKTOP = !IS_MOBILE;

// Variables para movimiento desktop
let mouseX = 200, targetX = 200, smoothMouseX = 200;

// SISTEMA DE GIROSCOPIO PROFESIONAL Y REDISEÑADO
class GyroscopeController {
  constructor() {
    this.isActive = false;
    this.calibrationOffset = 0;
    this.isCalibrated = false;
    this.samples = [];
    this.tiltValue = 0;
    this.smoothTilt = 0;
    this.hasPermission = false;
    
    // Configuración optimizada
    this.DEAD_ZONE = 3.0;
    this.MAX_TILT = 30.0;
    this.SENSITIVITY = 1.5;
    this.SMOOTHING = 0.15;
    
    this.init();
  }
  
  async init() {
    if (!window.DeviceOrientationEvent || !IS_MOBILE) {
      console.log('[GYRO] No disponible en este dispositivo');
      return;
    }
    
    console.log('[GYRO] Inicializando sistema profesional');
    
    // Solicitar permisos en iOS
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        this.hasPermission = response === 'granted';
        console.log(`[GYRO] Permisos iOS: ${this.hasPermission ? 'CONCEDIDOS' : 'DENEGADOS'}`);
      } catch (error) {
        console.warn('[GYRO] Error solicitando permisos iOS:', error);
        this.hasPermission = false;
      }
    } else {
      this.hasPermission = true; // Android y otros
    }
    
    if (this.hasPermission) {
      this.startListening();
    }
  }
  
  startListening() {
    window.addEventListener("deviceorientation", (e) => {
      this.handleOrientation(e);
    }, { passive: true });
    
    this.isActive = true;
    this.startCalibration();
    console.log('[GYRO] Sistema activo');
  }
  
  handleOrientation(event) {
    if (!event.gamma || !this.isActive) return;
    
    const rawGamma = event.gamma;
    this.lastTiltReading = rawGamma;
    
    // Fase de calibración
    if (!this.isCalibrated) {
      this.samples.push(rawGamma);
      return;
    }
    
    // Procesar inclinación calibrada
    let calibratedTilt = rawGamma - this.calibrationOffset;
    
    // Aplicar zona muerta para estabilidad
    if (Math.abs(calibratedTilt) < this.DEAD_ZONE) {
      calibratedTilt = 0;
    } else {
      // Remover zona muerta manteniendo dirección
      const sign = calibratedTilt > 0 ? 1 : -1;
      calibratedTilt = sign * (Math.abs(calibratedTilt) - this.DEAD_ZONE);
    }
    
    // Normalizar a rango [-1, 1]
    calibratedTilt = Math.max(-this.MAX_TILT, Math.min(this.MAX_TILT, calibratedTilt));
    let normalizedTilt = (calibratedTilt / this.MAX_TILT) * this.SENSITIVITY;
    normalizedTilt = Math.max(-1, Math.min(1, normalizedTilt));
    
    // Suavizado adaptativo
    this.smoothTilt = this.smoothTilt * (1 - this.SMOOTHING) + normalizedTilt * this.SMOOTHING;
    this.tiltValue = this.smoothTilt;
    
    // Actualizar variable global
    tiltInput = this.tiltValue;
  }
  
  startCalibration() {
    this.samples = [];
    this.isCalibrated = false;
    console.log('[GYRO] Iniciando calibración inteligente...');
    
    setTimeout(() => {
      if (this.samples.length >= 15) {
        // Usar mediana para robustez
        this.samples.sort((a, b) => a - b);
        const mid = Math.floor(this.samples.length / 2);
        this.calibrationOffset = this.samples[mid];
        this.isCalibrated = true;
        console.log(`[GYRO] Calibración completada: ${this.calibrationOffset.toFixed(2)}°`);
        
        // Notificar al usuario
        this.showCalibrationComplete();
      } else {
        console.warn('[GYRO] Muestras insuficientes, usando valor por defecto');
        this.calibrationOffset = 0;
        this.isCalibrated = true;
      }
    }, 1500);
  }
  
  showCalibrationComplete() {
    // Crear indicador visual temporal
    const indicator = document.createElement('div');
    indicator.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(46, 204, 113, 0.9);
      color: white;
      padding: 10px 20px;
      border-radius: 25px;
      font-size: 14px;
      font-weight: bold;
      z-index: 10000;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;
    indicator.textContent = '📱 Giroscopio calibrado';
    document.body.appendChild(indicator);
    
    setTimeout(() => {
      indicator.style.opacity = '0';
      setTimeout(() => indicator.remove(), 300);
    }, 1500);
  }
  
  recalibrate() {
    if (this.isActive) {
      console.log('[GYRO] Recalibración manual iniciada');
      this.startCalibration();
    }
  }
  
  getTiltInput() {
    return this.isCalibrated ? this.tiltValue : 0;
  }
  
  getStatus() {
    return {
      isActive: this.isActive,
      isCalibrated: this.isCalibrated,
      hasPermission: this.hasPermission,
      currentTilt: this.tiltValue,
      calibrationOffset: this.calibrationOffset
    };
  }
}

// Instanciar controlador de giroscopio
const gyroController = new GyroscopeController();
// ===== PARTICLE SYSTEM =====
class Particle {
  constructor(x, y, vx, vy, color, life, size = 2) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.size = size;
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.1;
    this.life--;
    this.vx *= 0.99;
  }
  
  draw(ctx) {
    const alpha = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  
  isDead() {
    return this.life <= 0;
  }
}

function addParticles(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 2 + Math.random() * 3;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 2;
    particles.push(new Particle(x, y, vx, vy, color, 30 + Math.random() * 20));
  }
}

// ===== PROGRESSIVE DIFFICULTY SYSTEM =====
function getDifficulty() {
  const rawLevel = score / 200;
  const level = Math.floor(rawLevel);
  const progress = rawLevel - level;
  
  const lerp = (start, end, t) => start + (end - start) * Math.min(1, t);
  
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

// ===== PLATFORM GENERATION =====
function createInitialPlatforms() {
  platforms = [];
  obstacles = [];
  blackHoles = [];
  boosters = [];
  particles = [];
  
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
      obstacles.push({
        x: mainX + w/2 - 15, y: y - 35, w: 30, h: 30,
        lives: 1, maxLives: 1, vx: 0
      });
    },
    
    // Patrón: Escalera ascendente
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
    
    // Patrón: Super jump con landing challenge
    () => {
      platforms.push({
        x: cw * 0.15, y: y, w: w * 0.7, h: PLATFORM_H,
        type: PLATFORM_TYPES.SUPER_JUMP, vx: 0, vy: 0, baseY: y
      });
      platforms.push({
        x: cw * 0.8, y: y - 60, w: w * 0.6, h: PLATFORM_H,
        type: PLATFORM_TYPES.NORMAL, vx: 0, vy: 0, baseY: y - 60
      });
      blackHoles.push({
        x: cw * 0.5, y: y - 30, radius: 18, pullRadius: 50, rotation: 0
      });
    }
  ];
  
  const maxPatterns = Math.min(patterns.length, 3 + Math.floor(difficulty.level / 2));
  const availablePatterns = patterns.slice(0, maxPatterns);
  const pattern = availablePatterns[Math.floor(Math.random() * availablePatterns.length)];
  pattern();
}

function spawnPlatformAt(y, widthOpt) {
  if (initialBoost) return;
  
  const difficulty = getDifficulty();
  const cw = canvas.clientWidth;
  
  if (Math.random() < difficulty.complexPatternProb) {
    spawnComplexPattern(y, difficulty);
    return;
  }
  
  const w = widthOpt || difficulty.width;
  let x = Math.random() * (cw - w);
  
  let type = PLATFORM_TYPES.NORMAL;
  let vx = 0, vy = 0;
  
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
  
  // Spawns adicionales
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
  // Actualizar efectos visuales
  PLAYER.glowIntensity = boosting ? Math.sin(Date.now() * 0.01) * 0.5 + 0.5 : 0;
  
  // Trail de partículas cuando está boosting
  if (boosting && Math.random() < 0.3) {
    const trailX = PLAYER.x + PLAYER.w/2 + (Math.random() - 0.5) * PLAYER.w;
    const trailY = PLAYER.y + PLAYER.h;
    particles.push(new Particle(trailX, trailY, 0, 2, '#5b8cff', 20, 1));
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
      for (const particle of particles) particle.y += delta;
      
      cameraY += delta;
      
      if (gameStarted) {
        const newScore = Math.floor(cameraY / 5);
        if (newScore > score) {
          score = newScore;
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
    
    // Movimiento vertical
    if (p.vy) {
      p.y += p.vy;
      if (Math.abs(p.y - p.baseY) > 35) {
        p.vy *= -1;
      }
    }
    
    // Colisiones - CORREGIR BUG CRÍTICO
    if (!boosting && PLAYER.dy > 0) {
      const prevBottom = prevPlayerY + PLAYER.h;
      const nowBottom = PLAYER.y + PLAYER.h;
      
      // FIX CRÍTICO: validar que prevPlayerY sea válido
      if (prevBottom <= p.y && nowBottom >= p.y && prevPlayerY > 0) {
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
          
          // Efectos de aterrizaje
          addParticles(PLAYER.x + PLAYER.w/2, p.y, 3, '#40b66b');
          
          const playerCenter = PLAYER.x + PLAYER.w / 2;
          const platformRight = p.x + p.w;
          const buttonZone = platformRight - 15;
          const touchedButton = PLAYER.x + PLAYER.w > buttonZone;
          
          switch (p.type) {
            case PLATFORM_TYPES.SUPER_JUMP:
              PLAYER.dy = touchedButton ? jumpStrength * 2.2 : jumpStrength;
              if (touchedButton) addParticles(PLAYER.x + PLAYER.w/2, PLAYER.y, 8, '#ff1493');
              break;
            case PLATFORM_TYPES.GREAT_JUMP:
              PLAYER.dy = touchedButton ? jumpStrength * 1.6 : jumpStrength;
              if (touchedButton) addParticles(PLAYER.x + PLAYER.w/2, PLAYER.y, 6, '#ff69b4');
              break;
            case PLATFORM_TYPES.MINI_JUMP:
              PLAYER.dy = touchedButton ? jumpStrength * 0.6 : jumpStrength;
              if (touchedButton) addParticles(PLAYER.x + PLAYER.w/2, PLAYER.y, 4, '#87ceeb');
              break;
            case PLATFORM_TYPES.BREAKABLE:
              PLAYER.dy = jumpStrength;
              p.health--;
              addParticles(PLAYER.x + PLAYER.w/2, p.y, 5, '#8b4513');
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
    
    // Matar obstáculos pisándolos desde arriba
    const playerBottom = PLAYER.y + PLAYER.h;
    const playerTop = PLAYER.y;
    const playerLeft = PLAYER.x;
    const playerRight = PLAYER.x + PLAYER.w;
    
    const obstacleTop = o.y;
    const obstacleBottom = o.y + o.h;
    const obstacleLeft = o.x;
    const obstacleRight = o.x + o.w;
    
    // FIX: Validar prevPlayerY antes de usar
    if (PLAYER.dy > 0 && 
        prevPlayerY > 0 &&
        prevPlayerY + PLAYER.h <= obstacleTop && 
        playerBottom >= obstacleTop && 
        playerRight > obstacleLeft && 
        playerLeft < obstacleRight) {
      
      // Efectos de destrucción
      addParticles(o.x + o.w/2, o.y, 8, '#ff4757');
      obstacles.splice(i, 1);
      PLAYER.dy = jumpStrength * 1.5;
      PLAYER.y = obstacleTop - PLAYER.h;
      continue;
    }
    
    // Colisión normal - SOLO si el juego está corriendo correctamente
    if (isGameRunning && !isAwaitingContinue && !isPaused &&
        playerLeft < obstacleRight && 
        playerRight > obstacleLeft &&
        playerTop < obstacleBottom && 
        playerBottom > obstacleTop) {
      onPlayerDeath('obstacle');
      return;
    }
    
    // Colisión con balas
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (b.x > obstacleLeft - 5 && b.x < obstacleRight + 5 && 
          b.y > obstacleTop - 5 && b.y < obstacleBottom + 5) {
        bullets.splice(j, 1);
        o.lives--;
        addParticles(b.x, b.y, 4, '#e74c3c');
        if (o.lives <= 0) {
          addParticles(o.x + o.w/2, o.y + o.h/2, 10, '#ff4757');
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
      
      // Efectos visuales de succión
      if (Math.random() < 0.4) {
        const suckX = playerCenterX + (Math.random() - 0.5) * 40;
        const suckY = playerCenterY + (Math.random() - 0.5) * 40;
        particles.push(new Particle(suckX, suckY, 
          (bh.x - suckX) * 0.1, (bh.y - suckY) * 0.1, 
          '#16213e', 15, 1));
      }
    }
    
    // FIX: Solo colisión de muerte si el juego está corriendo
    if (isGameRunning && !isAwaitingContinue && !isPaused && distance < bh.radius) {
      onPlayerDeath('blackhole');
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
      
      // Efectos visuales de booster
      addParticles(bs.x + bs.w/2, bs.y + bs.h/2, 12, bs.type === BOOSTER_TYPES.SHORT ? '#2ecc71' : '#3498db');
      
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

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    if (particles[i].isDead()) {
      particles.splice(i, 1);
    }
  }
}

function cleanupElements() {
  const screenBottom = canvas.clientHeight + 100;
  platforms = platforms.filter(p => p.y < screenBottom);
  obstacles = obstacles.filter(o => o.y < screenBottom);
  blackHoles = blackHoles.filter(bh => bh.y < screenBottom);
  boosters = boosters.filter(bs => bs.y < screenBottom);
}

// ===== ENHANCED DRAWING =====
function drawPlayer() {
  const centerX = PLAYER.x + PLAYER.w / 2;
  const centerY = PLAYER.y + PLAYER.h / 2;
  
  // Glow effect cuando está boosting
  if (boosting || PLAYER.glowIntensity > 0) {
    const glowSize = PLAYER.w + (PLAYER.glowIntensity * 10);
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowSize);
    gradient.addColorStop(0, `rgba(91, 140, 255, ${0.3 + PLAYER.glowIntensity * 0.4})`);
    gradient.addColorStop(1, 'rgba(91, 140, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowSize, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Cuerpo principal con gradiente
  const bodyGradient = ctx.createLinearGradient(PLAYER.x, PLAYER.y, PLAYER.x, PLAYER.y + PLAYER.h);
  bodyGradient.addColorStop(0, '#7ba3ff');
  bodyGradient.addColorStop(1, '#4a75ff');
  
  ctx.fillStyle = bodyGradient;
  ctx.fillRect(PLAYER.x, PLAYER.y, PLAYER.w, PLAYER.h);
  
  // Highlight superior
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillRect(PLAYER.x + 2, PLAYER.y + 2, PLAYER.w - 4, 8);
  
  // Borde sutil
  ctx.strokeStyle = '#2c5aa0';
  ctx.lineWidth = 1;
  ctx.strokeRect(PLAYER.x, PLAYER.y, PLAYER.w, PLAYER.h);
}

function drawPlatforms() {
  for (const p of platforms) {
    let gradient;
    
    switch (p.type) {
      case PLATFORM_TYPES.MOVING_HORIZONTAL:
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, '#ffb347');
        gradient.addColorStop(1, '#ff8c00');
        break;
      case PLATFORM_TYPES.MOVING_VERTICAL:
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, '#ff9f5a');
        gradient.addColorStop(1, '#ff7527');
        break;
      case PLATFORM_TYPES.BREAKABLE:
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, '#a0522d');
        gradient.addColorStop(1, '#6b3410');
        break;
      case PLATFORM_TYPES.TRANSPARENT:
        ctx.fillStyle = "rgba(64, 182, 107, 0.4)";
        ctx.fillRect(p.x, p.y, p.w, p.h);
        // Borde punteado
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "#40b66b";
        ctx.strokeRect(p.x, p.y, p.w, p.h);
        ctx.setLineDash([]);
        continue;
      case PLATFORM_TYPES.SUPER_JUMP:
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, '#ff69b4');
        gradient.addColorStop(1, '#dc143c');
        break;
      case PLATFORM_TYPES.GREAT_JUMP:
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, '#ff8fa3');
        gradient.addColorStop(1, '#ff1493');
        break;
      case PLATFORM_TYPES.MINI_JUMP:
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, '#b0e0e6');
        gradient.addColorStop(1, '#4682b4');
        break;
      default:
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, '#5fbf73');
        gradient.addColorStop(1, '#2e7d32');
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    
    // Highlight superior
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(p.x, p.y, p.w, 2);
    
    // Dibujar botones con animación
    if (p.type === PLATFORM_TYPES.SUPER_JUMP || 
        p.type === PLATFORM_TYPES.GREAT_JUMP || 
        p.type === PLATFORM_TYPES.MINI_JUMP) {
      
      const pulse = Math.sin(Date.now() * 0.008) * 0.2 + 0.8;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * pulse})`;
      
      const buttonSize = p.type === PLATFORM_TYPES.SUPER_JUMP ? 10 : 
                        p.type === PLATFORM_TYPES.GREAT_JUMP ? 8 : 6;
      
      ctx.fillRect(p.x + p.w - buttonSize - 2, p.y - buttonSize, buttonSize, buttonSize);
      
      // Borde del botón
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x + p.w - buttonSize - 2, p.y - buttonSize, buttonSize, buttonSize);
    }
  }
}

function drawObstacles() {
  for (const o of obstacles) {
    let gradient;
    
    if (o.lives === 1) {
      gradient = ctx.createRadialGradient(o.x + o.w/2, o.y + o.h/2, 0, o.x + o.w/2, o.y + o.h/2, o.w/2);
      gradient.addColorStop(0, '#ff6b7a');
      gradient.addColorStop(1, '#ff3742');
    } else {
      gradient = ctx.createRadialGradient(o.x + o.w/2, o.y + o.h/2, 0, o.x + o.w/2, o.y + o.h/2, o.w/2);
      gradient.addColorStop(0, '#ff7f7f');
      gradient.addColorStop(1, '#ff4757');
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    
    // Borde
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x, o.y, o.w, o.h);
    
    // Texto de vidas con sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(o.lives.toString(), o.x + o.w/2 + 1, o.y + o.h/2 + 6);
    
    ctx.fillStyle = "white";
    ctx.fillText(o.lives.toString(), o.x + o.w/2, o.y + o.h/2 + 5);
  }
}

function drawBlackHoles() {
  for (const bh of blackHoles) {
    ctx.save();
    ctx.translate(bh.x, bh.y);
    ctx.rotate(bh.rotation);
    
    // Múltiples capas para efecto más realista
    const layers = [
      { radius: bh.radius * 1.2, color: '#0f0f23', alpha: 0.3 },
      { radius: bh.radius, color: '#1a1a2e', alpha: 0.8 },
      { radius: bh.radius * 0.6, color: '#000000', alpha: 1 }
    ];
    
    layers.forEach(layer => {
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, layer.radius);
      gradient.addColorStop(0, layer.color);
      gradient.addColorStop(1, 'transparent');
      
      ctx.fillStyle = gradient;
      ctx.globalAlpha = layer.alpha;
      ctx.beginPath();
      ctx.arc(0, 0, layer.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    
    ctx.globalAlpha = 1;
    
    // Anillo de succión animado
    ctx.strokeStyle = "rgba(100, 149, 237, 0.4)";
    ctx.lineWidth = 2;
    const pulseRadius = bh.pullRadius + Math.sin(Date.now() * 0.01) * 5;
    ctx.beginPath();
    ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
  }
}

function drawBoosters() {
  for (const bs of boosters) {
    const y = bs.y + Math.sin(bs.bobOffset) * 2;
    
    let gradient;
    if (bs.type === BOOSTER_TYPES.SHORT) {
      gradient = ctx.createRadialGradient(bs.x + bs.w/2, y + bs.h/2, 0, bs.x + bs.w/2, y + bs.h/2, bs.w/2);
      gradient.addColorStop(0, '#58d68d');
      gradient.addColorStop(1, '#27ae60');
    } else {
      gradient = ctx.createRadialGradient(bs.x + bs.w/2, y + bs.h/2, 0, bs.x + bs.w/2, y + bs.h/2, bs.w/2);
      gradient.addColorStop(0, '#5dade2');
      gradient.addColorStop(1, '#3498db');
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(bs.x, y, bs.w, bs.h);
    
    // Efecto de pulso
    const pulse = Math.sin(bs.bobOffset * 2) * 0.3 + 0.7;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * pulse})`;
    ctx.fillRect(bs.x + 3, y + 3, bs.w - 6, bs.h - 6);
    
    // Borde brillante
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * pulse})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(bs.x, y, bs.w, bs.h);
  }
}

function drawBullets() {
  for (const b of bullets) {
    // Bullet con trail
    const gradient = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 6);
    gradient.addColorStop(0, '#ff6b6b');
    gradient.addColorStop(0.7, '#e74c3c');
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Core brillante
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles() {
  particles.forEach(particle => particle.draw(ctx));
}

function drawDifficultyInfo() {
  const difficulty = getDifficulty();
  
  // Fondo semitransparente para la UI
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(5, canvas.clientHeight - 80, 200, 75);
  
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "left";
  
  const progressPercent = Math.floor(difficulty.progress * 100);
  ctx.fillText(`Nivel: ${difficulty.level}`, 10, canvas.clientHeight - 55);
  ctx.fillText(`Score: ${score}`, 10, canvas.clientHeight - 35);
  
  // Barra de progreso mejorada
  const barWidth = 180;
  const barHeight = 12;
  const barX = 10;
  const barY = canvas.clientHeight - 20;
  
  // Fondo de la barra
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.fillRect(barX, barY, barWidth, barHeight);
  
  // Progreso con gradiente
  const progressGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
  progressGradient.addColorStop(0, '#3498db');
  progressGradient.addColorStop(0.5, '#2ecc71');
  progressGradient.addColorStop(1, '#e74c3c');
  
  ctx.fillStyle = progressGradient;
  ctx.fillRect(barX, barY, barWidth * difficulty.progress, barHeight);
  
  // Borde de la barra
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
  
  // Texto del progreso
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${progressPercent}%`, barX + barWidth/2, barY + 8);
}

// ===== MAIN UPDATE LOOP =====
function update() {
  if (!ctx || !canvas) return;
  
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  
  // ===== SISTEMA DE MOVIMIENTO HORIZONTAL MEJORADO =====
  {
    const w = canvas.clientWidth;

    if (IS_DESKTOP) {
      // PC: seguir al mouse con suavizado natural
      const minCenter = PLAYER.w / 2;
      const maxCenter = w - PLAYER.w / 2;
      const clampedTarget = Math.max(minCenter, Math.min(maxCenter, targetX));
      smoothMouseX = smoothMouseX * 0.8 + clampedTarget * 0.2;
      PLAYER.x = smoothMouseX - PLAYER.w / 2;
    } else {
  // MÓVIL: Sistema profesional con giroscopio
  const tilt = gyroController.getTiltInput();
  const baseSpeed = w * 0.025; // Velocidad base optimizada
  let moveSpeed = tilt * baseSpeed;
  
  // Aceleración progresiva mejorada
  const absInput = Math.abs(tilt);
  if (absInput > 0.2) {
    const accelerationFactor = 1 + (absInput - 0.2) * 2;
    moveSpeed *= accelerationFactor;
  }
  
  // Aplicar movimiento suavizado
  PLAYER.vx = PLAYER.vx * 0.8 + moveSpeed * 0.2;
  PLAYER.x += PLAYER.vx;
}

    // ===== WRAP-AROUND COMPLETO =====
    if (PLAYER.x > w) {
      PLAYER.x = -PLAYER.w;
    } else if (PLAYER.x + PLAYER.w < 0) {
      PLAYER.x = w;
    }
  }

  // Pausa - solo mantener overlay visible
  if (isPaused || isAwaitingContinue) {
    if (isGameRunning) requestAnimationFrame(update);
    return;
  }

  // Updates del juego
  updatePlayer();
  updateCamera();
  updatePlatforms();
  updateObstacles();
  updateBlackHoles();
  updateBoosters();
  updateBullets();
  updateParticles();
  cleanupElements();
  
  // Verificar caída - SOLO si el juego está corriendo
  if (isGameRunning && !isAwaitingContinue && PLAYER.y > canvas.clientHeight + 60) {
    onPlayerDeath('fall');
    return;
  }
  
  // Drawing con efectos mejorados
  drawPlayer();
  drawPlatforms();
  drawObstacles();
  drawBlackHoles();
  drawBoosters();
  drawBullets();
  drawParticles();
  drawDifficultyInfo();
  
  // IMPORTANTE: Actualizar prevPlayerY AL FINAL
  prevPlayerY = PLAYER.y;
  
  if (isGameRunning) requestAnimationFrame(update);
}

// ===== GAME MANAGEMENT =====
function startGame() {
  const c = canvas;
  const context = ctx;
  if (!c || !context) {
    console.error('[GAME] Canvas no disponible al iniciar');
    return;
  }

  resizeCanvasToContainer();

  // Solicitar permisos en iOS MEJORADO
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
    console.log('[iOS] Solicitando permisos...');
    DeviceOrientationEvent.requestPermission()
      .then(response => {
        if (response === 'granted') {
          console.log('[iOS] Permisos de orientación concedidos');
        } else {
          console.warn('[iOS] Permisos denegados:', response);
        }
      })
      .catch(error => {
        console.error('[iOS] Error solicitando permisos:', error);
      });
  }

  // Reset estado COMPLETO
  deathCount = 0;
  continuePriceWLD = 0.11;
  isPaused = false;
  isAwaitingContinue = false;
  $overlayPause?.classList.add('hidden');
  $overlayContinue?.classList.add('hidden');
  $overlayGameOver?.classList.add('hidden');

  isGameRunning = true;
  boosting = true;
  initialBoost = true;
  boostingTime = 0;
  score = 0;
  cameraY = 0;
  gameStarted = false;

  const scoreElement = document.getElementById("score");
  if (scoreElement) scoreElement.innerText = "Score: 0";

  // Reset sistema de inclinación PARA MÁXIMA RESPUESTA
  isCalibrated = false;
  calibrationSamples = [];
  calibrationOffset = 0;
  tiltInput = 0;
  rawTiltInput = 0; // Nuevo campo
  lastTiltTime = 0;

  // Posición inicial centrada
  PLAYER.x = c.clientWidth / 2 - PLAYER.w / 2;
  PLAYER.y = c.clientHeight - 100;
  PLAYER.dy = 0;
  PLAYER.vx = 0;
  PLAYER.glowIntensity = 0;
  prevPlayerY = PLAYER.y; // IMPORTANTE: Inicializar correctamente

  // Objetivos de movimiento
  mouseX = c.clientWidth / 2;
  targetX = c.clientWidth / 2;
  smoothMouseX = c.clientWidth / 2;

  bullets = [];
  createInitialPlatforms();

  console.log('[GAME] Juego iniciado correctamente');

  // Fin del booster inicial
  setTimeout(() => {
    boosting = false;
    boostingTime = 0;
    initialBoost = false;
    gameStarted = true;
    maybeSpawnNewTopPlatforms();
    console.log('[GAME] Booster inicial terminado');
  }, 1800);

  update();
}

function finalizeGameOver() {
  console.log('[GAME] Finalizando game over');
  isGameRunning = false;
  isAwaitingContinue = false; // IMPORTANTE
  
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
  $finalScore && ($finalScore.textContent = String(score));
  $finalCoins && ($finalCoins.textContent = String(Math.floor(score/100)));
  $overlayGameOver?.classList.remove('hidden');
}

// FIX CRÍTICO: Función endGame simplificada
function endGame() {
  console.log('[GAME] Juego terminado - transición a game over');
  onPlayerDeath('generic');
}

// FIX CRÍTICO: onPlayerDeath mejorado
function onPlayerDeath(reason) {
  console.log(`[GAME] Jugador murió: ${reason}`);
  
  if (!isGameRunning || isAwaitingContinue) {
    console.log('[GAME] Muerte ignorada - juego no está corriendo o ya esperando continue');
    return;
  }
  
  // Detener el juego INMEDIATAMENTE
  isGameRunning = false;
  isAwaitingContinue = true;
  setPaused(false);

  deathCount += 1;
  continuePriceWLD = 0.11 + 0.05 * (deathCount - 1);
  if ($continuePrice) $continuePrice.textContent = `${continuePriceWLD.toFixed(2)} WLD`;

  $overlayContinue?.classList.remove('hidden');
  startPieCountdown(5);
}

function startPieCountdown(seconds) {
  clearInterval(continueTimerId);
  const total = seconds * 1000;
  continueDeadline = Date.now() + total;

  continueTimerId = setInterval(() => {
    const left = Math.max(0, continueDeadline - Date.now());
    const pct = 1 - left / total;
    const angle = Math.floor(360 * pct) + 'deg';
    if ($pie) $pie.style.setProperty('--angle', angle);
    if ($pieLabel) $pieLabel.textContent = String(Math.ceil(left/1000));
    if (left <= 0) {
      clearInterval(continueTimerId);
      $overlayContinue?.classList.add('hidden');
      showFinalGameOver();
    }
  }, 100);
}

// FIX CRÍTICO: applyContinue corregido
async function applyContinue() {
  console.log(`[CONTINUE] Aplicando continue por ${continuePriceWLD} WLD`);
  
  // SIMULAR pago exitoso por ahora - CAMBIAR cuando tengas la función real
  let paymentOk = true;
  
  if (typeof window.payForContinueWLD === 'function') {
    try {
      paymentOk = await window.payForContinueWLD(continuePriceWLD);
      console.log(`[CONTINUE] Resultado del pago: ${paymentOk}`);
    } catch (error) {
      console.error('[CONTINUE] Error en el pago:', error);
      paymentOk = false;
    }
  }

  if (!paymentOk) {
    console.log('[CONTINUE] Pago fallido - yendo a game over');
    clearInterval(continueTimerId);
    $overlayContinue?.classList.add('hidden');
    showFinalGameOver();
    return;
  }

  console.log('[CONTINUE] Pago exitoso - respawneando jugador');
  safeRespawn();
  clearInterval(continueTimerId);
  $overlayContinue?.classList.add('hidden');
  isAwaitingContinue = false;
  isGameRunning = true;
  update();
}

function showFinalGameOver() {
  console.log('[GAME] Mostrando game over final');
  finalizeGameOver();
}

function safeRespawn() {
  console.log('[RESPAWN] Respawneando jugador de forma segura');
  
  const y = canvas.clientHeight * 0.6;
  const w = 100;
  const x = (canvas.clientWidth - w)/2;
  
  // Crear plataforma segura
  platforms.push({ 
    x, y, w, h: PLATFORM_H, 
    type: PLATFORM_TYPES.NORMAL, 
    vx: 0, vy: 0, baseY: y 
  });

  // Posicionar jugador
  PLAYER.x = x + (w - PLAYER.w)/2;
  PLAYER.y = y - PLAYER.h - 5;
  PLAYER.dy = jumpStrength * 0.9;
  prevPlayerY = PLAYER.y; // IMPORTANTE: actualizar prevPlayerY

  // Limpiar obstáculos cercanos
  obstacles = obstacles.filter(o => o.y < y - 50 || o.y > y + 100);
  blackHoles = blackHoles.filter(bh => bh.y < y - 80 || bh.y > y + 120);
  
  console.log(`[RESPAWN] Jugador respawneado en X:${PLAYER.x.toFixed(1)}, Y:${PLAYER.y.toFixed(1)}`);
}

// ===== SHOOTING SYSTEM =====
function shootBulletAtX(touchX) {
  if (!isGameRunning || isPaused || isAwaitingContinue) return;

  const cw = canvas.clientWidth;
  const hornX = PLAYER.x + PLAYER.w * 0.5;
  const hornY = PLAYER.y + 4;

  const maxAngle = Math.PI / 3;
  const rel = (Math.max(0, Math.min(cw, touchX)) - hornX) / (cw * 0.5);
  const angle = Math.max(-maxAngle, Math.min(maxAngle, rel * maxAngle));

  const speed = 12;
  const dx = Math.sin(angle) * speed;
  const dy = -Math.cos(angle) * speed;

  bullets.push({ x: hornX, y: hornY, dx, dy, r: 4 });
  
  // Efecto visual del disparo
  addParticles(hornX, hornY, 3, '#ff6b6b');
}

// ===== EVENT HANDLERS =====
function setPaused(v) {
  isPaused = !!v;
  console.log(`[PAUSE] Pausa ${isPaused ? 'activada' : 'desactivada'}`);
  if (isPaused) { 
    $overlayPause?.classList.remove('hidden'); 
  } else { 
    $overlayPause?.classList.add('hidden'); 
  }
}

// ===== INPUT HANDLING MEJORADO =====
if (IS_DESKTOP) {
  // Mouse movement con mejor interpolación
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const newTarget = e.clientX - rect.left;
    // Interpolación más suave para desktop
    targetX = targetX * 0.75 + newTarget * 0.25;
  });
}

// Sistema de disparo optimizado para móvil y desktop
canvas.addEventListener("click", (e) => {
  if (!isGameRunning) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  shootBulletAtX(e.clientX - rect.left);
});

canvas.addEventListener("touchstart", (e) => {
  if (!isGameRunning) return;
  e.preventDefault(); // Prevenir zoom y otros comportamientos
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  if (!isGameRunning) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  if (e.changedTouches.length > 0) {
    const touch = e.changedTouches[0];
    shootBulletAtX(touch.clientX - rect.left);
  }
}, { passive: false });

// Prevenir comportamientos no deseados en móvil
canvas.addEventListener("touchmove", (e) => {
  e.preventDefault(); // Prevenir scroll de página
}, { passive: false });

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault(); // Prevenir menú contextual
});

// ===== UI EVENT LISTENERS =====
$pauseBtn?.addEventListener('click', () => setPaused(!isPaused));
document.getElementById('btn-resume')?.addEventListener('click', () => setPaused(false));
document.getElementById('btn-continue')?.addEventListener('click', applyContinue);
document.getElementById('btn-no-continue')?.addEventListener('click', () => {
  console.log('[CONTINUE] Usuario rechazó continue');
  clearInterval(continueTimerId);
  $overlayContinue?.classList.add('hidden');
  showFinalGameOver();
});
document.getElementById('btn-back-menu')?.addEventListener('click', () => {
  console.log('[UI] Volviendo al menú principal');
  $overlayGameOver?.classList.add('hidden');
  const gameContainer = document.getElementById('game-container');
  const homeScreen = document.getElementById('home-screen');
  if (gameContainer) gameContainer.classList.add('hidden');
  if (homeScreen) homeScreen.classList.remove('hidden');
});

// ===== FUNCIONES DE UTILIDAD PARA DEBUGGING =====
function addDebugInfo() {
  if (typeof console !== 'undefined' && IS_MOBILE) {
    // Debug info cada 5 segundos solo en móvil
    setInterval(() => {
      if (isGameRunning) {
        console.log(`[DEBUG] Tilt: ${tiltInput.toFixed(3)}, Calibrated: ${isCalibrated}, Player X: ${PLAYER.x.toFixed(1)}, Game State: running`);
      } else {
        console.log(`[DEBUG] Game State: ${isAwaitingContinue ? 'awaiting-continue' : 'stopped'}`);
      }
    }, 5000);
  }
}

// Función para recalibrar manualmente (mejorada)
function forceRecalibration() {
  if (IS_MOBILE) {
    isCalibrated = false;
    calibrationSamples = [];
    calibrationOffset = 0;
    tiltInput = 0;
    console.log('[DEBUG] Recalibración forzada - sistema reset');
  }
}

// ===== INICIALIZACIÓN Y EXPORTS =====
// Inicializar debug info si estamos en desarrollo
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  addDebugInfo();
  // Exponer función de recalibración para debugging
  window.forceRecalibration = forceRecalibration;
  window.gameDebug = {
    getCurrentTilt: () => tiltInput,
    isCalibrated: () => isCalibrated,
    getCalibrationOffset: () => calibrationOffset,
    getGameState: () => ({
      isGameRunning,
      isAwaitingContinue,
      isPaused,
      score,
      deathCount
    }),
    forceRecalibration: forceRecalibration
  };
}

// Asegurar que el canvas tenga el foco correcto
if (canvas) {
  canvas.setAttribute('tabindex', '0');
  canvas.style.outline = 'none';
  
  // Prevenir el scroll del body cuando se toca el canvas
  canvas.style.touchAction = 'none';
}

// Event listener para cuando la orientación cambie
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    resizeCanvasToContainer();
    // Recalibrar después de cambio de orientación
    if (IS_MOBILE && (isGameRunning || isAwaitingContinue)) {
      setTimeout(() => {
        forceRecalibration();
      }, 500);
    }
  }, 100);
});

// Event listener para cuando la aplicación regrese del background
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && IS_MOBILE && (isGameRunning || isAwaitingContinue)) {
    // Recalibrar cuando la app regrese del background
    setTimeout(() => {
      forceRecalibration();
    }, 200);
  }
});

// Prevenir el zoom en iOS
document.addEventListener('gesturestart', function (e) {
  e.preventDefault();
});

document.addEventListener('gesturechange', function (e) {
  e.preventDefault();
});

document.addEventListener('gestureend', function (e) {
  e.preventDefault();
});

// ===== EXPORTS =====
window.startGame = startGame;

console.log('[GAME] Sistema de juego cargado correctamente');
console.log(`[DEVICE] Tipo: ${IS_MOBILE ? 'MÓVIL' : 'DESKTOP'}`);
if (IS_MOBILE) {
  console.log('[MOBILE] Sistema de inclinación mejorado activado');
}