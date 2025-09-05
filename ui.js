// ===== Loading robusto (DOM + load + fallback + tap) =====
function showHome() {
  const loading = document.getElementById('loading-screen');
  const home = document.getElementById('home-screen');
  if (!loading || !home) return;
  if (home.classList.contains('hidden')) {
    loading.classList.add('hidden');
    home.classList.remove('hidden');
    console.log('[UI] Home mostrado');
  }
}
function safeBoot() { setTimeout(showHome, 600); }

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(safeBoot, 0);
} else {
  document.addEventListener('DOMContentLoaded', safeBoot, { once: true });
  window.addEventListener('load', safeBoot, { once: true });
}
document.addEventListener('click', (e) => {
  const loading = document.getElementById('loading-screen');
  if (loading && !loading.classList.contains('hidden') && loading.contains(e.target)) {
    console.log('[UI] Forzado por tap en loading');
    showHome();
  }
}, true);

// ===== Estado UI (expuesto en window para game.js) =====
const uiState = {
  coins: 0, token: 0, hearts: 5, levelXP: 0, level: 1,
  highScore: 0, games: 0, avgScore: 0,
};
window.uiState = uiState;

function renderTop(){
  document.getElementById('ui-coins').textContent = uiState.coins;
  document.getElementById('ui-token').textContent = uiState.token;
  document.getElementById('ui-hearts').textContent = uiState.hearts;
  document.getElementById('ui-highscore').textContent = uiState.highScore;
  document.getElementById('ui-games').textContent = uiState.games;
  document.getElementById('ui-avgscore').textContent = Math.floor(uiState.avgScore);
  const pct = Math.max(0, Math.min(100, uiState.levelXP % 100));
  document.getElementById('ui-level').textContent = `Lv. ${uiState.level}`;
  document.getElementById('ui-level-progress').style.width = pct + '%';
}
window.renderTop = renderTop;

// Persistencia local
function loadProgress(){
  try {
    const raw = localStorage.getItem('rj_state');
    if (raw) Object.assign(uiState, JSON.parse(raw));
  } catch(e){ console.warn('No state loaded', e); }
}
function saveProgress(){
  try {
    const s = { coins: uiState.coins, token: uiState.token, hearts: uiState.hearts,
                levelXP: uiState.levelXP, level: uiState.level, highScore: uiState.highScore,
                games: uiState.games, avgScore: uiState.avgScore };
    localStorage.setItem('rj_state', JSON.stringify(s));
  } catch(e){ console.warn('No state saved', e); }
}
window.saveProgress = saveProgress;
loadProgress();
renderTop();

// ===== Popover Perfil/Settings =====
const btnProfile = document.getElementById('btnProfile');
const popover = document.getElementById('profile-popover');
btnProfile.addEventListener('click', () => { popover.classList.toggle('hidden'); });

document.querySelectorAll('.popover-tabs .tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.popover-tabs .tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p=>{p.classList.remove('active'); p.classList.add('hidden');});
    tab.classList.add('active');
    const pane = document.getElementById(tab.dataset.tab);
    pane.classList.add('active'); pane.classList.remove('hidden');
  });
});

document.addEventListener('click', (e)=>{
  if (!popover.contains(e.target) && e.target !== btnProfile) { popover.classList.add('hidden'); }
}, true);

// ===== Claim de vida cada 6 horas =====
const btnClaim = document.getElementById('btn-claim-life');
const lifeTimer = document.getElementById('life-timer');
function msToHHMMSS(ms){
  const total = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(total/3600).toString().padStart(2,'0');
  const m = Math.floor((total%3600)/60).toString().padStart(2,'0');
  const s = (total%60).toString().padStart(2,'0');
  return `${h}:${m}:${s}`;
}
let lastClaim = parseInt(localStorage.getItem('rj_lastClaim')||'0',10);
function updateClaimUI(){
  const now = Date.now();
  const cool = 10*1000;
  const left = lastClaim ? (lastClaim + cool - now) : 0;
  if (left > 0){ btnClaim.disabled = true; lifeTimer.textContent = `Next life in ${msToHHMMSS(left)}`; }
  else { btnClaim.disabled = false; lifeTimer.textContent = `You can claim now`; }
}
btnClaim.addEventListener('click', ()=>{
  const now = Date.now(); const cool = 10*1000;
  if (!lastClaim || now - lastClaim >= cool){
    uiState.hearts = Math.min(9, uiState.hearts + 1);
    lastClaim = now; localStorage.setItem('rj_lastClaim', String(now));
    renderTop(); updateClaimUI(); saveProgress();
  }
});
setInterval(updateClaimUI, 1000); updateClaimUI();

// ===== Bottom Nav =====
const views = { home: ()=>{ hideSub(); }, shop: ()=>{ show('shop-view'); }, wallet: ()=>{ show('wallet-view'); }, prizes: ()=>{ show('prizes-view'); } };
function hideSub(){ ['shop-view','wallet-view','prizes-view'].forEach(id=>{ const el = document.getElementById(id); if(el) el.classList.add('hidden'); }); }
function show(id){ hideSub(); const el = document.getElementById(id); if(el) el.classList.remove('hidden'); }
document.querySelectorAll('.nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); (views[btn.dataset.view] || views.home)();
  });
});

// ===== Start Game bridge =====
const home = document.getElementById('home-screen');
const game = document.getElementById('game-container');
const uiStart = document.getElementById('ui-start');

// Bloquea scroll de página por gestos
document.addEventListener('touchmove', (e)=>{ e.preventDefault(); }, { passive: false });

uiStart.addEventListener('click', async ()=>{
  if (uiState.hearts <= 0){
    alert('No tienes ❤️. Espera el claim o compra en la tienda.');
    return;
  }
  uiState.hearts -= 1; renderTop(); saveProgress();
  home.classList.add('hidden'); game.classList.remove('hidden');
  // Permiso para orientación en iOS
if (typeof DeviceOrientationEvent !== 'undefined'
    && typeof DeviceOrientationEvent.requestPermission === 'function') {
  try { await DeviceOrientationEvent.requestPermission(); } catch (e) { console.warn(e); }
}

  if (typeof window.startGame === 'function') { window.startGame(); }
  else { console.error('startGame no está disponible.'); }
});
