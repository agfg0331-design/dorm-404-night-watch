(function () {
  "use strict";

  class ProceduralNightAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.sfxBus = null;
      this.bgmBus = null;
      this.enabled = false;
      this.silenced = false;
      this.fakeDawnQuiet = false;
      this.birdTimer = null;
      this.volumes = { master: 0.72, bgm: 0.38, sfx: 0.88 };
      this.scene = "duty";
      this.ambientTimer = null;
      this.tensionTimers = [];
      this.hum = null;
      this.bgmNodes = [];
      this.bgmLayerGains = {};
      this.ambienceSources = [];
      this.ambienceKeys = new Set();
      this.finalNodes = [];
      this.duckTimer = null;
      this.sampleBuffers = new Map();
      this.samplePromises = new Map();
      this.tensionSources = [];
      this.ringtoneSource = null;
      this.ringtoneTimer = null;
      this.tensionPhase = 0;
      this.eventFocused = false;
      this.sampleUrls = {
        crtSwitch: "assets/audio/crt_switch_short.mp3",
        crtGlitch: "assets/audio/crt_glitch_medium.mp3",
        crtSevere: "assets/audio/crt_severe_static.mp3",
        doorShort: "assets/audio/door_creak_short.mp3",
        doorLong: "assets/audio/door_creak_long.mp3",
        doorTense: "assets/audio/door_creak_tense.mp3",
        drip1: "assets/audio/drip_single_01.mp3",
        drip2: "assets/audio/drip_single_02.mp3",
        drip3: "assets/audio/drip_single_03.mp3",
        fluorescent: "assets/audio/fluorescent_buzz_loop_20s.mp3",
        stairDouse: "assets/audio/stairs-fluorescent-douse.mp3",
        clockTicks: "assets/audio/clock-real-ticking.mp3",
        clockGears: "assets/audio/clock-gears-runaway.mp3",
        boneFracture: "assets/audio/shadow-bone-fracture.mp3",
        heelsFar: "assets/audio/heels_far_to_near.mp3",
        heelsNear: "assets/audio/heels_near_walk.mp3",
        heelsStop: "assets/audio/heels_stop_outside.mp3",
        roomNight: "assets/audio/room_night_loop_60s.mp3",
        washer1: "assets/audio/washer_stage_1_normalish.mp3",
        washer2: "assets/audio/washer_stage_2_unbalanced.mp3",
        washer3: "assets/audio/washer_stage_3_out_of_control.mp3",
        knock: "assets/audio/door-knock.mp3",
        floorCreak: "assets/audio/floorboard-creak.mp3",
        ringtone: "assets/audio/phone-old-ring.mp3",
        heartbeat: "assets/audio/heartbeat-fast.mp3",
        woodScrape: "assets/audio/wood-scrape.mp3",
        chairFall: "assets/audio/chair-fall-floor.mp3",
        glassBreak: "assets/audio/glass-break.mp3",
        wind: "assets/audio/wind-ambience.mp3",
        breathing: "assets/audio/human-breathing.mp3",
        horrorAmbience: "assets/audio/horror-ambience.mp3",
        horrorHit: "assets/audio/horror-hit.mp3",
        metalFrameFall: "assets/audio/scene-metal-frame-fall.mp3",
        badPiano: "assets/audio/scene-bad-piano.mp3",
        curtainWind: "assets/audio/scene-curtain-wind.mp3",
        elevatorDoor: "assets/audio/scene-elevator-door.mp3",
        elevatorDing: "assets/audio/scene-elevator-ding.mp3",
        danceScreech: "assets/audio/scene-dance-screech.mp3",
        danceWhispers: "assets/audio/scene-dance-whispers.mp3",
        tvStatic: "assets/audio/scene-tv-static.mp3",
        robotVoices: "assets/audio/scene-robot-voices.mp3"
      };
    }

    async setEnabled(enabled) {
      this.enabled = enabled;
      if (!enabled) {
        this.stopScene();
        this.stopReportTension();
        this.stopBgm();
        return;
      }
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.bgmBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.bgmBus.connect(this.master);
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.setVolumes(this.volumes);
      this.startBgm();
      await this.loadSamples(["crtSwitch"]);
      this.setScene(this.scene);
    }

    async warmAmbience() {
      // Decode the large beds in small groups so the first seconds of CCTV
      // playback do not compete with four simultaneous audio decoders.
      for (const keys of [["roomNight", "fluorescent"], ["wind"], ["horrorAmbience"]]) {
        if (!this.enabled || this.silenced) return;
        await this.loadSamples(keys);
        this.startRecordedAmbience();
      }
    }

    loadSample(key) {
      if (this.sampleBuffers.has(key)) return Promise.resolve(this.sampleBuffers.get(key));
      if (this.samplePromises.has(key)) return this.samplePromises.get(key);
      const url = this.sampleUrls[key];
      if (!url) return Promise.resolve(null);
      const promise = (async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        let response;
        try { response = await fetch(url, { signal: controller.signal }); }
        finally { window.clearTimeout(timeout); }
        if (!response.ok) throw new Error(`audio ${response.status}: ${url}`);
        const data = await response.arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(data.slice(0));
        this.sampleBuffers.set(key, buffer);
        return buffer;
      })().catch(() => {
        // A transient request/decode failure must not silence the cue for the
        // rest of the shift. The next warm-up can retry this recording.
        this.samplePromises.delete(key);
        return null;
      });
      this.samplePromises.set(key, promise);
      return promise;
    }

    loadSamples(keys = Object.keys(this.sampleUrls)) {
      return Promise.allSettled(keys.map((key) => this.loadSample(key)));
    }

    playSample(key, options = {}) {
      if (!this.enabled || !this.ctx || this.silenced || this.fakeDawnQuiet) return null;
      if (!this.sampleBuffers.has(key)) return null;
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      const destination = options.bus === "bgm" ? this.bgmBus : (this.sfxBus || this.master);
      const now = this.ctx.currentTime + (options.delay || 0);
      source.buffer = this.sampleBuffers.get(key);
      source.loop = Boolean(options.loop);
      source.playbackRate.value = options.rate || 1;
      filter.type = options.filter || "lowpass";
      filter.frequency.value = options.frequency || 18000;
      const targetVolume = Math.max(0.0001, options.volume ?? 0.45);
      const attack = Math.max(0.006, options.attack ?? 0.012);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(targetVolume, now + attack);
      source.connect(filter);
      let tail = filter;
      if (typeof this.ctx.createStereoPanner === "function") {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = options.pan || 0;
        tail.connect(panner);
        tail = panner;
      }
      tail.connect(gain).connect(destination);
      const offset = Math.min(options.offset || 0, Math.max(0, source.buffer.duration - 0.05));
      if (options.duration && !source.loop) {
        const clipDuration = Math.min(options.duration, Math.max(0.05, source.buffer.duration - offset));
        const fadeOut = Math.min(options.fadeOut ?? 0.045, clipDuration * 0.22);
        const fadeStart = Math.max(now + attack, now + clipDuration - fadeOut);
        gain.gain.setValueAtTime(targetVolume, fadeStart);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + clipDuration);
        source.start(now, offset, clipDuration);
      } else source.start(now, offset);
      return { source, gain };
    }

    setVolumes(next = {}) {
      this.volumes = { ...this.volumes, ...next };
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.sfxBus.gain.cancelScheduledValues(now);
      this.bgmBus.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.silenced ? 0.0001 : Math.max(0.0001, this.volumes.master), now, 0.03);
      this.sfxBus.gain.setTargetAtTime(this.fakeDawnQuiet ? 0.0001 : Math.max(0.0001, this.volumes.sfx), now, 0.03);
      this.bgmBus.gain.setTargetAtTime(this.fakeDawnQuiet ? Math.max(0.0001, this.volumes.bgm * 0.12) : Math.max(0.0001, this.volumes.bgm), now, 0.08);
    }

    startBgm() {
      if (!this.enabled || !this.ctx || this.silenced || this.bgmNodes.length) return;
      const makeDrone = (key, frequency, type, volume) => {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = frequency;
        filter.type = "lowpass";
        filter.frequency.value = 310;
        filter.Q.value = 1.8;
        gain.gain.value = volume;
        osc.connect(filter).connect(gain).connect(this.bgmBus);
        osc.start();
        this.bgmNodes.push(osc);
        this.bgmLayerGains[key] = gain;
      };
      makeDrone("low", 73, "triangle", 0.04);
      makeDrone("unease", 109.5, "sine", 0.018);
      makeDrone("dissonance", 51.3, "sawtooth", 0.0001);
      const length = this.ctx.sampleRate * 8;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < length; i += 1) {
        brown = brown * 0.995 + (Math.random() * 2 - 1) * 0.005;
        data[i] = brown * 2.4;
      }
      const air = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      air.buffer = buffer;
      air.loop = true;
      filter.type = "bandpass";
      filter.frequency.value = 430;
      filter.Q.value = 0.55;
      gain.gain.value = 0.038;
      air.connect(filter).connect(gain).connect(this.bgmBus);
      air.start();
      this.bgmNodes.push(air);
      this.bgmLayerGains.air = gain;
      this.setTension(this.tensionPhase, 0);
    }

    startRecordedAmbience() {
      if (!this.enabled || !this.ctx || this.silenced) return;
      [
        ["horrorAmbience", 0.07, 0.93, 0],
        ["wind", 0.045, 0.87, 9.5],
        ["roomNight", 0.2, 1, 3.2],
        ["fluorescent", 0.14, 1, 1.1]
      ].forEach(([key, volume, rate, offset], index) => {
        if (this.ambienceKeys.has(key)) return;
        const voice = this.playSample(key, { bus: "bgm", loop: true, volume, rate, offset });
        if (voice) {
          this.ambienceKeys.add(key);
          this.ambienceSources.push(voice.source);
          this.bgmLayerGains[`recorded${index}`] = voice.gain;
        }
      });
      this.setTension(this.tensionPhase, 0);
    }

    setTension(phase = 0, danger = 0) {
      this.tensionPhase = Math.max(0, Math.min(5, phase));
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const intensity = Math.min(1, this.tensionPhase / 5 + danger / 240);
      const targets = {
        low: 0.04 + intensity * 0.025,
        unease: 0.016 + intensity * 0.022,
        dissonance: 0.0001 + Math.max(0, intensity - 0.24) * 0.026,
        air: 0.032 + intensity * 0.025,
        recorded0: 0.065 + intensity * 0.075,
        recorded1: 0.038 + intensity * 0.035,
        recorded2: 0.18 + intensity * 0.035,
        recorded3: 0.12 + intensity * 0.03
      };
      Object.entries(targets).forEach(([key, value]) => {
        const node = this.bgmLayerGains[key];
        if (node) node.gain.setTargetAtTime(value, now, 1.8);
      });
    }

    stopBgm() {
      window.clearTimeout(this.duckTimer);
      this.duckTimer = null;
      this.bgmNodes.forEach((node) => { try { node.stop(); } catch (_) { /* already stopped */ } });
      this.bgmNodes = [];
      this.ambienceSources.forEach((node) => { try { node.stop(); } catch (_) { /* already stopped */ } });
      this.ambienceSources = [];
      this.ambienceKeys.clear();
      this.bgmLayerGains = {};
      this.stopRingtone();
      this.finalNodes.forEach((node) => { try { node.stop(); } catch (_) { /* already stopped */ } });
      this.finalNodes = [];
    }

    enterSilence() {
      this.silenced = true;
      this.stopScene();
      this.stopReportTension();
      this.stopBgm();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.015);
    }

    exitSilence() {
      if (!this.silenced) return;
      this.silenced = false;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(Math.max(0.0001, this.volumes.master), now, 0.04);
      // The ordinary ambience stays off. The call breaks the silence, and the
      // final-choice score starts only after the player answers or declines.
    }

    enterFakeDawn() {
      this.fakeDawnQuiet = true;
      this.stopScene();
      this.stopReportTension();
      window.clearTimeout(this.duckTimer);
      this.duckTimer = null;
      this.setVolumes();
    }

    startFakeDawnBirds() {
      if (!this.enabled || !this.ctx || !this.fakeDawnQuiet) return;
      const chirp = () => {
        if (!this.fakeDawnQuiet || this.silenced || !this.ctx) return;
        const now = this.ctx.currentTime;
        [0, 0.18, 0.39].forEach((delay, index) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const start = now + delay;
          const base = [1750, 2050, 1580][index];
          osc.type = "sine";
          osc.frequency.setValueAtTime(base, start);
          osc.frequency.exponentialRampToValueAtTime(base * 1.38, start + 0.095);
          osc.frequency.exponentialRampToValueAtTime(base * 0.86, start + 0.23);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.028 * this.volumes.sfx, start + 0.035);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
          osc.connect(gain).connect(this.master);
          osc.start(start);
          osc.stop(start + 0.25);
        });
        this.birdTimer = window.setTimeout(chirp, 1500 + Math.random() * 850);
      };
      window.clearTimeout(this.birdTimer);
      chirp();
    }

    stopFakeDawnBirds() {
      window.clearTimeout(this.birdTimer);
      this.birdTimer = null;
    }

    exitFakeDawn() {
      this.stopFakeDawnBirds();
      this.fakeDawnQuiet = false;
      this.setVolumes();
      this.setScene(this.scene);
    }

    duck(duration = 1.2, amount = 0.25) {
      if (!this.enabled || !this.ctx || !this.bgmBus || this.fakeDawnQuiet) return;
      window.clearTimeout(this.duckTimer);
      const now = this.ctx.currentTime;
      const normal = Math.max(0.0001, this.volumes.bgm);
      this.bgmBus.gain.cancelScheduledValues(now);
      this.bgmBus.gain.setTargetAtTime(Math.max(0.0001, normal * amount), now, 0.025);
      this.duckTimer = window.setTimeout(() => {
        if (!this.ctx || !this.enabled) return;
        this.bgmBus.gain.setTargetAtTime(normal, this.ctx.currentTime, 0.18);
      }, duration * 1000);
    }

    tone(frequency, duration, options = {}) {
      if (!this.enabled || !this.ctx || this.silenced || this.fakeDawnQuiet) return;
      const now = this.ctx.currentTime + (options.delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = options.type || "sine";
      osc.frequency.setValueAtTime(frequency, now);
      if (options.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(options.volume || 0.1, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(this.sfxBus || this.master);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    }

    noise(duration, options = {}) {
      if (!this.enabled || !this.ctx || this.silenced || this.fakeDawnQuiet) return;
      const rate = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, Math.ceil(rate * duration), rate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = last * (options.dark ? 0.985 : 0.25) + white * (options.dark ? 0.015 : 0.75);
        data[i] = last;
      }
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      source.buffer = buffer;
      filter.type = options.filter || "lowpass";
      filter.frequency.value = options.frequency || (options.dark ? 520 : 2600);
      const now = this.ctx.currentTime + (options.delay || 0);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(options.volume || 0.06, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter).connect(gain).connect(this.sfxBus || this.master);
      source.start(now);
    }

    playRandomDrip(options = {}) {
      const keys = ["drip1", "drip2", "drip3"];
      const key = keys[Math.floor(Math.random() * keys.length)];
      return this.playSample(key, { volume: 0.38, rate: 0.96 + Math.random() * 0.08, pan: -0.5 + Math.random(), ...options });
    }

    playDoor(kind = "random", options = {}) {
      const variants = kind === "short" ? ["doorShort"] : kind === "long" ? ["doorLong"] : kind === "tense" ? ["doorTense"] : ["doorShort", "doorLong", "doorTense"];
      const key = variants[Math.floor(Math.random() * variants.length)];
      return this.playSample(key, { volume: 0.52, rate: 0.97 + Math.random() * 0.06, pan: 0.4, ...options });
    }

    stopScene() {
      window.clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
      if (this.hum) {
        try { this.hum.osc.stop(); } catch (_) { /* already stopped */ }
        this.hum = null;
      }
    }

    setScene(scene) {
      this.scene = scene || "duty";
      this.stopScene();
      if (!this.enabled || !this.ctx || this.silenced || this.fakeDawnQuiet) return;
      const loop = () => {
        this.playAmbientDetail();
        const nextDelay = this.scene === "laundry" ? 4000 + Math.random() * 8000 : 3600 + Math.random() * 6200;
        this.ambientTimer = window.setTimeout(loop, nextDelay);
      };
      this.ambientTimer = window.setTimeout(loop, this.scene === "laundry" ? 1800 + Math.random() * 3000 : 2400 + Math.random() * 3600);
    }

    setEventFocus(focused) {
      this.eventFocused = Boolean(focused);
    }

    playAmbientDetail() {
      if (this.eventFocused) return;
      if (this.scene === "laundry") {
        this.playRandomDrip({ volume: 0.34 + Math.random() * 0.1 });
      } else if (this.scene === "hall") {
        this.playSample("floorCreak", { volume: 0.09, rate: 0.78 + Math.random() * 0.16, filter: "lowpass", frequency: 1450, pan: Math.random() * 1.4 - 0.7 });
      } else if (this.scene === "dorm") {
        this.playSample(Math.random() > 0.52 ? "woodScrape" : "floorCreak", { volume: 0.15, rate: 0.82 + Math.random() * 0.2, filter: "lowpass", frequency: 2600, pan: -0.55 });
      } else if (this.scene === "stairs") {
        if (Math.random() > 0.58) this.playSample("floorCreak", { volume: 0.08, rate: 0.7, filter: "lowpass", frequency: 1050, pan: -0.25 });
      } else if (this.scene === "lobby") {
        if (Math.random() > 0.62) this.playSample("wind", { volume: 0.045, rate: 0.74, offset: 8, duration: 2.2, filter: "lowpass", frequency: 950, pan: 0.58 });
      } else {
        if (Math.random() > 0.65) this.playSample("floorCreak", { volume: 0.13, rate: 0.72, filter: "lowpass", frequency: 1500, pan: 0.7 });
      }
    }

    switchCamera() {
      this.duck(0.22, 0.55);
      const voice = this.playSample("crtSwitch", { volume: 0.42, rate: 0.98 + Math.random() * 0.04, pan: Math.random() * 0.24 - 0.12 });
      if (!voice) this.noise(0.09, { volume: 0.07, frequency: 3600 });
    }

    phoneNotify(level = "normal") {
      this.duck(level === "corrupt" ? 1.15 : 0.65, level === "normal" ? 0.45 : 0.22);
      if (level === "corrupt") {
        this.noise(0.22, { volume: 0.16, frequency: 4200 });
        [1180, 520, 1640].forEach((f, i) => this.tone(f, 0.17, { delay: i * 0.11, volume: 0.13, to: i === 1 ? 90 : f * 0.7, type: "sawtooth" }));
        this.vibrate(3);
      } else if (level === "suspicious") {
        this.tone(930, 0.16, { volume: 0.09, to: 400, type: "square" });
        this.tone(1470, 0.2, { delay: 0.13, volume: 0.08, to: 230 });
        this.vibrate(2);
      } else {
        this.tone(780, 0.1, { volume: 0.065, to: 620 });
        this.tone(1040, 0.15, { delay: 0.1, volume: 0.055, to: 820 });
        this.vibrate(1);
      }
    }

    phoneInterference(type = "ghost") {
      const hard = type === "snow-hard" || type === "flood";
      this.duck(hard ? 2.6 : 1.2, hard ? 0.025 : 0.12);
      this.playSample(hard ? "crtSevere" : "crtGlitch", { volume: hard ? 0.78 : 0.5, rate: hard ? 0.92 : 0.98, duration: hard ? 3.2 : 1.45, filter: hard ? "highpass" : "lowpass", frequency: hard ? 240 : 6200 });
      if (type === "flood") {
        [1180, 540, 1540].forEach((frequency, index) => this.tone(frequency, 0.22, { delay: index * 0.2, volume: 0.07, to: 52, type: "sawtooth" }));
        this.vibrate(4);
      } else if (type === "snow-hard") {
        this.tone(94, 1.2, { volume: 0.18, to: 31, type: "square" });
        this.vibrate(3);
      } else if (type === "snow") {
        this.tone(620, 0.48, { volume: 0.1, to: 110, type: "square" });
        this.vibrate(2);
      } else {
        this.tone(1180, 0.18, { volume: 0.08, to: 290, type: "square" });
        this.vibrate(1);
      }
    }

    vibrate(count = 2) {
      for (let i = 0; i < count; i += 1) {
        this.tone(72, 0.12, { delay: i * 0.19, volume: 0.12, to: 55, type: "square" });
        this.noise(0.1, { delay: i * 0.19, volume: 0.055, dark: true, frequency: 180 });
      }
      if (navigator.vibrate) navigator.vibrate(Array.from({ length: count * 2 - 1 }, (_, i) => i % 2 ? 65 : 130));
    }

    playEventCue(event) {
      const cue = event.visual;
      const quietCue = ["stairs-darkness", "clock-reverse", "self-turn", "mirror-reflection", "wet-footprints", "lobby-double", "scene-still"].includes(cue);
      if (!quietCue) this.duck(1.1, 0.24);
      if (cue === "chair-fall") {
        this.playSample("woodScrape", { volume: 0.2, rate: 0.76, filter: "lowpass", frequency: 2500 });
      } else if (cue === "window-break") {
        this.playSample("wind", { volume: 0.08, offset: 13, duration: 1.4, filter: "lowpass", frequency: 1500 });
      } else if (cue === "shadow-walk") {
        // Individual, distance-matched steps are scheduled in playEventBeat.
        // Do not layer the full recording here: it made footsteps sound like an
        // unrelated door/metal loop and destroyed the approach rhythm.
        this.playSample("roomNight", { volume: 0.055, rate: 0.86, offset: 4.2, duration: 1.8, filter: "lowpass", frequency: 950, pan: -0.55 });
      } else if (cue === "shadow-rush") {
        this.playSample("breathing", { volume: 0.13, rate: 0.8, offset: 0.35, duration: 1.15, filter: "lowpass", frequency: 1500, pan: -0.3 });
      } else if (cue === "duty-extra") {
        this.breath(1);
      } else if (cue === "light-flicker") {
        for (let i = 0; i < 5; i += 1) this.tone(96, 0.035, { delay: i * 0.13, volume: 0.055, type: "square" });
      } else if (cue === "machine-start") {
        this.playSample("washer1", { volume: 0.42, rate: 1, duration: 4.95, filter: "lowpass", frequency: 5200, pan: -0.16 });
      } else if (cue === "stair-steps") {
        this.footsteps(1, 0.4);
      } else if (cue === "door-open") {
        this.playDoor("short", { volume: 0.28, duration: 1.6, filter: "lowpass", frequency: 2600, pan: 0.55 });
      } else if (cue === "pipe-drip") {
        this.playRandomDrip({ volume: 0.34, pan: 0.28 });
      } else if (cue === "space-repeat") {
        this.glitch();
      } else if (cue === "bed-curtain") {
        this.playSample("breathing", { volume: 0.1, rate: 0.8, offset: 0.4, duration: 1.2, filter: "lowpass", frequency: 1400 });
      } else if (cue === "clock-reverse") {
        // Recorded wall-clock ticks establish the clock before its hands run wild.
        this.playSample("clockTicks", { volume: 0.32, duration: 15, filter: "highpass", frequency: 120, pan: -0.58, attack: 0.35 });
      }
    }

    playEventBeat(event, beat) {
      const cue = event.visual;
      if (cue === "scene-still") {
        // New scenes keep their own cues; a generic scene-still event has no sound.
        if (event.id === "music-stands" && beat === "fall") {
          this.duck(1.7, 0.07);
          // Both recordings start on the same image frame: one metal frame and
          // the existing chair hitting the classroom floor.
          this.playSample("metalFrameFall", { volume: 0.8, pan: 0.22, attack: 0.006 });
          this.playSample("chairFall", { volume: 0.57, pan: 0.22, attack: 0.006 });
        } else if (event.id === "music-piano" && beat === "open") {
          this.playSample("badPiano", { volume: 0.48, duration: 6.8, offset: 1.3, pan: -0.34, filter: "lowpass", frequency: 5600 });
        } else if (event.id === "music-figure" && beat === "curtain") {
          this.playSample("curtainWind", { volume: 0.45, duration: 7, pan: 0.45, filter: "lowpass", frequency: 5000 });
        } else if (event.id === "dance-figure" && beat === "blackout") {
          this.duck(0.85, 0.035);
          this.playSample("danceScreech", { volume: 0.77, attack: 0.006, pan: 0.04 });
        } else if (event.id === "dance-line" && beat === "appear") {
          this.playSample("danceWhispers", { volume: 0.47, duration: 6, pan: -0.15, filter: "lowpass", frequency: 5600 });
          this.playSample("danceWhispers", { volume: 0.26, duration: 5.4, delay: 0.16, offset: 0.7, rate: 0.92, pan: 0.37, filter: "lowpass", frequency: 4200 });
        } else if (event.id === "elevator-die" && beat === "die") {
          this.playSample("elevatorDing", { volume: 0.6, pan: 0.02 });
        } else if (event.id === "elevator-open" && beat === "open") {
          this.duck(1.8, 0.14);
          this.playSample("elevatorDoor", { volume: 0.73, pan: -0.14, filter: "lowpass", frequency: 5500 });
        } else if (event.id === "elevator-footprints" && beat.startsWith("step-")) {
          const index = Number(beat.slice(5));
          const near = index >= 3;
          this.playSample(near ? "heelsNear" : "heelsFar", {
            volume: 0.19 + index * 0.045, offset: near ? 0.8 + (index - 3) * 0.75 : 1.1 + index * 0.8,
            duration: 0.45, rate: 0.93 + index * 0.025, pan: 0.36 - index * 0.17,
            filter: "lowpass", frequency: 1300 + index * 650
          });
        } else if (["lab-screen", "lab-static"].includes(event.id) && beat === "screen") {
          this.playSample("tvStatic", { volume: event.id === "lab-screen" ? 0.35 : 0.57, duration: event.id === "lab-screen" ? 3 : 6, pan: event.id === "lab-screen" ? -0.46 : 0, filter: "highpass", frequency: 220 });
        } else if (event.id === "lab-feed" && beat === "screens") {
          this.playSample("robotVoices", { volume: 0.43, duration: 5.2, pan: -0.35, filter: "lowpass", frequency: 6200 });
          this.playSample("robotVoices", { volume: 0.34, duration: 4.5, delay: 0.19, offset: 0.8, rate: 0.85, pan: 0.34, filter: "lowpass", frequency: 4500 });
          this.playSample("robotVoices", { volume: 0.24, duration: 3.8, delay: 0.42, offset: 1.4, rate: 1.12, pan: 0.02, filter: "lowpass", frequency: 3200 });
        }
      } else if (cue === "chair-fall" && beat === "impact") {
        this.duck(2.2, 0.06);
        // The chair reaches the tile as its fallen frame appears. The recorded
        // first crash and shorter rebound follow the earlier dragging cue.
        this.playSample("chairFall", { volume: 0.86, rate: 1, pan: -0.24, attack: 0.006 });
        if (navigator.vibrate) navigator.vibrate(90);
      } else if (cue === "window-break" && beat === "impact") {
        this.duck(2.8, 0.04);
        this.playSample("glassBreak", { volume: 0.95, rate: 0.96 });
        this.playSample("horrorHit", { volume: 0.38, rate: 0.72, duration: 1.3 });
        this.tone(48, 0.5, { volume: 0.16, to: 26, type: "triangle" });
        this.vibrate(3);
      } else if ((cue === "shadow-walk" || cue === "shadow-rush") && beat.startsWith("step")) {
        const index = Number(beat.split("-")[1] || 0);
        const intensity = Math.min(1, index / 7);
        this.duck(0.72, Math.max(0.06, 0.42 - intensity * 0.34));
        if (index === 7) {
          this.playSample("heelsStop", { volume: 0.82, rate: 1, duration: 4.2, filter: "lowpass", frequency: 7600, pan: 0.28 });
        } else {
          const offset = index < 4 ? 1.6 + index * 1.65 : 0.7 + (index - 4) * 1.45;
          const stepOptions = { volume: 0.34 + intensity * 0.58, rate: 0.95 + intensity * 0.1, offset, duration: 0.78, filter: "lowpass", frequency: 1250 + intensity * 6200, pan: (index % 2 ? 0.16 : -0.16) + (-0.36 + intensity * 0.62) };
          if (index < 4) this.playSample("heelsFar", stepOptions);
          else this.playSample("heelsNear", stepOptions);
        }
        // Keep a low floor impact, but let the recorded heel remain the audible focus.
        this.tone(54 - intensity * 20, 0.18, { volume: 0.022 + intensity * 0.07, to: 28, type: "triangle" });
        if (navigator.vibrate) navigator.vibrate(index >= 4 ? [55 + index * 9, 28, 70 + index * 10] : 28);
      } else if (cue === "stairs-darkness") {
        if (beat === "silence") {
          this.duck(1.8, 0.04);
        } else if (beat.startsWith("douse")) {
          const index = Number(beat.split("-")[1] || 1);
          // One real fluorescent shutdown per approved darkening frame.
          this.playSample("stairDouse", { volume: 0.37 + index * 0.08, rate: 1.04 - index * 0.04, filter: "highpass", frequency: 95, pan: -0.42 + index * 0.25 });
        } else if (beat.startsWith("step")) {
          const index = Number(beat.split("-")[1] || 1);
          this.playSample(index < 3 ? "heelsFar" : "heelsNear", { volume: 0.1 + index * 0.035, rate: 0.9 + index * 0.035, offset: 1.2 + index * 1.45, duration: 0.62, filter: "lowpass", frequency: 850 + index * 720, pan: -0.25 + index * 0.2 });
        }
      } else if (cue === "light-flicker") {
        this.duck(beat === "blackout" || beat === "surge" ? 1.15 : 0.35, beat === "surge" ? 0.08 : 0.32);
        this.tone(92, beat === "surge" ? 0.62 : 0.09, { volume: beat === "surge" ? 0.16 : 0.075, to: beat === "blackout" ? 26 : 62, type: "square" });
        this.noise(beat === "surge" ? 0.46 : 0.08, { volume: beat === "surge" ? 0.14 : 0.055, frequency: 4800 });
        if (beat === "surge") { this.playSample("horrorHit", { volume: 0.5, rate: 1.08, duration: 1.1 }); this.vibrate(3); }
      } else if (cue === "pipe-drip") {
        const finalHit = beat === "ceiling-hit";
        this.duck(finalHit ? 1.25 : 0.35, finalHit ? 0.12 : 0.45);
        this.playRandomDrip({ volume: finalHit ? 0.62 : 0.36 + Math.random() * 0.08, rate: finalHit ? 0.8 : 0.95 + Math.random() * 0.08, pan: finalHit ? 0.12 : -0.5 + Math.random() });
        if (finalHit) { this.playSample("horrorHit", { volume: 0.18, rate: 0.72, duration: 0.8 }); this.tone(42, 0.65, { volume: 0.1, to: 25, type: "triangle" }); this.vibrate(3); }
      } else if (cue === "wet-footprints") {
        if (beat === "stop") {
          this.duck(1.8, 0.06);
        } else if (beat.startsWith("step")) {
          const index = Math.max(1, Number(beat.split("-")[1] || 1));
          // The approved lobby artwork contains eight distinct prints. Take
          // one recorded shoe strike per print, moving from the doors inward.
          const closeness = Math.min(1, index / 8);
          const pan = 0.38 - closeness * 0.68 + (index % 2 ? -0.08 : 0.08);
          const farOffsets = [0.5, 1.1, 1.7, 2.3];
          const nearOffsets = [0.4, 0.9, 1.5, 2.0];
          this.playSample(index <= 4 ? "heelsFar" : "heelsNear", {
            volume: 0.13 + closeness * 0.17, rate: 0.92 + closeness * 0.08,
            offset: index <= 4 ? farOffsets[index - 1] : nearOffsets[index - 5],
            duration: 0.43, filter: "lowpass", frequency: 1050 + closeness * 3000, pan
          });
          this.playRandomDrip({ volume: 0.05 + closeness * 0.07, rate: 0.85 + closeness * 0.08, pan });
        }
      } else if (cue === "stair-steps" && beat.startsWith("step")) {
        const index = Math.max(1, Number(beat.split("-")[1] || 1));
        this.duck(0.45, Math.max(0.16, 0.5 - index * 0.065));
        this.playSample(index < 4 ? "heelsFar" : "heelsNear", { volume: 0.2 + index * 0.1, rate: 0.94 + index * 0.025, offset: 0.8 + ((index - 1) * 1.34), duration: 0.9, filter: "lowpass", frequency: 1050 + index * 720, pan: index % 2 ? -0.34 : 0.34 });
        this.tone(62 - index * 3, 0.2, { volume: 0.038 + index * 0.018, to: 29, type: "triangle" });
        if (index >= 3 && navigator.vibrate) navigator.vibrate(25 + index * 11);
      } else if (cue === "door-open") {
        if (beat === "handle") this.doorHandle();
        else if (beat === "inside-breath") { this.duck(1.4, 0.08); this.breath(1); this.playSample("horrorHit", { volume: 0.38, rate: 0.7, duration: 1.2 }); this.vibrate(3); }
        else { this.duck(1.2, 0.16); this.playDoor(beat === "creak" ? "long" : "tense", { volume: beat === "creak" ? 0.56 : 0.74, rate: beat === "creak" ? 0.97 : 0.92, duration: beat === "creak" ? 4.2 : 5.5, pan: 0.45 }); }
      } else if (cue === "machine-start") {
        if (beat === "click") this.playSample("washer1", { volume: 0.38, rate: 1, offset: 0.4, duration: 1.6, filter: "lowpass", frequency: 4200 });
        else if (beat === "spin") { this.duck(1.1, 0.18); this.playSample("washer2", { volume: 0.64, rate: 1, duration: 5.5, filter: "lowpass", frequency: 6800, pan: -0.08, attack: 0.42 }); }
        else if (beat === "knock") { this.playSample("washer2", { volume: 0.56, rate: 1.03, offset: 2.1, duration: 2.7, filter: "lowpass", frequency: 7600, pan: 0.08 }); if (navigator.vibrate) navigator.vibrate([55, 40, 75]); }
        else { this.duck(2.4, 0.035); this.playSample("washer3", { volume: 0.92, rate: 1, duration: 6.1, filter: "lowpass", frequency: 11000, attack: 0.28 }); this.playSample("horrorHit", { volume: 0.26, rate: 0.78, duration: 1.2, delay: 0.12 }); this.tone(34, 0.9, { volume: 0.15, to: 23, type: "triangle" }); this.vibrate(4); }
      } else if (cue === "bed-curtain") {
        if (beat === "rustle") {
          this.playSample("woodScrape", { volume: 0.14, rate: 1.45, duration: 1.15, filter: "lowpass", frequency: 1850, pan: -0.42 });
          this.noise(0.52, { volume: 0.055, frequency: 1450 });
        }
        else if (beat === "breath") { this.duck(1.1, 0.18); this.breath(2); }
        else { this.duck(1.5, 0.06); this.playSample("horrorHit", { volume: 0.6, rate: 0.78, duration: 1.3 }); this.tone(47, 0.72, { volume: 0.14, to: 26, type: "triangle" }); this.vibrate(3); }
      } else if (cue === "clock-reverse") {
        if (beat === "spin-start") {
          // Accelerate the physical clockwork recording with the rotating hands.
          const gear = this.playSample("clockGears", { volume: 0.66, rate: 0.86, filter: "lowpass", frequency: 5400, pan: -0.58, attack: 0.65 });
          if (gear) gear.source.playbackRate.linearRampToValueAtTime(1.6, this.ctx.currentTime + 17);
        }
      } else if (cue === "self-turn") {
        if (beat === "cloth") this.playSample("woodScrape", { volume: 0.065, rate: 1.42, duration: 0.72, filter: "lowpass", frequency: 980, pan: -0.08 });
        else if (beat === "snap") this.playSample("boneFracture", { volume: 0.65, rate: 0.94, filter: "lowpass", frequency: 4800, pan: -0.18, attack: 0.008 });
        else if (beat === "look") this.duck(1.45, 0.045);
      } else if (cue === "lobby-double") {
        if (beat === "inside") this.tone(43, 0.7, { volume: 0.045, to: 32, type: "triangle" });
        else if (beat === "echo") this.tone(39, 0.9, { volume: 0.052, to: 29, type: "triangle" });
        else if (beat === "hold") this.duck(0.9, 0.16);
      } else if (cue === "duty-extra") {
        const terminal = ["look", "presence", "impact"].includes(beat);
        this.duck(terminal ? 2 : 0.9, terminal ? 0.03 : 0.16);
        if (beat === "breath" || beat === "whisper") this.breath(beat === "whisper" ? 3 : 1);
        this.tone(terminal ? 36 : 52, terminal ? 1.1 : 0.45, { volume: terminal ? 0.2 : 0.09, to: 24, type: "triangle" });
        if (terminal) { this.playSample("horrorHit", { volume: 0.64, rate: 0.68, duration: 1.5 }); this.vibrate(3); }
      } else if (cue === "space-repeat") {
        const terminal = beat === "collapse";
        this.duck(terminal ? 1.8 : 0.8, terminal ? 0.04 : 0.18);
        this.noise(terminal ? 0.72 : 0.25, { volume: terminal ? 0.19 : 0.1, frequency: terminal ? 6200 : 2800 });
        this.tone(terminal ? 34 : 145, terminal ? 1 : 0.35, { volume: terminal ? 0.18 : 0.09, to: 22, type: "sawtooth" });
        if (terminal) { this.playSample("horrorHit", { volume: 0.7, rate: 0.74, duration: 1.5 }); this.vibrate(3); }
      } else if (beat === "movement") {
        this.duck(1, 0.24);
        this.playSample("woodScrape", { volume: 0.42, rate: 0.88, filter: "lowpass", frequency: 2800 });
      }
    }

    footsteps(count = 3, gap = 0.5) {
      for (let i = 0; i < count; i += 1) {
        this.playSample("heelsNear", { delay: i * gap, volume: 0.3 + i * 0.09, rate: 0.97 + i * 0.025, offset: 0.6 + (i % 5) * 1.38, duration: Math.min(0.88, gap + 0.24), filter: "lowpass", frequency: 2200 + i * 620, pan: i % 2 ? 0.24 : -0.24 });
        this.tone(57, 0.14, { delay: i * gap, volume: 0.035 + i * 0.01, to: 34, type: "triangle" });
      }
    }

    breath(count = 1) {
      for (let i = 0; i < count; i += 1) this.playSample("breathing", { delay: i * 1.7, volume: 0.3 + i * 0.045, rate: 0.9 + i * 0.025, offset: (i * 1.3) % 3.6, duration: 1.45, filter: "lowpass", frequency: 1900, pan: 0.42 });
    }

    doorHandle() {
      this.duck(0.7, 0.35);
      this.playDoor("short", { volume: 0.46, rate: 1.04, offset: 0.08, duration: 1.1, filter: "lowpass", frequency: 3600, pan: 0.55 });
    }

    knock() {
      this.duck(2.2, 0.08);
      [0, 0.62, 1.24].forEach((delay) => {
        this.playSample("knock", { delay, volume: 0.74 + delay * 0.08, rate: 0.92 + delay * 0.03, duration: 0.45, pan: 0.58 });
      });
      this.vibrate(3);
    }

    glitch(severe = false) {
      this.duck(severe ? 3.2 : 1.2, severe ? 0.035 : 0.1);
      const voice = this.playSample(severe ? "crtSevere" : "crtGlitch", { volume: severe ? 0.8 : 0.52, rate: severe ? 0.9 : 1, duration: severe ? 3.5 : 1.45, filter: severe ? "highpass" : "lowpass", frequency: severe ? 220 : 6400 });
      if (!voice) this.noise(severe ? 1.2 : 0.38, { volume: severe ? 0.24 : 0.14, frequency: 5200 });
      this.tone(severe ? 92 : 160, severe ? 0.72 : 0.34, { volume: severe ? 0.11 : 0.055, to: 43, type: "sawtooth" });
    }

    startRingtone() {
      this.stopRingtone();
      this.duck(10, 0.12);
      const voice = this.playSample("ringtone", { volume: 0.9, loop: true, rate: 0.96, filter: "lowpass", frequency: 6200, pan: 0.4 });
      this.ringtoneSource = voice?.source || null;
      this.vibrate(3);
      this.ringtoneTimer = window.setInterval(() => this.vibrate(2), 1700);
      if (!voice) this.phoneNotify("corrupt");
    }

    stopRingtone() {
      window.clearInterval(this.ringtoneTimer);
      this.ringtoneTimer = null;
      if (this.ringtoneSource) {
        try { this.ringtoneSource.stop(); } catch (_) { /* already stopped */ }
        this.ringtoneSource = null;
      }
    }

    startReportTension(danger = 20) {
      this.stopReportTension();
      this.duck(4.8, 0.18);
      const heartbeat = this.playSample("heartbeat", { volume: 0.42 + danger / 340, loop: true, rate: 0.88 + danger / 500, filter: "lowpass", frequency: 2600 });
      if (heartbeat) this.tensionSources.push(heartbeat.source);
      this.tensionTimers.push(window.setInterval(() => this.footsteps(1, 0.3), Math.max(1350, 3000 - danger * 13)));
      this.tensionTimers.push(window.setInterval(() => this.breath(1), 3800));
    }

    stopReportTension() {
      this.tensionTimers.forEach((timer) => window.clearInterval(timer));
      this.tensionTimers = [];
      this.tensionSources.forEach((source) => { try { source.stop(); } catch (_) { /* already stopped */ } });
      this.tensionSources = [];
    }

    turn() {
      this.playSample("wind", { volume: 0.16, rate: 0.74, offset: 7, duration: 12, filter: "lowpass", frequency: 1800 });
      this.playSample("woodScrape", { volume: 0.58, rate: 0.62 });
      window.setTimeout(() => this.breath(2), 3600);
      window.setTimeout(() => this.footsteps(2, 2.1), 8200);
    }

    enterFinalChoice() {
      if (!this.enabled || !this.ctx || this.finalNodes.length) return;
      this.stopScene();
      const now = this.ctx.currentTime;
      this.bgmBus.gain.cancelScheduledValues(now);
      this.bgmBus.gain.setTargetAtTime(Math.max(0.0001, this.volumes.bgm * 1.28), now, 2.2);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 46;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.018, now + 5.5);
      lfo.frequency.value = 0.17;
      lfoGain.gain.value = 0.008;
      lfo.connect(lfoGain).connect(gain.gain);
      osc.connect(gain).connect(this.bgmBus);
      osc.start(); lfo.start();
      this.finalNodes.push(osc, lfo);
      const heartbeat = this.playSample("heartbeat", { volume: 0.4, loop: true, rate: 0.86, filter: "lowpass", frequency: 2600 });
      if (heartbeat) { this.finalNodes.push(heartbeat.source); }
      this.breath(1);
    }

    choiceHover() {
      this.tone(176, 0.22, { volume: 0.026, to: 132, type: "triangle" });
    }

    holdGaze() {
      this.noise(13, { volume: 0.055, dark: true, frequency: 360 });
      for (let i = 0; i < 4; i += 1) this.tone(48 - i * 3, 0.22, { delay: 3.5 + i * 2.6, volume: 0.1 + i * 0.02, to: 28, type: "triangle" });
    }

    resolveEnding(kind) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.bgmBus.gain.setTargetAtTime(kind === "watched" ? 0.0001 : Math.max(0.0001, this.volumes.bgm * 0.35), now, 1.8);
      this.finalNodes.forEach((node) => { try { node.stop(now + 2.4); } catch (_) { /* already stopped */ } });
      this.finalNodes = [];
    }

    pickupPhone() {
      this.duck(0.7, 0.42);
      this.noise(0.32, { volume: 0.028, dark: true, frequency: 760 });
      this.tone(116, 0.24, { delay: 0.08, volume: 0.035, to: 78, type: "triangle" });
    }

    putdownPhone() {
      this.noise(0.22, { volume: 0.024, dark: true, frequency: 540 });
      this.tone(82, 0.16, { delay: 0.22, volume: 0.05, to: 52, type: "triangle" });
    }

    phoneHome() {
      this.duck(0.28, 0.6);
      this.tone(460, 0.045, { volume: 0.045, to: 310, type: "square" });
      if (navigator.vibrate) navigator.vibrate(18);
    }
  }

  window.NightAudio = new ProceduralNightAudio();
})();
