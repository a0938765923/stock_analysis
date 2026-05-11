// ---------------------------------------------------------------------------
// Module imports (ES module — manifest "type": "module")
// ---------------------------------------------------------------------------
import { sendTelegramMessage, testTelegramConnection, formatAlertMessage, formatBriefingMessage } from './telegram.js';
import { getProfile, saveProfile, buildProfilePromptSection } from './profile.js';
import { buildPinePrompt } from './pine-generator.js';
import { generateDailyBriefing, buildBriefingPrompt } from './briefing.js';

// ---------------------------------------------------------------------------
// Constants & defaults
// ---------------------------------------------------------------------------
const SETTINGS_KEY = 'chart_ai_settings';
/** 記住自訂 API 上次成功的 vision 格式，避免每次都輪詢多種 payload */
const CUSTOM_VISION_HINTS_KEY = 'chart_ai_custom_vision_hints';
/** 單次 vision 請求逾時（ms）；中轉卡住時不要無限等待
 *  120s：prompt 現在包含 K線/進場信號/圖表型態/量能 4 個知識庫，token 數較大
 */
const CUSTOM_VISION_FETCH_MS = 120000;

/** 一般 API 請求逾時（ms），用於 Anthropic / MiniMax */
const DEFAULT_FETCH_TIMEOUT_MS = 90000;

/** callCustom / callCustomMulti 整體操作的天花板（ms）
 *  300s 允許最多 2 次完整嘗試（各 120s）+ 備用格式重試空間
 */
const CUSTOM_GLOBAL_TIMEOUT_MS = 300000;

/** callCustom / callCustomMulti 最大 rounds 數（圖片尺寸層） */
const CUSTOM_MAX_ROUNDS = 3;

const DEFAULT_SETTINGS = {
  provider: 'anthropic',
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-4-5',
  minimaxApiKey: '',
  minimaxRegion: 'global',
  minimaxModel: 'MiniMax-M2.5',
  customBaseUrl: '',
  customApiKey: '',
  customModel: '',
  customVision: true,
  riskPct: 1,
  lang: 'zh-TW',
  language: 'zh-TW',
  promptTemplates: [],
  selectedTemplateId: null,
  batchScanDelayMs: 3000,
  batchScanMaxSymbols: 20
};

