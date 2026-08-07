/** Shared bottom navigation with center camera scan button */

function renderMobileNav(active) {
  const pending = window.famsApi?.getPendingCount?.() ?? 0;
  const badge = pending > 0
    ? `<span class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center">${pending > 99 ? '99+' : pending}</span>`
    : '';

  const item = (href, icon, label, isActive, extra = '') => `
    <a class="relative flex flex-col items-center justify-center ${isActive ? 'bg-primary text-on-primary-fixed rounded-xl px-4 py-1' : 'text-on-surface-variant hover:text-primary'} active:scale-95 transition-all" href="${href}">
      <span class="material-symbols-outlined" ${isActive ? "style=\"font-variation-settings: 'FILL' 1;\"" : ''}>${icon}</span>
      <span class="font-label-md text-label-md mt-1 text-xs">${label}</span>
      ${extra}
    </a>`;

  return `
<nav class="fixed bottom-0 w-full z-50 rounded-t-xl bg-surface-container/80 backdrop-blur-md border-t border-white/10 flex justify-around items-end h-[84px] px-2 pb-safe">
  ${item('../live_floor_dashboard/code.html', 'visibility', 'Live', active === 'live')}
  ${item('../terminals_list/code.html', 'terminal', 'Terminals', active === 'terminals')}
  <a class="relative -mt-6 flex flex-col items-center justify-center active:scale-95 transition-all" href="../scan/code.html" aria-label="Scan attendance">
    <div class="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary to-[#00c3eb] shadow-[0_4px_20px_rgba(109,221,255,0.45)] flex items-center justify-center border-2 border-[#001019]">
      <span class="material-symbols-outlined text-[#004352] text-3xl" style="font-variation-settings: 'FILL' 1;">photo_camera</span>
      ${badge}
    </div>
    <span class="font-label-md text-xs mt-1 text-primary font-semibold">Scan</span>
  </a>
  ${item('../sync_center_dashboard/code.html', 'sync', 'Sync', active === 'sync', pending > 0 && active !== 'sync' ? `<span class="absolute top-0 right-2 w-2 h-2 rounded-full bg-error"></span>` : '')}
  <a id="nav-logout" class="flex flex-col items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-all" href="#">
    <span class="material-symbols-outlined">logout</span>
    <span class="font-label-md text-label-md mt-1 text-xs">Logout</span>
  </a>
</nav>`;
}

function mountMobileNav(active) {
  const mount = document.getElementById('mobile-nav-root');
  if (!mount) return;
  mount.innerHTML = renderMobileNav(active);

  const logoutBtn = document.getElementById('nav-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.famsApi.isSupervisorLoggedIn()) window.famsApi.logoutSupervisor();
      else window.famsApi.unpairTerminal();
      window.location.href = '../supervisor_login/code.html';
    });
  }
}

window.famsNav = { renderMobileNav, mountMobileNav };
