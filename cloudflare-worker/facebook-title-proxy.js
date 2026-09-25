const ALLOWED_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'];
const CACHE_TTL_SECONDS = 6 * 60 * 60;
// 回應內容的欄位結構有變動時就把這個版號往上加一，讓舊的快取內容自然失效
const CACHE_VERSION = 'v2';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'GET') {
      return jsonResponse({ error: '只支援 GET' }, 405);
    }
    return handleRequest(request);
  }
};
