# Chart AI Copilot — 功能 PRD

| 版本                | **v0.2**                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 文件狀態            | Draft                                                                        |
| 最後更新            | 2026-05-10                                                                   |
| 主要變更（vs v0.1） | 加入 Multi-Provider 支援（Anthropic + MiniMax）、區域路由、JSON 容錯解析強化 |
| 目標釋出            | v0.2（Multi-Provider MVP）→ v1.0（含回測）                                   |

---

## 1. 產品概述

### 1.1 背景

主動交易者（外匯、期貨、加密貨幣）的痛點：

- 看圖、判讀、設進出場價、算 R:R、查相關新聞——每次至少 5–15 分鐘
- 換商品、換週期就要重來一遍
- 紀律執行不穩，常常進場理由模糊就下單
- 既有 AI 工具（如 TradingView Remix）需訂閱、客製空間小、prompt 不透明
- **新增痛點**：單一 AI 提供商鎖定，沒法依需求切換成本/速度/品質

### 1.2 產品願景

**一個鍵在 TradingView 上做完技術分析 + 風險規劃，輸出結構化、可執行的交易計劃，並可自由選擇 AI 引擎。**

讓 AI 做「初稿分析師」，使用者保留決策權，把 5–15 分鐘的功課壓到 30 秒內看完。

### 1.3 產品目標

| 維度       | 目標                                                                    |
| ---------- | ----------------------------------------------------------------------- |
| **效率**   | 從點擊到看到完整建議 < 30 秒                                            |
| **成本**   | 每次分析 API 費用 < $0.05 USD（Claude Sonnet）/ < $0.005 USD（MiniMax） |
| **準確度** | 視覺辨識商品/週期/最近價位準確率 ≥ 95%                                  |
| **可信度** | 每個建議價位都附結構性理由（不是黑盒）                                  |
| **可控**   | Prompt、模型、Provider、輸出 schema 100% 可由使用者自行調整             |
| **可用性** | 支援中國大陸網路環境（透過 MiniMax 中國版）                             |

### 1.4 非目標（暫不做）

- 自動下單（風險過高、合規問題）
- 提供買賣訊號訂閱服務（不做 SaaS）
- 預測勝率 / 期望值（避免使用者誤信絕對保證）
- 支援 TradingView 以外的圖表平台（v1.0 後評估）

---

## 2. 目標使用者

### 2.1 Persona A — 半職業外匯交易者「David」

- 35 歲、台灣、白天上班、晚上盤後做歐美盤
- 每天看 5–10 個商品，主要 4H 波段 + 15M 進場
- 對技術分析熟，但每天功課量大、容易漏掉訊號
- 痛點：時間分散，常常某商品有好機會但沒注意到
- **需求**：快速掃過多個商品，標出「有機會」的那幾個 → MiniMax（成本低、速度快）

### 2.2 Persona B — 加密貨幣全職散戶「Mei」

- 28 歲、全職交易加密貨幣 1 年
- 用 TradingView pro，每天主要看 BTCUSDT、ETHUSDT、幾個 alt
- 自己有一套進場系統，但執行不穩、追高殺低
- 痛點：要一個「冷靜的第二意見」做紀律檢核
- **需求**：AI 給出與她不同方向的看法時要敢於指出，並說明理由 → Claude Opus（深度分析）

### 2.3 Persona C — 學習中的新手「Alex」

- 23 歲、學生、用模擬倉學習
- 看得懂 K 線但對 Order Block、CHoCH、Fib confluence 等進階概念還在摸索
- 痛點：不知道專業的人怎麼看一張圖
- **需求**：透過 AI 分析「逆向學習」專業判讀邏輯 → 以低成本為主，MiniMax 為主力

### 2.4 Persona D — 中國大陸交易者「老王」**（v0.2 新增）**

- 40 歲、上海、做加密貨幣 + 美股期貨
- 在中國大陸 GFW 環境下，無法穩定使用 Anthropic / OpenAI
- 痛點：付費翻牆不穩，時延高
- **需求**：原生中國大陸可用的 AI 引擎 → MiniMax 中國版（api.minimaxi.com）

---

## 3. 功能需求

採用 **MoSCoW 優先級**：M = Must (P0) / S = Should (P1) / C = Could (P2) / W = Won't

