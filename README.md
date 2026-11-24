# 來回巴掌（beatboss）

單手就能玩的洩恨小遊戲：點畫面或左右滑，對羊駝、柿子、清朝人一直甩巴掌。每天第一次進站輸入名字，記錄今天的出手次數，還有全公司的「今日怒氣榜」。

網站跑在 Cloudflare Workers 上，紀錄存在 Cloudflare D1 資料庫。同事拿到網址就能玩，不需要任何帳號。

## 專案結構

```
index.html              遊戲頁面（Vite 的入口）
src/client/main.js      遊戲本體：畫面、音效、今日成績、排行榜
src/client/sprites.js   像素角色圖
src/client/api.js       跟後端 API 溝通
src/client/style.css    樣式
src/worker/index.ts     Worker：只處理 /api/*，其他路徑由靜態檔回應
src/worker/plays.ts     資料驗證、資料表、查詢
test/api.test.ts        API 測試（在 Workers 執行環境裡跑，含本機 D1）
cloudflare.config.ts    Worker 名稱與 D1 綁定
demo/                   早期原型，不會被打包，也不屬於網站
```

## 本機開發

需要 Node.js 22.18 以上。

```sh
npm install
npm run dev        # 開 http://localhost:5173/ ，資料存在本機模擬的 D1（.cloudflare/state）
npm test           # API 測試
npm run check      # 型別、lint、格式
```

開發模式下，瀏覽器的 `window.__beatboss` 可以拿到 `Stats`、`Board` 方便除錯；正式版不會有。

## 部署到 Cloudflare

第一次部署照順序做：

1. 登入。會開瀏覽器，登入你的 Cloudflare 帳號並按允許：

   ```sh
   npx cf auth login
   ```

2. 先確認能打包、看綁定。這一步不會上傳：

   ```sh
   npx cf deploy --dry-run
   ```

3. 正式部署：

   ```sh
   npm run deploy
   ```

   - 第一次部署會在你的帳號自動建立名為 `beatboss-db` 的 D1 資料庫。
   - 部署完成會印出網址，通常是 `https://beatboss.<你的子網域>.workers.dev`。帳號還沒有 workers.dev 子網域的話，依畫面指示設定。
   - 資料表不用另外建：Worker 第一次收到請求時會自己建立（`CREATE TABLE IF NOT EXISTS`）。

4. 打開 `https://<網址>/api/days/<今天日期，例如 2026-11-25>/plays`，看到 `{"plays":[]}` 就代表後端和資料庫都通了。

5. 固定資料庫（只做一次，建議做；本專案已經做過）：

   ```sh
   npx cf d1 list
   ```

   找到 `beatboss-db` 的 `uuid`，填進 `cloudflare.config.ts`：

   ```ts
   DB: bindings.d1({ name: "beatboss-db", id: "<uuid>" }),
   ```

   `cf deploy` 不會把自動建立的資料庫 ID 寫回設定檔。照它的說明，不填 ID 之後也能繼續部署；但固定下來，就確定每次接的都是同一個資料庫。

之後修改程式，再跑一次 `npm run deploy` 就好。

## 誰看得到、誰能寫

目前任何拿到網址的人都能玩、看到排行榜上的名字，也能送出分數。伺服器會擋掉不合理的資料：

- 名字 1 到 16 個字。
- 次數必須是非負整數，上限一百萬。
- 時間格式要正確。
- 日期只收前後兩天。
- 內容大小有上限。
- 每筆紀錄的總次數只增不減。

每台裝置的紀錄編號（sid）是寫入那一筆的唯一憑證，API 不會把任何人的 sid 回傳出去。

如果只想讓公司的人進來，可以在 Cloudflare 後台用 **Zero Trust → Access** 替這個網址加上 email 驗證，只允許公司網域的信箱登入，程式不用改。Zero Trust 有免費方案，人數上限以官方價格頁為準。

## 費用估算（免費方案）

- Workers 免費方案每天 10 萬次請求；只有打 `/api` 才算，遊戲頁面本身的靜態檔免費、不限次數。
- D1 免費方案每天讀 500 萬列、寫 10 萬列。

遊戲的請求頻率：

- 排行榜：看榜時每 4 秒抓一次，玩的時候每 10 秒，分頁在背景就不抓。
- 寫入：有新出手時最多每 4 秒寫一次。

以 20 個人、每人每天開 2 小時估算，一天大約 1.5 萬到 3 萬次請求，D1 讀取不到 100 萬列，都在免費額度內。

## API

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/days/:day/plays` | 某天所有人的紀錄。帶標頭 `x-beatboss-sid: <自己的 sid>` 時，自己那筆會標成 `self: true` |
| PUT | `/api/days/:day/plays/:sid` | 寫入或更新自己那一筆，內容是 `{ name, total, kos, maxCombo, bins, vic }` |

- `day` 是玩家當地日期 `YYYY-MM-DD`。
- `bins` 是每分鐘的次數，例如 `{ "09:10": 5 }`。
- `vic` 是三個角色各被打幾下：`alpaca`、`persimmon`、`marketer`。

## 資料表

```sql
plays (day, sid, name, total, kos, max_combo, bins, vic, updated_at)  -- 主鍵 (day, sid)
```

舊資料不會自動刪除。要清掉某天以前的紀錄，可以自己執行（會真的刪資料，請先確認）：

```sh
npx cf d1 list   # 查 beatboss-db 的 uuid
npx cf d1 raw <uuid> --sql "DELETE FROM plays WHERE day < '2026-01-01'"
```
