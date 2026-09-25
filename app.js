const CATEGORIES = ['全部', '進攻', '防守', '基本練習'];

const CATEGORY_FILES = {
  '進攻': 'data/attack.json',
  '防守': 'data/defense.json',
  '基本練習': 'data/basics.json'
};

const SUB_LABELS = {
  '進攻': ['全部進攻', '擺脫緊逼', '運球過人', '單打投籃'],
  '防守': ['全部防守', '站位卡位', '補防轉換'],
  '基本練習': ['全部基本', '運球基礎', '投籃姿勢']
};

const FAVORITES_KEY = 'bb_favorites_v1';
const CUSTOM_VIDEOS_KEY = 'bb_custom_videos_v1';
const HIDDEN_KEY = 'bb_hidden_v1';

const state = {
  category: '全部',
  sub: null,
  favorites: loadJSON(FAVORITES_KEY, {}),
  customVideos: loadJSON(CUSTOM_VIDEOS_KEY, []),
  hidden: loadJSON(HIDDEN_KEY, {}),
  dataCache: {},
  toastTimer: null
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // 儲存空間不可用時靜默失敗，不影響瀏覽功能
  }
}

function cleanupSyncedCustomVideos(masterList) {
  const masterIds = new Set(masterList.map((v) => v.id));
  const before = state.customVideos.length;
  state.customVideos = state.customVideos.filter((v) => !masterIds.has(v.id));
  if (state.customVideos.length !== before) {
    saveJSON(CUSTOM_VIDEOS_KEY, state.customVideos);
  }
}

async function fetchCategoryVideos(category) {
  if (state.dataCache[category]) return state.dataCache[category];
  const res = await fetch(CATEGORY_FILES[category]);
  if (!res.ok) throw new Error('載入分類資料失敗：' + category);
  const list = await res.json();
  state.dataCache[category] = list;
  cleanupSyncedCustomVideos(list);
  return list;
}

async function fetchAllVideos() {
  if (state.dataCache['全部']) return state.dataCache['全部'];
  const lists = await Promise.all(Object.keys(CATEGORY_FILES).map(fetchCategoryVideos));
  const merged = lists.flat();
  state.dataCache['全部'] = merged;
  return merged;
}

function isFavorite(video) {
  const override = state.favorites[video.id];
  return override === undefined ? !!video.favorite : override;
}

function toggleFavorite(id) {
  const current = state.favorites[id];
  const wasFav = current === undefined ? findVideoFavoriteDefault(id) : current;
  state.favorites[id] = !wasFav;
  saveJSON(FAVORITES_KEY, state.favorites);
  render();
}

function findVideoFavoriteDefault(id) {
  const all = [...(state.dataCache['全部'] || []), ...state.customVideos];
  const found = all.find((v) => v.id === id);
  return found ? !!found.favorite : false;
}

function isCustomVideo(id) {
  return id.indexOf('custom_') === 0;
}

function deleteVideo(video) {
  if (!window.confirm('確定要刪除「' + video.title + '」嗎？')) return;
  if (isCustomVideo(video.id)) {
    state.customVideos = state.customVideos.filter((v) => v.id !== video.id);
    saveJSON(CUSTOM_VIDEOS_KEY, state.customVideos);
  } else {
    state.hidden[video.id] = true;
    saveJSON(HIDDEN_KEY, state.hidden);
  }
  render();
}

function selectCategory(cat) {
  state.category = cat;
  state.sub = null;
  render();
}

function selectSub(sub) {
  state.sub = sub;
  render();
}

async function getVisibleVideos() {
  const base = state.category === '全部'
    ? await fetchAllVideos()
    : await fetchCategoryVideos(state.category);
  const custom = state.category === '全部'
    ? state.customVideos
    : state.customVideos.filter((v) => v.category === state.category);
  const combined = [...base, ...custom].filter((v) => !state.hidden[v.id]);
  return combined.filter((v) => !state.sub || v.subCategory === state.sub);
}

function renderCategoryTabs() {
  const segmented = document.getElementById('categorySegmented');
  const pill = document.getElementById('categoryPill');
  const activeIndex = CATEGORIES.indexOf(state.category);
  pill.style.width = 'calc((100% - 8px) / ' + CATEGORIES.length + ')';
  pill.style.transform = 'translateX(calc(' + activeIndex + ' * 100%))';

  segmented.querySelectorAll('.segmented__btn').forEach((el) => el.remove());
  CATEGORIES.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'segmented__btn tap' + (cat === state.category ? ' is-active' : '');
    btn.textContent = cat;
    btn.addEventListener('click', () => selectCategory(cat));
    segmented.appendChild(btn);
  });
}