### 3.1 P0（v0.2 MVP，**必做**，目前已實作）

| ID        | 功能                         | 描述                                                                                             |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| F-001     | 側欄注入                     | 進入 `*.tradingview.com` 自動在右側顯示固定側欄                                                  |
| F-002     | 截取當前圖表                 | 點擊「分析」自動截取當前 tab 可見區域                                                            |
| F-003     | 截圖前隱藏側欄               | 截圖瞬間隱藏自身 UI，避免污染                                                                    |
| F-004     | LLM 視覺分析                 | 將截圖 + prompt 送選定 Provider，取得 JSON 回應                                                  |
| F-005     | 結構化結果渲染               | 顯示：商品、週期、趨勢、進場區、SL、TP1、TP2、R:R、倉位、持倉時間                                |
| F-006     | 止損理由欄位                 | 解釋為何止損設此處（引用結構性原因）                                                             |
| F-007     | 觀察要點清單                 | 至少 4 點：漏進場、回踩反轉、SL 失效、提前突破                                                   |
| F-008     | 風險提示                     | 列出近期可能影響此商品的事件（央行、CPI、地緣）                                                  |
| F-009     | 方向偏好設定                 | 下拉選單：自動 / 偏好做多 / 偏好做空                                                             |
| F-010     | 設定頁                       | API Key、模型、單筆風險 %、輸出語言                                                              |
| F-011     | 側欄收合                     | 按按鈕收起側欄，留浮動小按鈕展開                                                                 |
| F-012     | 錯誤處理                     | API 失敗、JSON 解析失敗、無 Key → 友善錯誤訊息                                                   |
| F-013     | 載入狀態                     | 截圖中、AI 分析中（含 spinner）                                                                  |
| **F-014** | **Multi-Provider 架構**      | **支援 Anthropic 與 MiniMax，可在設定頁切換，各自獨立保存 API Key**                              |
| **F-015** | **MiniMax 區域路由**         | **MiniMax 設定中可選海外（api.minimax.io）/ 中國大陸（api.minimaxi.com），key 對應對應 host**    |
| **F-016** | **JSON 容錯解析**            | **自動清除 `<think>` 推理 token、markdown code fence、前後贅字，並 fallback regex 抓 JSON 物件** |
| **F-017** | **每 Provider 獨立模型清單** | **Anthropic 顯示 Opus/Sonnet/Haiku；MiniMax 顯示 VL-01/M2.5/M2**                                 |

### 3.2 P1（v0.3，**應做**）

| ID        | 功能                      | 描述                                                                     |
| --------- | ------------------------- | ------------------------------------------------------------------------ |
| F-101     | 分析歷史紀錄              | 本機儲存最近 50 次分析結果，可回看                                       |
| F-102     | 一鍵複製建議              | 把 JSON 或文字格式複製到剪貼簿                                           |
| F-103     | 多時間框架融合            | 一次分析 4H + 1H + 15M，AI 互相驗證                                      |
| F-104     | 自訂 prompt 模板          | 使用者可在設定頁編輯 prompt（提供預設模板）                              |
| F-105     | 經濟行事曆整合            | 自動拉 ForexFactory 或 TradingEconomics 未來 24h 高影響事件，併入 prompt |
| F-106     | 商品清單批次掃描          | 給定 watchlist，自動逐一分析，標出「有機會」的                           |
| F-107     | 計算具體手數              | 給定帳戶資金，自動算出符合風險 % 的手數 / 合約數                         |
| **F-108** | **Provider 雙重驗證模式** | **同時送 Anthropic + MiniMax，比較兩者結論差異，發現分歧時標示**         |
| **F-109** | **Provider 自動降級**     | **首選 Provider 失敗（429/5xx）時自動 fallback 到次選 Provider**         |
| **F-110** | **API Key 健康檢查**      | **設定頁加「測試連線」按鈕，立即驗證 Key 與 region 是否相符**            |

### 3.3 P2（v0.4+，**可做**）

