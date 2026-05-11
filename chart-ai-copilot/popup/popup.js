(function () {
  'use strict';

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
    riskPct: 1,
    accountBalance: 0,
    accountCurrency: 'USD',
    lang: 'zh-TW',
    language: 'zh-TW',
    promptTemplates: [],
    selectedTemplateId: null,
    batchScanDelayMs: 3000,
    batchScanMaxSymbols: 20
  };

  const TEMPLATES_KEY = 'promptTemplates';

  function sendMessagePromise(message) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(message, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // ── Toast ────────────────────────────────────────────────────────────────

  function showToast(message, type) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast--visible toast--${type}`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      toast.className = 'toast';
    }, 2500);
  }

  // ── Provider section switching ───────────────────────────────────────────

  function switchProvider(provider) {
    document.querySelectorAll('.provider-section').forEach(function (el) {
      el.classList.remove('active');
    });
    const active = document.getElementById(`${provider}-section`);
    if (active) active.classList.add('active');
  }

  // ── Form fill / collect ──────────────────────────────────────────────────

  function fillForm(settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings);

    document.querySelectorAll('input[name="provider"]').forEach(function (radio) {
      radio.checked = radio.value === s.provider;
    });

    document.getElementById('anthropicApiKey').value = s.anthropicApiKey || '';
    document.getElementById('anthropicModel').value = s.anthropicModel || DEFAULT_SETTINGS.anthropicModel;

    document.getElementById('minimaxApiKey').value = s.minimaxApiKey || '';
    document.querySelectorAll('input[name="minimaxRegion"]').forEach(function (radio) {
      radio.checked = radio.value === (s.minimaxRegion || 'global');
    });
    document.getElementById('minimaxModel').value = s.minimaxModel || DEFAULT_SETTINGS.minimaxModel;

    document.getElementById('customBaseUrl').value = s.customBaseUrl || '';
    document.getElementById('customApiKey').value = s.customApiKey || '';
    document.getElementById('customModel').value = s.customModel || '';
    document.getElementById('customVision').checked = s.customVision !== false;

    document.getElementById('accountBalance').value = s.accountBalance != null ? s.accountBalance : 0;
    document.getElementById('accountCurrency').value = s.accountCurrency || 'USD';
    document.getElementById('riskPct').value = s.riskPct != null ? s.riskPct : 1;
    document.getElementById('lang').value = s.lang || 'zh-TW';

    // Telegram 設定
    const tg = s.telegram || {};
    const botTokenEl = document.getElementById('telegramBotToken');
    const chatIdEl = document.getElementById('telegramChatId');
    const alertsEl = document.getElementById('telegramAlertsEnabled');
    const briefingEl = document.getElementById('telegramBriefingEnabled');
    const briefingTimeEl = document.getElementById('telegramBriefingTime');
    const briefingSymbolsEl = document.getElementById('telegramBriefingSymbols');
    const briefingOptionsEl = document.getElementById('briefingOptions');

    if (botTokenEl) botTokenEl.value = tg.botToken || '';
    if (chatIdEl) chatIdEl.value = tg.chatId || '';
    if (alertsEl) alertsEl.checked = !!tg.alertsEnabled;
    if (briefingEl) {
      briefingEl.checked = !!tg.briefingEnabled;
    }
    if (briefingTimeEl) briefingTimeEl.value = tg.briefingTime || '08:00';
    if (briefingSymbolsEl) briefingSymbolsEl.value = (tg.briefingSymbols || []).join('\n');
    if (briefingOptionsEl) briefingOptionsEl.style.display = tg.briefingEnabled ? '' : 'none';

    switchProvider(s.provider || 'anthropic');
  }

  function collectForm() {
    const provider = (document.querySelector('input[name="provider"]:checked') || {}).value || 'anthropic';
    const minimaxRegion = (document.querySelector('input[name="minimaxRegion"]:checked') || {}).value || 'global';

    const settings = {
      provider,
      anthropicApiKey: document.getElementById('anthropicApiKey').value.trim(),
      anthropicModel: document.getElementById('anthropicModel').value,
      minimaxApiKey: document.getElementById('minimaxApiKey').value.trim(),
      minimaxRegion,
      minimaxModel: document.getElementById('minimaxModel').value,
      customBaseUrl: document.getElementById('customBaseUrl').value.trim(),
      customApiKey: document.getElementById('customApiKey').value.trim(),
      customModel: document.getElementById('customModel').value.trim(),
      customVision: document.getElementById('customVision').checked,
      riskPct: parseFloat(document.getElementById('riskPct').value) || 1,
      accountBalance: parseFloat(document.getElementById('accountBalance').value) || 0,
      accountCurrency: document.getElementById('accountCurrency').value || 'USD',
      lang: document.getElementById('lang').value || 'zh-TW',
      language: document.getElementById('lang').value || 'zh-TW'
    };

    // Telegram 設定
    const botToken = (document.getElementById('telegramBotToken')?.value || '').trim();
    const chatId = (document.getElementById('telegramChatId')?.value || '').trim();
    const symbols = (document.getElementById('telegramBriefingSymbols')?.value || '')
      .split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 10);
    settings.telegram = {
      enabled: !!(botToken),
      botToken: botToken,
      chatId: chatId,
      alertsEnabled: document.getElementById('telegramAlertsEnabled')?.checked || false,
      briefingEnabled: document.getElementById('telegramBriefingEnabled')?.checked || false,
      briefingTime: document.getElementById('telegramBriefingTime')?.value || '08:00',
      briefingSymbols: symbols
    };

    return settings;
  }

  function validate(settings) {
    if (settings.provider === 'anthropic' && !settings.anthropicApiKey) {
      return 'Anthropic API Key 不得為空';
    }
    if (settings.provider === 'minimax' && !settings.minimaxApiKey) {
      return 'MiniMax API Key 不得為空';
    }
    if (settings.provider === 'custom') {
      if (!settings.customBaseUrl) return '請填入 Base URL';
      if (!settings.customApiKey) return '請填入 API Key';
      if (!settings.customModel) return '請填入 Model 名稱';
    }
    const risk = settings.riskPct;
    if (isNaN(risk) || risk < 0.5 || risk > 5) {
      return '風險比例須介於 0.5% 至 5% 之間';
    }
    return null;
  }

  // ── Load / save settings ─────────────────────────────────────────────────

  async function loadSettings() {
    try {
      const response = await sendMessagePromise({ type: 'GET_SETTINGS' });
      fillForm(response && response.settings ? response.settings : DEFAULT_SETTINGS);
    } catch (_) {
      fillForm(DEFAULT_SETTINGS);
    }
  }

  async function saveSettings() {
    const settings = collectForm();
    const errorMsg = validate(settings);
    if (errorMsg) {
      showToast(errorMsg, 'error');
      return;
    }

    // Preserve fields not managed by this form so a Save doesn't wipe them
    try {
      const stored = await sendMessagePromise({ type: 'GET_SETTINGS' });
      if (stored && stored.settings) {
        settings.promptTemplates = stored.settings.promptTemplates || [];
        settings.selectedTemplateId = stored.settings.selectedTemplateId || null;
        settings.batchScanDelayMs = stored.settings.batchScanDelayMs || 3000;
        settings.batchScanMaxSymbols = stored.settings.batchScanMaxSymbols || 20;
      }
    } catch (_) {}

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    try {
      await sendMessagePromise({ type: 'SAVE_SETTINGS', payload: settings });
      showToast('設定已儲存', 'success');
      // 通知 service-worker 重新設定每日簡報 alarm
      chrome.runtime.sendMessage({ type: 'UPDATE_BRIEFING_ALARM' }, function () {});
    } catch (_) {
      showToast('儲存失敗，請重試', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  // ── F-110: Test connection ───────────────────────────────────────────────

  function setTestResult(resultElId, state, message) {
    const el = document.getElementById(resultElId);
    if (!el) return;
    el.className = `test-result test-result--${state}`;
    if (state === 'testing') {
      el.textContent = '測試中...';
    } else if (state === 'ok') {
      el.textContent = '✅ 連線正常';
    } else {
      el.textContent = `❌ ${message || '連線失敗'}`;
    }
  }

  async function testConnection(provider) {
    const resultElId = `test${provider.charAt(0).toUpperCase() + provider.slice(1)}Result`;
    const btnId = `test${provider.charAt(0).toUpperCase() + provider.slice(1)}Btn`;
    const btn = document.getElementById(btnId);

    if (btn) btn.disabled = true;
    setTestResult(resultElId, 'testing');

    const settings = collectForm();

    try {
      const response = await sendMessagePromise({
        type: 'TEST_CONNECTION',
        payload: { provider, settings }
      });

      if (response && response.ok) {
        setTestResult(resultElId, 'ok');
      } else {
        setTestResult(resultElId, 'error', (response && response.error) || '連線失敗');
      }
    } catch (err) {
      setTestResult(resultElId, 'error', err.message || '連線失敗');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Prompt Templates ─────────────────────────────────────────────────────

  async function getTemplates() {
    try {
      const result = await chrome.storage.local.get(TEMPLATES_KEY);
      return Array.isArray(result[TEMPLATES_KEY]) ? result[TEMPLATES_KEY] : [];
    } catch (_) {
      return [];
    }
  }

  async function saveTemplatesStorage(templates) {
    await chrome.storage.local.set({ [TEMPLATES_KEY]: templates });
  }

  function generateTemplateId() {
    return 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function renderTemplateRow(t) {
    const li = document.createElement('div');
    li.className = 'template-list-item';
    li.setAttribute('data-id', t.id);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'template-list-name';
    nameSpan.textContent = t.name;
    nameSpan.title = t.name;
    li.appendChild(nameSpan);

    if (t.isDefault) {
      const badge = document.createElement('span');
      badge.className = 'template-default-badge';
      badge.textContent = '預設';
      li.appendChild(badge);
    }

    // Set default button
    const defaultBtn = document.createElement('button');
    defaultBtn.className = 'template-action-btn' + (t.isDefault ? ' template-action-btn--default-active' : '');
    defaultBtn.textContent = t.isDefault ? '取消預設' : '設預設';
    defaultBtn.title = t.isDefault ? '取消設為預設模板' : '設為預設模板';
    defaultBtn.addEventListener('click', function () {
      setDefaultTemplate(t.id, !t.isDefault);
    });
    li.appendChild(defaultBtn);

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'template-action-btn';
    editBtn.textContent = '編輯';
    editBtn.addEventListener('click', function () {
      openEditForm(t);
    });
    li.appendChild(editBtn);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'template-action-btn template-action-btn--danger';
    delBtn.textContent = '刪除';
    delBtn.addEventListener('click', function () {
      deleteTemplate(t.id);
    });
    li.appendChild(delBtn);

    return li;
  }

  async function loadTemplates() {
    const templates = await getTemplates();
    const listEl = document.getElementById('templatesList');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!templates.length) {
      const hint = document.createElement('p');
      hint.className = 'template-empty-hint';
      hint.textContent = '尚無自訂模板';
      listEl.appendChild(hint);
      return;
    }

    templates.forEach(function (t) {
      listEl.appendChild(renderTemplateRow(t));
    });
  }

  function openAddForm() {
    const formEl = document.getElementById('templateForm');
    const nameEl = document.getElementById('templateName');
    const bodyEl = document.getElementById('templateBody');
    const editingId = document.getElementById('editingTemplateId');
    const addBtn = document.getElementById('addTemplateBtn');
    const charCount = document.getElementById('templateCharCount');

    if (!formEl) return;

    editingId.value = '';
    nameEl.value = '';
    bodyEl.value = '';
    if (charCount) charCount.textContent = '0 / 2000';

    formEl.style.display = '';
    if (addBtn) addBtn.style.display = 'none';
    nameEl.focus();
  }

  function openEditForm(t) {
    const formEl = document.getElementById('templateForm');
    const nameEl = document.getElementById('templateName');
    const bodyEl = document.getElementById('templateBody');
    const editingId = document.getElementById('editingTemplateId');
    const addBtn = document.getElementById('addTemplateBtn');
    const charCount = document.getElementById('templateCharCount');

    if (!formEl) return;

    editingId.value = t.id;
    nameEl.value = t.name;
    bodyEl.value = t.body || '';
    if (charCount) charCount.textContent = `${(t.body || '').length} / 2000`;

    formEl.style.display = '';
    if (addBtn) addBtn.style.display = 'none';
    nameEl.focus();
  }

  function closeTemplateForm() {
    const formEl = document.getElementById('templateForm');
    const addBtn = document.getElementById('addTemplateBtn');
    if (formEl) formEl.style.display = 'none';
    if (addBtn) addBtn.style.display = '';
  }

  async function saveTemplate() {
    const nameEl = document.getElementById('templateName');
    const bodyEl = document.getElementById('templateBody');
    const editingId = document.getElementById('editingTemplateId');

    const name = (nameEl.value || '').trim();
    const body = (bodyEl.value || '').trim();
    const id = editingId.value || '';

    if (!name) {
      showToast('請填入模板名稱', 'error');
      nameEl.focus();
      return;
    }
    if (!body) {
      showToast('請填入模板內容', 'error');
      bodyEl.focus();
      return;
    }

    const templates = await getTemplates();

    if (id) {
      // Edit existing
      const idx = templates.findIndex(function (t) { return t.id === id; });
      if (idx !== -1) {
        templates[idx].name = name;
        templates[idx].body = body;
      }
    } else {
      // Add new
      templates.push({
        id: generateTemplateId(),
        name: name,
        body: body,
        isDefault: templates.length === 0, // first template auto-defaults
        createdAt: Date.now()
      });
    }

    await saveTemplatesStorage(templates);
    closeTemplateForm();
    await loadTemplates();
    showToast(id ? '模板已更新' : '模板已新增', 'success');
  }

  async function deleteTemplate(id) {
    let templates = await getTemplates();
    const target = templates.find(function (t) { return t.id === id; });
    templates = templates.filter(function (t) { return t.id !== id; });

    // If deleted template was default, auto-assign to first remaining
    if (target && target.isDefault && templates.length > 0) {
      templates[0].isDefault = true;
    }

    await saveTemplatesStorage(templates);
    await loadTemplates();
    showToast('模板已刪除', 'success');
  }

  async function setDefaultTemplate(id, makeDefault) {
    const templates = await getTemplates();

    templates.forEach(function (t) {
      if (makeDefault) {
        t.isDefault = t.id === id;
      } else if (t.id === id) {
        t.isDefault = false;
      }
    });

    await saveTemplatesStorage(templates);
    await loadTemplates();
  }

  // ── Templates section collapse toggle ────────────────────────────────────

  function initTemplatesSection() {
    const toggle = document.getElementById('templatesSectionToggle');
    const section = document.getElementById('templatesSection');
    if (!toggle || !section) return;

    toggle.addEventListener('click', function () {
      section.classList.toggle('settings-section--collapsed');
    });

    const addBtn = document.getElementById('addTemplateBtn');
    if (addBtn) {
      addBtn.addEventListener('click', openAddForm);
    }

    const saveTemplateBtn = document.getElementById('saveTemplateBtn');
    if (saveTemplateBtn) {
      saveTemplateBtn.addEventListener('click', saveTemplate);
    }

    const cancelTemplateBtn = document.getElementById('cancelTemplateBtn');
    if (cancelTemplateBtn) {
      cancelTemplateBtn.addEventListener('click', closeTemplateForm);
    }

    // Character counter for template body
    const bodyEl = document.getElementById('templateBody');
    const charCount = document.getElementById('templateCharCount');
    if (bodyEl && charCount) {
      bodyEl.addEventListener('input', function () {
        const len = bodyEl.value.length;
        charCount.textContent = `${len} / 2000`;
        if (len > 1800) {
          charCount.classList.add('template-char-count--warn');
        } else {
          charCount.classList.remove('template-char-count--warn');
        }
      });
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    loadSettings();
    loadTemplates();
    initTemplatesSection();

    document.querySelectorAll('input[name="provider"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (radio.checked) switchProvider(radio.value);
      });
    });

    document.getElementById('saveBtn').addEventListener('click', saveSettings);

    // Test connection buttons
    ['anthropic', 'minimax', 'custom'].forEach(function (provider) {
      const btnId = `test${provider.charAt(0).toUpperCase() + provider.slice(1)}Btn`;
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', function () { testConnection(provider); });
      }
    });

    // Telegram section collapse toggle
    const telegramToggle = document.getElementById('telegramSectionToggle');
    const telegramSection = document.getElementById('telegramSection');
    if (telegramToggle && telegramSection) {
      telegramToggle.addEventListener('click', function () {
        telegramSection.classList.toggle('settings-section--collapsed');
      });
    }

    // Briefing options visibility toggle — bound once here, not inside fillForm()
    var briefingChk = document.getElementById('telegramBriefingEnabled');
    var briefingOpts = document.getElementById('briefingOptions');
    if (briefingChk && briefingOpts) {
      briefingChk.addEventListener('change', function () {
        briefingOpts.style.display = this.checked ? '' : 'none';
      });
    }

    // Telegram test connection button
    var testTelegramBtn = document.getElementById('testTelegramBtn');
    if (testTelegramBtn) {
      testTelegramBtn.addEventListener('click', function () {
        var botToken = (document.getElementById('telegramBotToken').value || '').trim();
        var chatId = (document.getElementById('telegramChatId').value || '').trim();
        var statusEl = document.getElementById('telegramTestStatus');
        if (!botToken || !chatId) {
          if (statusEl) {
            statusEl.textContent = '❌ 請先填入 Bot Token 和 Chat ID';
            statusEl.className = 'test-result test-result--error';
          }
          return;
        }
        if (statusEl) {
          statusEl.textContent = '測試中...';
          statusEl.className = 'test-result test-result--testing';
        }
        chrome.runtime.sendMessage({ type: 'TEST_TELEGRAM', payload: { botToken: botToken, chatId: chatId } }, function (resp) {
          if (!statusEl) return;
          if (resp && resp.ok) {
            statusEl.textContent = '✅ 連線成功！請檢查 Telegram';
            statusEl.className = 'test-result test-result--ok';
          } else {
            statusEl.textContent = '❌ 連線失敗：' + ((resp && resp.error) || '未知錯誤');
            statusEl.className = 'test-result test-result--error';
          }
        });
      });
    }
  });
})();
