function showUpdateBanner(registration) {
  if (document.getElementById('updateBanner')) return;
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.id = 'updateBanner';
  banner.innerHTML = '<span>有新版本可用</span>';
  const btn = document.createElement('button');
  btn.textContent = '點此更新';
  btn.addEventListener('click', () => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });
  banner.appendChild(btn);
  document.body.appendChild(banner);
}

function watchForUpdate(registration) {
  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateBanner(registration);
      }
    });
  });
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('sw.js').then((registration) => {
    if (registration.waiting && registration.active) {
      showUpdateBanner(registration);
    }
    watchForUpdate(registration);
  }).catch(() => {
    // 離線首次載入或註冊失敗時，App 仍可正常於線上使用
  });
}

initServiceWorker();
