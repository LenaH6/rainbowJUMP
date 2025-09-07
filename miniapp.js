(function(){
  const isWorldApp = Boolean(window.WorldApp || window.walletkit || /WorldApp/i.test(navigator.userAgent));
  console.log('[MiniApp] World App container:', isWorldApp);
  // TODO: Aquí conectaremos Sign-in/Payments cuando tengas acceso (Stage 3).
})();
// Stub de pago en WLD (simulado por ahora)
window.payForContinueWLD = async function(amountWLD){
  // TODO: reemplazar por invocación real en World App (WalletKit/Payments)
  const ok = confirm(`Confirmar pago de ${amountWLD.toFixed(2)} WLD para continuar?`);
  return ok;
};
