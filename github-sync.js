async function trySyncToGitHub(video) {
  const secret = getOwnerSecret();
  if (!secret || WORKER_BASE_URL.indexOf('REPLACE_ME') === 0) return false;

  try {
    const res = await fetch(WORKER_BASE_URL + '/add-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        video,
        targetFile: CATEGORY_FILES[video.category]
      })
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.ok;
  } catch (err) {
    // 離線、Worker 未部署或寫入失敗時，回傳 false，讓呼叫端改用手動複製貼上的備援流程
    return false;
  }
}
