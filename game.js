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
let initialBoost = false;
let boostingTime = 0;
let score = 0;
let highestY = 0;
let cameraY = 0;
let prevPlayerY = 0;
let gameStarted = false;
let gameHeight = 0;

// ===== PAUSE & CONTINUE STATE =====
let isPaused = false;
let isAwaitingContinue = false;
let deathCount = 0;
let continuePriceWLD = 0.11;
let continueDeadline = 0;
let continueTimerId = null;

// Doodle Jump style effects
let screenShake = 0;
let comboMultiplier = 1;
let lastPlatformHit = 0;

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

// ===== DOODLE CHARACTER =====
const PLAYER = {
  x: 180,
  y: 600,
  w: 28,
  h: 32,
  dy: 0,
  vx: 0,
  facing: 1, // 1 = right, -1 = left
  animFrame: 0,
  animSpeed: 0.2,
  bounceScale: 1,
  trailParticles: [],
  onPlatform: false
};

// Doodle Jump Physics - more authentic feel
let gravity = 0.4;
let jumpStrength = -14;
let maxFallSpeed = 12;
let horizontalSpeed = 6;
let airResistance = 0.98;

// Arrays de elementos del juego
let platforms = [];
let obstacles = [];
let blackHoles = [];
let boosters = [];
let bullets = [];
let particles = [];
let springs = [];
let enemies = [];

// Configuraciones
const BASE_PLATFORM_W = 65;
const PLATFORM_H = 16;

// Tipos de plataformas (Doodle Jump style)
const PLATFORM_TYPES = {
  NORMAL: 'normal',
  MOVING: 'moving',
  BREAKABLE: 'breakable',
  DISAPPEARING: 'disappearing',
  ICE: 'ice',
  SPRING: 'spring'
};

// ===== MOBILE MOVEMENT SYSTEM =====
let tiltInput = 0;
let calibrationOffset = 0;
let isCalibrated = false;
let lastTiltReading = 0;
let smoothTilt = 0;
let calibrationSamples = [];

const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                 ('ontouchstart' in window) || 
                 (navigator.maxTouchPoints > 0);
const IS_DESKTOP = !IS_MOBILE;

let mouseX = 200, targetX = 200, smoothMouseX = 200;

// Enhanced Gyroscope Controller for Doodle Jump feel
class GyroscopeController {
  constructor() {
    this.isActive = false;
    this.calibrationOffset = 0;
    this.isCalibrated = false;
    this.samples = [];
    this.tiltValue = 0;
    this.smoothTilt = 0;
    this.hasPermission = false;
    
    // Doodle Jump optimized settings
    this.DEAD_ZONE = 0.8;
    this.MAX_TILT = 20.0;
    this.SENSITIVITY = 1.2;
    this.SMOOTHING = 0.08;
    
    this.init();
  }
  