function parseJSON(text) {
  // Strip think tags and markdown code fences
  let cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?\s*/g, '')
    .replace(/```\s*$/g, '')
    .trim();

  // Direct parse
  try { return JSON.parse(cleaned); } catch (_) {}

  // Extract the outermost {...} block (handles markdown wrapper text)
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}

    // Last resort: find the largest valid JSON object in the string
    let depth = 0, start = -1, best = null;
    for (let i = 0; i < match[0].length; i++) {
      if (match[0][i] === '{') { if (depth === 0) start = i; depth++; }
      else if (match[0][i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            const candidate = JSON.parse(match[0].slice(start, i + 1));
            if (Object.keys(candidate).length > (best ? Object.keys(best).length : -1)) best = candidate;
          } catch (_) {}
        }
      }
    }
    if (best) return best;
  }

  throw new Error('AI 回應無法解析為 JSON，原始內容：' + cleaned.slice(0, 150));
}

/**
 * 判斷此錯誤是否符合 fallback 條件（429 或 5xx）。
 * callAnthropic / callMiniMax / callCustom 在拋出錯誤時會把
 * HTTP status 附掛在 error.httpStatus，供此函式讀取。
 *
 * @param {Error} e
 * @returns {boolean}
 */
function isFallbackEligible(e) {
  if (typeof e.httpStatus === 'number') {
    return e.httpStatus === 429 || e.httpStatus >= 500;
  }
  return false;
}

async function resizeDataUrl(dataUrl, maxWidth, quality) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bmp = await createImageBitmap(blob);

    async function compress(src, w, h, q) {
      const oc = new OffscreenCanvas(w, h);
      oc.getContext('2d').drawImage(src, 0, 0, w, h);
      return oc.convertToBlob({ type: 'image/jpeg', quality: q });
    }

    const w0 = Math.min(bmp.width, maxWidth);
    const h0 = Math.round(bmp.height * (w0 / bmp.width));
    let outBlob = await compress(bmp, w0, h0, quality);
    bmp.close();

    // 超過 100 KB 二次壓縮（relay payload 上限保護）
    if (outBlob.size > 100000) {
      const bmp2 = await createImageBitmap(outBlob);
      outBlob = await compress(bmp2, Math.round(w0 * 0.7), Math.round(h0 * 0.7), 0.6);
      bmp2.close();
    }

    // 還是太大，三次壓縮
    if (outBlob.size > 100000) {
      const bmp3 = await createImageBitmap(outBlob);
      outBlob = await compress(bmp3, Math.round(w0 * 0.5), Math.round(h0 * 0.5), 0.5);
      bmp3.close();
    }

    const bytes = new Uint8Array(await outBlob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
    }
    return 'data:image/jpeg;base64,' + btoa(binary);
  } catch (_) {
    return dataUrl;
  }
}

async function handleCaptureTab() {
  try {
    const raw = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    const dataUrl = await resizeDataUrl(raw, 1280, 0.75);
    return { ok: true, dataUrl };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function handleGetSettings() {
  try {
    const result = await chrome.storage.local.get([SETTINGS_KEY, 'promptTemplates']);
    const settings = result[SETTINGS_KEY] || Object.assign({}, DEFAULT_SETTINGS);
    // promptTemplates are stored under a separate key by popup.js; merge them in
    // so content.js resolveTemplateBody() can read settings.promptTemplates correctly
    if (Array.isArray(result['promptTemplates'])) {
      settings.promptTemplates = result['promptTemplates'];
    } else if (!Array.isArray(settings.promptTemplates)) {
      settings.promptTemplates = [];
    }
    return { ok: true, settings };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function handleSaveSettings(payload) {
  try {
    await chrome.storage.local.set({ [SETTINGS_KEY]: payload });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * F-109：Provider 自動降級（Auto Fallback）
 *
 * AnalysisResult 可選欄位：
 *   _fallbackWarning?: string   — 僅在發生 fallback 時附加
 *
 * Fallback 規則：
 *   anthropic → minimax（需有 minimaxApiKey）
 *   minimax   → anthropic（需有 anthropicApiKey）
 *   custom    → 不 fallback
 * 觸發條件：HTTP 429 或 5xx（401 等 key 錯誤不觸發）
 */
async function handleAnalyzeChart(payload) {
  const { dataUrl, settings } = payload;

  // --- 注入用戶交易偏好 ---
  const profile = await getProfile();
  const profileSection = buildProfilePromptSection(profile);
  const prompt = profileSection ? profileSection + '\n\n' + payload.prompt : payload.prompt;

  // --- 主 provider 呼叫 ---
  try {
    let result;
    if (settings.provider === 'custom') {
      result = await callCustom(dataUrl, prompt, settings);
    } else if (settings.provider === 'minimax') {
      result = await callMiniMax(dataUrl, prompt, settings);
    } else {
      result = await callAnthropic(dataUrl, prompt, settings);
    }
    return { ok: true, result };
  } catch (primaryError) {
    // custom provider 不做 fallback，直接回傳錯誤
    if (settings.provider === 'custom') {
      return { ok: false, error: primaryError.message };
    }

    // 非 429 / 5xx 錯誤（如 401 key 無效）不做 fallback
    if (!isFallbackEligible(primaryError)) {
      return { ok: false, error: primaryError.message };
    }

    // --- 決定 fallback provider ---
    let fallbackProvider = null;
    if (settings.provider === 'anthropic' && settings.minimaxApiKey) {
      fallbackProvider = 'minimax';
    } else if (settings.provider === 'minimax' && settings.anthropicApiKey) {
      fallbackProvider = 'anthropic';
    }

    // 沒有可用的 fallback provider
    if (!fallbackProvider) {
      return { ok: false, error: primaryError.message };
    }

    // --- 執行 fallback ---
    try {
      let result;
      if (fallbackProvider === 'minimax') {
        result = await callMiniMax(dataUrl, prompt, settings);
      } else {
        result = await callAnthropic(dataUrl, prompt, settings);
      }
      result._fallbackWarning = `主 Provider 失敗，已切換至 ${fallbackProvider} 重試`;
      return { ok: true, result };
    } catch (fallbackError) {
      // fallback 也失敗，回傳 fallback 的錯誤訊息
      return { ok: false, error: fallbackError.message };
    }
  }
}

/**
 * F-103：Multi-timeframe fusion handler
 *
 * payload: { dataUrls: string[], prompt: string, settings: object }
 * 回傳：{ ok: true, result } | { ok: false, error: string }
 */
async function handleAnalyzeMultiChart(payload) {
  const { dataUrls, settings } = payload;

  // --- 注入用戶交易偏好 ---
  const profile = await getProfile();
  const profileSection = buildProfilePromptSection(profile);
  const prompt = profileSection ? profileSection + '\n\n' + payload.prompt : payload.prompt;

  try {
    let result;
    if (settings.provider === 'custom') {
      result = await callCustomMulti(dataUrls, prompt, settings);
    } else if (settings.provider === 'minimax') {
      result = await callMiniMaxMulti(dataUrls, prompt, settings);
    } else {
      result = await callAnthropicMulti(dataUrls, prompt, settings);
    }
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * F-108：Dual-provider validation handler
 *
 * payload: { dataUrl: string, prompt: string, settings: object }
 * 回傳：{ ok: true, dualResults: [...] } | { ok: false, error: string }
 */
async function handleDualAnalyzeChart(payload) {
  const { dataUrl, settings } = payload;

  // --- 注入用戶交易偏好 ---
  const profile = await getProfile();
  const profileSection = buildProfilePromptSection(profile);
  const prompt = profileSection ? profileSection + '\n\n' + payload.prompt : payload.prompt;

  const availableProviders = [
    settings.anthropicApiKey ? 'anthropic' : null,
    settings.minimaxApiKey ? 'minimax' : null,
    (settings.customApiKey && settings.customBaseUrl && settings.customModel) ? 'custom' : null
  ].filter(Boolean);

  if (availableProviders.length < 2) {
    return { ok: false, error: '雙驗證需要至少設定兩個 Provider 的 API Key（例如同時設定 Anthropic 和 MiniMax）' };
  }

  const primaryIdx = availableProviders.indexOf(settings.provider);
  const ordered = primaryIdx >= 0
    ? [availableProviders[primaryIdx], ...availableProviders.filter((_, i) => i !== primaryIdx)]
    : availableProviders;

  const p1 = ordered[0];
  const p2 = ordered[1];

  const [r1, r2] = await Promise.allSettled([
    callProvider(p1, dataUrl, prompt, settings),
    callProvider(p2, dataUrl, prompt, settings)
  ]);

  return {
    ok: true,
    dualResults: [
      {
        provider: p1,
        result: r1.status === 'fulfilled' ? r1.value : null,
        error: r1.status === 'rejected' ? (r1.reason && r1.reason.message) : null
      },
      {
        provider: p2,
        result: r2.status === 'fulfilled' ? r2.value : null,
        error: r2.status === 'rejected' ? (r2.reason && r2.reason.message) : null
      }
    ]
  };
}

/**
 * F-110：TEST_CONNECTION handler
 *
 * 發送最小純文字訊息測試 API key 是否有效，不含圖片。
 * payload: { provider, settings }
 * 回傳：{ ok: true, message: "連線正常" } | { ok: false, error: "..." }
 */
async function handleTestConnection(payload) {
  const { provider, settings } = payload;
  try {
    if (provider === 'anthropic') {
      await callAnthropicText('hi', settings);
    } else if (provider === 'minimax') {
      await callMiniMaxText('hi', settings);
    } else if (provider === 'custom') {
      await callCustomText('hi', settings);
    } else {
      return { ok: false, error: `未知的 provider: ${provider}` };
    }
    return { ok: true, message: '連線正常' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// 各 Provider 圖片分析呼叫
// ---------------------------------------------------------------------------

async function callAnthropic(dataUrl, prompt, settings) {
  if (!settings.anthropicApiKey) {
    throw new Error('請先點擴充功能 icon 設定 API Key');
  }

  const mediaType = dataUrl.split(';')[0].split(':')[1] || 'image/jpeg';
  const base64 = dataUrl.split(',')[1];

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': settings.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.anthropicModel || 'claude-sonnet-4-5',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`Anthropic 請求逾時（>${DEFAULT_FETCH_TIMEOUT_MS / 1000}s），請重試`);
    }
    throw new Error('無法連線，請檢查網路後重試');
  }

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorJson = await response.json();
      if (errorJson.error && errorJson.error.message) {
        errorMessage = errorJson.error.message;
      }
    } catch (_) {}

    const err = (() => {
      if (response.status === 401) return new Error('Anthropic API 401: invalid x-api-key');
      if (response.status === 429) return new Error('API 額度已用盡，請稍後再試');
      return new Error(`Anthropic API ${response.status}: ${errorMessage}`);
    })();
    err.httpStatus = response.status;
    throw err;
  }

  const json = await response.json();
  return parseJSON(json.content[0].text);
}

async function callMiniMax(dataUrl, prompt, settings) {
  if (!settings.minimaxApiKey) {
    throw new Error('請先點擴充功能 icon 設定 API Key');
  }

  const baseUrl = settings.minimaxRegion === 'china'
    ? 'https://api.minimaxi.com'
    : 'https://api.minimax.io';

  let response;
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.minimaxApiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.minimaxModel || 'MiniMax-M2.5',
        max_tokens: 2048,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: dataUrl }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      })
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`MiniMax 請求逾時（>${DEFAULT_FETCH_TIMEOUT_MS / 1000}s），請重試`);
    }
    throw new Error('無法連線，請檢查網路後重試');
  }

  if (!response.ok) {
    let errorMessage = `MiniMax API ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.error && errorJson.error.message) {
        errorMessage = errorJson.error.message;
      }
    } catch (_) {}

    const err = (() => {
      if (response.status === 401) return new Error('MiniMax API: invalid api key - 請確認區域設定是否正確');
      if (response.status === 429) return new Error('API 額度已用盡，請稍後再試');
      return new Error(errorMessage);
    })();
    err.httpStatus = response.status;
    throw err;
  }

  const json = await response.json();
  const text = json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content
    : null;
  if (!text) throw new Error('MiniMax 回應格式異常: ' + JSON.stringify(json).slice(0, 200));
  try {
    return parseJSON(text);
  } catch (e) {
    throw new Error('MiniMax 原始回應: ' + text.slice(0, 300));
  }
}

