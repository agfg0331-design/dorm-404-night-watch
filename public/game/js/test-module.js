(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const ui = {
    overlay: $("testModule"), menu: $("testMenu"), preflight: $("testPreflight"), footer: $("testFooter"),
    summary: $("testSummary"), close: $("testClose"), begin: $("testBegin"), launch: $("testLaunch"),
    speed: $("testSpeed"), event: $("testEvent"), show: $("testShow"), seed: $("testSeed"), random: $("testRandomSeed"),
    dock: $("testDock"), dockLabel: $("testDockLabel"), replay: $("testReplay"), back: $("testBack")
  };
  if (!ui.overlay) return;
  const params = new URLSearchParams(location.search);
  const runMode = ["full", "event", "show"].includes(params.get("test")) && params.get("qa") === "1" ? params.get("test") : null;
  let tab = "full";
  const randomSeed = () => Math.floor(Math.random() * 4294967296);
  ui.seed.value = String(randomSeed());

  const scenes = Object.values(window.GameContent.scenePool);
  const eventGroups = [...scenes.map((scene) => ({ name: scene.name, events: scene.anomalies })), {
    name: "值班室（固定 CAM 04）", events: window.GameContent.events.filter((event) => event.camera === "cam04")
  }];
  eventGroups.forEach(({ name, events }) => {
    const group = document.createElement("optgroup");
    group.label = name;
    events.forEach((event) => {
      const option = document.createElement("option");
      option.value = event.id;
      option.textContent = `${event.title} · ${event.category}`;
      group.append(option);
    });
    ui.event.append(group);
  });

  function showMenu() {
    ui.preflight.classList.add("hidden");
    ui.menu.classList.remove("hidden");
    ui.footer.classList.remove("hidden");
    ui.overlay.classList.remove("hidden");
    ui.dock.classList.add("hidden");
    ui.launch.focus({ preventScroll: true });
  }
  function goHome() {
    if (runMode || params.get("test") === "menu") location.assign(location.pathname);
    else ui.overlay.classList.add("hidden");
  }
  function setTab(next) {
    tab = next;
    document.querySelectorAll("[data-test-tab]").forEach((button) => button.classList.toggle("active", button.dataset.testTab === next));
    document.querySelectorAll("[data-test-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.testPanel !== next));
  }
  function launch() {
    const seed = Number(ui.seed.value);
    const target = new URL(location.pathname, location.origin);
    target.searchParams.set("qa", "1");
    target.searchParams.set("test", tab);
    target.searchParams.set("seed", String(Number.isFinite(seed) && seed >= 0 ? Math.min(4294967295, Math.floor(seed)) : randomSeed()));
    if (tab === "full") {
      if (ui.speed.value === "75") target.searchParams.set("fast", "1");
      else target.searchParams.set("rate", ui.speed.value);
    } else if (tab === "event") target.searchParams.set("event", ui.event.value);
    else target.searchParams.set("show", ui.show.value);
    location.assign(target.toString());
  }
  function runSummary() {
    if (runMode === "full") return `完整局快速测试 · seed ${params.get("seed") || "随机"}\n场景、异常与结局照常运行；这里只加快游戏时钟。`;
    if (runMode === "event") {
      const event = eventGroups.flatMap((group) => group.events).find((item) => item.id === params.get("event"));
      return event ? `单独异常 · ${event.title}\n进入对应监控后，异常会在数秒内开始，完整播放并停留在最终画面。` : "找不到这个异常。请返回测试菜单重新选择。";
    }
    const labels = Object.fromEntries([...ui.show.options].map((option) => [option.value, option.textContent]));
    return `单独演出 · ${labels[params.get("show")] || "未知演出"}\n进入监控后自动触发。本轮不生成其他异常。`;
  }

  window.addEventListener("dorm404:test-open", showMenu);
  ui.close.addEventListener("click", goHome);
  ui.random.addEventListener("click", () => { ui.seed.value = String(randomSeed()); });
  ui.launch.addEventListener("click", launch);
  ui.begin.addEventListener("click", () => {
    ui.overlay.classList.add("hidden");
    ui.dock.classList.remove("hidden");
    window.dispatchEvent(new Event("dorm404:test-start"));
  });
  ui.replay.addEventListener("click", () => location.reload());
  ui.back.addEventListener("click", () => location.assign(`${location.pathname}?qa=1&test=menu`));
  document.querySelectorAll("[data-test-tab]").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.testTab)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ui.overlay.classList.contains("hidden")) {
      event.stopImmediatePropagation();
      goHome();
    }
  }, true);

  if (runMode) {
    ui.summary.textContent = runSummary();
    ui.dockLabel.textContent = runMode === "full" ? "完整局测试" : runMode === "event" ? "异常单测" : "演出单测";
    ui.menu.classList.add("hidden");
    ui.footer.classList.add("hidden");
    ui.preflight.classList.remove("hidden");
    ui.overlay.classList.remove("hidden");
  } else if (params.get("test") === "menu" && params.get("qa") === "1") showMenu();
})();
