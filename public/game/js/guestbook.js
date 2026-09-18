(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const ui = {
    overlay: $("guestbookOverlay"), open: $("openGuestbook"), close: $("closeGuestbook"), home: $("guestbookHome"),
    list: $("guestbookList"), form: $("guestbookForm"), nickname: $("guestbookNickname"), content: $("guestbookContent"),
    counter: $("guestbookCounter"), note: $("guestbookNote"), sorts: [...document.querySelectorAll(".guestbook-sort button")]
  };
  if (!ui.overlay || !ui.open) return;

  const visitorKey = "dorm404.guestbook.visitor.v1";
  const nameKey = "dorm404.guestbook.nickname.v1";
  const votesKey = "dorm404.guestbook.votes.v1";
  const visitorId = localStorage.getItem(visitorKey) || (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`);
  localStorage.setItem(visitorKey, visitorId);
  const fallbackName = `夜班访客${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
  ui.nickname.value = localStorage.getItem(nameKey) || fallbackName;
  let sort = "latest";
  let loading = false;
  let messages = [];
  let localVotes = readVotes();
  const apiBase = location.hostname.endsWith(".edgeone.dev")
    ? "https://dorm-404-night-watch.agfg0331.chatgpt.site"
    : "";
  const apiUrl = (path) => `${apiBase}${path}`;

  function readVotes() {
    try { return JSON.parse(localStorage.getItem(votesKey) || "{}"); } catch { return {}; }
  }
  function setNote(text, error = false) {
    ui.note.textContent = text;
    ui.note.classList.toggle("error", error);
  }
  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "刚刚";
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
  }
  function makeButton(label, vote, message) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.vote = String(vote);
    button.dataset.id = String(message.id);
    button.classList.toggle("voted", Number(localVotes[message.id]) === vote);
    button.textContent = `${label} ${vote === 1 ? message.likes : message.dislikes}`;
    return button;
  }
  function render() {
    ui.list.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement("p");
      empty.className = "guestbook-state";
      empty.textContent = "还没有人留言。你可以给下一位值班员留第一句话。";
      ui.list.append(empty);
      return;
    }
    for (const message of messages) {
      const article = document.createElement("article");
      article.className = "guest-message";
      const header = document.createElement("header");
      const name = document.createElement("b"); name.textContent = message.nickname;
      const time = document.createElement("time"); time.textContent = formatTime(message.createdAt);
      header.append(name, time);
      const content = document.createElement("p"); content.textContent = message.content;
      const votes = document.createElement("div"); votes.className = "guest-votes";
      votes.append(makeButton("赞", 1, message), makeButton("踩", -1, message));
      article.append(header, content, votes);
      ui.list.append(article);
    }
  }
  async function load() {
    if (loading) return;
    loading = true;
    ui.list.innerHTML = '<p class="guestbook-state">正在读取值班记录……</p>';
    try {
      const response = await fetch(apiUrl(`/api/board?sort=${sort}`), { headers: { "X-Board-Visitor": visitorId }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "留言终端暂时离线");
      messages = Array.isArray(data.messages) ? data.messages : [];
      if (data.votes) {
        localVotes = { ...localVotes, ...data.votes };
        localStorage.setItem(votesKey, JSON.stringify(localVotes));
      }
      render();
      setNote("每台设备对每条留言只能投一票。");
    } catch (error) {
      ui.list.innerHTML = '<p class="guestbook-state">留言终端没有回应。游戏本体仍可正常开始。</p>';
      setNote("公共留言暂未接入，游戏本体不受影响。", true);
    } finally { loading = false; }
  }
  function open() {
    ui.overlay.classList.remove("hidden");
    document.body.classList.add("guestbook-open");
    load();
    setTimeout(() => ui.content.focus(), 180);
  }
  function close() {
    ui.overlay.classList.add("hidden");
    document.body.classList.remove("guestbook-open");
  }

  ui.open.addEventListener("click", open);
  ui.close.addEventListener("click", close);
  ui.home.addEventListener("click", close);
  ui.overlay.addEventListener("click", (event) => { if (event.target === ui.overlay) close(); });
  ui.content.addEventListener("input", () => { ui.counter.textContent = `${ui.content.value.length} / 180`; });
  ui.nickname.addEventListener("change", () => localStorage.setItem(nameKey, ui.nickname.value.trim().slice(0, 16) || fallbackName));
  ui.sorts.forEach((button) => button.addEventListener("click", () => {
    sort = button.dataset.sort === "hot" ? "hot" : "latest";
    ui.sorts.forEach((item) => item.classList.toggle("active", item === button));
    load();
  }));
  ui.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nickname = ui.nickname.value.trim().slice(0, 16);
    const content = ui.content.value.trim();
    if (!nickname || !content) return setNote("请填写昵称和留言。", true);
    const submit = ui.form.querySelector("button[type=submit]");
    submit.disabled = true;
    setNote("正在写入留言……");
    try {
      const response = await fetch(apiUrl("/api/board"), { method: "POST", headers: { "Content-Type": "application/json", "X-Board-Visitor": visitorId }, body: JSON.stringify({ nickname, content, visitorId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "发送失败");
      localStorage.setItem(nameKey, nickname);
      ui.content.value = ""; ui.counter.textContent = "0 / 180";
      setNote("留言已写入 404 终端。");
      await load();
    } catch (error) { setNote("公共留言暂未接入，当前无法发送。", true); }
    finally { submit.disabled = false; }
  });
  ui.list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-vote]");
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      const id = Number(button.dataset.id); const value = Number(button.dataset.vote);
      const response = await fetch(apiUrl(`/api/board/${id}/vote`), { method: "POST", headers: { "Content-Type": "application/json", "X-Board-Visitor": visitorId }, body: JSON.stringify({ value, visitorId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "投票失败");
      localVotes[id] = data.vote;
      localStorage.setItem(votesKey, JSON.stringify(localVotes));
      await load();
    } catch (error) { setNote("公共留言暂未接入，当前无法投票。", true); }
    finally { button.disabled = false; }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ui.overlay.classList.contains("hidden")) { event.stopImmediatePropagation(); close(); }
  }, true);
})();
