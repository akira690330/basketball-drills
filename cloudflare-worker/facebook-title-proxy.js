// 這支 Worker 身兼兩個用途：
// 1. GET  /?url=...   代抓 Facebook 貼文的 og:title/og:description/og:image
// 2. POST /add-video  管理者模式新增影片時，直接把資料寫進 GitHub 上的 data/*.json
const ALLOWED_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'];
const CACHE_TTL_SECONDS = 6 * 60 * 60;
// 回應內容的欄位結構有變動時就把這個版號往上加一，讓舊的快取內容自然失效
const CACHE_VERSION = 'v2';

const GITHUB_OWNER = 'akira690330';
const GITHUB_REPO = 'basketball-drills';
const ALLOWED_TARGET_FILES = ['data/attack.json', 'data/defense.json', 'data/basics.json'];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }
  });
}

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function extractVideoId(rawUrl) {
  const patterns = [/\/reel\/(\d+)/, /[?&]v=(\d+)/, /\/videos\/(\d+)/];
  for (const pattern of patterns) {
    const match = rawUrl.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function fetchOgTags(targetUrl) {
  const result = { title: '', description: '', image: '' };
  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });
  if (!res.ok) return { result, resolvedUrl: res.url, ok: false };

  const rewriter = new HTMLRewriter()
    .on('meta[property="og:title"]', {
      element(el) {
        const content = el.getAttribute('content');
        if (content) result.title = decodeHtmlEntities(content);
      }
    })
    .on('meta[property="og:description"]', {
      element(el) {
        const content = el.getAttribute('content');
        if (content) result.description = decodeHtmlEntities(content);
      }
    })
    .on('meta[property="og:image"]', {
      element(el) {
        const content = el.getAttribute('content');
        if (content) result.image = decodeHtmlEntities(content);
      }
    });

  // transform() 只有在讀取 response body 時才會真正執行 handler
  await rewriter.transform(res).text();
  return { result, resolvedUrl: res.url, ok: true };
}

async function resolveFacebookMeta(inputUrl) {
  let targetUrl = inputUrl;
  const directId = extractVideoId(inputUrl);
  if (directId) {
    targetUrl = 'https://www.facebook.com/watch/?v=' + directId;
  }

  let { result, resolvedUrl, ok } = await fetchOgTags(targetUrl);

  // reel 網址常被擋下來（回應無 og 標籤或非 200），改用它重新導向後的真實網址再解析一次
  if ((!ok || !result.title) && resolvedUrl && resolvedUrl !== targetUrl) {
    const redirectedId = extractVideoId(resolvedUrl);
    if (redirectedId) {
      const retryUrl = 'https://www.facebook.com/watch/?v=' + redirectedId;
      if (retryUrl !== targetUrl) {
        ({ result, ok } = await fetchOgTags(retryUrl));
      }
    }
  }

  return result;
}

async function handleRequest(request) {
  const requestUrl = new URL(request.url);
  const inputUrl = requestUrl.searchParams.get('url');

  if (!inputUrl) {
    return jsonResponse({ error: '缺少 url 參數' }, 400);
  }

  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch (err) {
    return jsonResponse({ error: 'url 格式錯誤' }, 400);
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return jsonResponse({ error: '只支援 facebook.com / fb.watch 網址' }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(requestUrl.origin + '/cache/' + CACHE_VERSION + '/' + encodeURIComponent(inputUrl));
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const meta = await resolveFacebookMeta(inputUrl);
    if (!meta.title) {
      return jsonResponse({ error: '找不到標題，該貼文可能已下架或需要登入才能檢視' }, 404);
    }
    const response = jsonResponse({ title: meta.title, description: meta.description, image: meta.image });
    response.headers.set('Cache-Control', 'public, max-age=' + CACHE_TTL_SECONDS);
    await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    return jsonResponse({ error: '擷取失敗：' + err.message }, 502);
  }
}

function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function githubHeaders(env) {
  return {
    'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'basketball-drills-worker',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function handleAddVideo(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: '只支援 POST' }, 405);
  }
  if (!env.OWNER_SECRET || !env.GITHUB_TOKEN) {
    return jsonResponse({ error: 'Worker 尚未設定管理者密鑰' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return jsonResponse({ error: '請求格式不是有效的 JSON' }, 400);
  }

  if (!body.secret || body.secret !== env.OWNER_SECRET) {
    return jsonResponse({ error: '未授權' }, 401);
  }
  if (!body.video || typeof body.video !== 'object') {
    return jsonResponse({ error: '缺少 video 欄位' }, 400);
  }
  if (!ALLOWED_TARGET_FILES.includes(body.targetFile)) {
    return jsonResponse({ error: '不允許的目標檔案' }, 400);
  }

  const apiBase = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + body.targetFile;

  const getRes = await fetch(apiBase, { headers: githubHeaders(env) });
  if (!getRes.ok) {
    return jsonResponse({ error: '讀取 ' + body.targetFile + ' 失敗：HTTP ' + getRes.status }, 502);
  }
  const fileData = await getRes.json();

  let list;
  try {
    list = JSON.parse(decodeBase64Utf8(fileData.content));
  } catch (err) {
    return jsonResponse({ error: '現有檔案內容不是有效的 JSON，無法自動合併' }, 500);
  }
  if (!Array.isArray(list)) {
    return jsonResponse({ error: '現有檔案內容不是陣列，無法自動合併' }, 500);
  }

  list.unshift(body.video);
  const newContent = JSON.stringify(list, null, 2) + '\n';

  const putRes = await fetch(apiBase, {
    method: 'PUT',
    headers: { ...githubHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '新增影片：' + body.video.title,
      content: encodeBase64Utf8(newContent),
      sha: fileData.sha,
      branch: 'main'
    })
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    return jsonResponse({ error: '寫入 GitHub 失敗：HTTP ' + putRes.status + ' ' + errText }, 502);
  }

  return jsonResponse({ ok: true });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (url.pathname === '/add-video') {
      return handleAddVideo(request, env);
    }
    if (request.method !== 'GET') {
      return jsonResponse({ error: '只支援 GET' }, 405);
    }
    return handleRequest(request);
  }
};
