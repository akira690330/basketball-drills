const FACEBOOK_TITLE_PROXY_URL = 'https://basketball-fb-title-proxy.akira690330.workers.dev';

const addModalBackdrop = document.getElementById('addModalBackdrop');
const addForm = document.getElementById('addForm');
const fieldCategory = document.getElementById('fieldCategory');
const fieldSubCategory = document.getElementById('fieldSubCategory');
const fieldUrl = document.getElementById('fieldUrl');
const fieldTitle = document.getElementById('fieldTitle');

let pendingThumbnail = '';

function subCategoryOptions(category) {
  return SUB_LABELS[category].filter((label) => label.indexOf('全部') !== 0);
}

function populateSubCategorySelect() {
  const options = subCategoryOptions(fieldCategory.value);
  fieldSubCategory.innerHTML = options
    .map((label) => '<option value="' + label + '">' + label + '</option>')
    .join('');
}

function openAddModal() {
  addForm.reset();
  fieldCategory.value = '進攻';
  populateSubCategorySelect();
  pendingThumbnail = '';
  addModalBackdrop.classList.remove('hidden');
}

function closeAddModal() {
  addModalBackdrop.classList.add('hidden');
}

function detectPlatform(url) {
  return /facebook\.com|fb\.watch/i.test(url) ? 'Facebook' : 'YouTube';
}

function extractYoutubeId(url) {
  const shortsMatch = url.match(/youtube\.com\/shorts\/([\w-]+)/);
  const watchMatch = url.match(/[?&]v=([\w-]+)/);
  const shortMatch = url.match(/youtu\.be\/([\w-]+)/);
  return (shortsMatch || watchMatch || shortMatch || [null, ''])[1];
}

function toYoutubeEmbedUrl(id) {
  return id ? 'https://www.youtube.com/embed/' + id : '';
}

function toYoutubeThumbnailUrl(id) {
  return id ? 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg' : '';
}

async function tryAutofillFromYoutube(url) {
  if (detectPlatform(url) !== 'YouTube') return;
  const id = extractYoutubeId(url);
  if (id) pendingThumbnail = toYoutubeThumbnailUrl(id);
  if (fieldTitle.value.trim()) return;
  try {
    const oembedUrl = 'https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json';
    const res = await fetch(oembedUrl);
    if (!res.ok) return;
    const data = await res.json();
    if (data.title) fieldTitle.value = data.title;
  } catch (err) {
    // 離線或跨域限制時放棄自動帶入標題，改由使用者手動輸入
  }
}

async function tryAutofillFromFacebook(url) {
  if (detectPlatform(url) !== 'Facebook') return;
  if (FACEBOOK_TITLE_PROXY_URL.indexOf('REPLACE_ME') === 0) return;
  try {
    const proxyUrl = FACEBOOK_TITLE_PROXY_URL + '?url=' + encodeURIComponent(url);
    const res = await fetch(proxyUrl);
    if (!res.ok) return;
    const data = await res.json();
    if (data.title && !fieldTitle.value.trim()) fieldTitle.value = data.title;
    if (data.image) pendingThumbnail = data.image;
  } catch (err) {
    // Worker 未部署、離線或擷取失敗時放棄自動帶入，改由使用者手動輸入
  }
}

function buildCustomVideo(formData) {
  const url = formData.get('url').trim();
  const platform = detectPlatform(url);
  const youtubeId = platform === 'YouTube' ? extractYoutubeId(url) : '';
  return {
    id: 'custom_' + Date.now(),
    title: formData.get('title').trim(),
    category: formData.get('category'),
    subCategory: formData.get('subCategory'),
    platform,
    url,
    embedUrl: toYoutubeEmbedUrl(youtubeId),
    thumbnail: platform === 'YouTube' ? toYoutubeThumbnailUrl(youtubeId) : pendingThumbnail,
    note: formData.get('note').trim(),
    favorite: false
  };
}

fieldCategory.addEventListener('change', populateSubCategorySelect);
fieldUrl.addEventListener('input', () => { pendingThumbnail = ''; });
fieldUrl.addEventListener('blur', () => {
  const url = fieldUrl.value.trim();
  if (!url) return;
  tryAutofillFromYoutube(url);
  tryAutofillFromFacebook(url);
});

document.getElementById('addBtn').addEventListener('click', openAddModal);
document.getElementById('addCancelBtn').addEventListener('click', closeAddModal);
addModalBackdrop.addEventListener('click', (event) => {
  if (event.target === addModalBackdrop) closeAddModal();
});

addForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const video = buildCustomVideo(new FormData(addForm));
  state.customVideos.push(video);
  saveJSON(CUSTOM_VIDEOS_KEY, state.customVideos);
  closeAddModal();
  state.category = video.category;
  state.sub = null;
  render();
  showToast('已儲存到本機，之後可匯出併入 data.json', 3000);
});
