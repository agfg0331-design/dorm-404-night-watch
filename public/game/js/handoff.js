(() => {
  "use strict";

  const visitorKey = "dorm404.handoff.visitor.v1";
  const visitorId = window.GamePlatform.storage.getItem(visitorKey) || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
  window.GamePlatform.storage.setItem(visitorKey, visitorId);
  async function request(path, options = {}) {
    const response = await fetch(window.GamePlatform.apiUrl(path), options);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("application/json")) throw new Error("交班终端暂时离线。");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "交班终端暂时离线。");
    return data;
  }

  async function getRandom() {
    const data = await request("/api/handoff", {
      headers: { "X-Board-Visitor": visitorId },
      cache: "no-store"
    });
    return typeof data.message?.content === "string" ? data.message.content : null;
  }

  async function submit(content, endingKind) {
    return request("/api/handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Board-Visitor": visitorId },
      body: JSON.stringify({ content, endingKind, visitorId })
    });
  }

  window.HandoffService = { getRandom, submit };
})();
