(function () {
  "use strict";

  const KEY = "dorm404.archive.v1";
  const scenes = window.GameContent.scenePool;
  const anomalyEntries = [...Object.values(scenes).flatMap((scene) => scene.anomalies),
    ...window.GameContent.events.filter((event) => event.camera === "cam04")];
  const uniqueAnomalies = [...new Map(anomalyEntries.map((event) => [event.id, event])).values()];
  const catalog = {
    anomaly: uniqueAnomalies.map((event) => ({
      id: event.id,
      title: event.title,
      detail: `${event.camera === "cam04" ? "值班室" : scenes[event.sceneId]?.name || "未知区域"}　/　${event.category}`
    })),
    show: [
      { id: "cascade", title: "六路依次断连", detail: "监控墙 / 系统记录" },
      { id: "snow", title: "全屏雪花", detail: "监控墙 / 系统记录" },
      { id: "fake-dawn", title: "假天亮", detail: "清晨 / 系统记录" },
      { id: "pa-override", title: "宿舍广播接管", detail: "公共广播 / 系统记录" },
      { id: "phone-snow", title: "手机信号雪花", detail: "值班手机 / 系统记录" },
      { id: "phone-flood", title: "手机红字刷屏", detail: "值班手机 / 系统记录" },
      { id: "final-blackout", title: "最终断流", detail: "监控墙 / 系统记录" }
    ],
    ending: [
      { id: "handoff", title: "有人来接班", detail: "回头 / 值班结局" },
      { id: "dawn", title: "天亮了", detail: "留在屏幕前 / 值班结局" },
      { id: "watched-turn", title: "下一任值班员：回头", detail: "回头 / 值班结局" },
      { id: "watched-stay", title: "下一任值班员：守望", detail: "留在屏幕前 / 值班结局" }
    ]
  };
  const allowed = Object.fromEntries(Object.entries(catalog).map(([type, entries]) => [type, new Set(entries.map((entry) => entry.id))]));
  const saved = { anomaly: {}, show: {}, ending: {} };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    for (const type of Object.keys(saved)) {
      for (const [id, time] of Object.entries(stored[type] || {})) {
        if (allowed[type].has(id) && Number.isFinite(time)) saved[type][id] = time;
      }
    }
  } catch { /* A blocked or damaged local store should never prevent play. */ }

  const overlay = document.getElementById("archiveOverlay");
  const entry = document.getElementById("openArchive");
  const close = document.getElementById("closeArchive");
  const list = document.getElementById("archiveList");
  const progress = document.getElementById("archiveProgress");
  const footer = document.getElementById("archiveFooter");
  const tabs = [...overlay.querySelectorAll("[data-archive-tab]")];
  let selected = "anomaly";

  function count(type) { return Object.keys(saved[type]).length; }

  function render() {
    for (const type of Object.keys(catalog)) {
      document.getElementById(`archive${type[0].toUpperCase()}${type.slice(1)}Count`).textContent = `${String(count(type)).padStart(2, "0")}/${catalog[type].length}`;
    }
    const total = Object.values(catalog).reduce((sum, entries) => sum + entries.length, 0);
    const found = Object.keys(catalog).reduce((sum, type) => sum + count(type), 0);
    progress.replaceChildren();
    const summary = document.createElement("strong");
    summary.textContent = `${String(found).padStart(2, "0")} / ${total}`;
    const label = document.createElement("span");
    label.textContent = "总计";
    const meter = document.createElement("div");
    meter.className = "archive-meter";
    const fill = document.createElement("i");
    fill.style.width = `${total ? found / total * 100 : 0}%`;
    meter.append(fill);
    progress.append(summary, label, meter);
    tabs.forEach((tab) => {
      const active = tab.dataset.archiveTab === selected;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    const fragment = document.createDocumentFragment();
    catalog[selected].forEach((item, index) => {
      const foundAt = saved[selected][item.id];
      const row = document.createElement("article");
      row.className = `archive-row${foundAt ? " unlocked" : " sealed"}`;
      const number = document.createElement("span");
      number.className = "archive-index";
      number.textContent = String(index + 1).padStart(2, "0");
      const content = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = foundAt ? item.title : "记录待解封";
      const detail = document.createElement("small");
      detail.textContent = foundAt ? item.detail : "尚无目击记录";
      content.append(title, detail);
      const mark = document.createElement("span");
      mark.className = "archive-mark";
      mark.textContent = foundAt ? "已归档" : "未解锁";
      row.append(number, content, mark);
      fragment.append(row);
    });
    list.replaceChildren(fragment);
    list.scrollTop = 0;
    footer.textContent = `FILE ${String(Object.keys(catalog).indexOf(selected) + 1).padStart(2, "0")}`;
  }

  function record(type, id) {
    if (!allowed[type]?.has(id) || saved[type][id]) return;
    saved[type][id] = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* Gameplay continues without storage. */ }
    if (!overlay.classList.contains("hidden")) render();
  }

  entry.addEventListener("click", () => {
    if (!document.getElementById("startOverlay").classList.contains("hidden")) return;
    render();
    overlay.classList.remove("hidden");
    close.focus({ preventScroll: true });
  });
  function hide() {
    overlay.classList.add("hidden");
    entry.focus({ preventScroll: true });
  }
  close.addEventListener("click", hide);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) hide(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.classList.contains("hidden")) { event.preventDefault(); hide(); }
  });
  tabs.forEach((tab) => tab.addEventListener("click", () => { selected = tab.dataset.archiveTab; render(); }));

  window.GameArchive = {
    unlockedIds: () => Object.entries(saved).flatMap(([type, entries]) => Object.keys(entries).map((id) => `${type}:${id}`)),
    recordAnomaly: (id) => record("anomaly", id),
    recordShow: (id) => record("show", id),
    recordEnding: (kind, choice) => record("ending", kind === "watched" ? `watched-${choice === "TURN" ? "turn" : "stay"}` : kind)
  };
})();