  async init() {
    if (!window.DeviceOrientationEvent || !IS_MOBILE) {
      console.log('[GYRO] No disponible en este dispositivo');
      return;
    }
    
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        this.hasPermission = response === 'granted';
        console.log(`[GYRO] Permisos iOS: ${this.hasPermission ? 'CONCEDIDOS' : 'DENEGADOS'}`);
      } catch (error) {
        this.hasPermission = false;
      }
    } else {
      this.hasPermission = true;
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
  }
  
  handleOrientation(event) {
    if (!event.gamma || !this.isActive) return;
    
    const rawGamma = event.gamma;
    this.lastTiltReading = rawGamma;
    
    if (!this.isCalibrated) {
      this.samples.push(rawGamma);
      return;
    }
    
    let calibratedTilt = rawGamma - this.calibrationOffset;
    
    if (Math.abs(calibratedTilt) < this.DEAD_ZONE) {
      calibratedTilt = 0;
    } else {
      const sign = calibratedTilt > 0 ? 1 : -1;
      calibratedTilt = sign * (Math.abs(calibratedTilt) - this.DEAD_ZONE);
    }
    
    calibratedTilt = Math.max(-this.MAX_TILT, Math.min(this.MAX_TILT, calibratedTilt));
    let normalizedTilt = (calibratedTilt / this.MAX_TILT) * this.SENSITIVITY;
    normalizedTilt = Math.max(-1, Math.min(1, normalizedTilt));
    
    this.smoothTilt = this.smoothTilt * (1 - this.SMOOTHING) + normalizedTilt * this.SMOOTHING;
    this.tiltValue = this.smoothTilt;
    
    tiltInput = this.tiltValue;
  }
  
  startCalibration() {
    this.samples = [];
    this.isCalibrated = false;
    
    setTimeout(() => {
      if (this.samples.length >= 10) {
        this.samples.sort((a, b) => a - b);
        const mid = Math.floor(this.samples.length / 2);
        this.calibrationOffset = this.samples[mid];
        this.isCalibrated = true;
        console.log(`[GYRO] Calibrado: ${this.calibrationOffset.toFixed(2)}°`);
      } else {
        this.calibrationOffset = 0;
        this.isCalibrated = true;
      }
    }, 1000);
  }
  
  getTiltInput() {
    return this.isCalibrated ? this.tiltValue : 0;
  }
}

const gyroController = new GyroscopeController();

// ===== ENHANCED PARTICLE SYSTEM =====
class DoodleParticle {
  constructor(x, y, vx, vy, color, life, size = 2, type = 'circle') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.type = type;
    this.gravity = 0.2;
    this.bounce = 0.7;
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.life--;
    this.vx *= 0.98;
    
    // Bounce off screen edges
    if (this.x < 0 || this.x > canvas.clientWidth) {
      this.vx *= -this.bounce;
      this.x = Math.max(0, Math.min(canvas.clientWidth, this.x));
    }
  }
  
  draw(ctx) {
    const alpha = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    
    if (this.type === 'star') {
      this.drawStar(ctx);
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  drawStar(ctx) {
    const spikes = 5;
    const outerRadius = this.size;
    const innerRadius = this.size * 0.4;
    
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.translate(this.x, this.y);
    
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / spikes;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    
    ctx.closePath();
    ctx.fill();
    ctx.translate(-this.x, -this.y);
  }
  
  isDead() {
    return this.life <= 0;
  }
}

function addDoodleParticles(x, y, count, color, type = 'circle') {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 2 + Math.random() * 4;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 3;
    particles.push(new DoodleParticle(x, y, vx, vy, color, 40 + Math.random() * 30, 3 + Math.random() * 2, type));
  }
}

// ===== DOODLE JUMP DIFFICULTY =====
function getDoodleDifficulty() {
  const level = Math.floor(score / 500);
  
  return {
    level: level,
    platformGapMin: Math.max(40, 80 - level * 3),
    platformGapMax: Math.max(80, 150 - level * 5),
    platformWidth: Math.max(45, BASE_PLATFORM_W - level * 2),
    movingPlatformProb: Math.min(0.3, 0.05 + level * 0.02),
    breakablePlatformProb: Math.min(0.2, level * 0.015),
    springProb: Math.min(0.1, 0.01 + level * 0.008),
    enemyProb: Math.min(0.15, level * 0.01),
    movingSpeed: Math.min(3, 1 + level * 0.2)
  };
}

// ===== PLATFORM GENERATION (Doodle Jump Style) =====
function createDoodlePlatforms() {
  platforms = [];
  obstacles = [];
  blackHoles = [];
  boosters = [];
  particles = [];
  springs = [];
  enemies = [];
  
  // Starting platform
  let y = canvas.clientHeight - 60;
  platforms.push({
    x: canvas.clientWidth / 2 - 60,
    y: y,
    w: 120,
    h: PLATFORM_H,
    type: PLATFORM_TYPES.NORMAL,
    vx: 0,
    baseX: canvas.clientWidth / 2 - 60,
    disappeared: false,
    breakTimer: 0
  });
  
  // Generate initial platforms going up
  for (let i = 1; i < 20; i++) {
    spawnDoodlePlatform(y - (i * 100));
  }
}