| ID        | 功能                    | 描述                                                             |
| --------- | ----------------------- | ---------------------------------------------------------------- |
| F-201     | TradingView 自動畫線    | AI 分析後自動在圖表上畫出 entry / SL / TP 水平線                 |
| F-202     | Webhook 推送            | 訊號自動發 Discord / Telegram / LINE                             |
| F-203     | 訊號回測面板            | 紀錄歷史訊號，事後追蹤是否觸發、是否獲利                         |
| F-204     | 勝率 / R:R 統計         | 累積一定樣本後，顯示 AI 訊號的真實表現（**可分 Provider 比較**） |
| F-205     | 警報設定                | 進場價、SL、TP 達到時瀏覽器通知                                  |
| F-206     | 對話式追問              | 對某個分析結果可以追問「為什麼不選 A 方案？」                    |
| F-207     | 更多 Provider           | OpenAI GPT-4V、Google Gemini Vision、本地 Ollama VLM             |
| **F-208** | **Provider 性能儀表板** | **顯示各 Provider 的平均回應時間、成功率、JSON 解析失敗率**      |

### 3.4 不做（W）

- 真實下單（合規風險）
- 公開的訊號廣播 / 社群功能
- 移動 App（Chrome MV3 已能在桌面 + Android Chrome 上運作）
- 自製圖表引擎
- ~~單一 Provider 鎖定~~（v0.2 已解除）

---

## 4. 使用者流程

### 4.1 首次安裝設定流程

```
下載 / 解壓縮 zip
       ↓
開 chrome://extensions
       ↓
啟用開發人員模式
       ↓
載入未封裝項目 → 選資料夾
       ↓
固定擴充功能到工具列
       ↓
點擴充功能 icon
       ↓
【選擇 Provider】← v0.2 新增
   ├─ Anthropic
   │     └─ 貼上 sk-ant-... key、選 Sonnet/Opus/Haiku
   └─ MiniMax
         └─ 選海外/中國區域、貼對應 key、選 VL-01
       ↓
設風險 %、選語言
       ↓
儲存
       ↓
✓ 完成（< 3 分鐘）
```

### 4.2 主要分析流程（不變）

```
開啟 TradingView 商品頁面
       ↓
側欄自動出現
       ↓
使用者調整圖表（商品 / 週期 / 縮放）
       ↓
（選用）切換方向偏好下拉選單
       ↓
點「分析當前圖表」
       ↓
側欄自身隱藏 80ms → 截圖 → 側欄恢復
       ↓
顯示「AI 分析中...」spinner
       ↓
（依 Provider，8-30 秒後）顯示完整結構化結果
       ↓
使用者複製 / 截圖 / 自行下單
```

### 4.3 切換 Provider 流程（v0.2 新增）

```
點擴充功能 icon → 開設定頁
       ↓
切換頂部 Provider 下拉選單
       ↓
對應的 Provider 區塊展開（另一個收起）
       ↓
（首次切換）填入新 Provider 的 API Key、模型
       ↓
按「儲存設定」
       ↓
✓ 下次分析自動用新 Provider
```

注意：**兩個 Provider 的 Key 各自獨立保存**，切換時不需重新貼。

### 4.4 錯誤處理流程

| 情境                                          | 處理                                                              |
| --------------------------------------------- | ----------------------------------------------------------------- |
| 未設定 API Key                                | 紅框提示「請先點擴充功能 icon 設定 API Key」                      |
| Anthropic Key 錯誤（401）                     | 顯示「Anthropic API 401: invalid x-api-key」                      |
| **MiniMax Key 與 Region 不匹配**              | **顯示「MiniMax API: invalid api key」並建議檢查區域設定**        |
| API 額度用盡（429）                           | 顯示「額度已用盡」+ 提示切換到另一 Provider（v0.3 自動 fallback） |
| 網路斷線                                      | 顯示「無法連線，請檢查網路」+ 「重試」按鈕                        |
| **`<think>` 標籤未清乾淨**（MiniMax M2 系列） | **regex strip 後仍嘗試解析 JSON；失敗則顯示原始回應前 200 字**    |
| JSON 解析失敗                                 | 顯示原始回應前 200 字，建議重試                                   |
| 截圖失敗                                      | 提示權限問題，引導使用者重新授權                                  |

---

## 5. UI / UX 規範

### 5.1 側欄佈局（不變）

