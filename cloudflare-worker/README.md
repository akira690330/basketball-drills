# Facebook 標題擷取 Worker

給「新增影片」表單用的小型代理服務：抓 Facebook Reel/影片頁面的 `og:title`、
`og:description`，繞過瀏覽器端無法跨網域讀取 facebook.com 網頁內容的限制。

原理：直接打 `facebook.com/reel/<id>` 會被擋（回傳一般錯誤頁，沒有 og 標籤），
但同一支影片改用 `facebook.com/watch/?v=<id>` 網址請求就能正常拿到標題。
這個 Worker 會自動把你貼的各種 Facebook 影片連結（reel / videos / watch /
fb.watch 短連結）轉成 `watch/?v=` 格式再抓取。

**非官方做法，不保證長期穩定**——Facebook 隨時可能調整頁面結構或加強封鎖，
屆時這支 Worker 可能需要跟著調整，或直接失效改回手動輸入標題。

## 部署步驟

1. 安裝 wrangler（只需一次）：
   ```bash
   npm install -g wrangler
   ```
2. 登入你的 Cloudflare 帳號：
   ```bash
   wrangler login
   ```
3. 在這個資料夾內部署：
   ```bash
   cd cloudflare-worker
   wrangler deploy
   ```
4. 部署完成後，終端機會印出網址，格式類似：
   ```
   https://basketball-fb-title-proxy.<你的帳號>.workers.dev
   ```
5. 把這個網址填進 `../add-video.js` 檔案最上方的
   `FACEBOOK_TITLE_PROXY_URL` 常數，取代 `REPLACE_ME_WITH_YOUR_WORKER_URL`。

## 本機測試（部署後）

```bash
curl "https://basketball-fb-title-proxy.<你的帳號>.workers.dev?url=https://www.facebook.com/reel/3997109483754781"
```

預期回傳：
```json
{"title":"...","description":"..."}
```

## 免費額度

Cloudflare Workers 免費方案每天 10 萬次請求，個人使用完全夠用，不需要
綁信用卡。
