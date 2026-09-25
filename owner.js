const OWNER_KEY = 'bb_is_owner_v1';

(function initOwnerFlag() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('owner') !== '1') return;
  try {
    localStorage.setItem(OWNER_KEY, '1');
  } catch (err) {
    // 無法寫入 localStorage 時放棄，管理者按鈕就不會顯示
  }
  params.delete('owner');
  const query = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (query ? '?' + query : ''));
})();

function isOwner() {
  try {
    return localStorage.getItem(OWNER_KEY) === '1';
  } catch (err) {
    return false;
  }
}

const syncBtnEl = document.getElementById('syncBtn');
if (syncBtnEl) syncBtnEl.classList.toggle('hidden', !isOwner());
