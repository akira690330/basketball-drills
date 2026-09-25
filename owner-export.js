const exportModalBackdrop = document.getElementById('exportModalBackdrop');
const exportJsonText = document.getElementById('exportJsonText');
const exportTargetFile = document.getElementById('exportTargetFile');

function showExportPanel(video) {
  exportTargetFile.textContent = CATEGORY_FILES[video.category];
  exportJsonText.value = JSON.stringify(video, null, 2) + ',';
  exportModalBackdrop.classList.remove('hidden');
}

function hideExportPanel() {
  exportModalBackdrop.classList.add('hidden');
}

async function copyExportJson() {
  try {
    await navigator.clipboard.writeText(exportJsonText.value);
    showToast('已複製到剪貼簿', 2000);
  } catch (err) {
    exportJsonText.select();
  }
}

document.getElementById('exportCloseBtn').addEventListener('click', hideExportPanel);
document.getElementById('exportCopyBtn').addEventListener('click', copyExportJson);
exportModalBackdrop.addEventListener('click', (event) => {
  if (event.target === exportModalBackdrop) hideExportPanel();
});