/**
 * Normalise a user-supplied Base URL into the full /chat/completions endpoint.
 * Handles the common mistake of pasting the full endpoint URL as Base URL,
 * and enforces that the URL has a valid http(s) protocol so fetch doesn't throw
 * a silent "Failed to fetch" that looks like a network error.
 */
function resolveCustomEndpoint(rawUrl) {
  const trimmed = (rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('請先在設定頁填入 Base URL');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Base URL 格式錯誤：必須以 https:// 或 http:// 開頭（目前：${trimmed.slice(0, 40)}）`);
  }
  // If the user already pasted the full endpoint URL, don't double-append the path
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

/** F-103 多時間框架截圖順序標籤（Custom / Anthropic / MiniMax 共用） */
const MULTI_TF_LABELS = ['4H', '1H', '15M'];

function customExtractErrorMessage(status, rawText, parsed) {
  let errorMessage = `API ${status}`;
  if (parsed) {
    errorMessage = (parsed.error && parsed.error.message)
      || parsed.message
      || errorMessage;
  } else if (rawText) {
    const stripped = rawText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (stripped) errorMessage = `API ${status}: ${stripped}`;
  }
  return errorMessage;
}

/** 部分中轉服務對 vision 請求格式挑剔：554 或多模態相關 400 時可換格式重試 */
function customVisionRetryEligible(status, errorMessage) {
  if (status === 554) return true;
  if (status === 400 || status === 422 || status === 415) {
    const m = String(errorMessage || '').toLowerCase();
    return /vision|multimodal|multi-modal|image_url|image input|image_inputs|picture|unsupported.*image|多模|模態|图片|圖片/.test(m);
  }
  return false;
}

function customBaseChatBody(model, messages, maxTokens = 2048) {
  return {
    model,
    max_tokens: maxTokens,
    temperature: 0.3,
    stream: false,
    messages
  };
}

/**
 * @param {object} body
 * @param {{ timeoutMs?: number, signal?: AbortSignal }} [opts]
 *   signal: 外部全局 deadline（callCustom 傳入），與單次逾時組合使用
 */
async function customPostChat(endpoint, apiKey, body, opts) {
  const timeoutMs = opts && typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 0;
  const outerSignal = (opts && opts.signal instanceof AbortSignal) ? opts.signal : null;

  let signal = null;
  if (timeoutMs > 0 && outerSignal) {
    signal = (typeof AbortSignal.any === 'function')
      ? AbortSignal.any([AbortSignal.timeout(timeoutMs), outerSignal])
      : AbortSignal.timeout(timeoutMs);
  } else if (timeoutMs > 0) {
    signal = AbortSignal.timeout(timeoutMs);
  } else if (outerSignal) {
    signal = outerSignal;
  }

  const init = {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
  if (signal) init.signal = signal;

  try {
    return await fetch(endpoint, init);
  } catch (e) {
    const name = e && e.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      // 區分「全局 deadline 到期」和「單次逾時」
      if (outerSignal && outerSignal.aborted) {
        const err = new Error('GLOBAL_TIMEOUT');
        err.isGlobalTimeout = true;
        throw err;
      }
      throw new Error(`請求逾時（>${Math.round(timeoutMs / 1000)}s），請檢查中轉服務或網路`);
    }
    throw e;
  }
}

/** 單圖：多種 OpenAI Chat Completions 相容的 multimodal 排列 */
function buildSingleChartVisionBodies(model, imageUrl, prompt) {
  const img = (detail) => ({
    type: 'image_url',
    image_url: detail !== undefined && detail !== null
      ? { url: imageUrl, detail }
      : { url: imageUrl }
  });
  const txt = { type: 'text', text: prompt };
  const partSequences = [
    [img(), txt],
    [img('auto'), txt],
    [img('low'), txt],
    [txt, img()],
    [txt, img('auto')],
    [txt, img('low')]
  ];
  const bodies = partSequences.map((parts) => customBaseChatBody(model, [{ role: 'user', content: parts }]));
  bodies.push(customBaseChatBody(model, [
    { role: 'user', content: [{ type: 'image_url', image_url: { url: imageUrl } }] },
    { role: 'user', content: prompt }
  ]));
  return bodies;
}

async function shrinkMultiDataUrls(dataUrls, maxWidth, quality) {
  const out = [];
  for (const u of dataUrls) {
    try {
      out.push(await resizeDataUrl(u, maxWidth, quality));
    } catch (_) {
      out.push(u);
    }
  }
  return out;
}

/** 多圖：交錯圖+標籤 / 先圖後文 / 拆成兩則 user */
function buildMultiChartVisionBodies(model, urls, prompt) {
  const interleaved = [];
  urls.forEach((dataUrl, i) => {
    interleaved.push({ type: 'image_url', image_url: { url: dataUrl } });
    interleaved.push({
      type: 'text',
      text: `↑ 以上是 ${MULTI_TF_LABELS[i] || String(i + 1)} 圖表截圖`
    });
  });
  interleaved.push({ type: 'text', text: prompt });

  const imagesLowThenText = [];
  urls.forEach((u) => {
    imagesLowThenText.push({ type: 'image_url', image_url: { url: u, detail: 'low' } });
  });
  const tfLabel = urls.map((_, i) => MULTI_TF_LABELS[i] || String(i + 1)).join('、');
  imagesLowThenText.push({
    type: 'text',
    text: `以上 ${urls.length} 張截圖依序為：${tfLabel}。\n\n${prompt}`
  });

  const splitMessages = [
    {
      role: 'user',
      content: urls.map((u) => ({ type: 'image_url', image_url: { url: u } }))
    },
    {
      role: 'user',
      content: urls
        .map((_, i) => `第 ${i + 1} 張：${MULTI_TF_LABELS[i] || String(i + 1)} 時間框架`)
        .join('\n') + '\n\n' + prompt
    }
  ];

  return [
    customBaseChatBody(model, [{ role: 'user', content: interleaved }]),
    customBaseChatBody(model, [{ role: 'user', content: imagesLowThenText }]),
    customBaseChatBody(model, splitMessages)
  ];
}

function throwCustomFailed(status, errorMessage, visionExhausted) {
  let msg = errorMessage;
  if (visionExhausted) {
    msg += ' — 已自動嘗試多種圖片請求格式（圖文順序、image_detail、拆成多則 user、較小影像）仍失敗。請確認中轉服務支援 OpenAI Chat Completions 的 image_url multimodal，或改用官方 API；亦可暫時關閉「支援圖片分析」。';
  } else if (status === 554) {
    msg += ' — 模型不支援圖片輸入。請改用 deepseek-vl2 等 vision 模型，或在設定頁取消勾選「支援圖片分析」改用純文字模式。';
  }
  const err = (() => {
    if (status === 401) return new Error('API Key 無效（401）');
    if (status === 429) return new Error('API 額度已用盡，請稍後再試');
    return new Error(msg);
  })();
  err.httpStatus = status;
  throw err;
}

function customVisionHintMapKey(endpoint, model, scope) {
  return `${endpoint}\u0000${model}\u0000${scope}`;
}

/** @param {number|null|undefined} preferredIdx */
function orderAttempts(preferredIdx, len) {
  const idxs = [...Array(len).keys()];
  if (preferredIdx == null || preferredIdx < 0 || preferredIdx >= len) return idxs;
  return [preferredIdx, ...idxs.filter((i) => i !== preferredIdx)];
}

async function loadCustomVisionHint(endpoint, model, scope) {
  try {
    const r = await chrome.storage.local.get(CUSTOM_VISION_HINTS_KEY);
    const map = r[CUSTOM_VISION_HINTS_KEY];
    if (!map || typeof map !== 'object') return null;
    const h = map[customVisionHintMapKey(endpoint, model, scope)];
    return h && typeof h === 'object' ? h : null;
  } catch (_) {
    return null;
  }
}

async function saveCustomVisionHint(endpoint, model, scope, hint) {
  try {
    const r = await chrome.storage.local.get(CUSTOM_VISION_HINTS_KEY);
    const map = r[CUSTOM_VISION_HINTS_KEY] && typeof r[CUSTOM_VISION_HINTS_KEY] === 'object'
      ? r[CUSTOM_VISION_HINTS_KEY]
      : {};
    map[customVisionHintMapKey(endpoint, model, scope)] = hint;
    await chrome.storage.local.set({ [CUSTOM_VISION_HINTS_KEY]: map });
  } catch (_) {}
}

async function buildInitialSingleChartRounds(dataUrl, hint) {
  const base = { url: dataUrl, iImg: 0 };
  if (!hint || hint.iImg == null || hint.iImg === 0) return [base];
  try {
    const prefUrl =
      hint.iImg === 1
        ? await resizeDataUrl(dataUrl, 768, 0.62)
        : await resizeDataUrl(dataUrl, 512, 0.55);
    if (prefUrl && prefUrl !== dataUrl) return [{ url: prefUrl, iImg: hint.iImg }, base];
  } catch (_) {}
  return [base];
}

async function buildInitialMultiRounds(dataUrls, hint) {
  const base = { urls: dataUrls, iRound: 0 };
  if (!hint || hint.iRound == null || hint.iRound === 0) return [base];
  try {
    const shrunk = await shrinkMultiDataUrls(dataUrls, 768, 0.62);
    const changed = shrunk.some((u, i) => u !== dataUrls[i]);
    if (hint.iRound === 1 && changed) return [{ urls: shrunk, iRound: 1 }, base];
  } catch (_) {}
  return [base];
}

function multiRoundsUrlsEqual(a, b) {
  return a.length === b.length && a.every((u, i) => u === b[i]);
}

async function _callCustomVisionInner(endpoint, model, apiKey, dataUrl, prompt, hint, globalSignal) {
  const rounds = await buildInitialSingleChartRounds(dataUrl, hint);
  let lastStatus = 0;
  let lastMessage = '';
  let attemptCount = 0;

  for (let r = 0; r < rounds.length; r++) {
    const { url: imgUrl, iImg } = rounds[r];
    const bodies = buildSingleChartVisionBodies(model, imgUrl, prompt);
    const order = orderAttempts(hint && hint.iImg === iImg ? hint.iBody : null, bodies.length);

    for (const bi of order) {
      attemptCount++;
      const body = bodies[bi];
      let response;
      try {
        response = await customPostChat(endpoint, apiKey, body, {
          timeoutMs: CUSTOM_VISION_FETCH_MS,
          signal: globalSignal
        });
      } catch (e) {
        if (e && e.isGlobalTimeout) throw e;
        throw new Error(`無法連線至 ${endpoint}：${e.message}`);
      }
      const rawText = await response.text();
      let parsed = null;
      try { parsed = JSON.parse(rawText); } catch (_) {}

      if (response.ok) {
        await saveCustomVisionHint(endpoint, model, 'single', { iImg, iBody: bi });
        const json = parsed;
        const text = json.choices && json.choices[0] && json.choices[0].message
          ? json.choices[0].message.content : null;
        if (!text) throw new Error('回應格式異常: ' + JSON.stringify(json).slice(0, 200));
        try { return parseJSON(text); }
        catch (e) { throw new Error('原始回應: ' + text.slice(0, 300)); }
      }

      lastStatus = response.status;
      lastMessage = customExtractErrorMessage(response.status, rawText, parsed);
      if (!customVisionRetryEligible(response.status, lastMessage)) {
        throwCustomFailed(response.status, lastMessage, false);
      }
    }

    if (r === rounds.length - 1 && rounds.length < CUSTOM_MAX_ROUNDS) {
      const nextW = rounds.length === 1 ? 768 : 512;
      const nextQ = rounds.length === 1 ? 0.62 : 0.55;
      try {
        const nu = await resizeDataUrl(dataUrl, nextW, nextQ);
        if (nu && !rounds.some((x) => x.url === nu)) {
          rounds.push({ url: nu, iImg: rounds.length });
        }
      } catch (_) {}
    }
  }

  throwCustomFailed(lastStatus, lastMessage || `API ${lastStatus}`, attemptCount > 0);
}

async function callCustom(dataUrl, prompt, settings) {
  if (!settings.customApiKey) throw new Error('請先在設定頁填入 API Key');
  if (!settings.customBaseUrl) throw new Error('請先在設定頁填入 Base URL');
  if (!settings.customModel) throw new Error('請先在設定頁填入 Model 名稱');

  const endpoint = resolveCustomEndpoint(settings.customBaseUrl);
  const model = settings.customModel;
  const apiKey = settings.customApiKey;
  const useVision = settings.customVision !== false;

  async function runPlainText() {
    const content = '[圖表截圖分析模式 - 純文字，無法嵌入圖片]\n' + prompt;
    let response;
    try {
      response = await customPostChat(endpoint, apiKey, customBaseChatBody(model, [{ role: 'user', content }]));
    } catch (e) {
      throw new Error(`無法連線至 ${endpoint}：${e.message}`);
    }
    const rawText = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(rawText); } catch (_) {}
    if (!response.ok) {
      throwCustomFailed(response.status, customExtractErrorMessage(response.status, rawText, parsed), false);
    }
    const json = parsed;
    const text = json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content : null;
    if (!text) throw new Error('回應格式異常: ' + JSON.stringify(json).slice(0, 200));
    try { return parseJSON(text); }
    catch (e) { throw new Error('原始回應: ' + text.slice(0, 300)); }
  }

  if (!useVision) return runPlainText();

  // Vision 路徑：用全局 deadline 包住所有 retry，避免最壞 21 分鐘等待
  const hint = await loadCustomVisionHint(endpoint, model, 'single');
  const globalController = new AbortController();
  const globalTimeoutId = setTimeout(() => globalController.abort(), CUSTOM_GLOBAL_TIMEOUT_MS);

  try {
    return await _callCustomVisionInner(endpoint, model, apiKey, dataUrl, prompt, hint, globalController.signal);
  } catch (e) {
    if (e && e.isGlobalTimeout) {
      throw new Error(
        `Custom API 已嘗試多種格式，但未能在 ${CUSTOM_GLOBAL_TIMEOUT_MS / 1000} 秒內完成。` +
        '請確認中轉服務回應速度，或改用官方 API。'
      );
    }
    throw e;
  } finally {
    clearTimeout(globalTimeoutId);
  }
}

