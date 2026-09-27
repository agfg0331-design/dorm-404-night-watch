(function () {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const FINAL_CHOICES = Object.freeze({ TURN: "TURN", STAY: "STAY" });
  const FINAL_ROUTES = Object.freeze({
    TURN: {
      camera: { mode: "desk-empty", status: "CAM 04 / FRAME HOLD 03:17" },
      phone: [
        { sender: "门卫老陈", text: "值班室那路画面要是只剩空椅，先别拿录像确认自己。那路监控比屋里慢了不止一拍。" },
        { sender: "门卫老陈", text: "CAM 04里的人影如果和你对不上，先相信值班室里能听见的动静。" }
      ],
      sound: ["handoff-pattern", "key-and-knock"],
      mislead: [
        { sender: "自己", text: "门外的声音是屏幕放出来的。别把视线移开。", corrupt: true },
        { sender: "未知号码", text: "只要继续看着监控，它就进不来。", corrupt: true }
      ]
    },
    STAY: {
      camera: { mode: "desk-synced", status: "CAM 04 / MOTION SYNC" },
      phone: [
        { sender: "门卫老陈", text: "我还在一楼门卫室。六点十分前，不会有人拿钥匙进值班室。" },
        { sender: "门卫老陈", text: "我和接班老师都在一楼，六点十分才会上来。六点前，值班室外不该有人敲门。" }
      ],
      sound: ["false-entry", "steps-at-door"],
      mislead: [
        { sender: "自己", text: "接班的人已经到了。听见敲门就确认一下。", corrupt: true },
        { sender: "未知号码", text: "门外是来接班的老师。别让他等太久。", corrupt: true }
      ]
    }
  });

  class NightShiftSimulation {
    #safeFinalChoice;
    #finalPlan;

    constructor(options = {}) {
      this.callbacks = options.callbacks || {};
      this.baseMinuteMs = options.minuteMs || 470000 / 360;
      this.quickMode = Boolean(options.quickMode);
      this.phoneSpacingMs = this.scaleMessageDelay(8000);
      this.leadSpacingMs = this.scaleMessageDelay(3000);
      this.criticalMessageHorizonMs = this.scaleMessageDelay(4500);
      this.minuteMs = this.baseMinuteMs;
      this.startMinute = options.startMinute || 0;
      const providedSeed = Number(options.seed);
      this.seed = Number.isFinite(providedSeed) ? Math.trunc(providedSeed) : Math.floor(Math.random() * 99999);
      this.shift = options.shift || window.GameContent.createShift(this.seed, options.sceneIds);
      this.cameras = this.shift.cameras;
      this.sceneIds = this.shift.sceneIds;
      this.#safeFinalChoice = this.#seededUnit(0x46494e41) < 0.5 ? FINAL_CHOICES.TURN : FINAL_CHOICES.STAY;
      this.#finalPlan = this.#buildFinalPlan();
      this.reset();
    }

    #seededUnit(salt) {
      let value = (this.seed ^ salt) >>> 0;
      value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
      value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
      return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
    }

    #seededIndex(length, salt) {
      return Math.min(length - 1, Math.floor(this.#seededUnit(salt) * length));
    }

    #buildFinalPlan() {
      const route = FINAL_ROUTES[this.#safeFinalChoice];
      const phone = route.phone[this.#seededIndex(route.phone.length, 0x50484f4e)];
      const sound = route.sound[this.#seededIndex(route.sound.length, 0x534f554e)];
      const mislead = route.mislead[this.#seededIndex(route.mislead.length, 0x4d49534c)];
      const at = (base, span, salt) => base + Math.floor(this.#seededUnit(salt) * span);
      return [
        { id: "final-camera", at: at(244, 7, 0x43414d34), channel: "camera", role: "evidence", cue: { ...route.camera } },
        { id: "final-phone", at: at(286, 11, 0x50484f54), channel: "phone", role: "evidence", message: { ...phone } },
        { id: "final-sound", at: this.#seededUnit(0x4441574e) < 0.5 ? 308 : at(315, 15, 0x534e4441), channel: "sound", role: "evidence", cue: sound },
        { id: "final-misdirect", at: at(334, 8, 0x4d495354), channel: "phone", role: "interference", message: { ...mislead } }
      ];
    }

    scaleMessageDelay(ms) {
      return this.quickMode ? Math.max(150, Math.round(ms * this.baseMinuteMs / (470000 / 360))) : ms;
    }

    ordinaryMessageSpacing() {
      if (this.minute < 100) return this.phoneSpacingMs;
      if (this.minute < 250) return this.scaleMessageDelay(5000 + Math.floor(this.#seededUnit(0x4d494450) * 1000));
      return this.scaleMessageDelay(this.minute < 300 ? 7500 : 9500);
    }

    reset() {
      this.minute = this.startMinute;
      this.lastMinute = Math.floor(this.minute);
      this.running = false;
      this.ended = false;
      this.view = "room";
      this.currentCamera = "cam01";
      this.danger = 8;
      this.trust = 100;
      this.correct = 0;
      this.wrong = 0;
      this.missed = 0;
      this.unread = 0;
      this.monitorFailed = false;
      this.fakeDawnPlanned = this.#seededUnit(0x4441574e) < 0.5;
      // The protected 25-second dawn advances eight game minutes. Keep its
      // full shift only about 15 seconds longer than an ordinary shift.
      this.minuteMs = this.fakeDawnPlanned && !this.quickMode ? 462000 / 352 : this.baseMinuteMs;
      this.fakeDawnStage = "idle";
      this.fakeDawnStartedAt = 0;
      this.fakeDawnAnchor = 316;
      this.fakeDawnProgress = 0;
      this.terminalStage = false;
      this.turnPrompted = false;
      this.finalStage = false;
      this.turning = false;
      this.finalDecision = null;
      this.finalCameraCue = null;
      this.firedNarrative = new Set();
      this.firedFinalClues = new Set();
      this.firedInterference = new Set();
      this.pendingOrdinaryMessages = [];
      this.lastPhoneMessageAt = -Infinity;
      this.messageNow = 0;
      // Four seeded windows, ending before the final third of the shift.
      this.interferencePlan = [[75, 21], [120, 26], [165, 26], [205, 26]].map(([base, span], index) => ({
        at: base + Math.floor(this.#seededUnit(0x494e4600 + index) * span), index
      }));
      this.eventQueue = this.shift.events.map((event, index) => {
        let actualStart = clamp(event.start + this.jitter(index, event.jitter), 5, 340);
        // Preserve every anomaly, but bring any late one that would cross the
        // 05:20 quiet window forward. Nothing is spawned or missed on the false
        // daylight, and the final phone beat remains uncrowded.
        if (this.fakeDawnPlanned && actualStart < 325 && actualStart + event.duration + event.grace > 315) {
          actualStart = 315 - event.duration - event.grace;
        }
        const early = actualStart < 120;
        const priority = event.hintPriority || "standard";
        const late = actualStart >= 260;
        const hintChance = {
          essential: 1,
          featured: late ? 0.78 : 0.88,
          standard: late ? 0.48 : 0.66,
          subtle: late ? 0.32 : 0.48
        }[priority];
        const silent = !early && this.#seededUnit(0x53494c00 + index) >= hintChance;
        // Early notices and important multi-stage notices point to the actual
        // feed even if the original scene text was an intentional false lead.
        const lead = (early || priority === "essential" || priority === "featured") && event.lead.kind === "false"
          ? { sender: "值班系统", text: `${this.cameras[event.camera].code}（${this.cameras[event.camera].name}）的记录与巡楼登记不一致，需人工复核。`, kind: "real" }
          : { ...event.lead };
        const feed = this.cameras[event.camera];
        if (priority === "essential" && !lead.text.includes(feed.code) && !lead.text.includes(feed.name)) {
          lead.text = `${feed.code}（${feed.name}）：${lead.text}`;
        }
        return {
          ...event,
          lead: { ...lead, offset: early ? -4.5 : priority === "essential" ? -5 : priority === "featured" ? -4 : -2.8 },
          actualStart,
          leadSent: silent,
          leadQueued: false,
          silent,
          state: "waiting",
          progress: 0,
          seenChanging: false,
          reported: false,
          resolvingUntil: 0
        };
      }).sort((a, b) => a.actualStart - b.actualStart);
      // Reserve space around the final phone clue for important scheduled
      // notices. The clue still stays inside 04:46–04:56.
      const finalPhone = this.#finalPlan.find((clue) => clue.id === "final-phone");
      const clearOfImportantLeads = (minute) => this.eventQueue.every((event) => !["essential", "featured"].includes(event.hintPriority) ||
        Math.abs(event.actualStart + event.lead.offset - minute) >= 4);
      if (!clearOfImportantLeads(finalPhone.at)) {
        const alternatives = Array.from({ length: 11 }, (_, index) => 286 + index)
          .filter(clearOfImportantLeads).sort((a, b) => Math.abs(a - finalPhone.at) - Math.abs(b - finalPhone.at) || a - b);
        if (alternatives.length) finalPhone.at = alternatives[0];
      }
      this.activeEvents = [];
      this.lastFrame = 0;
      this.pausedUntil = 0;
      this.callbacks.onReset?.(this.snapshot());
    }

    jitter(index, amount) {
      if (!amount) return 0;
      const x = Math.sin((this.seed + index * 47) * 12.9898) * 43758.5453;
      return Math.round(((x - Math.floor(x)) * 2 - 1) * amount);
    }

    start(now = performance.now()) {
      this.running = true;
      this.lastFrame = now;
      this.messageNow = now;
      this.callbacks.onStart?.(this.snapshot());
    }

    pauseFor(duration, now = performance.now()) {
      this.pausedUntil = Math.max(this.pausedUntil, now + duration);
    }

    setView(view) {
      this.view = view;
      if (view === "phone-messages") this.readPhone();
      this.callbacks.onView?.(view, this.snapshot());
    }

    setCamera(camera) {
      this.currentCamera = camera;
      this.markVisibleEvents();
      this.callbacks.onCamera?.(camera, this.snapshot());
    }

    get timeScale() {
      if (this.finalStage || this.terminalStage || this.fakeDawnStage === "bright") return 0;
      if (this.view === "phone-report") return 0.3;
      if (this.view === "phone-messages") return 0.65;
      if (this.turning) return 0.12;
      return 1;
    }

    step(now) {
      if (!this.running || this.ended) return;
      this.messageNow = now;
      if (!this.lastFrame) this.lastFrame = now;
      const elapsed = Math.min(250, now - this.lastFrame);
      this.lastFrame = now;
      if (["pre", "bright", "post"].includes(this.fakeDawnStage)) {
        this.advanceFakeDawn(now);
        this.callbacks.onTick?.(this.snapshot());
        return;
      }
      if (now < this.pausedUntil) {
        this.callbacks.onTick?.(this.snapshot());
        return;
      }
      this.minute += (elapsed / this.minuteMs) * this.timeScale;
      if (this.fakeDawnPlanned && this.fakeDawnStage === "idle" && this.minute >= 316 && this.minute < 334 &&
          (!this.callbacks.canStartFakeDawn || this.callbacks.canStartFakeDawn(now))) {
        this.fakeDawnAnchor = this.minute < 316.5 ? 316 : this.minute;
        this.minute = this.fakeDawnAnchor;
        this.lastMinute = Math.floor(this.minute);
        this.fakeDawnStage = "pre";
        this.fakeDawnStartedAt = now;
        this.callbacks.onFakeDawn?.("pre", this.snapshot());
        this.callbacks.onTick?.(this.snapshot());
        return;
      }
      const floorMinute = Math.floor(this.minute);
      if (floorMinute !== this.lastMinute) {
        this.lastMinute = floorMinute;
        this.processNarrative();
        this.processInterference();
        this.processMilestones();
      }
      this.processFinalClues();
      if (this.finalStage || this.terminalStage) {
        this.callbacks.onTick?.(this.snapshot());
        return;
      }
      this.processEvents();
      this.flushOrdinaryMessages();
      this.callbacks.onTick?.(this.snapshot());
      if (this.minute >= 360 && !this.turning && !this.finalStage) this.finish("dawn");
    }

    advanceFakeDawn(now) {
      const elapsed = Math.max(0, now - this.fakeDawnStartedAt);
      const stage = elapsed < 5000 ? "pre" : elapsed < 20000 ? "bright" : elapsed < 25000 ? "post" : "done";
      this.minute = stage === "pre" ? this.fakeDawnAnchor + Math.min(1, elapsed / 5000) * 4
        : stage === "bright" ? this.fakeDawnAnchor + 4
          : this.fakeDawnAnchor + 4 + Math.min(1, (elapsed - 20000) / 5000) * 4;
      this.lastMinute = Math.floor(this.minute);
      const visualTime = elapsed - 5000;
      this.fakeDawnProgress = stage === "bright"
        ? visualTime < 3500 ? visualTime / 3500 : visualTime < 11000 ? 1 : Math.max(0, (15000 - visualTime) / 4000)
        : 0;
      if (stage === this.fakeDawnStage) return;
      this.fakeDawnStage = stage;
      this.callbacks.onFakeDawn?.(stage, this.snapshot());
    }

    processNarrative() {
      this.shift.narrative.forEach((item) => {
        if (this.minute >= item.at && !this.firedNarrative.has(item.id)) {
          this.firedNarrative.add(item.id);
          this.queueOrdinaryMessage({ ...item }, 25, 1);
        }
      });
    }

    processInterference() {
      this.interferencePlan.forEach(({ at, index }) => {
        if (this.minute < at || this.firedInterference.has(index)) return;
        this.firedInterference.add(index);
        this.pendingOrdinaryMessages.push({ index, expiresAt: Math.min(at + 18, [100, 150, 195, 240][index]), priority: 3 });
      });
    }

    createInterference(index) {
      const cameras = Object.keys(this.cameras);
      const active = this.activeEvents.find((event) => !event.reported && !event.resolvingUntil && event.state !== "missed");
      const empty = cameras.filter((camera) => !this.activeEvents.some((event) => event.camera === camera && !event.reported));
      const emptyCamera = empty[this.#seededIndex(empty.length, 0x43414d00 + index)];
      const emptyFeed = this.cameras[emptyCamera];
      if (index % 2 === 0 && emptyFeed) {
        return index === 0
          ? { sender: "值班系统", text: `${emptyFeed.code}（${emptyFeed.name}）检测到短时人员活动，请核对画面。`, suspicious: true, interference: true }
          : { sender: "405 张同学", text: `我刚才看到 ${emptyFeed.name} 那边有人经过，你看到了吗？`, suspicious: true, interference: true };
      }
      if (index % 2 === 1 && active) {
        const activeFeed = this.cameras[active.camera];
        return index === 3
          ? { sender: "值班系统", text: `${activeFeed.code}（${activeFeed.name}）现场复核无异常。`, suspicious: true, interference: true }
          : { sender: "值班系统", text: `${activeFeed.code}（${activeFeed.name}）画面状态正常。`, suspicious: true, interference: true };
      }
      return null;
    }

    queueOrdinaryMessage(message, lifetimeMinutes = 20, priority = 2) {
      this.pendingOrdinaryMessages.push({ message, expiresAt: this.minute + lifetimeMinutes, priority });
    }

    flushOrdinaryMessages() {
      if (this.callbacks.canSendOrdinaryMessage?.() === false) return;
      this.pendingOrdinaryMessages = this.pendingOrdinaryMessages.filter((entry) => this.minute <= entry.expiresAt);
      if (this.messageNow - this.lastPhoneMessageAt < this.ordinaryMessageSpacing() || !this.pendingOrdinaryMessages.length) return;
      // If a lead or final clue is seconds away, let it speak first. Neither
      // the clue nor the anomaly itself waits for an ordinary phone message.
      const horizon = this.minute + this.criticalMessageHorizonMs / this.minuteMs;
      if (this.eventQueue.some((event) => !event.leadSent && event.actualStart + event.lead.offset > this.minute &&
          event.actualStart + event.lead.offset <= horizon) ||
          this.#finalPlan.some((clue) => clue.channel === "phone" && !this.firedFinalClues.has(clue.id) &&
            clue.at > this.minute && clue.at <= horizon)) return;
      this.pendingOrdinaryMessages.sort((a, b) => a.priority - b.priority);
      for (let index = 0; index < this.pendingOrdinaryMessages.length; index++) {
        const entry = this.pendingOrdinaryMessages[index];
        const message = entry.message || this.createInterference(entry.index);
        if (!message) continue;
        this.pendingOrdinaryMessages.splice(index, 1);
        this.pushMessage(message);
        return;
      }
    }

    processFinalClues() {
      this.#finalPlan.forEach((clue) => {
        if (this.minute < clue.at || this.firedFinalClues.has(clue.id)) return;
        if (clue.channel === "phone" && this.callbacks.canSendAnomalyLead?.() === false) return;
        this.firedFinalClues.add(clue.id);
        if (clue.channel === "camera") this.finalCameraCue = { ...clue.cue };
        if (clue.channel === "phone") this.pushMessage({ ...clue.message });
        this.callbacks.onFinalClue?.({
          id: clue.id,
          at: clue.at,
          channel: clue.channel,
          role: clue.role,
          cue: typeof clue.cue === "object" ? { ...clue.cue } : clue.cue,
          message: clue.message ? { ...clue.message } : null
        }, this.snapshot());
      });
    }

    processMilestones() {
      if (this.minute >= 342 && !this.monitorFailed) {
        this.monitorFailed = true;
        this.terminalStage = true;
        this.callbacks.onMonitorFail?.(this.snapshot());
      }
      // The final call begins after the phone effect and ten seconds of real
      // silence. It is not tied to the accelerated clock anymore.
    }

    beginFinalCall() {
      if (!this.terminalStage || this.firedNarrative.has("self-call") || this.ended) return;
      this.firedNarrative.add("self-call");
      this.callbacks.onSelfCall?.(this.snapshot());
    }

    promptTurn() {
      if (this.turnPrompted || this.ended) return;
      this.turnPrompted = true;
      this.finalStage = true;
      this.minute = 360;
      this.pushMessage({ sender: "自己", text: "屏幕和门外，只能有一个是真的。", corrupt: true });
      this.callbacks.onTurnPrompt?.(this.snapshot());
    }

    processEvents() {
      this.eventQueue.forEach((event) => {
        if (!event.leadSent && this.minute >= event.actualStart + event.lead.offset) event.leadQueued = true;
        if (event.state === "waiting" && this.minute >= event.actualStart) {
          event.state = "changing";
          this.activeEvents.push(event);
          this.callbacks.onEventStart?.(event, this.snapshot());
        }
      });

      this.flushAnomalyLeads();

      this.activeEvents.slice().forEach((event) => {
        if (event.reported) return;
        if (event.resolvingUntil) {
          if (performance.now() >= event.resolvingUntil) event.reported = true;
          return;
        }
        if (event.state === "missed") return;
        event.progress = clamp((this.minute - event.actualStart) / event.duration, 0, 1);
        event.state = event.progress < 1 ? "changing" : "complete";
        if (this.view === "monitor" && this.currentCamera === event.camera && event.state === "changing") event.seenChanging = true;
        if (this.minute >= event.actualStart + event.duration + event.grace) this.missEvent(event);
      });
      this.activeEvents = this.activeEvents.filter((event) => !event.reported);
    }

    flushAnomalyLeads() {
      if (this.callbacks.canSendAnomalyLead?.() === false) return;
      const order = { essential: 0, featured: 1, standard: 2, subtle: 3 };
      const pending = this.eventQueue.filter((event) => event.leadQueued && !event.leadSent)
        .sort((a, b) => order[a.hintPriority] - order[b.hintPriority] || a.actualStart - b.actualStart);
      for (const event of pending) {
        const priority = event.hintPriority || "standard";
        const sinceLast = this.messageNow - this.lastPhoneMessageAt;
        const leadAt = event.actualStart + event.lead.offset;
        const waitedMs = (this.minute - leadAt) * this.minuteMs;
        const deadline = priority === "essential" ? event.actualStart - 0.1
          : priority === "featured" ? event.actualStart + 0.5 : event.actualStart;
        if (this.minute > event.actualStart + event.duration + event.grace ||
            ((priority === "standard" || priority === "subtle") && this.minute > deadline)) {
          event.leadSent = true;
          continue;
        }
        // A subtle hint is expendable when the phone is busy. Keep the
        // anomaly itself untouched; essential hints always retain their slot.
        if (priority === "subtle" && sinceLast < this.leadSpacingMs) {
          event.leadSent = true;
          continue;
        }
        const imminentFinal = this.#finalPlan.some((clue) => clue.channel === "phone" && !this.firedFinalClues.has(clue.id) &&
          clue.at >= this.minute && clue.at - this.minute <= this.criticalMessageHorizonMs / this.minuteMs);
        if ((priority === "standard" || priority === "subtle") && imminentFinal) continue;
        if (sinceLast < this.leadSpacingMs && this.minute < deadline &&
            (priority !== "featured" || waitedMs < this.scaleMessageDelay(2800))) continue;
        // Even when two early essential notices share a deadline, never buzz
        // twice in the same second. Their offsets give them room to queue.
        if (sinceLast < this.scaleMessageDelay(1000)) continue;
        event.leadSent = true;
        this.pushMessage({ sender: event.lead.sender, text: event.lead.text, suspicious: event.lead.kind === "false", linkedEvent: event.id });
        break;
      }
    }

    markVisibleEvents() {
      this.activeEvents.forEach((event) => {
        if (event.camera === this.currentCamera && event.state === "changing") event.seenChanging = true;
      });
    }

    report(camera, category) {
      // When two events share a camera and category, resolve the one currently
      // shown on the feed before an older missed event behind it.
      const match = this.activeEvents.slice().reverse().find((event) => !event.reported && !event.resolvingUntil && event.camera === camera && event.category === category);
      if (match) {
        match.resolvingUntil = performance.now() + 2800 + this.#seededUnit(0x52455000 + this.correct) * 1500;
        this.correct += 1;
        this.danger = clamp(this.danger - 7, 0, 100);
        this.trust = clamp(this.trust + 2, 0, 100);
        this.callbacks.onReport?.({ ok: true, event: match }, this.snapshot());
        return { ok: true, message: "报告已提交", event: match };
      }
      this.wrong += 1;
      this.trust = clamp(this.trust - 13, 0, 100);
      this.danger = clamp(this.danger + 3, 0, 100);
      this.callbacks.onReport?.({ ok: false }, this.snapshot());
      return { ok: false, message: "报告已提交" };
    }

    missEvent(event) {
      event.state = "missed";
      this.missed += 1;
      this.danger = clamp(this.danger + event.severity, 0, 100);
      this.trust = clamp(this.trust - 2, 0, 100);
      this.callbacks.onMiss?.(event, this.snapshot());
    }

    pushMessage(message) {
      this.unread += 1;
      this.lastPhoneMessageAt = this.messageNow || performance.now();
      this.callbacks.onMessage?.(message, this.snapshot());
    }

    readPhone() {
      this.unread = 0;
      this.callbacks.onReadPhone?.(this.snapshot());
    }

    chooseTurn(turn) {
      if (this.turning || this.ended) return;
      this.turning = true;
      this.finalDecision = turn ? FINAL_CHOICES.TURN : FINAL_CHOICES.STAY;
      const resolution = this.#finalResolution(this.finalDecision);
      if (!turn) {
        this.callbacks.onTurnDeclined?.(this.snapshot(), resolution);
        return;
      }
      this.callbacks.onTurnStart?.(this.snapshot(), resolution);
    }

    #performancePassed() {
      return this.correct >= 9 && this.missed <= 7 && this.danger < 68 && this.trust > 30;
    }

    #finalResolution(choice) {
      const performancePassed = this.#performancePassed();
      const choiceCorrect = choice === this.#safeFinalChoice;
      let endingKind = "watched";
      if (performancePassed && choiceCorrect) endingKind = choice === FINAL_CHOICES.TURN ? "handoff" : "dawn";
      return { endingKind, performancePassed, choiceCorrect };
    }

    resolveTurn() {
      this.finalDecision = FINAL_CHOICES.TURN;
      this.finish(this.#finalResolution(FINAL_CHOICES.TURN).endingKind);
    }

    resolveNoTurn() {
      this.finalDecision = FINAL_CHOICES.STAY;
      this.finish(this.#finalResolution(FINAL_CHOICES.STAY).endingKind);
    }

    finish(kind) {
      if (this.ended) return;
      this.ended = true;
      this.running = false;
      this.callbacks.onEnding?.(kind, this.snapshot());
    }

    getVisibleEvent() {
      if (["pre", "bright", "post"].includes(this.fakeDawnStage)) return null;
      // Once missed, the earlier CAM 04 figure gives way to the final camera
      // clue. It stays in activeEvents and remains reportable from the phone.
      const candidates = this.activeEvents.filter((event) => event.camera === this.currentCamera && !event.reported &&
        !(this.currentCamera === "cam04" && this.finalCameraCue && event.id === "duty-self" && event.state === "missed"));
      // An older missed anomaly stays reportable, but never hides a newer event
      // on the same feed. Other missed events remain visible in quiet gaps.
      return candidates.filter((event) => event.state !== "missed").at(-1) || candidates.at(-1) || null;
    }

    snapshot() {
      return {
        minute: this.minute, view: this.view, currentCamera: this.currentCamera,
        sceneIds: [...this.sceneIds],
        danger: this.danger, trust: this.trust, correct: this.correct, wrong: this.wrong,
        missed: this.missed, unread: this.unread, monitorFailed: this.monitorFailed,
        fakeDawnPlanned: this.fakeDawnPlanned, fakeDawnStage: this.fakeDawnStage, fakeDawnProgress: this.fakeDawnProgress,
        turnPrompted: this.turnPrompted, finalStage: this.finalStage, turning: this.turning, ended: this.ended,
        finalDecision: this.finalDecision,
        finalCameraCue: this.finalCameraCue ? { ...this.finalCameraCue } : null,
        visibleEvent: this.getVisibleEvent(), activeEvents: this.activeEvents
      };
    }
  }

  window.NightShiftSimulation = NightShiftSimulation;
})();
