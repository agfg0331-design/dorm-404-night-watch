(function () {
  "use strict";

  const { events, narrative } = window.GameContent;
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
      this.minuteMs = options.minuteMs || 1800;
      this.startMinute = options.startMinute || 0;
      const providedSeed = Number(options.seed);
      this.seed = Number.isFinite(providedSeed) ? Math.trunc(providedSeed) : Math.floor(Math.random() * 99999);
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
        { id: "final-phone", at: at(276, 13, 0x50484f54), channel: "phone", role: "evidence", message: { ...phone } },
        { id: "final-sound", at: at(315, 15, 0x534e4441), channel: "sound", role: "evidence", cue: sound },
        { id: "final-misdirect", at: at(334, 8, 0x4d495354), channel: "phone", role: "interference", message: { ...mislead } }
      ];
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
      this.turnPrompted = false;
      this.finalStage = false;
      this.turning = false;
      this.finalDecision = null;
      this.finalCameraCue = null;
      this.firedNarrative = new Set();
      this.firedFinalClues = new Set();
      this.eventQueue = events.map((event, index) => {
        const leadOffset = event.start >= 280 ? -0.35 : -0.65;
        return {
          ...event,
          lead: { ...event.lead, offset: leadOffset },
          actualStart: clamp(event.start + this.jitter(index, event.jitter), 5, 340),
          leadSent: false,
          state: "waiting",
          progress: 0,
          seenChanging: false,
          reported: false
        };
      }).sort((a, b) => a.actualStart - b.actualStart);
      this.activeEvents = [];
      this.lastFrame = 0;
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
      this.callbacks.onStart?.(this.snapshot());
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
      if (this.finalStage) return 0;
      if (this.view === "phone-report") return 0.42;
      if (this.turning) return 0.12;
      return 1;
    }

    step(now) {
      if (!this.running || this.ended) return;
      if (!this.lastFrame) this.lastFrame = now;
      const elapsed = Math.min(250, now - this.lastFrame);
      this.lastFrame = now;
      this.minute += (elapsed / this.minuteMs) * this.timeScale;
      const floorMinute = Math.floor(this.minute);
      if (floorMinute !== this.lastMinute) {
        this.lastMinute = floorMinute;
        this.processNarrative();
        this.processFinalClues();
        this.processMilestones();
      }
      if (this.finalStage) {
        this.callbacks.onTick?.(this.snapshot());
        return;
      }
      this.processEvents();
      this.callbacks.onTick?.(this.snapshot());
      if (this.minute >= 360 && !this.turning && !this.finalStage) this.finish("dawn");
    }

    processNarrative() {
      narrative.forEach((item) => {
        if (this.minute >= item.at && !this.firedNarrative.has(item.id)) {
          this.firedNarrative.add(item.id);
          this.pushMessage(item);
        }
      });
    }

    processFinalClues() {
      this.#finalPlan.forEach((clue) => {
        if (this.minute < clue.at || this.firedFinalClues.has(clue.id)) return;
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
        this.callbacks.onMonitorFail?.(this.snapshot());
        this.pushMessage({ sender: "值班系统", text: "CAMERA FEED INTERRUPTED", corrupt: true });
      }
      if (this.minute >= 347 && !this.firedNarrative.has("self-call")) {
        this.firedNarrative.add("self-call");
        this.callbacks.onSelfCall?.(this.snapshot());
      }
      if (this.minute >= 353 && !this.turnPrompted) {
        this.turnPrompted = true;
        this.finalStage = true;
        this.minute = 360;
        this.pushMessage({ sender: "自己", text: "屏幕和门外，只能有一个是真的。", corrupt: true });
        this.callbacks.onTurnPrompt?.(this.snapshot());
      }
    }

    processEvents() {
      this.eventQueue.forEach((event) => {
        // Linked chat messages should lead players to an anomaly, not make them
        // stare at an unchanged feed for seven or eight real seconds.
        const messageLead = Math.max(event.lead.offset, -1.2);
        if (!event.leadSent && this.minute >= event.actualStart + messageLead) {
          event.leadSent = true;
          this.pushMessage({ sender: event.lead.sender, text: event.lead.text, suspicious: event.lead.kind === "false", linkedEvent: event.id });
        }
        if (event.state === "waiting" && this.minute >= event.actualStart) {
          event.state = "changing";
          this.activeEvents.push(event);
          this.callbacks.onEventStart?.(event, this.snapshot());
        }
      });

      this.activeEvents.slice().forEach((event) => {
        if (event.reported || event.state === "missed") return;
        event.progress = clamp((this.minute - event.actualStart) / event.duration, 0, 1);
        event.state = event.progress < 1 ? "changing" : "complete";
        if (this.view === "monitor" && this.currentCamera === event.camera && event.state === "changing") event.seenChanging = true;
        if (this.minute >= event.actualStart + event.duration + event.grace) this.missEvent(event);
      });
      this.activeEvents = this.activeEvents.filter((event) => !event.reported && event.state !== "missed");
    }

    markVisibleEvents() {
      this.activeEvents.forEach((event) => {
        if (event.camera === this.currentCamera && event.state === "changing") event.seenChanging = true;
      });
    }

    report(camera, category) {
      const match = this.activeEvents.find((event) => !event.reported && event.camera === camera && event.category === category);
      if (match) {
        match.reported = true;
        this.correct += 1;
        this.danger = clamp(this.danger - 7, 0, 100);
        this.trust = clamp(this.trust + 2, 0, 100);
        this.callbacks.onReport?.({ ok: true, event: match }, this.snapshot());
        return { ok: true, message: "上报已受理。保持观察。", event: match };
      }
      this.wrong += 1;
      this.trust = clamp(this.trust - 13, 0, 100);
      this.danger = clamp(this.danger + 3, 0, 100);
      this.callbacks.onReport?.({ ok: false }, this.snapshot());
      return { ok: false, message: this.minute > 250 ? "没有异常。你看错了。" : "未找到对应异常。系统信任下降。" };
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
      return this.activeEvents.find((event) => event.camera === this.currentCamera && !event.reported) || null;
    }

    snapshot() {
      return {
        minute: this.minute, view: this.view, currentCamera: this.currentCamera,
        danger: this.danger, trust: this.trust, correct: this.correct, wrong: this.wrong,
        missed: this.missed, unread: this.unread, monitorFailed: this.monitorFailed,
        turnPrompted: this.turnPrompted, finalStage: this.finalStage, turning: this.turning, ended: this.ended,
        finalDecision: this.finalDecision,
        finalCameraCue: this.finalCameraCue ? { ...this.finalCameraCue } : null,
        visibleEvent: this.getVisibleEvent(), activeEvents: this.activeEvents
      };
    }
  }

  window.NightShiftSimulation = NightShiftSimulation;
})();
