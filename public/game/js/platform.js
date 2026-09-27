(() => {
  "use strict";
  const config = window.GAME_PLATFORM_CONFIG || {};
  const query = new URLSearchParams(location.search);
  // QA override is available only on local hosts and never changes a release package.
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const override = local && config.allowInternalQA && query.get("platform") === "taptap";
  const mode = config.mode === "taptap" || override ? "taptap" : "web";
  const cloudflare = "https://dorm-404-night-watch.pages.dev";
  // Preserve the existing EdgeOne mirror's cross-origin handoff access in one place.
  const apiBase = config.apiBase || (mode === "taptap" || location.hostname.endsWith(".edgeone.dev") ? cloudflare : "");
  const memory = new Map();
  const storage = {
    getItem(key) {
      try {
        const value = window.localStorage.getItem(key);
        if (value !== null) return value;
      } catch { /* A container can deny access to storage. */ }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      const text = String(value);
      memory.set(key, text);
      try { window.localStorage.setItem(key, text); } catch { /* Keep this shift playable in memory. */ }
    }
  };
  const platform = {
    mode, isWeb: mode === "web", isTapTap: mode === "taptap", apiBase,
    allowInternalQA: config.allowInternalQA === true, storage,
    supportsBrowserFullscreen: mode === "web",
    viewport: { width: 0, height: 0 }, safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    apiUrl(path) { return `${this.apiBase}${path}`; }
  };
  window.GamePlatform = platform;
  document.body.classList.add(`platform-${mode}`);

  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.append(probe);
  let pending = false;
  function measure() {
    pending = false;
    const view = window.visualViewport;
    platform.viewport = { width: view?.width || innerWidth, height: view?.height || innerHeight };
    const style = getComputedStyle(probe);
    platform.safeArea = Object.fromEntries(["top", "right", "bottom", "left"].map(side => [side, parseFloat(style.getPropertyValue(`padding-${side}`)) || 0]));
    if (platform.isTapTap) {
      const { width, height } = platform.viewport;
      const { left, right, top, bottom } = platform.safeArea;
      const availableWidth = Math.max(1, width - left - right);
      const availableHeight = Math.max(1, height - top - bottom);
      const wide = availableWidth - availableHeight * 4 / 3 >= 210;
      const stageHeight = wide ? availableHeight : Math.min(availableHeight - 54, availableWidth * 3 / 4);
      document.body.classList.toggle("taptap-wide", wide);
      document.body.style.setProperty("--tap-stage-height", `${Math.max(1, stageHeight)}px`);
      document.body.style.setProperty("--tap-viewport-height", `${height}px`);
    }
  }
  function scheduleMeasure() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(measure);
  }
  measure();
  window.addEventListener("resize", scheduleMeasure);
  window.visualViewport?.addEventListener("resize", scheduleMeasure);
  window.visualViewport?.addEventListener("scroll", scheduleMeasure);
  window.addEventListener("orientationchange", scheduleMeasure);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleMeasure(); });
  window.addEventListener("pageshow", scheduleMeasure);
})();
