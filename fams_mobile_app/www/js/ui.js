// Shared UI helpers for FAMS Mobile

function showToast(message, type = 'info') {
  let root = document.getElementById('fams-toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'fams-toast-root';
    root.style.cssText = 'position:fixed;bottom:88px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:90vw;pointer-events:none;';
    document.body.appendChild(root);
  }

  const el = document.createElement('div');
  const colors = {
    info: 'background:#002939;color:#c7ebff;border:1px solid rgba(109,221,255,0.3)',
    success: 'background:#006d35;color:#e3ffe4;border:1px solid rgba(63,255,139,0.3)',
    error: 'background:#9f0519;color:#ffa8a3;border:1px solid rgba(255,113,108,0.4)',
  };
  el.style.cssText = `${colors[type] || colors.info};padding:12px 16px;border-radius:12px;font-size:14px;font-family:Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.35);opacity:0;transition:opacity .2s;`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, 3200);
}

function setButtonLoading(btn, loading, idleHtml) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.idleHtml = btn.dataset.idleHtml || btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="font-size:18px">sync</span> Please wait…';
  } else {
    btn.innerHTML = idleHtml || btn.dataset.idleHtml || btn.innerHTML;
  }
}

function initialsAvatar(name) {
  return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

window.famsUi = { showToast, setButtonLoading, initialsAvatar };