// ---------------------------------------------------------------------------
// Provider 路由 helper（F-108 雙驗證使用）
// ---------------------------------------------------------------------------

function callProvider(provider, dataUrl, prompt, settings) {
  if (provider === 'minimax') return callMiniMax(dataUrl, prompt, settings);
  if (provider === 'custom') return callCustom(dataUrl, prompt, settings);
  return callAnthropic(dataUrl, prompt, settings);
}

// ---------------------------------------------------------------------------
// 各 Provider 多圖分析呼叫（F-103 多時間框架融合）
// ---------------------------------------------------------------------------

async function callAnthropicMulti(dataUrls, prompt, settings) {
  if (!settings.anthropicApiKey) {
    throw new Error('請先設定 Anthropic API Key');
  }

  const contentParts = [];
  dataUrls.forEach((dataUrl, i) => {
    const mediaType = dataUrl.split(';')[0].split(':')[1] || 'image/jpeg';
    const base64 = dataUrl.split(',')[1];
    contentParts.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64 }
    });
    contentParts.push({
      type: 'text',
      text: `↑ 以上是 ${MULTI_TF_LABELS[i] || String(i + 1)} 圖表截圖`
    });
  });
  contentParts.push({ type: 'text', text: prompt });

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': settings.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.anthropicModel || 'claude-sonnet-4-5',
        max_tokens: 3072,
        messages: [{ role: 'user', content: contentParts }]
      })
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`Anthropic 請求逾時（>${DEFAULT_FETCH_TIMEOUT_MS / 1000}s），請重試`);
    }
    throw new Error('無法連線，請檢查網路後重試');
  }

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorJson = await response.json();
      if (errorJson.error && errorJson.error.message) errorMessage = errorJson.error.message;
    } catch (_) {}
    const err = (() => {
      if (response.status === 401) return new Error('Anthropic API 401: invalid x-api-key');
      if (response.status === 429) return new Error('API 額度已用盡，請稍後再試');
      return new Error(`Anthropic API ${response.status}: ${errorMessage}`);
    })();
    err.httpStatus = response.status;
    throw err;
  }

  const json = await response.json();
  return parseJSON(json.content[0].text);
}

