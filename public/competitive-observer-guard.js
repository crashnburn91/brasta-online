(() => {
  if (window.__BRASTA_COMPETITIVE_OBSERVER_GUARD__) return;
  window.__BRASTA_COMPETITIVE_OBSERVER_GUARD__ = true;

  const NativeObserver = window.MutationObserver;
  if (!NativeObserver?.prototype?.observe) return;

  const nativeObserve = NativeObserver.prototype.observe;
  let intercepted = false;

  NativeObserver.prototype.observe = function(target, options) {
    if (!intercepted && target === document.documentElement && options?.childList && options?.subtree) {
      const app = document.getElementById('app');
      if (app) {
        intercepted = true;
        const result = nativeObserve.call(this, app, { childList: true });
        NativeObserver.prototype.observe = nativeObserve;
        return result;
      }
    }
    return nativeObserve.call(this, target, options);
  };

  // Fail safe: never leave the prototype patched beyond startup.
  window.setTimeout(() => {
    NativeObserver.prototype.observe = nativeObserve;
  }, 3000);
})();