function renderSubTabs() {
  const wrap = document.getElementById('subWrap');
  const hasSub = state.category !== '全部';
  wrap.innerHTML = '';
  wrap.style.display = hasSub ? 'block' : 'none';
  if (!hasSub) return;

  const labels = SUB_LABELS[state.category];
  const track = document.createElement('div');
  track.className = 'segmented segmented--sub';
  const pill = document.createElement('div');
  pill.className = 'segmented__pill segmented__pill--sub';

  const activeIndex = Math.max(labels.findIndex((label) => labelToValue(label) === state.sub), 0);
  pill.style.width = 'calc((100% - 6px) / ' + labels.length + ')';
  pill.style.transform = 'translateX(calc(' + activeIndex + ' * 100%))';
  track.appendChild(pill);

  labels.forEach((label, index) => {
    const value = labelToValue(label);
    const btn = document.createElement('button');
    btn.className = 'segmented__btn segmented__btn--sub tap' + (state.sub === value ? ' is-active' : '');
    btn.style.animationDelay = (index * 60) + 'ms';
    btn.textContent = label;
    btn.addEventListener('click', () => selectSub(value));
    track.appendChild(btn);
  });
  wrap.appendChild(track);
}

function labelToValue(label) {
  return label.indexOf('全部') === 0 ? null : label;
}

function buildCardEl(video, index) {
  const isYoutube = video.platform === 'YouTube';
  const fav = isFavorite(video);

  const card = document.createElement('article');
  card.className = 'card';
  card.style.animationDelay = (index * 45) + 'ms';

  const thumb = document.createElement('div');
  thumb.className = 'card__thumb ' + (isYoutube ? 'card__thumb--youtube' : 'card__thumb--facebook');

  if (video.thumbnail) {
    const img = document.createElement('img');
    img.src = video.thumbnail;
    img.alt = '';
    img.loading = 'lazy';
    img.className = 'card__thumb-img';
    img.addEventListener('error', () => img.remove());
    thumb.appendChild(img);
  }
  if (isYoutube) {
    const play = document.createElement('div');
    play.className = 'card__play';
    play.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M8 5v14l11-7z"></path></svg>';
    thumb.appendChild(play);
  }
  const badge = document.createElement('span');
  badge.className = 'card__platform-badge ' + (isYoutube ? 'card__platform-badge--youtube' : 'card__platform-badge--facebook');
  badge.textContent = video.platform;
  thumb.appendChild(badge);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'card__delete tap';
  deleteBtn.setAttribute('aria-label', '刪除影片');
  deleteBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>';
  deleteBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    deleteVideo(video);
  });
  thumb.appendChild(deleteBtn);

  const favBtn = document.createElement('button');
  favBtn.className = 'card__fav tap' + (fav ? ' is-fav' : '');
  favBtn.setAttribute('aria-label', '切換收藏');
  favBtn.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.8-6.2 3.8 1.6-7-5.4-4.8 7.1-.7z"></path></svg>';
  favBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(video.id);
  });
  thumb.appendChild(favBtn);

  const body = document.createElement('div');
  body.className = 'card__body';
  body.innerHTML =
    '<div class="card__tags">' +
      '<span class="tag tag--category">' + escapeHtml(video.category) + '</span>' +
      '<span class="tag tag--sub">' + escapeHtml(video.subCategory) + '</span>' +
    '</div>' +
    '<h2 class="card__title">' + escapeHtml(video.title) + '</h2>' +
    (video.note ? '<p class="card__note">' + escapeHtml(video.note) + '</p>' : '');

  const link = document.createElement('a');
  link.href = video.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'block';
  link.appendChild(thumb);

  card.appendChild(link);
  card.appendChild(body);
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function renderMessage(text) {
  const list = document.getElementById('cardList');
  list.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = text;
  list.appendChild(empty);
}

async function renderCards() {
  let videos;
  try {
    videos = await getVisibleVideos();
  } catch (err) {
    renderMessage('影片資料載入失敗，請確認是用網頁伺服器開啟本頁（例如已部署到 GitHub Pages），而不是直接雙擊 index.html 檔案。');
    return;
  }

  if (videos.length === 0) {
    renderMessage('此分類尚無影片');
    return;
  }
  const list = document.getElementById('cardList');
  list.innerHTML = '';
  videos.forEach((video, index) => list.appendChild(buildCardEl(video, index)));
}

async function updateTotalCountLabel() {
  const label = document.getElementById('totalCountLabel');
  try {
    const all = await fetchAllVideos();
    const visibleSeedCount = all.filter((v) => !state.hidden[v.id]).length;
    label.textContent = '共 ' + (visibleSeedCount + state.customVideos.length) + ' 支教學影片';
  } catch (err) {
    label.textContent = '影片資料載入失敗';
  }
}

function render() {
  renderCategoryTabs();
  renderSubTabs();
  renderCards();
  updateTotalCountLabel();
}

function showToast(message, duration) {
  const el = document.getElementById('toast');
  el.querySelector('.toast__text').textContent = message;
  el.classList.remove('hidden');
  clearTimeout(state.toastTimer);
  if (duration) {
    state.toastTimer = setTimeout(hideToast, duration);
  }
}

function hideToast() {
  document.getElementById('toast').classList.add('hidden');
}

document.getElementById('toastClose').addEventListener('click', hideToast);

render();