function spawnDoodlePlatform(y) {
  const difficulty = getDoodleDifficulty();
  const cw = canvas.clientWidth;
  const w = difficulty.platformWidth;
  
  let x = Math.random() * (cw - w);
  let type = PLATFORM_TYPES.NORMAL;
  let vx = 0;
  let baseX = x;
  
  // Determine platform type based on difficulty
  const rand = Math.random();
  
  if (rand < difficulty.movingPlatformProb) {
    type = PLATFORM_TYPES.MOVING;
    vx = (Math.random() < 0.5 ? -1 : 1) * difficulty.movingSpeed;
    baseX = x;
  } else if (rand < difficulty.movingPlatformProb + difficulty.breakablePlatformProb) {
    type = PLATFORM_TYPES.BREAKABLE;
  }
  
  platforms.push({
    x, y, w, h: PLATFORM_H, type, vx, baseX,
    disappeared: false,
    breakTimer: 0,
    bounceScale: 1
  });
  
  // Add springs occasionally
  if (Math.random() < difficulty.springProb) {
    springs.push({
      x: x + w/2 - 8,
      y: y - 20,
      w: 16,
      h: 20,
      compressed: 0,
      bounceScale: 1
    });
  }
  
  // Add enemies occasionally  
  if (Math.random() < difficulty.enemyProb) {
    spawnEnemy(y - 40);
  }
}

function spawnEnemy(y) {
  const cw = canvas.clientWidth;
  enemies.push({
    x: Math.random() * (cw - 30),
    y: y,
    w: 24,
    h: 24,
    vx: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random()),
    animFrame: 0,
    alive: true
  });
}

function maybeSpawnDoodlePlatforms() {
  let topY = Infinity;
  for (const p of platforms) {
    if (p.y < topY) topY = p.y;
  }
  
  while (topY > cameraY - 800) {
    const difficulty = getDoodleDifficulty();
    topY -= 60 + Math.random() * 40;
    spawnDoodlePlatform(topY);
  }
}

// ===== DOODLE JUMP UPDATE LOGIC =====
function updateDoodlePlayer() {
  const prevY = PLAYER.y;
  
  // Horizontal movement with Doodle Jump feel
  let horizontalInput = 0;
  
  if (IS_DESKTOP) {
    const centerX = canvas.clientWidth / 2;
    horizontalInput = (targetX - centerX) / (canvas.clientWidth / 2);
    horizontalInput = Math.max(-1, Math.min(1, horizontalInput));
  } else {
    horizontalInput = gyroController.getTiltInput();
  }
  
  // Apply horizontal movement
  PLAYER.vx += horizontalInput * 0.8;
  PLAYER.vx *= airResistance;
  PLAYER.vx = Math.max(-horizontalSpeed, Math.min(horizontalSpeed, PLAYER.vx));
  
  PLAYER.x += PLAYER.vx;
  
  // Screen wrapping
  if (PLAYER.x + PLAYER.w < 0) {
    PLAYER.x = canvas.clientWidth;
  } else if (PLAYER.x > canvas.clientWidth) {
    PLAYER.x = -PLAYER.w;
  }
  
  // Update facing direction
  if (PLAYER.vx > 0.5) PLAYER.facing = 1;
  else if (PLAYER.vx < -0.5) PLAYER.facing = -1;
  
  // Vertical physics
  if (boosting) {
    PLAYER.dy = -16;
    boosting = false;
    addDoodleParticles(PLAYER.x + PLAYER.w/2, PLAYER.y + PLAYER.h, 8, '#FFD700', 'star');
  } else {
    PLAYER.y += PLAYER.dy;
    PLAYER.dy += gravity;
    PLAYER.dy = Math.min(PLAYER.dy, maxFallSpeed);
  }
  
  // Animation
  if (Math.abs(PLAYER.vx) > 0.5) {
    PLAYER.animFrame += PLAYER.animSpeed;
  }
  
  // Bounce scale for landing effect
  if (PLAYER.onPlatform && PLAYER.bounceScale > 1) {
    PLAYER.bounceScale = Math.max(1, PLAYER.bounceScale - 0.05);
  }
  
  PLAYER.onPlatform = false;
}

