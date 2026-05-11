// pine-injector.js — 執行於 MAIN world，可存取頁面 JS 物件
(function () {
  'use strict';

  const EDITOR_SELECTORS = [
    '.pine-editor-content .CodeMirror',
    '.pine-editor-content .cm-editor',
    '[class*="pineEditor"] .CodeMirror',
    '[class*="pineEditor"] .cm-editor',
    '[class*="pine-editor"] .CodeMirror',
    '[class*="pine-editor"] .cm-editor',
    '[class*="PineEditor"] .CodeMirror',
    '[class*="PineEditor"] .cm-editor',
  ];

  function getPineEditorElement() {
    for (const sel of EDITOR_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function injectPineCode(code) {
    const el = getPineEditorElement();
    if (!el) return { success: false, error: 'editor_not_found' };

    // CM5 路徑
    if (el.classList.contains('CodeMirror') && el.CodeMirror) {
      try {
        el.CodeMirror.setValue(code);
        el.CodeMirror.focus();
        return { success: true, method: 'cm5' };
      } catch (e) {
        // fall through to CM6
      }
    }

    // CM6 路徑
    if (el.classList.contains('cm-editor')) {
      const view = el.cmView?.view || el.__cmView?.view || el._codemirror;
      if (view && typeof view.dispatch === 'function') {
        try {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: code }
          });
          view.focus();
          return { success: true, method: 'cm6' };
        } catch (e) {
          // fall through to execCommand
        }
      }
      // CM6 fallback: execCommand（deprecated but works）
      try {
        el.focus();
        document.execCommand('selectAll');
        document.execCommand('insertText', false, code);
        return { success: true, method: 'cm6_execcommand' };
      } catch (_) {}
    }

    // 終極 fallback：寫剪貼簿
    try {
      navigator.clipboard.writeText(code);
      return { success: true, method: 'clipboard_fallback' };
    } catch (_) {}

    return { success: false, error: 'all_methods_failed' };
  }

  // 監聽來自 isolated world 的 postMessage
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== '__CHART_AI_INJECT_PINE__') return;
    const { code, requestId } = event.data;
    const result = injectPineCode(code);
    window.postMessage({ type: '__CHART_AI_INJECT_PINE_RESULT__', requestId, ...result }, '*');
  });
})();
