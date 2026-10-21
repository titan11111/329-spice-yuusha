let lastTouchEnd = 0;
document.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('selectstart', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => e.preventDefault());
window.addEventListener('error', (e) => {
  window.__bootErr = `${e.message || ''} @${e.filename || ''}:${e.lineno || 0}`;
});