function updateDoodleCamera() {
  // Only move camera when player goes up (Doodle Jump style)
  if (PLAYER.y < highestY) {
    highestY = PLAYER.y;
    const targetCameraY = highestY - canvas.clientHeight * 0.6;
    
    if (targetCameraY < cameraY) {
      const deltaY = cameraY - targetCameraY;
      cameraY = targetCameraY;
      
      // Move all game elements
      for (const p of platforms) {
        p.y += deltaY;
      }
      for (const o of obstacles) o.y += deltaY;
      for (const bh of blackHoles) bh.y += deltaY;
      for (const bs of boosters) bs.y += deltaY;
      for (const b of bullets) b.y += deltaY;
      for (const particle of particles) particle.y += deltaY;
      for (const s of springs) s.y += deltaY;
      for (const e of enemies) e.y += deltaY;
      
      PLAYER.y += deltaY;
      
      // Update score based on height
      const newScore = Math.floor(Math.max(0, -cameraY) / 10);
      if (newScore > score) {
        score = newScore;
        const scoreElement = document.getElementById("score");
        if (scoreElement) {
          scoreElement.innerText = "Score: " + score;
        }
      }
      
      maybeSpawnDoodlePlatforms();
    }
  }
}

function updateDoodlePlatforms() {
  for (let i = platforms.length - 1; i >= 0; i--) {
    const p = platforms[i];
    
    // Moving platform physics
    if (p.type === PLATFORM_TYPES.MOVING) {
      p.x += p.vx;
      if (p.x <= 0 || p.x + p.w >= canvas.clientWidth) {
        p.vx *= -1;
      }
    }
    
    // Platform bounce effect
    if (p.bounceScale > 1) {
      p.bounceScale = Math.max(1, p.bounceScale - 0.08);
    }
    
    // Breakable platform timer
    if (p.type === PLATFORM_TYPES.BREAKABLE && p.breakTimer > 0) {
      p.breakTimer--;
      if (p.breakTimer <= 0) {
        addDoodleParticles(p.x + p.w/2, p.y, 6, '#8B4513');
        platforms.splice(i, 1);
        continue;
      }
    }
    
    // Platform collision (only when falling down)
    if (PLAYER.dy > 0) {
      const playerBottom = PLAYER.y + PLAYER.h;
      const playerLeft = PLAYER.x + 4;
      const playerRight = PLAYER.x + PLAYER.w - 4;
      
      if (prevPlayerY + PLAYER.h <= p.y && 
          playerBottom >= p.y && 
          playerBottom <= p.y + p.h + 5 &&
          playerRight > p.x && 
          playerLeft < p.x + p.w) {
        
        if (p.type === PLATFORM_TYPES.DISAPPEARING && p.disappeared) {
          continue;
        }
        
        // Land on platform
        PLAYER.y = p.y - PLAYER.h;
        PLAYER.dy = jumpStrength;
        PLAYER.onPlatform = true;
        PLAYER.bounceScale = 1.2;
        p.bounceScale = 1.3;
        
        // Platform-specific effects
        switch (p.type) {
          case PLATFORM_TYPES.BREAKABLE:
            if (p.breakTimer <= 0) {
              p.breakTimer = 30; // Frames until break
              addDoodleParticles(PLAYER.x + PLAYER.w/2, p.y, 4, '#8B4513');
            }
            break;
            
          case PLATFORM_TYPES.ICE:
            PLAYER.vx += (Math.random() - 0.5) * 3; // Slip effect
            break;
        }
        
        // Landing effects
        addDoodleParticles(PLAYER.x + PLAYER.w/2, p.y, 3, '#90EE90');
        
        // Screen shake on high jumps
        if (Math.abs(PLAYER.dy) > 12) {
          screenShake = 5;
        }
        
        break;
      }
    }
  }
}

