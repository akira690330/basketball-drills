const OWNER_KEY = 'bb_owner_secret_v1';

(function initOwnerFlag() {
  const params = new URLSearchParams(window.location.search);
  const secret = params.get('owner');
  if (!secret) return;
  try {
    localStorage.setItem(OWNER_KEY, secret);
  } catch (err) {
    // 無法寫入 localStorage 時放棄，管理者按鈕就不會顯示
  }
  params.delete('owner');
  const query = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (query ? '?' + query : ''));
})();

function getOwnerSecret() {
  try {
    return localStorage.getItem(OWNER_KEY) || '';
  } catch (err) {
    return '';
  }
}

function isOwner() {
  return !!getOwnerSecret();
}

const syncBtnEl = document.getElementById('syncBtn');
if (syncBtnEl) syncBtnEl.classList.toggle('hidden', !isOwner());