```
┌─────────────────────────────────┐
│ 📊 Chart AI Copilot      [⮕]   │
├─────────────────────────────────┤
│ [自動判斷 ▾] [分析當前圖表]    │
│                                 │
│ ┌─ 交易設置  [做多 LONG] ───┐ │
│ │ 商品 / 週期    USDJPY / 1H│ │
│ │ 進場區        158.45      │ │
│ │ 止損          159.05      │ │
│ │ TP1           157.20      │ │
│ │ TP2           155.70      │ │
│ │ R:R 比率      2.43:1      │ │
│ │ 建議倉位      1% 帳戶風險 │ │
│ │ 預期持倉      3-7 天      │ │
│ └────────────────────────────┘ │
│                                 │
│ ⚠️ 關鍵觀察要點                 │
│  1...  2...  3...  4...        │
│                                 │
│ ⚠ 風險提示                      │
│                                 │
│ 2026/5/10 14:32 · 僅供參考      │
└─────────────────────────────────┘
```

### 5.2 設定頁佈局（v0.2 更新）

```
┌─ Chart AI Copilot 設定 ──────────┐
│                                  │
│ AI 提供商                        │
│ [Anthropic ▾]                   │
│                                  │
│ ┌─ Anthropic 區塊（藍色左邊條）─┐│
│ │ Anthropic API Key             ││
│ │ [sk-ant-_______________]      ││
│ │ 模型                          ││
│ │ [Claude Sonnet 4.5 ▾]         ││
│ └───────────────────────────────┘│
│                                  │
│ ┌─ MiniMax 區塊（隱藏）─────────┐│
│ │  ...                          ││
│ └───────────────────────────────┘│
│ ────────────────────             │
│ 單筆風險上限（%）                │
│ [1.0]                            │
│ 分析語言                         │
│ [繁體中文 ▾]                    │
│                                  │
│ [    儲存設定    ]               │
└──────────────────────────────────┘
```

切換 Provider 時，對應區塊展開、另一個收起（不刪資料）。

### 5.3 狀態設計（不變，略）

### 5.4 配色（不變，略）

---

## 6. 技術架構

### 6.1 元件圖（v0.2 更新：加入 Provider Abstraction）

```
┌─────────────────────────────────────────────────┐
│ Chrome Browser                                  │
│                                                 │
│  ┌──── TradingView Tab ────────────────────┐  │
│  │  content.js（不變）                      │  │
│  └───────────────┬──────────────────────────┘  │
│                  │                              │
│                  ▼                              │
│  ┌── background.js (Service Worker) ────────┐  │
│  │                                            │  │
│  │  CAPTURE_TAB                              │  │
│  │     ↓                                     │  │
│  │  chrome.tabs.captureVisibleTab()          │  │
│  │                                            │  │
│  │  ANALYZE_IMAGE                            │  │
│  │     ↓                                     │  │
│  │  讀 storage 取設定                        │  │
│  │     ↓                                     │  │
│  │  buildPrompt()  ← 共用                    │  │
│  │     ↓                                     │  │
│  │  ┌─ Provider Dispatch ─────────────┐     │  │
│  │  │ switch(provider)                │     │  │
│  │  │   case 'anthropic':             │     │  │
│  │  │     callAnthropic() ─────────────┼─────┼─→ api.anthropic.com
│  │  │   case 'minimax':               │     │  │
│  │  │     region = 'global' | 'china' │     │  │
│  │  │     callMiniMax() ───────────────┼─────┼─→ api.minimax.io 或
│  │  │                                  │     │  │   api.minimaxi.com
│  │  └──────────────────────────────────┘     │  │
│  │     ↓                                     │  │
│  │  parseJSON()  ← 共用容錯解析              │  │
│  │     ↓                                     │  │
│  │  回傳 content                             │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌── popup.html / popup.js（v0.2 重寫）────┐  │
│  │ Provider 選擇器 + 動態切換區塊           │  │
│  │ chrome.storage.local 讀寫                │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 6.2 訊息協議（不變）

```ts
type Message =
  | { type: "CAPTURE_TAB" }
  | {
      type: "ANALYZE_IMAGE";
      base64: string;
      direction: "auto" | "long" | "short";
    };

type Response =
  | { base64: string }
  | { data: AnalysisResult }
  | { error: string };