function updateSprings() {
  for (const s of springs) {
    if (s.compressed > 0) {
      s.compressed--;
      s.bounceScale = 1 + s.compressed * 0.1;
    } else {
      s.bounceScale = Math.max(1, s.bounceScale - 0.05);
    }
    
    // Spring collision
    if (PLAYER.dy > 0 &&
        PLAYER.x + PLAYER.w > s.x &&
        PLAYER.x < s.x + s.w &&
        PLAYER.y + PLAYER.h > s.y &&
        PLAYER.y + PLAYER.h < s.y + s.h + 10) {
      
      PLAYER.dy = jumpStrength * 1.8; // Super jump
      PLAYER.y = s.y - PLAYER.h;
      s.compressed = 15;
      screenShake = 8;
      
      addDoodleParticles(s.x + s.w/2, s.y, 10, '#FF69B4', 'star');
    }
  }
}

function updateEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    
    if (!e.alive) continue;
    
    // Enemy movement
    e.x += e.vx;
    if (e.x <= 0 || e.x + e.w >= canvas.clientWidth) {
      e.vx *= -1;
    }
    
    e.animFrame += 0.1;
    
    // Enemy collision with player
    if (PLAYER.x + PLAYER.w > e.x &&
        PLAYER.x < e.x + e.w &&
        PLAYER.y + PLAYER.h > e.y &&
        PLAYER.y < e.y + e.h) {
      
      // Check if player is falling on enemy (can kill enemy)
      if (PLAYER.dy > 0 && prevPlayerY + PLAYER.h <= e.y + 5) {
        // Kill enemy
        e.alive = false;
        PLAYER.dy = jumpStrength * 1.2;
        addDoodleParticles(e.x + e.w/2, e.y, 8, '#FF4500');
        screenShake = 3;
      } else {
        // Enemy kills player
        onPlayerDeath('enemy');
        return;
      }
    }
    
    // Bullet collision
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (b.x > e.x - 5 && b.x < e.x + e.w + 5 && 
          b.y > e.y - 5 && b.y < e.y + e.h + 5) {
        bullets.splice(j, 1);
        e.alive = false;
        addDoodleParticles(e.x + e.w/2, e.y, 6, '#FF4500');
        break;
      }
    }
  }
  
  // Remove dead enemies
  enemies = enemies.filter(e => e.alive);
}

function updateScreenShake() {
  if (screenShake > 0) {
    screenShake *= 0.9;
    if (screenShake < 0.5) screenShake = 0;
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    if (particles[i].isDead()) {
      particles.splice(i, 1);
    }
  }
}

function updateBullets() {
  for (const b of bullets) {
    b.x += b.dx;
    b.y += b.dy;
  }
  bullets = bullets.filter(b => 
    b.x > -10 && b.x < canvas.clientWidth + 10 && 
    b.y > cameraY - 100 && b.y < canvas.clientHeight + cameraY + 100
  );
}

function cleanupElements() {
  const screenBottom = canvas.clientHeight + cameraY + 200;
  platforms = platforms.filter(p => p.y < screenBottom);
  obstacles = obstacles.filter(o => o.y < screenBottom);
  springs = springs.filter(s => s.y < screenBottom);
  enemies = enemies.filter(e => e.y < screenBottom);
}