async function callMiniMaxMulti(dataUrls, prompt, settings) {
  if (!settings.minimaxApiKey) {
    throw new Error('請先設定 MiniMax API Key');
  }

  const contentParts = [];
  dataUrls.forEach((dataUrl, i) => {
    contentParts.push({ type: 'image_url', image_url: { url: dataUrl } });
    contentParts.push({
      type: 'text',
      text: `↑ 以上是 ${MULTI_TF_LABELS[i] || String(i + 1)} 圖表截圖`
    });
  });
  contentParts.push({ type: 'text', text: prompt });

  const baseUrl = settings.minimaxRegion === 'china'
    ? 'https://api.minimaxi.com'
    : 'https://api.minimax.io';

  let response;
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.minimaxApiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.minimaxModel || 'MiniMax-M2.5',
        max_tokens: 3072,
        temperature: 0.3,
        messages: [{ role: 'user', content: contentParts }]
      })
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`MiniMax 請求逾時（>${DEFAULT_FETCH_TIMEOUT_MS / 1000}s），請重試`);
    }
    throw new Error('無法連線，請檢查網路後重試');
  }

  if (!response.ok) {
    let errorMessage = `MiniMax API ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.error && errorJson.error.message) errorMessage = errorJson.error.message;
    } catch (_) {}
    const err = (() => {
      if (response.status === 401) return new Error('MiniMax API: invalid api key - 請確認區域設定是否正確');
      if (response.status === 429) return new Error('API 額度已用盡，請稍後再試');
      return new Error(errorMessage);
    })();
    err.httpStatus = response.status;
    throw err;
  }

  const json = await response.json();
  const text = json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content
    : null;
  if (!text) throw new Error('MiniMax 回應格式異常: ' + JSON.stringify(json).slice(0, 200));
  try {
    return parseJSON(text);
  } catch (e) {
    throw new Error('MiniMax 原始回應: ' + text.slice(0, 300));
  }
}

async function _callCustomMultiVisionInner(endpoint, model, apiKey, dataUrls, prompt, hint, globalSignal) {
  const rounds = await buildInitialMultiRounds(dataUrls, hint);
  let lastStatus = 0;
  let lastMessage = '';
  let attemptCount = 0;

  for (let r = 0; r < rounds.length; r++) {
    const { urls, iRound } = rounds[r];
    const bodies = buildMultiChartVisionBodies(model, urls, prompt);
    const order = orderAttempts(hint && hint.iRound === iRound ? hint.iBody : null, bodies.length);

    for (const bi of order) {
      attemptCount++;
      const body = bodies[bi];
      let response;
      try {
        response = await customPostChat(endpoint, apiKey, body, {
          timeoutMs: CUSTOM_VISION_FETCH_MS,
          signal: globalSignal
        });
      } catch (e) {
        if (e && e.isGlobalTimeout) throw e;
        throw new Error(`無法連線至 ${endpoint}：${e.message}`);
      }
      const rawText = await response.text();
      let parsed = null;
      try { parsed = JSON.parse(rawText); } catch (_) {}

      if (response.ok) {
        await saveCustomVisionHint(endpoint, model, 'multi', { iRound, iBody: bi });
        const json = parsed;
        const text = json.choices && json.choices[0] && json.choices[0].message
          ? json.choices[0].message.content : null;
        if (!text) throw new Error('回應格式異常: ' + JSON.stringify(json).slice(0, 200));
        try { return parseJSON(text); }
        catch (e) { throw new Error('原始回應: ' + text.slice(0, 300)); }
      }

      lastStatus = response.status;
      lastMessage = customExtractErrorMessage(response.status, rawText, parsed);
      if (!customVisionRetryEligible(response.status, lastMessage)) {
        throwCustomFailed(response.status, lastMessage, false);
      }
    }

    if (r === rounds.length - 1 && rounds.length < CUSTOM_MAX_ROUNDS) {
      try {
        const shrunk = await shrinkMultiDataUrls(dataUrls, 768, 0.62);
        const changed = shrunk.some((u, i) => u !== dataUrls[i]);
        if (changed && !rounds.some((x) => multiRoundsUrlsEqual(x.urls, shrunk))) {
          rounds.push({ urls: shrunk, iRound: rounds.length });
        }
      } catch (_) {}
    }
  }

  throwCustomFailed(lastStatus, lastMessage || `API ${lastStatus}`, attemptCount > 0);
}

async function callCustomMulti(dataUrls, prompt, settings) {
  if (!settings.customApiKey) throw new Error('請先在設定頁填入 API Key');
  if (!settings.customBaseUrl) throw new Error('請先在設定頁填入 Base URL');
  if (!settings.customModel) throw new Error('請先在設定頁填入 Model 名稱');

  const endpoint = resolveCustomEndpoint(settings.customBaseUrl);
  const model = settings.customModel;
  const apiKey = settings.customApiKey;
  const useVision = settings.customVision !== false;

  if (!useVision) {
    const content = '[多時框圖表分析模式 - 純文字，無法嵌入圖片]\n' + prompt;
    let response;
    try {
      response = await customPostChat(endpoint, apiKey, customBaseChatBody(model, [
        { role: 'user', content }
      ], 1536));
    } catch (e) {
      throw new Error(`無法連線至 ${endpoint}：${e.message}`);
    }
    const rawText = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(rawText); } catch (_) {}
    if (!response.ok) {
      throwCustomFailed(response.status, customExtractErrorMessage(response.status, rawText, parsed), false);
    }
    const json = parsed;
    const text = json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content : null;
    if (!text) throw new Error('回應格式異常: ' + JSON.stringify(json).slice(0, 200));
    try { return parseJSON(text); }
    catch (e) { throw new Error('原始回應: ' + text.slice(0, 300)); }
  }

  // Vision 路徑：用全局 deadline 包住所有 retry
  const hint = await loadCustomVisionHint(endpoint, model, 'multi');
  const globalController = new AbortController();
  const globalTimeoutId = setTimeout(() => globalController.abort(), CUSTOM_GLOBAL_TIMEOUT_MS);

  try {
    return await _callCustomMultiVisionInner(endpoint, model, apiKey, dataUrls, prompt, hint, globalController.signal);
  } catch (e) {
    if (e && e.isGlobalTimeout) {
      throw new Error(
        `Custom API 多時框分析未能在 ${CUSTOM_GLOBAL_TIMEOUT_MS / 1000} 秒內完成。` +
        '請確認中轉服務回應速度，或改用官方 API。'
      );
    }
    throw e;
  } finally {
    clearTimeout(globalTimeoutId);
  }
}

// ---------------------------------------------------------------------------
// Provider 純文字路由 helper（ANALYZE_TEXT 批量掃描使用）
// ---------------------------------------------------------------------------

async function callProviderText(provider, text, settings) {
  if (provider === 'minimax') return callMiniMaxText(text, settings);
  if (provider === 'custom') return callCustomText(text, settings);
  return callAnthropicText(text, settings);
}

// ---------------------------------------------------------------------------
// callProviderTextAnalysis — 回傳解析後物件，供簡報/Pine/Alert 使用
// 與 callProviderText（健康檢查用）不同，這裡呼叫 *TextAnalysis 系列
// ---------------------------------------------------------------------------

async function callProviderTextAnalysis(provider, prompt, settings) {
  if (provider === 'minimax') return callMiniMaxTextAnalysis(prompt, settings);
  if (provider === 'custom') return callCustomTextAnalysis(prompt, settings);
  return callAnthropicTextAnalysis(prompt, settings);
}

// ---------------------------------------------------------------------------
// Daily briefing alarm setup
// ---------------------------------------------------------------------------

async function setupBriefingAlarm(settings) {
  await chrome.alarms.clear('DAILY_BRIEFING');
  if (!settings?.telegram?.briefingEnabled) return;
  const [h, m] = (settings.telegram.briefingTime || '08:00').split(':').map(Number);
  const now = new Date();
  const nextFire = new Date();
  nextFire.setHours(h, m, 0, 0);
  if (nextFire <= now) nextFire.setDate(nextFire.getDate() + 1);
  await chrome.alarms.create('DAILY_BRIEFING', {
    when: nextFire.getTime(),
    periodInMinutes: 1440
  });
}

// ---------------------------------------------------------------------------
// callProviderRawText — 取 AI 原始文字回應（不做 parseJSON），供 Pine Script 生成使用
// ---------------------------------------------------------------------------

async function callAnthropicRawText(prompt, settings) {
  if (!settings.anthropicApiKey) throw new Error('請先設定 Anthropic API Key');
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': settings.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.anthropicModel || 'claude-sonnet-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`Anthropic 請求逾時（>${DEFAULT_FETCH_TIMEOUT_MS / 1000}s），請重試`);
    }
    throw new Error('無法連線，請檢查網路後重試');
  }
  if (!response.ok) {
    const err = new Error(`Anthropic API ${response.status}`);
    err.httpStatus = response.status;
    throw err;
  }
  const json = await response.json();
  return json.content[0].text || '';
}

async function callMiniMaxRawText(prompt, settings) {
  if (!settings.minimaxApiKey) throw new Error('請先設定 MiniMax API Key');
  const baseUrl = settings.minimaxRegion === 'china'
    ? 'https://api.minimaxi.com'
    : 'https://api.minimax.io';
  let response;
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.minimaxApiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.minimaxModel || 'MiniMax-M2.5',
        max_tokens: 4096,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`MiniMax 請求逾時（>${DEFAULT_FETCH_TIMEOUT_MS / 1000}s），請重試`);
    }
    throw new Error('無法連線，請檢查網路後重試');
  }
  if (!response.ok) {
    const err = new Error(`MiniMax API ${response.status}`);
    err.httpStatus = response.status;
    throw err;
  }
  const json = await response.json();
  const text = json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content : null;
  if (!text) throw new Error('MiniMax 回應格式異常');
  return text;
}

async function callCustomRawText(prompt, settings) {
  if (!settings.customApiKey) throw new Error('請先在設定頁填入 API Key');
  if (!settings.customModel) throw new Error('請先在設定頁填入 Model 名稱');
  const endpoint = resolveCustomEndpoint(settings.customBaseUrl);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.customApiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.customModel,
        max_tokens: 4096,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`請求逾時（>${DEFAULT_FETCH_TIMEOUT_MS / 1000}s），請重試`);
    }
    throw new Error(`無法連線至 ${endpoint}：${e.message}`);
  }
  if (!response.ok) {
    let msg = `API ${response.status}`;
    try {
      const errJson = await response.json();
      msg = (errJson.error && errJson.error.message) || errJson.message || msg;
    } catch (_) {}
    const err = new Error(msg);
    err.httpStatus = response.status;
    throw err;
  }
  const json = await response.json();
  const text = json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content : null;
  if (!text) throw new Error('回應格式異常');
  return text;
}

async function callProviderRawText(provider, prompt, settings) {
  if (provider === 'minimax') return callMiniMaxRawText(prompt, settings);
  if (provider === 'custom') return callCustomRawText(prompt, settings);
  return callAnthropicRawText(prompt, settings);
}

/**
 * ANALYZE_TEXT: Text-only AI analysis (no image) used by batch-scan.
 * payload: { symbol, prompt, settings }
 * returns: { ok: true, result } | { ok: false, error }
 */
async function handleAnalyzeText(payload) {
  const { prompt, settings } = payload;
  try {
    let result;
    if (settings.provider === 'custom') {
      result = await callCustomTextAnalysis(prompt, settings);
    } else if (settings.provider === 'minimax') {
      result = await callMiniMaxTextAnalysis(prompt, settings);
    } else {
      result = await callAnthropicTextAnalysis(prompt, settings);
    }
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function callAnthropicTextAnalysis(prompt, settings) {
  if (!settings.anthropicApiKey) throw new Error('請先設定 Anthropic API Key');
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': settings.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.anthropicModel || 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`Anthropic 請求逾時（>${DEFAULT_FETCH_TIMEOUT_MS / 1000}s），請重試`);
    }
    throw new Error('無法連線，請檢查網路後重試');
  }
  if (!response.ok) {
    const err = new Error(`Anthropic API ${response.status}`);
    err.httpStatus = response.status;
    throw err;
  }
  const json = await response.json();
  return parseJSON(json.content[0].text);
}

async function callMiniMaxTextAnalysis(prompt, settings) {
  if (!settings.minimaxApiKey) throw new Error('請先設定 MiniMax API Key');
  const baseUrl = settings.minimaxRegion === 'china'
    ? 'https://api.minimaxi.com'
    : 'https://api.minimax.io';
  let response;
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.minimaxApiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.minimaxModel || 'MiniMax-M2.5',
        max_tokens: 1024,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`MiniMax 請求逾時（>${DEFAULT_FETCH_TIMEOUT_MS / 1000}s），請重試`);
    }
    throw new Error('無法連線，請檢查網路後重試');
  }
  if (!response.ok) {
    const err = new Error(`MiniMax API ${response.status}`);
    err.httpStatus = response.status;
    throw err;
  }
  const json = await response.json();
  const text = json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content : null;
  if (!text) throw new Error('MiniMax 回應格式異常');
  return parseJSON(text);
}

async function callCustomTextAnalysis(prompt, settings) {
  if (!settings.customApiKey) throw new Error('請先在設定頁填入 API Key');
  if (!settings.customModel) throw new Error('請先在設定頁填入 Model 名稱');
  const endpoint = resolveCustomEndpoint(settings.customBaseUrl);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.customApiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: settings.customModel,
        max_tokens: 1024,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`請求逾時（>${DEFAULT_FETCH_TIMEOUT_MS / 1000}s），請重試`);
    }
    throw new Error(`無法連線至 ${endpoint}：${e.message}`);
  }
  if (!response.ok) {
    let msg = `API ${response.status}`;
    try {
      const errJson = await response.json();
      msg = (errJson.error && errJson.error.message) || errJson.message || msg;
    } catch (_) {}
    const err = new Error(msg);
    err.httpStatus = response.status;
    throw err;
  }
  const json = await response.json();
  const text = json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content : null;
  if (!text) throw new Error('回應格式異常');
  return parseJSON(text);
}

// ---------------------------------------------------------------------------
// 各 Provider 純文字健康檢查呼叫（F-110）
// ---------------------------------------------------------------------------

async function callAnthropicText(text, settings) {
  if (!settings.anthropicApiKey) {
    throw new Error('請先設定 Anthropic API Key');
  }

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': settings.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.anthropicModel || 'claude-sonnet-4-5',
        max_tokens: 16,
        messages: [
          {
            role: 'user',
            content: text
          }
        ]
      })
    });
  } catch (e) {
    throw new Error('無法連線，請檢查網路後重試');
  }

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorJson = await response.json();
      if (errorJson.error && errorJson.error.message) {
        errorMessage = errorJson.error.message;
      }
    } catch (_) {}

    if (response.status === 401) throw new Error('Anthropic API Key 無效（401）');
    if (response.status === 429) throw new Error('Anthropic API 額度已用盡（429）');
    throw new Error(`Anthropic API ${response.status}: ${errorMessage}`);
  }
}

async function callMiniMaxText(text, settings) {
  if (!settings.minimaxApiKey) {
    throw new Error('請先設定 MiniMax API Key');
  }

  const baseUrl = settings.minimaxRegion === 'china'
    ? 'https://api.minimaxi.com'
    : 'https://api.minimax.io';

  let response;
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.minimaxApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.minimaxModel || 'MiniMax-M2.5',
        max_tokens: 16,
        messages: [
          {
            role: 'user',
            content: text
          }
        ]
      })
    });
  } catch (e) {
    throw new Error('無法連線，請檢查網路後重試');
  }

  if (!response.ok) {
    let errorMessage = `MiniMax API ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.error && errorJson.error.message) {
        errorMessage = errorJson.error.message;
      }
    } catch (_) {}

    if (response.status === 401) throw new Error('MiniMax API Key 無效（401），請確認區域設定是否正確');
    if (response.status === 429) throw new Error('MiniMax API 額度已用盡（429）');
    throw new Error(errorMessage);
  }
}

