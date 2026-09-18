(function () {
  "use strict";

  const { events, narrative } = window.GameContent;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  class NightShiftSimulation {
    constructor(options = {}) {
      this.callbacks = options.callbacks || {};
      this.minuteMs = options.minuteMs || 1800;
      this.startMinute = options.startMinute || 0;
      this.seed = options.seed || Math.floor(Math.random() * 99999);
      this.reset();
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
      this.firedNarrative = new Set();
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

    processMilestones() {
      if (this.minute >= 342 && !this.monitorFailed) {
        this.monitorFailed = true;
        this.callbacks.onMonitorFail?.(this.snapshot());
        this.pushMessage({ sender: "自己", text: "不要相信时间戳。它在门外。", corrupt: true });
      }
      if (this.minute >= 347 && !this.firedNarrative.has("self-call")) {
        this.firedNarrative.add("self-call");
        this.callbacks.onSelfCall?.(this.snapshot());
      }
      if (this.minute >= 353 && !this.turnPrompted) {
        this.turnPrompted = true;
        this.finalStage = true;
        this.minute = 360;
        this.pushMessage({ sender: "自己", text: "不要回头看。", corrupt: true });
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
      if (!turn) {
        this.callbacks.onTurnDeclined?.(this.snapshot());
        return;
      }
      this.callbacks.onTurnStart?.(this.snapshot());
    }

    resolveTurn() {
      const survived = this.correct >= 9 && this.missed <= 7 && this.danger < 68 && this.trust > 30;
      this.finish(survived ? "handoff" : "watched");
    }

    resolveNoTurn() {
      const survived = this.correct >= 9 && this.missed <= 7 && this.danger < 68 && this.trust > 30;
      this.finish(survived ? "dawn" : "watched");
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
        visibleEvent: this.getVisibleEvent(), activeEvents: this.activeEvents
      };
    }
  }

  window.NightShiftSimulation = NightShiftSimulation;
})();
