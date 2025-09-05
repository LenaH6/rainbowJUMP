// CTRL+F: WORLDAPP_HOOKS
(function(){
  const isWorldApp = Boolean(window.WorldApp || window.walletkit || /WorldApp/i.test(navigator.userAgent));
  console.log('[MiniApp] World App container:', isWorldApp);
  // TODO: Aquí conectaremos Sign-in/Payments cuando tengas acceso (Stage 3).
})();