async function callCustomText(text, settings) {
  if (!settings.customApiKey) throw new Error('請先在設定頁填入 API Key');
  if (!settings.customModel) throw new Error('請先在設定頁填入 Model 名稱');

  const endpoint = resolveCustomEndpoint(settings.customBaseUrl);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.customApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.customModel,
        max_tokens: 16,
        messages: [
          {
            role: 'user',
            content: text
          }
        ]
      })
    });
  } catch (e) {
    throw new Error(`無法連線至 ${endpoint}：${e.message}`);
  }

  if (!response.ok) {
    let errorMessage = `API ${response.status}`;
    try {
      const errorJson = await response.json();
      errorMessage = (errorJson.error && errorJson.error.message) || errorMessage;
    } catch (_) {}

    if (response.status === 401) throw new Error('API Key 無效（401）');
    if (response.status === 429) throw new Error('API 額度已用盡（429）');
    throw new Error(errorMessage);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle: onInstalled / onStartup — set up briefing alarm
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const { chart_ai_settings: s } = await chrome.storage.local.get(SETTINGS_KEY);
    await setupBriefingAlarm(s || {});
  } catch (e) {
    console.error('onInstalled setupBriefingAlarm error:', e);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    const { chart_ai_settings: s } = await chrome.storage.local.get(SETTINGS_KEY);
    await setupBriefingAlarm(s || {});
  } catch (e) {
    console.error('onStartup setupBriefingAlarm error:', e);
  }
});

