const syncModalBackdrop = document.getElementById('syncModalBackdrop');
const syncGroups = document.getElementById('syncGroups');

function groupCustomVideosByFile() {
  const groups = {};
  state.customVideos.forEach((video) => {
    const file = CATEGORY_FILES[video.category];
    if (!groups[file]) groups[file] = [];
    groups[file].push(video);
  });
  return groups;
}

async function copySyncGroup(jsonText, button) {
  try {
    await navigator.clipboard.writeText(jsonText);
    showToast('已複製到剪貼簿', 2000);
  } catch (err) {
    const textarea = button.previousElementSibling;
    if (textarea) textarea.select();
  }
}

function buildSyncGroupEl(file, videos) {
  const block = document.createElement('div');
  block.className = 'sync-group';

  const title = document.createElement('h3');
  title.className = 'sync-group__title';
  title.textContent = file + '（' + videos.length + ' 筆）';
  block.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'sync-group__list';
  videos.forEach((video) => {
    const item = document.createElement('li');
    item.textContent = video.title;
    list.appendChild(item);
  });
  block.appendChild(list);

  const jsonText = videos.map((video) => JSON.stringify(video, null, 2)).join(',\n') + ',';
  const textarea = document.createElement('textarea');
  textarea.className = 'modal__code';
  textarea.rows = 6;
  textarea.readOnly = true;
  textarea.value = jsonText;
  block.appendChild(textarea);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'modal__submit sync-group__copy';
  copyBtn.textContent = '複製這組 JSON';
  copyBtn.addEventListener('click', () => copySyncGroup(jsonText, copyBtn));
  block.appendChild(copyBtn);

  return block;
}

function renderSyncPanel() {
  const groups = groupCustomVideosByFile();
  const files = Object.keys(groups);

  syncGroups.innerHTML = '';
  if (files.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'modal__hint';
    empty.textContent = '目前沒有尚未同步的新增影片。';
    syncGroups.appendChild(empty);
    return;
  }
  files.forEach((file) => syncGroups.appendChild(buildSyncGroupEl(file, groups[file])));
}

function openSyncModal() {
  renderSyncPanel();
  syncModalBackdrop.classList.remove('hidden');
}

function closeSyncModal() {
  syncModalBackdrop.classList.add('hidden');
}

document.getElementById('syncBtn').addEventListener('click', openSyncModal);
document.getElementById('syncCloseBtn').addEventListener('click', closeSyncModal);
syncModalBackdrop.addEventListener('click', (event) => {
  if (event.target === syncModalBackdrop) closeSyncModal();
});
