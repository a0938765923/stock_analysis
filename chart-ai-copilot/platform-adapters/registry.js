(function() {
  window.__chartAI = window.__chartAI || {};

  function detectAdapter() {
    var host = window.location.hostname.replace(/^www\./, '');
    var adapters = Object.values(window.__chartAI._adapters || {});
    var matched = adapters.filter(function(a) {
      if (typeof a.hostname === 'string') {
        return host === a.hostname || host.endsWith('.' + a.hostname);
      }
      return false;
    }).sort(function(x, y) {
      return (y.priority || 0) - (x.priority || 0);
    });
    return matched[0] || null;
  }

  var _cachedAdapter;
  function getAdapter() {
    if (_cachedAdapter === undefined) _cachedAdapter = detectAdapter();
    return _cachedAdapter;
  }

  function getPlatformName() {
    var a = getAdapter();
    return a ? a.name : null;
  }

  Object.assign(window.__chartAI, { getAdapter: getAdapter, getPlatformName: getPlatformName });
})();