// ===== DOODLE JUMP DRAWING =====
function drawDoodlePlayer() {
  ctx.save();
  
  // Apply screen shake
  if (screenShake > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake;
    const shakeY = (Math.random() - 0.5) * screenShake;
    ctx.translate(shakeX, shakeY);
  }
  
  const centerX = PLAYER.x + PLAYER.w / 2;
  const centerY = PLAYER.y + PLAYER.h / 2;
  
  // Scale for bounce effect
  ctx.translate(centerX, centerY);
  ctx.scale(PLAYER.bounceScale * PLAYER.facing, PLAYER.bounceScale);
  ctx.translate(-centerX, -centerY);
  
  // Doodle character body
  ctx.fillStyle = '#4A90E2';
  ctx.fillRect(PLAYER.x, PLAYER.y, PLAYER.w, PLAYER.h);
  
  // Character details
  ctx.fillStyle = '#FFFFFF';
  // Eyes
  ctx.fillRect(PLAYER.x + 6, PLAYER.y + 6, 4, 4);
  ctx.fillRect(PLAYER.x + 14, PLAYER.y + 6, 4, 4);
  
  // Nose
  ctx.fillStyle = '#FFB347';
  ctx.fillRect(PLAYER.x + 12, PLAYER.y + 14, 4, 6);
  
  // Moving legs animation
  if (Math.abs(PLAYER.vx) > 0.5) {
    const legOffset = Math.sin(PLAYER.animFrame * 8) * 2;
    ctx.fillStyle = '#4A90E2';
    ctx.fillRect(PLAYER.x + 4 + legOffset, PLAYER.y + PLAYER.h, 6, 8);
    ctx.fillRect(PLAYER.x + PLAYER.w - 10 - legOffset, PLAYER.y + PLAYER.h, 6, 8);
  } else {
    ctx.fillStyle = '#4A90E2';
    ctx.fillRect(PLAYER.x + 6, PLAYER.y + PLAYER.h, 6, 8);
    ctx.fillRect(PLAYER.x + PLAYER.w - 12, PLAYER.y + PLAYER.h, 6, 8);
  }
  
  ctx.restore();
}

function drawDoodlePlatforms() {
  for (const p of platforms) {
    ctx.save();
    
    // Platform bounce effect
    const centerX = p.x + p.w / 2;
    const centerY = p.y + p.h / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(p.bounceScale, p.bounceScale);
    ctx.translate(-centerX, -centerY);
    
    let gradient;
    
    switch (p.type) {
      case PLATFORM_TYPES.NORMAL:
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, '#7ED321');
        gradient.addColorStop(1, '#5CB85C');
        break;
        
      case PLATFORM_TYPES.MOVING:
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, '#FF9500');
        gradient.addColorStop(1, '#FF7300');
        break;
        
      case PLATFORM_TYPES.BREAKABLE:
        const breakAlpha = p.breakTimer > 0 ? 0.5 + Math.sin(p.breakTimer * 0.5) * 0.3 : 1;
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, `rgba(139, 69, 19, ${breakAlpha})`);
        gradient.addColorStop(1, `rgba(101, 67, 33, ${breakAlpha})`);
        break;
        
      case PLATFORM_TYPES.ICE:
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, '#E8F4FD');
        gradient.addColorStop(1, '#B3D9F2');
        break;
        
      default:
        gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        gradient.addColorStop(0, '#7ED321');
        gradient.addColorStop(1, '#5CB85C');
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    
    // Platform highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(p.x, p.y, p.w, 3);
    
    // Platform shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);
    
    ctx.restore();
  }
}

function drawSprings() {
  for (const s of springs) {
    ctx.save();
    
    // Spring bounce effect
    const centerX = s.x + s.w / 2;
    const centerY = s.y + s.h / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(1, s.bounceScale);
    ctx.translate(-centerX, -centerY);
    
    // Spring base
    ctx.fillStyle = '#FF1493';
    ctx.fillRect(s.x, s.y + s.h - 4, s.w, 4);
    
    // Spring coils
    const coilHeight = (s.h - 4) / s.bounceScale;
    const coils = 4;
    
    ctx.strokeStyle = '#FF69B4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    for (let i = 0; i <= coils; i++) {
      const y = s.y + (i / coils) * coilHeight;
      const x = s.x + s.w/2 + (i % 2 === 0 ? -4 : 4);
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    
    ctx.restore();
  }
}

