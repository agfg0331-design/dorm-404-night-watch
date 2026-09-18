(function () {
  "use strict";

  const { cameras, events, frameAssets } = window.GameContent;
  const audio = window.NightAudio;
  const params = new URLSearchParams(location.search);
  const qa = params.get("qa") === "1";
  const fast = params.get("fast") === "1";
  const startMinute = qa ? Math.max(0, Math.min(350, Number(params.get("start") || 0))) : 0;
  const minuteMs = fast ? 75 : qa ? Math.max(90, Number(params.get("rate") || 260)) : 1800;
  const $ = (id) => document.getElementById(id);

  const els = {
    body: document.body, roomView: $("roomView"), monitorView: $("monitorView"), phoneView: $("phoneView"),
    roomBackground: $("roomBackground"), roomClock: $("roomClock"), roomCaption: $("roomCaption"),
    enterMonitor: $("enterMonitor"), monitorPhone: $("monitorPhone"),
    monitorUnread: $("monitorUnread"), tabUnread: $("tabUnread"),
    cameraImage: $("cameraImage"), cameraCode: $("cameraCode"), cameraName: $("cameraName"), monitorTime: $("monitorTime"),
    eventFrameStack: $("eventFrameStack"), eventFrames: [$("eventFrame1"), $("eventFrame2"), $("eventFrame3")],
    eventLayer: $("eventLayer"), eventStatus: $("eventStatus"), signalError: $("signalError"),
    danger: $("dangerValue"), trust: $("trustValue"), correct: $("correctValue"), missed: $("missedValue"),
    phoneTime: $("phoneTime"), phoneSubtitle: $("phoneSubtitle"), handset: $("handset"), closePhone: $("closePhone"), phoneHome: $("phoneHome"),
    phoneCorruption: $("phoneCorruption"), phoneRedFlood: $("phoneRedFlood"), phoneGhostWarning: $("phoneGhostWarning"),
    messagesPanel: $("messagesPanel"), reportPanel: $("reportPanel"), messageList: $("messageList"), autoInput: $("autoInput"),
    reportForm: $("reportForm"), reportCamera: $("reportCamera"), reportFeedback: $("reportFeedback"),
    turnChoice: $("turnChoice"), dontTurn: $("dontTurn"), turnAround: $("turnAround"), turnSequence: $("turnSequence"),
    turnStart: $("turnStart"), turnMid: $("turnMid"), turnImage: $("turnImage"), turnCaption: $("turnCaption"), turnWarning: $("turnWarning"), startOverlay: $("startOverlay"), startGame: $("startGame"),
    audioCheckOverlay: $("audioCheckOverlay"), confirmHeadphones: $("confirmHeadphones"), skipHeadphones: $("skipHeadphones"),
    settingsOverlay: $("settingsOverlay"), settingsForm: $("settingsForm"), openSettings: $("openSettings"), closeSettings: $("closeSettings"),
    masterVolume: $("masterVolume"), bgmVolume: $("bgmVolume"), sfxVolume: $("sfxVolume"), brightness: $("brightness"),
    masterVolumeValue: $("masterVolumeValue"), bgmVolumeValue: $("bgmVolumeValue"), sfxVolumeValue: $("sfxVolumeValue"), brightnessValue: $("brightnessValue"),
    screenShake: $("screenShake"), visualNoise: $("visualNoise"), cameraSwitchMask: $("cameraSwitchMask"),
    callOverlay: $("callOverlay"), callText: $("callText"), answerCall: $("answerCall"), declineCall: $("declineCall"),
    endingOverlay: $("endingOverlay"), endingKicker: $("endingKicker"), endingTitle: $("endingTitle"), endingText: $("endingText"),
    endCorrect: $("endCorrect"), endWrong: $("endWrong"), endMissed: $("endMissed"), endDanger: $("endDanger"),
    handoffForm: $("handoffForm"), handoffContent: $("handoffContent"), handoffCounter: $("handoffCounter"), handoffNote: $("handoffNote"),
    restart: $("restartGame"), toast: $("toast"), guestbookOverlay: $("guestbookOverlay")
  };

  const phone = new window.PhoneSystem(els.messageList);
  let previousView = "room";
  let currentTab = "messages";
  let toastTimer = null;
  let promptPending = false;
  let callOverride = false;
  let transitionLocked = false;
  let phoneTransitionTimer = null;
  let swipeStartY = null;
  let displayedCameraSource = els.cameraImage.getAttribute("src");
  let pendingCameraSource = null;
  let cameraRequestToken = 0;
  let renderedCameraId = "";
  let renderedEventKey = "";
  let renderedEventClass = "";
  let renderedEventStage = "";
  let pendingPhoneCorruption = null;
  let phoneCorruptionTimer = null;
  const eventBeatState = new Map();
  const eventCueState = new Set();
  let lastAudioTensionKey = "";
  let shiftStarting = false;
  let audioPromptResolving = false;
  const renderedText = new WeakMap();
  let renderedUnread = -1;
  let renderedPhase = -1;
  let renderedMonitorFailed = null;
  let renderedFrameEventKey = "";
  let renderedEventFocus = null;
  let handoffLoadStarted = false;
  let handoffCandidate = null;
  let handoffDeliveryMinute = null;
  let handoffDelivered = false;
  let handoffSubmitted = false;
  let activeEndingKind = "dawn";
  const SETTINGS_KEY = "dorm404.settings.v2";
  const HOME_STATE_KEY = "dorm404.home.contaminated";
  const defaultSettings = { master: 76, bgm: 58, sfx: 92, brightness: 100, shake: true, noise: true };
  let settings = loadSettings();
  const imageRecords = new Map();
  const allCameraSources = [...new Set([
    ...Object.values(cameras).flatMap((camera) => [camera.image, camera.corruptImage]),
    ...frameAssets
  ])];
  // All six feeds and their event frames are small enough to decode while the player
  // is still on the title/duty-room screens. This prevents the previous feed from
  // lingering for seconds when an event image is requested for the first time.
  const cameraPreload = Promise.all(allCameraSources.map((source) => preloadImage(source, true)));
  const criticalAudioSamples = [
    "crtSwitch", "heelsFar", "heelsNear", "heelsStop", "woodScrape", "glassBreak",
    "drip1", "drip2", "drip3", "washer1", "washer2", "washer3", "doorShort",
    "doorLong", "doorTense", "ringtone", "horrorHit", "heartbeat", "breathing"
  ];

  applySettings(false);
  els.startOverlay.classList.toggle("contaminated", localStorage.getItem(HOME_STATE_KEY) === "1");

  const sim = new window.NightShiftSimulation({
    minuteMs,
    startMinute,
    callbacks: {
      onTick: render,
      onView: () => render(sim.snapshot()),
      onCamera: () => renderCamera(),
      onMessage: (message, state) => receiveMessage(message, state),
      onReadPhone: updateUnread,
      onEventStart: (event) => {
        if (sim.currentCamera === event.camera && sim.view === "monitor") {
          ensureEventCue(event);
        }
      },
      onReport: (result) => result.ok && showToast("上报已受理。"),
      onMonitorFail: () => audio.glitch(true),
      onSelfCall: showSelfCall,
      onTurnPrompt: () => {
        promptPending = true;
        if (sim.view.startsWith("phone")) revealTurnChoice();
        else window.setTimeout(() => { openPhone("messages"); window.setTimeout(revealTurnChoice, 1500); }, 500);
      },
      onTurnDeclined: runNoTurnSequence,
      onTurnStart: runTurnSequence,
      onEnding: showEnding
    }
  });

  function formatMinute(minute, seconds = false) {
    let value = Math.max(0, Math.min(360, minute));
    if (seconds) value += (performance.now() / 1000 % 1) / 60;
    const hour = Math.floor(value / 60);
    const min = Math.floor(value % 60);
    const sec = seconds ? Math.floor((value * 60) % 60) : null;
    return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}${seconds ? `:${String(sec).padStart(2, "0")}` : ""}`;
  }

  function phase(minute) { return Math.max(0, Math.min(5, Math.floor(minute / 60))); }

  function showToast(message, error = false) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.className = `toast visible${error ? " error" : ""}`;
    toastTimer = window.setTimeout(() => { els.toast.className = "toast"; }, 2100);
  }

  function setText(element, value) {
    const text = String(value);
    if (renderedText.get(element) === text) return;
    renderedText.set(element, text);
    element.textContent = text;
  }

  function loadSettings() {
    try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; }
    catch (_) { return { ...defaultSettings }; }
  }

  function preloadImage(source, highPriority = false) {
    if (imageRecords.has(source)) return imageRecords.get(source).promise;
    const record = { ready: false, image: new Image(), promise: null };
    const promise = new Promise((resolve) => {
      const image = record.image;
      image.decoding = "async";
      if (highPriority && "fetchPriority" in image) image.fetchPriority = "high";
      image.onload = async () => {
        try { if (image.decode) await image.decode(); } catch (_) { /* decoded enough to render */ }
        record.ready = true;
        resolve(source);
      };
      image.onerror = () => resolve(source);
      image.src = source;
    });
    record.promise = promise;
    imageRecords.set(source, record);
    return promise;
  }

  function preloadLinkedEvent(message) {
    if (!message.linkedEvent) return;
    const linked = events.find((event) => event.id === message.linkedEvent);
    (linked?.frames || []).forEach((source) => preloadImage(source, true));
  }

  function applySettings(save = true) {
    const controls = [
      [els.masterVolume, els.masterVolumeValue, "master"], [els.bgmVolume, els.bgmVolumeValue, "bgm"],
      [els.sfxVolume, els.sfxVolumeValue, "sfx"], [els.brightness, els.brightnessValue, "brightness"]
    ];
    controls.forEach(([input, output, key]) => { input.value = settings[key]; output.value = settings[key]; output.textContent = settings[key]; });
    els.screenShake.checked = settings.shake;
    els.visualNoise.checked = settings.noise;
    document.documentElement.style.setProperty("--game-brightness", String(settings.brightness / 100));
    document.body.classList.toggle("custom-brightness", settings.brightness !== 100);
    document.documentElement.style.setProperty("--noise-opacity", settings.noise ? ".12" : "0");
    document.body.classList.toggle("no-screen-shake", !settings.shake);
    document.body.classList.toggle("no-visual-noise", !settings.noise);
    audio.setVolumes({ master: settings.master / 100, bgm: settings.bgm / 100, sfx: settings.sfx / 100 });
    if (save) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function readSettingsControls() {
    settings = {
      master: Number(els.masterVolume.value), bgm: Number(els.bgmVolume.value), sfx: Number(els.sfxVolume.value),
      brightness: Number(els.brightness.value), shake: els.screenShake.checked, noise: els.visualNoise.checked
    };
    applySettings();
  }

  function setViewElement(view) {
    [els.roomView, els.monitorView].forEach((element) => element.classList.remove("active"));
    if (view === "room") els.roomView.classList.add("active");
    else els.monitorView.classList.add("active");
    els.body.dataset.view = view;
  }

  function switchView(view) {
    if (sim.ended || sim.turning) return;
    if (view.startsWith("phone")) {
      openPhone(view === "phone-report" ? "report" : "messages");
      return;
    } else {
      if (transitionLocked) return;
      audio.stopReportTension();
      els.phoneView.classList.remove("active", "lowering");
      setViewElement(view);
      if (view === "monitor") audio.setScene(cameras[sim.currentCamera].ambient);
      else audio.setScene("duty");
    }
    sim.setView(view);
    if (promptPending && view.startsWith("phone")) window.setTimeout(revealTurnChoice, 700);
  }

  function openPhone(tab = "messages") {
    if (transitionLocked || sim.ended || sim.turning) return;
    if (!sim.view.startsWith("phone")) previousView = sim.view === "room" ? "room" : "monitor";
    transitionLocked = true;
    window.clearTimeout(phoneTransitionTimer);
    els.phoneView.classList.remove("lowering");
    els.phoneView.classList.add("active");
    els.body.dataset.view = "phone";
    audio.pickupPhone();
    setPhoneTab(tab);
    if (pendingPhoneCorruption) {
      const pending = pendingPhoneCorruption;
      pendingPhoneCorruption = null;
      window.setTimeout(() => triggerPhoneCorruption(pending.type, pending.phrase), 480);
    }
    phoneTransitionTimer = window.setTimeout(() => { transitionLocked = false; }, 500);
    if (promptPending) window.setTimeout(revealTurnChoice, 720);
  }

  function setPhoneTab(tab) {
    currentTab = tab;
    document.querySelectorAll(".phone-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    els.messagesPanel.classList.toggle("active", tab === "messages");
    els.reportPanel.classList.toggle("active", tab === "report");
    if (tab === "report") {
      els.reportCamera.value = sim.currentCamera;
      sim.setView("phone-report");
      audio.startReportTension(sim.danger);
    } else {
      sim.setView("phone-messages");
      audio.stopReportTension();
    }
  }

  function closePhone(force = false) {
    if (els.phoneView.classList.contains("lowering")) return;
    if (transitionLocked && !force && !els.phoneView.classList.contains("active")) return;
    transitionLocked = true;
    window.clearTimeout(phoneTransitionTimer);
    audio.stopReportTension();
    audio.putdownPhone();
    const destination = previousView === "room" ? "room" : "monitor";
    sim.setView(destination);
    setViewElement(destination);
    els.phoneView.classList.add("lowering");
    phoneTransitionTimer = window.setTimeout(() => {
      els.phoneView.classList.remove("active", "lowering");
      transitionLocked = false;
    }, 430);
  }

  function phoneBack() {
    if (currentTab === "report") setPhoneTab("messages");
    else closePhone();
  }

  function pressPhoneHome() {
    audio.phoneHome();
    els.phoneHome.classList.add("pressed");
    window.setTimeout(() => els.phoneHome.classList.remove("pressed"), 130);
    phoneBack();
  }

  function receiveMessage(message, state) {
    preloadLinkedEvent(message);
    phone.addMessage(message);
    // Keep the internal suspicious flag for story timing, but never reveal it
    // through a different notification sound before an explicit corruption beat.
    const level = message.corrupt ? "corrupt" : "normal";
    audio.phoneNotify(level);
    queuePhoneCorruption(message, state);
    [els.monitorPhone].forEach((element) => {
      element.classList.remove("ringing");
      void element.offsetWidth;
      element.classList.add("ringing");
      window.setTimeout(() => element.classList.remove("ringing"), 900);
    });
    updateUnread(state);
  }

  function queuePhoneCorruption(message, state) {
    let type = null;
    let phrase = "消息已撤回";
    if (state.minute >= 334 && (message.corrupt || message.sender === "自己")) {
      type = "flood"; phrase = message.text.includes("回头") ? "不要回头看" : "你正在被监控";
    } else if (state.minute >= 320 && message.corrupt) {
      type = "snow-hard"; phrase = "NO OPERATOR";
    } else if (state.minute >= 270 && message.corrupt) {
      type = "snow"; phrase = "信号不属于本机";
    } else if (state.minute >= 230 && (message.corrupt || message.suspicious)) {
      type = "ghost"; phrase = "消息已撤回";
    }
    if (!type) return;
    const rank = { ghost: 1, snow: 2, "snow-hard": 3, flood: 4 };
    const next = { type, phrase };
    if (sim.view.startsWith("phone")) triggerPhoneCorruption(type, phrase);
    else if (!pendingPhoneCorruption || rank[type] >= rank[pendingPhoneCorruption.type]) pendingPhoneCorruption = next;
  }

  function triggerPhoneCorruption(type, phrase) {
    window.clearTimeout(phoneCorruptionTimer);
    els.phoneGhostWarning.textContent = phrase;
    els.phoneRedFlood.querySelectorAll("span").forEach((line, index) => {
      line.textContent = index % 3 === 1 && type === "flood" ? "404不存在" : phrase;
    });
    els.phoneCorruption.className = `phone-corruption active phone-corruption-${type}`;
    els.phoneCorruption.setAttribute("aria-hidden", "false");
    els.phoneView.classList.add("phone-corrupting");
    audio.phoneInterference(type);
    const duration = type === "flood" ? 4400 : type === "snow-hard" ? 3200 : type === "snow" ? 2200 : 1500;
    phoneCorruptionTimer = window.setTimeout(() => {
      els.phoneCorruption.className = "phone-corruption";
      els.phoneCorruption.setAttribute("aria-hidden", "true");
      els.phoneView.classList.remove("phone-corrupting");
    }, duration);
  }

  function updateUnread(state = sim.snapshot()) {
    if (renderedUnread === state.unread) return;
    renderedUnread = state.unread;
    [els.monitorUnread].forEach((badge) => {
      setText(badge, state.unread);
      badge.classList.toggle("visible", state.unread > 0);
    });
    els.tabUnread.classList.toggle("visible", state.unread > 0);
  }

  function prepareHandoff() {
    if (handoffLoadStarted || !window.HandoffService) return;
    handoffLoadStarted = true;
    handoffDeliveryMinute = 2 + Math.floor(Math.random() * 13);
    window.HandoffService.getRandom()
      .then((content) => { if (typeof content === "string" && content.trim()) handoffCandidate = content.trim(); })
      .catch(() => {});
  }

  function maybeDeliverHandoff(state) {
    if (handoffDelivered || !handoffCandidate || !sim.running || state.minute < handoffDeliveryMinute || state.minute > 15) return;
    handoffDelivered = true;
    sim.pushMessage({ sender: "上一任值班员", text: handoffCandidate });
  }

  function render(state) {
    if (!state) return;
    const currentPhase = phase(state.minute);
    const tensionKey = `${currentPhase}:${Math.floor(state.danger / 10)}`;
    if (tensionKey !== lastAudioTensionKey) {
      lastAudioTensionKey = tensionKey;
      audio.setTension(currentPhase, state.danger);
    }
    if (renderedPhase !== currentPhase) {
      renderedPhase = currentPhase;
      els.body.dataset.phase = String(currentPhase);
    }
    setText(els.roomClock, formatMinute(state.minute));
    const phoneOffset = currentPhase >= 3 ? (currentPhase - 2) * 7 : 0;
    setText(els.phoneTime, formatMinute(state.minute + phoneOffset));
    setText(els.monitorTime, state.finalStage ? "06:00:00" : state.monitorFailed ? `${formatMinute(state.minute - 17)}:--` : formatMinute(state.minute, true));
    setText(els.danger, String(Math.round(state.danger)).padStart(2, "0"));
    setText(els.trust, String(Math.round(state.trust)).padStart(2, "0"));
    setText(els.correct, state.correct);
    setText(els.missed, state.missed);
    const monitorFailed = state.monitorFailed && !callOverride;
    if (renderedMonitorFailed !== monitorFailed) {
      renderedMonitorFailed = monitorFailed;
      els.monitorView.classList.toggle("failed", monitorFailed);
    }
    updateUnread(state);
    // The phone covers the feed. Avoid mutating hidden camera layers during its
    // lift/lower animation so mobile browsers can keep the phone on the compositor.
    if (state.view === "monitor") renderCamera();
    const visibleEvent = state.view === "monitor" ? state.visibleEvent : null;
    const eventFocused = Boolean(visibleEvent);
    if (renderedEventFocus !== eventFocused) {
      renderedEventFocus = eventFocused;
      audio.setEventFocus(eventFocused);
    }
    if (visibleEvent) {
      ensureEventCue(visibleEvent);
      syncEventBeat(visibleEvent);
    }
    if (currentPhase >= 4) setText(els.roomCaption, "你偶尔听见身后椅脚摩擦地面，但值班室只有一把椅子。");
    if (qa) {
      els.body.dataset.qa = JSON.stringify({ minute: +state.minute.toFixed(1), view: state.view, camera: state.currentCamera, event: state.visibleEvent?.id || null, eventState: state.visibleEvent?.state || null, danger: state.danger, trust: state.trust, correct: state.correct, missed: state.missed, monitorFailed: state.monitorFailed, finalStage: state.finalStage, ended: state.ended });
    }
    maybeDeliverHandoff(state);
  }

  function renderCamera() {
    const camera = cameras[sim.currentCamera];
    if (!camera) return;
    const event = sim.getVisibleEvent();
    if (renderedCameraId !== sim.currentCamera) {
      renderedCameraId = sim.currentCamera;
      els.cameraCode.textContent = camera.code;
      els.cameraName.textContent = camera.name;
      els.cameraImage.alt = `${camera.name}监控画面`;
      document.querySelectorAll(".camera-dock [data-camera]").forEach((button) => button.classList.toggle("active", button.dataset.camera === sim.currentCamera));
    }
    const lateCorruption = sim.minute > 285 && !event?.frames && (event?.visual === "shadow-rush" || event?.visual === "duty-extra");
    const source = lateCorruption ? camera.corruptImage : camera.image;
    queueCameraSource(source);
    const nextEventKey = event ? `${sim.currentCamera}:${event.id}` : "";
    const nextEventClass = event ? `event-${event.visual}` : "";
    if (nextEventKey !== renderedEventKey) {
      if (renderedEventClass) els.monitorView.classList.remove(renderedEventClass);
      renderedEventKey = nextEventKey;
      renderedEventClass = nextEventClass;
      renderedEventStage = "";
      if (renderedEventClass) els.monitorView.classList.add(renderedEventClass);
    }
    renderEventFrames(event);
    if (event) {
      const visualProgress = eventVisualProgress(event);
      els.eventLayer.style.setProperty("--event-progress", visualProgress.toFixed(3));
      const nextStage = String(Math.min(4, Math.floor(visualProgress * 5)));
      if (nextStage !== renderedEventStage) {
        renderedEventStage = nextStage;
        els.monitorView.dataset.eventStage = nextStage;
      }
    } else {
      els.eventLayer.style.setProperty("--event-progress", "0");
      if (renderedEventStage !== "0") {
        renderedEventStage = "0";
        els.monitorView.dataset.eventStage = "0";
      }
    }
    // The monitor never judges the feed for the player. Normal and altered
    // footage deliberately share the same neutral status line.
    els.eventStatus.textContent = `${camera.code} / MONITORING`;
  }

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  function eventVisualProgress(event) {
    const rate = event.visual === "window-break" ? 1.15 : event.visual === "shadow-walk" ? 1.45 : 1.75;
    return clamp01(event.progress * rate);
  }

  function setEventFrame(index, source, opacity) {
    const frame = els.eventFrames[index];
    if (!frame) return;
    if (source && !frame.src.endsWith(source)) frame.src = source;
    frame.style.opacity = String(clamp01(opacity));
  }

  function renderEventFrames(event) {
    const nextFrameEventKey = event?.frames?.length ? `${event.id}:${event.frames.join("|")}` : "";
    if (nextFrameEventKey !== renderedFrameEventKey) {
      renderedFrameEventKey = nextFrameEventKey;
      els.eventFrames.forEach((frame) => {
        frame.style.opacity = "0";
        frame.style.clipPath = "none";
        frame.style.maskImage = "none";
        frame.style.webkitMaskImage = "none";
        frame.style.transform = "";
        frame.style.transformOrigin = "";
      });
    }
    if (!event?.frames?.length) return;
    const p = eventVisualProgress(event);
    if (event.visual === "shadow-walk") {
      setEventFrame(0, event.frames[1], clamp01((p - 0.16) / 0.28) * (1 - clamp01((p - 0.64) / 0.2)));
      setEventFrame(1, event.frames[2], clamp01((p - 0.58) / 0.28));
    } else if (event.visual === "shadow-rush") {
      setEventFrame(0, event.frames[0], clamp01((p - 0.05) / 0.18) * (1 - clamp01((p - 0.48) / 0.16)));
      setEventFrame(1, event.frames[1], clamp01((p - 0.42) / 0.2));
    } else if (event.visual === "chair-fall") {
      setEventFrame(0, event.frames[0], clamp01((p - 0.2) / 0.09));
    } else if (event.visual === "window-break") {
      setEventFrame(0, event.frames[0], clamp01((p - 0.28) / 0.12));
    } else if (event.visual === "bed-curtain") {
      const reveal = clamp01((p - 0.08) / 0.68);
      const frame = els.eventFrames[0];
      setEventFrame(0, event.frames[0], reveal);
      frame.style.maskImage = "radial-gradient(ellipse 19% 32% at 34% 44%, #000 48%, rgba(0,0,0,.9) 68%, transparent 100%)";
      frame.style.webkitMaskImage = frame.style.maskImage;
      frame.style.transformOrigin = "34% 44%";
      frame.style.transform = `scale(${(1 + Math.max(0, p - 0.7) * 0.012).toFixed(4)})`;
    } else if (event.visual === "stair-steps") {
      const reveal = clamp01((p - 0.04) / 0.78);
      setEventFrame(0, event.frames[0], 1);
      els.eventFrames[0].style.clipPath = `inset(${(1 - reveal) * 100}% 0 0 0)`;
    } else if (event.visual === "wet-footprints") {
      const reveal = clamp01((p - 0.04) / 0.78);
      setEventFrame(0, event.frames[0], 1);
      els.eventFrames[0].style.clipPath = `inset(0 0 ${(1 - reveal) * 100}% 0)`;
    } else if (["pipe-drip", "machine-start", "clock-reverse", "door-open"].includes(event.visual) && event.frames.length > 1) {
      setEventFrame(0, event.frames[0], clamp01((p - 0.04) / 0.2) * (1 - clamp01((p - 0.56) / 0.18)));
      setEventFrame(1, event.frames[1], clamp01((p - 0.46) / 0.24));
    } else if (["door-open", "machine-start", "clock-reverse"].includes(event.visual)) {
      setEventFrame(0, event.frames[0], clamp01((p - 0.04) / 0.34));
    } else {
      setEventFrame(0, event.frames[0], p);
    }
  }

  function fireEventBeat(event, beat, impact = null, audible = true) {
    if (!audible) return;
    const fired = eventBeatState.get(event.id) || new Set();
    if (fired.has(beat)) return;
    fired.add(beat);
    eventBeatState.set(event.id, fired);
    audio.playEventBeat(event, beat);
    if (impact) {
      els.monitorView.classList.remove("impact-soft", "impact-hard");
      void els.monitorView.offsetWidth;
      els.monitorView.classList.add(impact);
      window.setTimeout(() => els.monitorView.classList.remove(impact), 700);
    }
  }

  function ensureEventCue(event) {
    if (!event || eventCueState.has(event.id)) return;
    eventCueState.add(event.id);
    audio.playEventCue(event);
  }

  function fireDueBeats(event, beats, progress, hardBeats = new Set()) {
    const fired = eventBeatState.get(event.id) || new Set();
    const due = beats.filter(([point, beat]) => progress >= point && !fired.has(beat));
    if (!due.length) return;
    due.slice(0, -1).forEach(([, beat]) => fired.add(beat));
    eventBeatState.set(event.id, fired);
    const [, beat] = due[due.length - 1];
    fireEventBeat(event, beat, hardBeats.has(beat) ? "impact-hard" : "impact-soft");
  }

  function syncEventBeat(event, audible = true) {
    if (!audible) return;
    const p = eventVisualProgress(event);
    if (event.visual === "chair-fall" && p >= 0.2) fireEventBeat(event, "impact", "impact-hard", audible);
    if (event.visual === "window-break" && p >= 0.28) fireEventBeat(event, "impact", "impact-hard", audible);
    if (["shadow-walk", "shadow-rush"].includes(event.visual)) {
      fireDueBeats(event, [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92].map((point, index) => [point, `step-${index}`]), p);
    }
    const stagedBeats = {
      "light-flicker": [[0.08, "arc-1"], [0.28, "arc-2"], [0.52, "blackout"], [0.78, "surge"]],
      "pipe-drip": [[0.14, "drop-1"], [0.36, "drop-2"], [0.62, "reverse"], [0.86, "ceiling-hit"]],
      "stair-steps": [[0.12, "step-1"], [0.3, "step-2"], [0.5, "step-3"], [0.7, "step-4"], [0.88, "step-5"]],
      "wet-footprints": [[0.12, "step-1"], [0.3, "step-2"], [0.5, "step-3"], [0.7, "step-4"], [0.88, "step-5"]],
      "door-open": [[0.12, "handle"], [0.34, "creak"], [0.68, "open"], [0.9, "inside-breath"]],
      "machine-start": [[0.1, "click"], [0.3, "spin"], [0.56, "knock"], [0.82, "bang"]],
      "bed-curtain": [[0.18, "rustle"], [0.52, "breath"], [0.84, "head-turn"]],
      "clock-reverse": [[0.14, "tick-1"], [0.32, "tick-2"], [0.5, "tick-3"], [0.68, "tick-4"], [0.86, "tick-5"]],
      "self-turn": [[0.18, "breath"], [0.55, "neck"], [0.86, "look"]],
      "duty-extra": [[0.18, "breath"], [0.55, "whisper"], [0.86, "presence"]],
      "lobby-double": [[0.18, "presence"], [0.55, "split"], [0.86, "impact"]],
      "space-repeat": [[0.18, "slip"], [0.48, "repeat"], [0.82, "collapse"]]
    };
    fireDueBeats(event, stagedBeats[event.visual] || [], p, new Set(["surge", "ceiling-hit", "bang", "head-turn", "look", "presence", "impact", "collapse"]));
  }

  function queueCameraSource(source) {
    if (source === displayedCameraSource) {
      if (pendingCameraSource) {
        cameraRequestToken += 1;
        pendingCameraSource = null;
        els.monitorView.classList.remove("camera-switching");
        els.cameraImage.removeAttribute("aria-busy");
      }
      return;
    }
    if (source === pendingCameraSource) return;
    const token = ++cameraRequestToken;
    pendingCameraSource = source;
    els.monitorView.classList.add("camera-switching");
    els.cameraImage.setAttribute("aria-busy", "true");
    const record = imageRecords.get(source);
    const commit = () => {
      if (token !== cameraRequestToken) return;
      els.cameraImage.src = source;
      displayedCameraSource = source;
      pendingCameraSource = null;
      requestAnimationFrame(() => window.setTimeout(() => {
        if (token !== cameraRequestToken) return;
        els.monitorView.classList.remove("camera-switching");
        els.cameraImage.removeAttribute("aria-busy");
      }, 72));
    };
    if (record?.ready) commit();
    else preloadImage(source, true).then(commit);
  }

  function switchCamera(cameraId) {
    if (!cameras[cameraId] || sim.turning || cameraId === sim.currentCamera) return;
    // Clear overlays before changing the simulation camera so no event from the
    // previous feed survives for a frame on slower phones.
    els.eventFrames.forEach((frame) => { frame.style.opacity = "0"; });
    els.monitorView.classList.add("camera-switching");
    sim.setCamera(cameraId);
    audio.switchCamera();
    audio.loadSamples(criticalAudioSamples);
    audio.setScene(cameras[cameraId].ambient);
  }

  function report(event) {
    event.preventDefault();
    const form = new FormData(els.reportForm);
    const category = form.get("category");
    if (!category) { els.reportFeedback.textContent = "请选择异常类别。"; return; }
    const result = sim.report(els.reportCamera.value, category);
    els.reportFeedback.textContent = result.message;
    els.reportFeedback.style.color = result.ok ? "#9bc5a7" : "#d17c80";
    if (result.ok) {
      els.reportForm.reset();
      window.setTimeout(() => { els.reportFeedback.textContent = ""; closePhone(); }, 850);
    } else audio.phoneNotify("corrupt");
  }

  function showSelfCall() {
    els.callOverlay.classList.remove("hidden");
    els.callText.textContent = "正在呼叫……";
    audio.startRingtone();
  }

  function answerCall() {
    audio.stopRingtone();
    els.callText.textContent = "通话中 · 只有很轻的呼吸声";
    audio.breath(2);
    window.setTimeout(() => { audio.knock(); els.callText.textContent = "咚。　咚。　咚。"; }, 1900);
    window.setTimeout(() => {
      callOverride = true;
      els.callOverlay.classList.add("hidden");
      switchView("monitor");
      switchCamera("cam04");
      window.setTimeout(() => { callOverride = false; }, 6500);
    }, 3900);
  }

  function revealTurnChoice() {
    if (!promptPending || sim.ended) return;
    els.turnChoice.classList.remove("ready");
    els.turnChoice.classList.remove("hidden");
    audio.enterFinalChoice();
    window.setTimeout(() => {
      if (!els.turnChoice.classList.contains("hidden")) els.turnChoice.classList.add("ready");
    }, 5000);
  }

  function runTurnSequence() {
    audio.stopReportTension();
    els.turnChoice.classList.add("hidden");
    els.turnChoice.classList.remove("ready");
    els.turnSequence.classList.remove("hidden");
    els.turnSequence.classList.remove("no-turn");
    els.turnSequence.classList.add("turning");
    const survived = sim.correct >= 9 && sim.missed <= 7 && sim.danger < 68 && sim.trust > 30;
    els.turnImage.src = survived ? "assets/turn-good-v2.webp" : "assets/turn-bad-v2.webp";
    els.turnCaption.textContent = "你把手从鼠标上移开。屏幕在身后失去信号。";
    audio.turn();
    window.setTimeout(() => { els.turnCaption.textContent = "椅脚摩擦地面。你只转过了一半。"; }, 4600);
    window.setTimeout(() => { els.turnCaption.textContent = "门外没有敲门声了。房间里却多了一次呼吸。"; }, 9200);
    window.setTimeout(() => { els.turnCaption.textContent = survived ? "晨光从门缝里照进来。有人来接班了。" : "它一直站在你的椅子后面。"; }, 14000);
    window.setTimeout(() => sim.resolveTurn(), 18500);
  }

  function runNoTurnSequence() {
    audio.stopReportTension();
    els.turnChoice.classList.add("hidden");
    els.turnChoice.classList.remove("ready");
    promptPending = false;
    els.turnSequence.classList.remove("hidden", "turning");
    els.turnSequence.classList.add("no-turn");
    els.turnStart.src = els.cameraImage.src;
    els.turnCaption.textContent = "你决定相信屏幕。06:00之后，时间没有再动。";
    audio.holdGaze();
    window.setTimeout(() => { els.turnCaption.textContent = "监控逐路熄灭。脚步已经走进值班室。"; }, 6000);
    window.setTimeout(() => { els.turnCaption.textContent = "最后一块屏幕里，坐着的人慢慢抬起了头。"; }, 12000);
    window.setTimeout(() => sim.resolveNoTurn(), 18500);
  }

  function showEnding(kind, state) {
    audio.stopRingtone();
    audio.stopReportTension();
    audio.resolveEnding(kind);
    const endings = {
      dawn: ["SHIFT COMPLETE", "天亮了", "06:00。窗外的鸟叫重新变得普通。接班老师推门进来，监控恢复正常，像整晚什么都没发生。"],
      handoff: ["GOOD MORNING", "有人来接班", "你回头时，磨砂玻璃已经被晨光照亮。门外的人穿着宿管制服，问你为什么一直盯着一块黑掉的屏幕。"],
      watched: ["NO OPERATOR DETECTED", "下一任值班员", "你回头看见的不是门，而是 CAM 04 的镜头。第二天，新的值班员坐下时，画面角落里多了一个始终背对镜头的人。"]
    };
    const [kicker, title, text] = endings[kind] || endings.dawn;
    activeEndingKind = endings[kind] ? kind : "dawn";
    handoffSubmitted = false;
    els.handoffContent.value = "";
    els.handoffContent.disabled = false;
    els.handoffForm.querySelector("button[type=submit]").disabled = false;
    els.handoffCounter.textContent = "0 / 100";
    els.handoffNote.textContent = "";
    els.handoffNote.classList.remove("error");
    if (kind === "watched") localStorage.setItem(HOME_STATE_KEY, "1");
    els.endingKicker.textContent = kicker; els.endingTitle.textContent = title; els.endingText.textContent = text;
    els.endCorrect.textContent = state.correct; els.endWrong.textContent = state.wrong; els.endMissed.textContent = state.missed; els.endDanger.textContent = Math.round(state.danger);
    els.turnSequence.classList.add("hidden"); els.endingOverlay.classList.remove("hidden");
  }

  async function submitHandoff(event) {
    event.preventDefault();
    if (handoffSubmitted || !window.HandoffService) return;
    const content = els.handoffContent.value.trim();
    if (!content) {
      els.handoffNote.textContent = "请先写下一句话。";
      els.handoffNote.classList.add("error");
      return;
    }
    const submit = els.handoffForm.querySelector("button[type=submit]");
    submit.disabled = true;
    els.handoffNote.textContent = "正在写入值班记录……";
    els.handoffNote.classList.remove("error");
    try {
      await window.HandoffService.submit(content, activeEndingKind);
      handoffSubmitted = true;
      els.handoffContent.disabled = true;
      els.handoffNote.textContent = "留言已留在值班室。";
    } catch (error) {
      submit.disabled = false;
      els.handoffNote.textContent = error.message || "交班留言发送失败。";
      els.handoffNote.classList.add("error");
    }
  }

  async function startGame() {
    els.startGame.disabled = true;
    const oldText = els.startGame.innerHTML;
    els.startGame.textContent = "正在进入值班室……";
    await audio.setEnabled(true);
    // Warm real-world samples while the player is looking around the duty room.
    // The game can still continue if a browser refuses one optional clip.
    audio.loadSamples(criticalAudioSamples);
    els.startGame.innerHTML = oldText;
    els.audioCheckOverlay.classList.remove("hidden", "closing");
    window.requestAnimationFrame(() => els.confirmHeadphones.focus({ preventScroll: true }));
  }

  function finishAudioCheck() {
    if (audioPromptResolving) return;
    audioPromptResolving = true;
    els.confirmHeadphones.disabled = true;
    els.skipHeadphones.disabled = true;
    els.audioCheckOverlay.classList.add("closing");
    window.setTimeout(() => {
      els.audioCheckOverlay.classList.add("hidden");
      els.audioCheckOverlay.classList.remove("closing");
      els.startOverlay.classList.add("hidden");
      switchView("room");
      els.enterMonitor.focus({ preventScroll: true });
    }, 220);
  }

  async function beginShift(firstCamera = null) {
    if (sim.running || shiftStarting) return;
    shiftStarting = true;
    els.enterMonitor.disabled = true;
    els.enterMonitor.classList.add("syncing");
    const syncHint = els.enterMonitor.querySelector("small");
    const oldHint = syncHint?.textContent || "点击屏幕正式开始值班";
    if (syncHint) syncHint.textContent = "正在同步六路监控……";
    prepareHandoff();
    await cameraPreload;
    sim.start(performance.now());
    switchView("monitor");
    if (firstCamera) switchCamera(firstCamera);
    els.enterMonitor.classList.remove("syncing");
    if (syncHint) syncHint.textContent = oldHint;
    shiftStarting = false;
  }

  els.startGame.addEventListener("click", startGame);
  els.confirmHeadphones.addEventListener("click", finishAudioCheck);
  els.skipHeadphones.addEventListener("click", finishAudioCheck);
  els.enterMonitor.addEventListener("click", () => beginShift());
  els.monitorPhone.addEventListener("click", () => switchView("phone-messages"));
  els.closePhone.addEventListener("click", phoneBack);
  els.phoneHome.addEventListener("click", pressPhoneHome);
  document.querySelectorAll(".camera-dock [data-camera]").forEach((button) => button.addEventListener("click", () => switchCamera(button.dataset.camera)));
  document.querySelectorAll(".phone-tabs button").forEach((button) => button.addEventListener("click", () => setPhoneTab(button.dataset.tab)));
  els.reportForm.addEventListener("submit", report);
  els.answerCall.addEventListener("click", answerCall);
  els.declineCall.addEventListener("click", () => { audio.stopRingtone(); els.callOverlay.classList.add("hidden"); phone.addMessage({ sender: "自己", text: "你听见门外响了三下。", corrupt: true }); audio.knock(); });
  els.dontTurn.addEventListener("click", () => sim.chooseTurn(false));
  els.turnAround.addEventListener("click", () => sim.chooseTurn(true));
  els.handoffContent.addEventListener("input", () => { els.handoffCounter.textContent = `${Array.from(els.handoffContent.value).length} / 100`; });
  els.handoffForm.addEventListener("submit", submitHandoff);
  els.restart.addEventListener("click", () => location.reload());
  els.openSettings.addEventListener("click", () => els.settingsOverlay.classList.remove("hidden"));
  els.closeSettings.addEventListener("click", () => els.settingsOverlay.classList.add("hidden"));
  els.settingsForm.addEventListener("submit", (event) => { event.preventDefault(); readSettingsControls(); els.settingsOverlay.classList.add("hidden"); });
  [els.masterVolume, els.bgmVolume, els.sfxVolume, els.brightness, els.screenShake, els.visualNoise].forEach((control) => control.addEventListener("input", readSettingsControls));
  els.phoneView.addEventListener("pointerdown", (event) => { swipeStartY = event.clientY; });
  els.phoneView.addEventListener("pointerup", (event) => {
    if (swipeStartY !== null && event.clientY - swipeStartY > 90) closePhone();
    swipeStartY = null;
  });
  document.addEventListener("keydown", (event) => {
    if (!els.audioCheckOverlay.classList.contains("hidden")) {
      if (event.key === "Enter") { event.preventDefault(); finishAudioCheck(); }
      else if (event.key === "Escape") { event.preventDefault(); finishAudioCheck(); }
      return;
    }
    if (!els.guestbookOverlay.classList.contains("hidden")) return;
    if (["1", "2", "3", "4", "5", "6"].includes(event.key) && !sim.ended && !sim.finalStage) {
      const camera = `cam0${event.key}`;
      if (!sim.running && els.startOverlay.classList.contains("hidden")) beginShift(camera);
      else if (sim.running) { if (sim.view !== "monitor") switchView("monitor"); switchCamera(camera); }
    } else if ((event.key === "r" || event.key === "R") && sim.running) switchView("phone-report");
    else if (event.key === "Escape" && sim.view.startsWith("phone")) closePhone(true);
    else if (event.key === "Escape" && !els.settingsOverlay.classList.contains("hidden")) els.settingsOverlay.classList.add("hidden");
  });
  [els.dontTurn, els.turnAround].forEach((button) => button.addEventListener("pointerenter", () => audio.choiceHover()));

  let lastAmbientWarning = -1;
  let lastSimulationFrame = 0;
  function loop(now) {
    if (lastSimulationFrame && now - lastSimulationFrame < 1000 / 30) {
      requestAnimationFrame(loop);
      return;
    }
    lastSimulationFrame = now;
    sim.step(now);
    const currentMinute = Math.floor(sim.minute);
    if (currentMinute > 210 && currentMinute % 37 === 0 && currentMinute !== lastAmbientWarning) {
      lastAmbientWarning = currentMinute;
      audio.doorHandle();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  render(sim.snapshot());
})();