```

### 6.3 資料 Schema

**AnalysisResult（不變）**

```ts
interface AnalysisResult {
  symbol: string;
  timeframe: string;
  trend: string;
  direction: "long" | "short";
  entry_zone: string;
  stop_loss: string;
  stop_loss_reason: string;
  tp1: string;
  tp2: string;
  rr_ratio: string;
  position_size: string;
  holding_period: string;
  key_points: string[];
  risk_warning: string;
}
```

**Storage Schema（v0.2 更新）**

```ts
interface ExtensionSettings {
  // Provider selection
  provider: "anthropic" | "minimax";

  // Anthropic
  anthropicApiKey: string; // 'sk-ant-...'
  anthropicModel: "claude-opus-4-5" | "claude-sonnet-4-5" | "claude-haiku-4-5";

  // MiniMax
  minimaxApiKey: string; // 各 region 不同
  minimaxRegion: "global" | "china";
  minimaxModel: "MiniMax-VL-01" | "MiniMax-M2.5" | "MiniMax-M2";

  // 共用
  riskPct: number; // 0.1 ~ 5.0
  lang: "zh-TW" | "zh-CN" | "en";
}
```

⚠️ 兩個 Provider 的 Key 各自獨立儲存，切換不會清空。

### 6.4 API 整合

#### 6.4.1 Anthropic Messages API

```
POST https://api.anthropic.com/v1/messages

Headers:
  x-api-key: <user_key>
  anthropic-version: 2023-06-01
  anthropic-dangerous-direct-browser-access: true
  content-type: application/json

Body:
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 2048,
  "messages": [{
    "role": "user",
    "content": [
      { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "..." } },
      { "type": "text", "text": "<analysis prompt>" }
    ]
  }]
}

Response.content[0].text → JSON 字串 → parseJSON()
```

#### 6.4.2 MiniMax Chat Completions API（v0.2 新增）

```
POST https://api.minimax.io/v1/chat/completions       (海外版)
POST https://api.minimaxi.com/v1/chat/completions     (中國版)

Headers:
  Authorization: Bearer <user_key>
  Content-Type: application/json

Body:  // OpenAI-compatible
{
  "model": "MiniMax-VL-01",
  "max_tokens": 2048,
  "temperature": 0.3,
  "messages": [{
    "role": "user",
    "content": [
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } },
      { "type": "text", "text": "<analysis prompt>" }
    ]
  }]
}