// ---------------------------------------------------------------------------
// Alarms: daily briefing trigger
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'DAILY_BRIEFING') return;
  try {
    const { chart_ai_settings: settings } = await chrome.storage.local.get(SETTINGS_KEY);
    await generateDailyBriefing(settings, callProviderTextAnalysis);
  } catch (e) {
    console.error('Daily briefing error:', e);
  }
});

// ---------------------------------------------------------------------------
// Message Router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let handler;

  switch (message.type) {
    case 'CAPTURE_TAB':
      handler = handleCaptureTab();
      break;
    case 'GET_SETTINGS':
      handler = handleGetSettings();
      break;
    case 'SAVE_SETTINGS':
      handler = handleSaveSettings(message.payload);
      break;
    case 'ANALYZE_CHART':
      handler = handleAnalyzeChart(message.payload);
      break;
    case 'TEST_CONNECTION':
      handler = handleTestConnection(message.payload);
      break;
    case 'ANALYZE_MULTI_CHART':
      handler = handleAnalyzeMultiChart(message.payload);
      break;
    case 'DUAL_ANALYZE_CHART':
      handler = handleDualAnalyzeChart(message.payload);
      break;
    case 'ANALYZE_TEXT':
      handler = handleAnalyzeText(message.payload);
      break;
    case 'GET_PROFILE':
      handler = (async () => {
        const profile = await getProfile();
        return { ok: true, profile };
      })();
      break;
    case 'SAVE_PROFILE':
      handler = (async () => {
        await saveProfile(message.payload.profile);
        return { ok: true };
      })();
      break;
    case 'ALERT_DETECTED':
      handler = (async () => {
        const { chart_ai_settings: settings } = await chrome.storage.local.get(SETTINGS_KEY);
        if (!settings?.telegram?.enabled || !settings?.telegram?.alertsEnabled) {
          return { ok: false, error: 'telegram_not_configured' };
        }
        // 生成簡短 AI 摘要（30字以內）
        let aiSummary = '';
        try {
          const summaryPrompt = `用一句話（30字以內）描述此警報的交易意義：${message.payload.message}`;
          const summaryRaw = await callProviderRawText(settings.provider || 'anthropic', summaryPrompt, settings);
          aiSummary = summaryRaw.trim().slice(0, 100);
        } catch (_) {}
        const text = formatAlertMessage(message.payload, aiSummary);
        await sendTelegramMessage(settings.telegram.botToken, settings.telegram.chatId, text);
        return { ok: true };
      })();
      break;
    case 'GENERATE_PINE':
      handler = (async () => {
        const { chart_ai_settings: settings } = await chrome.storage.local.get(SETTINGS_KEY);
        const { description, context } = message.payload;
        const prompt = buildPinePrompt(description, context);
        // 使用 callProviderRawText 取得原始文字（Pine Script 非 JSON）
        const rawText = await callProviderRawText(settings.provider || 'anthropic', prompt, settings);
        const code = rawText
          .replace(/```(?:pine|pinescript|javascript)?\n?/gi, '')
          .replace(/```/g, '')
          .trim();
        return { ok: true, code, explanation: '' };
      })();
      break;
    case 'TRIGGER_BRIEFING':
      handler = (async () => {
        const { chart_ai_settings: settings } = await chrome.storage.local.get(SETTINGS_KEY);
        return await generateDailyBriefing(settings, callProviderTextAnalysis);
      })();
      break;
    case 'UPDATE_BRIEFING_ALARM':
      handler = (async () => {
        const { chart_ai_settings: settings } = await chrome.storage.local.get(SETTINGS_KEY);
        await setupBriefingAlarm(settings);
        return { ok: true };
      })();
      break;
    case 'TEST_TELEGRAM':
      handler = (async () => {
        const { botToken, chatId } = message.payload;
        await testTelegramConnection(botToken, chatId);
        return { ok: true };
      })();
      break;
    case 'TEST_API':
      handler = (async () => {
        const { endpoint, apiKey, model, messages, maxTokens } = message.payload;
        const t0 = Date.now();
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, max_tokens: maxTokens || 256, temperature: 0.3, messages })
        });
        const elapsed = Date.now() - t0;
        const rawText = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(rawText); } catch (_) {}
        return { ok: res.ok, status: res.status, statusText: res.statusText, elapsed, rawText, parsed };
      })();
      break;
    default:
      sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
      return false;
  }

  handler.then(sendResponse).catch((e) => {
    sendResponse({ ok: false, error: e.message });
  });

  return true;
});
