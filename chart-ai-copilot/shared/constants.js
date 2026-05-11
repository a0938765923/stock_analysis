(function () {
  window.__chartAI = window.__chartAI || {};

  const MESSAGE_TYPES = {
    CAPTURE_TAB: 'CAPTURE_TAB',
    ANALYZE_CHART: 'ANALYZE_CHART',
    ANALYZE_TEXT: 'ANALYZE_TEXT',
    GET_SETTINGS: 'GET_SETTINGS',
    SAVE_SETTINGS: 'SAVE_SETTINGS',
    GET_PROFILE: 'GET_PROFILE',
    SAVE_PROFILE: 'SAVE_PROFILE',
    ALERT_DETECTED: 'ALERT_DETECTED',
    GENERATE_PINE: 'GENERATE_PINE',
    INJECT_PINE_CODE: 'INJECT_PINE_CODE',
    TRIGGER_BRIEFING: 'TRIGGER_BRIEFING',
    UPDATE_BRIEFING_ALARM: 'UPDATE_BRIEFING_ALARM',
    TEST_TELEGRAM: 'TEST_TELEGRAM',
  };

  const PROVIDERS = {
    ANTHROPIC: 'anthropic',
    MINIMAX: 'minimax',
    CUSTOM: 'custom'
  };

  const ANTHROPIC_MODELS = [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5'
  ];

  const MINIMAX_MODELS = [
    'MiniMax-Text-01',
    'MiniMax-M2.7',
    'MiniMax-M2.5',
    'MiniMax-M2.1',
    'MiniMax-M2'
  ];

  const MINIMAX_REGIONS = {
    GLOBAL: 'global',
    CHINA: 'china'
  };

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
    lang: 'zh-TW',
    language: 'zh-TW',
    promptTemplates: [],
    selectedTemplateId: null,
    batchScanDelayMs: 3000,
    batchScanMaxSymbols: 20,
    telegram: {
      enabled: false,
      botToken: '',
      chatId: '',
      alertsEnabled: false,
      briefingEnabled: false,
      briefingTime: '08:00',
      briefingSymbols: []
    },
  };

  const SETTINGS_KEY = 'chart_ai_settings';

  Object.assign(window.__chartAI, {
    MESSAGE_TYPES,
    PROVIDERS,
    ANTHROPIC_MODELS,
    MINIMAX_MODELS,
    MINIMAX_REGIONS,
    DEFAULT_SETTINGS,
    SETTINGS_KEY
  });
})();