Response.choices[0].message.content → 可能含 <think> → strip → parseJSON()
```

**MiniMax 特殊處理：**

| 議題                      | 處理                                                                      |
| ------------------------- | ------------------------------------------------------------------------- |
| Region 切換               | 由 `minimaxRegion` 決定 baseUrl                                           |
| `<think>...</think>` 標籤 | callMiniMax() 內以 regex 移除，再回傳                                     |
| Vision 模型可用性         | 預設 `MiniMax-VL-01`，純文字模型會回 `model does not support image input` |
| Key 與 region 不符        | 直接顯示 MiniMax 回的 `invalid api key` 錯誤                              |

### 6.5 Prompt 設計原則

1. **JSON-only 輸出**：明確要求純 JSON，不要 markdown、不要 `<think>` 標籤、不要解釋
2. **欄位必填**：每個 schema 欄位都要求填寫，缺資訊就寫「資訊不足」
3. **方法論列表**：明列要應用的 7 個分析框架，避免 LLM 自由發揮
4. **語言鎖定**：依 `lang` 設定要求輸出語言
5. **風險 % 帶入**：在 prompt 中代入 `${riskPct}`，AI 會據此計算倉位
6. **觀察要點四象限**：強制 key_points 涵蓋（漏進場 / 回踩 / SL 破 / 提前突破）
7. **Provider-agnostic**：同一份 prompt 兩 Provider 都能用（v0.2 確認）

### 6.6 容錯解析機制（v0.2 新增）

````js
function parseJSON(text) {
  let cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "") // 1. 移除 think 標籤
    .replace(/```(?:json)?\s*/g, "") // 2. 移除 markdown 開頭
    .replace(/```\s*$/g, "") // 3. 移除 markdown 結尾
    .trim();

  try {
    return JSON.parse(cleaned); // 4. 直接解析
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/); // 5. fallback：抓出第一個 JSON 物件
    if (match) return JSON.parse(match[0]);
    throw new Error("AI 回應無法解析為 JSON");
  }
}
````

---

## 7. 非功能需求

### 7.1 效能

| 指標         | Anthropic 目標 | **MiniMax 目標** |
| ------------ | -------------- | ---------------- |
| API 回應 p50 | < 15s          | **< 12s**        |
| API 回應 p95 | < 30s          | **< 25s**        |
| 截圖耗時     | < 200ms        | < 200ms          |
| 渲染耗時     | < 100ms        | < 100ms          |
| 端到端 p50   | < 18s          | **< 15s**        |
| 端到端 p95   | < 35s          | **< 28s**        |

### 7.2 安全與隱私

| 項目         | 處理方式                                                                    |
| ------------ | --------------------------------------------------------------------------- |
| API Key 儲存 | `chrome.storage.local`（僅本機，分 provider 各存一份）                      |
| API Key 傳輸 | 僅透過 HTTPS 直送對應 Provider                                              |
| 截圖傳輸     | 僅送選定 Provider，不存任何第三方                                           |
| 截圖保留     | API 呼叫結束即丟棄                                                          |
| 第三方追蹤   | 無 analytics、無 telemetry                                                  |
| 權限         | `storage`、`scripting`、TradingView host、Anthropic host、MiniMax 兩個 host |

⚠️ **告知使用者**：

- API Key 雖存本機，但同台電腦的其他 Chrome 擴充功能理論上能讀取
- 請使用低額度的 key 或設置額度上限
- **MiniMax 中國版** 的資料會經過中國境內伺服器，敏感商品資訊請留意

### 7.3 可靠度

| 情境                    | 處理                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| 網路斷線                | fetch 拋錯 → 顯示重試按鈕                                             |
| API 5xx                 | 顯示錯誤碼 + 訊息，使用者可重試（v0.3 自動 fallback 到另一 Provider） |
| API 429（rate limit）   | 顯示「請稍後再試」+ 倒數                                              |
| **MiniMax invalid key** | **顯示原始錯誤 + 建議檢查 region 設定**                               |
| LLM 回應非 JSON         | 容錯解析 → 失敗則顯示原始回應                                         |
| **`<think>` 標籤干擾**  | **callMiniMax + parseJSON 雙重清除**                                  |
| 截圖無內容              | 不檢測，但 LLM 會回「無法辨識圖表」                                   |
| 多次重複點擊            | 按鈕 disabled                                                         |

### 7.4 相容性

- Chrome 120+（MV3）
- Edge（Chromium）120+
- 不支援 Firefox（manifest 差異）
- 不支援 Safari（無 MV3）
- TradingView 所有圖表頁面

### 7.5 成本（v0.2 更新）

| 模型              | 每次分析估價     | 適用情境               |
| ----------------- | ---------------- | ---------------------- |
| Claude Opus 4.5   | $0.04–0.06       | 重要決策、複雜圖表     |
| Claude Sonnet 4.5 | $0.012–0.02      | 預設、日常             |
| Claude Haiku 4.5  | $0.003–0.006     | 批次掃多個             |
| **MiniMax-VL-01** | **$0.001–0.003** | **預設、日常、批次掃** |
| **MiniMax-M2.5**  | **$0.002–0.004** | **較複雜判斷**         |

**月使用量估算：**

- 每日 5 次分析 × 30 天 = 150 次/月
- 全用 Sonnet：$2.5–3 USD
- 全用 MiniMax-VL：$0.2–0.5 USD
- **混合策略**（80% MiniMax + 20% Sonnet）：$0.7–1.2 USD

---

## 8. 成功指標

### 8.1 啟動指標（v0.2 釋出後 30 天）

- 自己實際使用率：每週 ≥ 5 次分析
- 結果可用率：≥ 80% 直接可用
- 成本符合預期：每次 < $0.05（Claude）/ < $0.005（MiniMax）
- **Provider 切換率**：至少使用過兩個 Provider 的次數佔總次數 ≥ 20%

### 8.2 品質指標（依 Provider 分別追蹤）

| 指標                | Anthropic 目標 | MiniMax 目標                   |
| ------------------- | -------------- | ------------------------------ |
| 商品/週期辨識準確率 | ≥ 95%          | ≥ 92%                          |
| 最近價位辨識誤差    | ≤ 0.05%        | ≤ 0.1%                         |
| 結構性建議命中率    | ≥ 70%          | ≥ 65%                          |
| JSON 解析成功率     | ≥ 99%          | ≥ 97%（含 think token 處理後） |
| API 失敗率          | < 2%           | < 3%                           |

### 8.3 使用者體驗指標

- 從點擊到看到結果：p95 < 35 秒（Anthropic）/ < 28 秒（MiniMax）
- 連續 5 次分析無錯誤
- Provider 切換流程一次成功率 > 95%

---

## 9. 里程碑與排程

```
v0.1 — MVP（已過時）
└─ 單一 Anthropic Provider

v0.2 — Multi-Provider（已完成）  ← 目前
├─ F-014 ~ F-017（Provider 抽象、區域路由、容錯）
├─ Persona D（中國大陸使用者）覆蓋
└─ Acceptance：Anthropic / MiniMax 兩 Provider 都能完成完整分析

v0.3 — 工具化升級（2-3 週）
├─ F-101 分析歷史紀錄
├─ F-102 一鍵複製
├─ F-103 多時間框架融合
├─ F-107 計算具體手數
├─ F-108 Provider 雙重驗證
├─ F-109 Provider 自動 fallback
├─ F-110 API Key 健康檢查
└─ Acceptance：歷史可回看；Provider 失敗自動切換

v0.4 — 整合擴展（1-2 個月）
├─ F-104 自訂 prompt 模板
├─ F-105 經濟行事曆
├─ F-106 watchlist 批次掃描
├─ F-201 自動畫線到圖表
├─ F-202 Webhook 推送
└─ Acceptance：能與既有交易工作流整合

v1.0 — 數據驅動（3-6 個月）
├─ F-203 訊號回測面板（分 Provider 比較）
├─ F-204 勝率 / R:R 統計
├─ F-205 警報通知
├─ F-206 對話式追問
├─ F-208 Provider 性能儀表板
└─ Acceptance：累積 ≥ 100 筆訊號，可量化評估各 Provider 品質

v1.x — 平台擴展（評估後）
├─ F-207 OpenAI / Gemini / Ollama 支援
├─ Firefox 支援
└─ 其他圖表平台（TrendSpider、MT5 web）
```

---

## 10. 風險與緩解（v0.2 更新）

| 風險                         | 嚴重度    | 緩解策略                                                                   |
| ---------------------------- | --------- | -------------------------------------------------------------------------- |
| LLM 視覺辨識錯誤             | 🔴 高     | (1) Prompt 強調精確讀數 (2) 顯示「僅供參考」(3) v0.3 加 dual-provider 驗證 |
| 使用者誤信 AI 訊號全壓       | 🔴 高     | UI 顯眼處標「非投資建議」、強制 1% 風險預設                                |
| API Key 外流                 | 🟡 中     | 提示用低額度 key、文件強調風險                                             |
| TradingView 改版破壞注入     | 🟡 中     | 不依賴 TradingView 內部 DOM，獨立側欄                                      |
| 違反 TradingView ToS         | 🟡 中     | 僅截取使用者畫面，不抓內部 API                                             |
| **MiniMax key/region 配錯**  | **🟢 低** | **設定頁明確標註、F-110 加測試按鈕（v0.3）**                               |
| **MiniMax 視覺模型停用**     | **🟡 中** | **架構支援切回 Claude、F-109 自動 fallback（v0.3）**                       |
| **MiniMax 中國版資料合規**   | **🟡 中** | **README 明確告知使用者，敏感資訊請改用海外 Provider**                     |
| **`<think>` 標籤新格式變動** | **🟢 低** | **regex 容錯 + 雙重清理，新格式快速 patch**                                |
| Anthropic API 漲價           | 🟢 低     | 已有 MiniMax 替代                                                          |
| 法規風險（金融建議）         | 🟡 中     | 全文不使用「保證」「必勝」字眼                                             |

---

## 11. 開放問題（v0.2 更新）

待後續討論決定：

1. ~~**是否要付費版？**~~ → **已決定維持 BYOK**
2. **Provider 預設順序？** 新使用者首次安裝預設選 Anthropic 還是 MiniMax？目前預設 Anthropic（品質優先）
3. **Dual-mode 的 UI 呈現？** F-108 兩 Provider 同時跑時，結果如何並排顯示？分頁 / 並列 / 合成摘要？
4. **多語言市場優先序？** 中文（繁/簡）→ 英文 → 日文？
5. **Mobile 支援？** Chrome Android 支援 MV3，但 TradingView 手機版佈局完全不同
6. ~~**是否做 Manifest V2 fallback？**~~ → **已決定不做**
7. **是否整合 Anthropic 的 Computer Use 或 MiniMax 的 Agent？** 未來可讓 AI 自己操控 TradingView，但目前必要性不高
8. **新 Provider 加入優先序？** OpenAI GPT-4V、Gemini、Qwen-VL、本地 Ollama 哪個先做？

---

## 12. 附錄

### 12.1 預設 Prompt 模板

詳見 `background.js` 的 `buildPrompt()` 函式。核心結構：

```
你是專業金融市場技術分析師...
[方向偏好指令]
[7 個分析框架列表]
[風險控制 % 設定]
[嚴格輸出規則：純 JSON、無 think 標籤、無 markdown]
[JSON schema 定義]
[key_points 四象限要求]
```

### 12.2 競品對照（v0.2 更新）

| 產品                              | 優勢                                                           | 劣勢                               |
| --------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| TradingView Remix                 | 整合度高、prompt 完善                                          | 訂閱制、prompt 黑盒、單一 Provider |
| ChatGPT Vision（手動截圖）        | 模型多元                                                       | 流程繁瑣、無 R:R 計算              |
| TrendSpider AI                    | 內建技術指標多                                                 | 平台鎖定、學習曲線陡               |
| **Chart AI Copilot v0.2（本案）** | **BYOK 低成本、prompt 全透明、多 Provider 自由切換、中國可用** | 需自備 API Key、初期無回測數據     |

### 12.3 名詞表

| 縮寫         | 全名                      | 中文                                          |
| ------------ | ------------------------- | --------------------------------------------- |
| OB           | Order Block               | 訂單塊                                        |
| FVG          | Fair Value Gap            | 價值缺口                                      |
| BoS          | Break of Structure        | 結構突破                                      |
| CHoCH        | Change of Character       | 結構轉換                                      |
| R:R          | Risk:Reward Ratio         | 風險報酬比                                    |
| TP / SL      | Take Profit / Stop Loss   | 停利 / 停損                                   |
| SMC          | Smart Money Concept       | 主力資金邏輯                                  |
| MV3          | Manifest V3               | Chrome 擴充功能 v3 規範                       |
| BYOK         | Bring Your Own Key        | 自帶 API Key                                  |
| **VLM**      | **Vision-Language Model** | **視覺-語言模型**                             |
| **Provider** | —                         | **AI 服務提供商（Anthropic / MiniMax / 等）** |

### 12.4 v0.1 → v0.2 變更摘要

| 章節                | 變更                                                               |
| ------------------- | ------------------------------------------------------------------ |
| §2 Personas         | 新增 Persona D（中國大陸使用者）                                   |
| §3.1 P0             | 新增 F-014 ~ F-017（Provider 抽象、區域路由、JSON 容錯、模型清單） |
| §3.2 P1             | 新增 F-108 ~ F-110（雙重驗證、自動 fallback、Key 健康檢查）        |
| §4 流程             | 新增「切換 Provider 流程」                                         |
| §5.2 設定頁         | 重新設計為 Provider 選擇器 + 動態切換區塊                          |
| §6.1 架構圖         | 加入 Provider Dispatch 層                                          |
| §6.3 Storage Schema | 拆分 anthropic/minimax 各自欄位                                    |
| §6.4 API 整合       | 新增 MiniMax API 規格                                              |
| §6.6 容錯解析       | 新增（處理 `<think>` 標籤）                                        |
| §7.1 效能           | 分 Provider 列目標                                                 |
| §7.5 成本           | 加 MiniMax 對照、混合策略                                          |
| §8 指標             | 分 Provider 追蹤                                                   |
| §9 里程碑           | 新增 v0.2，原 v0.2/0.3 順延                                        |
| §10 風險            | 新增 4 條 MiniMax 相關                                             |
| §11 開放問題        | 標注已解決項；新增 dual-mode UI、新 Provider 優先序                |

---

**文件結束**