function drawEnemies() {
  for (const e of enemies) {
    if (!e.alive) continue;
    
    ctx.save();
    
    // Enemy body
    ctx.fillStyle = '#DC143C';
    ctx.fillRect(e.x, e.y, e.w, e.h);
    
    // Enemy eyes
    ctx.fillStyle = '#FFFFFF';
    const eyeOffset = Math.sin(e.animFrame * 4) * 1;
    ctx.fillRect(e.x + 4 + eyeOffset, e.y + 4, 3, 3);
    ctx.fillRect(e.x + e.w - 7 + eyeOffset, e.y + 4, 3, 3);
    
    // Enemy pupils
    ctx.fillStyle = '#000000';
    ctx.fillRect(e.x + 5 + eyeOffset, e.y + 5, 1, 1);
    ctx.fillRect(e.x + e.w - 6 + eyeOffset, e.y + 5, 1, 1);
    
    // Enemy teeth
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(e.x + 4 + i * 4, e.y + e.h - 4, 2, 4);
    }
    
    ctx.restore();
  }
}

function drawBullets() {
  for (const b of bullets) {
    // Bullet trail
    const gradient = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 8);
    gradient.addColorStop(0, '#FFD700');
    gradient.addColorStop(0.7, '#FFA500');
    gradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Bullet core
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles() {
  particles.forEach(particle => particle.draw(ctx));
}

function drawUI() {
  // Score with Doodle Jump style
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(10, 10, 200, 80);
  
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${score}`, 20, 40);
  
  // Height indicator
  const height = Math.floor(Math.max(0, -cameraY) / 10);
  ctx.font = "16px Arial";
  ctx.fillText(`Height: ${height}m`, 20, 65);
  
  // Level indicator
  const difficulty = getDoodleDifficulty();
  ctx.fillText(`Level: ${difficulty.level}`, 20, 85);
}

// ===== MAIN UPDATE LOOP =====
function update() {
  if (!ctx || !canvas) return;
  
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  
  // Background gradient (Doodle Jump style)
  const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight);
  bgGradient.addColorStop(0, '#87CEEB');
  bgGradient.addColorStop(1, '#E0F6FF');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  
  // Pausa - solo mantener overlay visible
  if (isPaused || isAwaitingContinue) {
    if (isGameRunning) requestAnimationFrame(update);
    return;
  }

  // Updates del juego
  updateDoodlePlayer();
  updateDoodleCamera();
  updateDoodlePlatforms();
  updateSprings();
  updateEnemies();
  updateBullets();
  updateParticles();
  updateScreenShake();
  cleanupElements();
  
  // Verificar caída - SOLO si el juego está corriendo
  if (isGameRunning && !isAwaitingContinue && PLAYER.y > canvas.clientHeight + cameraY + 200) {
    onPlayerDeath('fall');
    return;
  }
  
  // Drawing con efectos mejorados
  drawDoodlePlatforms();
  drawSprings();
  drawEnemies();
  drawDoodlePlayer();
  drawBullets();
  drawParticles();
  drawUI();
  
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

  // Solicitar permisos en iOS
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
  boosting = false;
  initialBoost = false;
  boostingTime = 0;
  score = 0;
  highestY = 0;
  cameraY = 0;
  gameStarted = true;
  screenShake = 0;
  comboMultiplier = 1;

  const scoreElement = document.getElementById("score");
  if (scoreElement) scoreElement.innerText = "Score: 0";

  // Reset sistema de inclinación
  isCalibrated = false;
  calibrationSamples = [];
  calibrationOffset = 0;
  tiltInput = 0;

  // Posición inicial centrada
  PLAYER.x = c.clientWidth / 2 - PLAYER.w / 2;
  PLAYER.y = c.clientHeight - 150;
  PLAYER.dy = 0;
  PLAYER.vx = 0;
  PLAYER.facing = 1;
  PLAYER.animFrame = 0;
  PLAYER.bounceScale = 1;
  PLAYER.onPlatform = false;
  prevPlayerY = PLAYER.y;
  highestY = PLAYER.y;

  // Objetivos de movimiento
  mouseX = c.clientWidth / 2;
  targetX = c.clientWidth / 2;
  smoothMouseX = c.clientWidth / 2;

  bullets = [];
  createDoodlePlatforms();

  console.log('[GAME] Doodle Jump iniciado correctamente');

  update();
}

function finalizeGameOver() {
  console.log('[GAME] Finalizando game over');
  isGameRunning = false;
  isAwaitingContinue = false;
  
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

function endGame() {
  console.log('[GAME] Juego terminado - transición a game over');
  onPlayerDeath('generic');
}

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

async function applyContinue() {
  console.log(`[CONTINUE] Aplicando continue por ${continuePriceWLD} WLD`);
  
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
  
  const y = PLAYER.y - 100;
  const w = 80;
  const x = (canvas.clientWidth - w)/2;
  
  // Crear plataforma segura
  platforms.push({ 
    x, y, w, h: PLATFORM_H, 
    type: PLATFORM_TYPES.NORMAL, 
    vx: 0, baseX: x,
    disappeared: false,
    breakTimer: 0,
    bounceScale: 1
  });

  // Posicionar jugador
  PLAYER.x = x + (w - PLAYER.w)/2;
  PLAYER.y = y - PLAYER.h - 5;
  PLAYER.dy = jumpStrength;
  prevPlayerY = PLAYER.y;

  // Limpiar enemigos cercanos
  enemies = enemies.filter(e => e.y < y - 80 || e.y > y + 120);
  
  console.log(`[RESPAWN] Jugador respawneado en X:${PLAYER.x.toFixed(1)}, Y:${PLAYER.y.toFixed(1)}`);
}

// ===== SHOOTING SYSTEM =====
function shootBulletAtX(touchX) {
  if (!isGameRunning || isPaused || isAwaitingContinue) return;

  const hornX = PLAYER.x + PLAYER.w * 0.5;
  const hornY = PLAYER.y - 5;

  const dx = 0; // Straight up like Doodle Jump
  const dy = -10;

  bullets.push({ x: hornX, y: hornY, dx, dy, r: 4 });
  
  // Efecto visual del disparo
  addDoodleParticles(hornX, hornY, 3, '#FFD700');
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

// ===== INPUT HANDLING =====
if (IS_DESKTOP) {
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    targetX = e.clientX - rect.left;
  });
}

// Sistema de disparo
canvas.addEventListener("click", (e) => {
  if (!isGameRunning) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  shootBulletAtX(e.clientX - rect.left);
});

canvas.addEventListener("touchstart", (e) => {
  if (!isGameRunning) return;
  e.preventDefault();
  
  if (e.touches.length > 0) {
    const rect = canvas.getBoundingClientRect();
    touchStartX = e.touches[0].clientX - rect.left;
    targetX = touchStartX;
  }
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

canvas.addEventListener("touchmove", (e) => {
  if (!isGameRunning) return;
  e.preventDefault();
  
  if (e.touches.length > 0) {
    const rect = canvas.getBoundingClientRect();
    targetX = e.touches[0].clientX - rect.left;
  }
}, { passive: false });

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
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

// Event listener para cambios de orientación
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    resizeCanvasToContainer();
    if (IS_MOBILE && (isGameRunning || isAwaitingContinue)) {
      setTimeout(() => {
        gyroController.startCalibration();
      }, 500);
    }
  }, 100);
});

// Canvas setup
if (canvas) {
  canvas.setAttribute('tabindex', '0');
  canvas.style.outline = 'none';
  canvas.style.touchAction = 'none';
}

// ===== EXPORTS =====
window.startGame = startGame;

console.log('[GAME] Sistema Doodle Jump cargado correctamente');
console.log(`[DEVICE] Tipo: ${IS_MOBILE ? 'MÓVIL' : 'DESKTOP'}`);