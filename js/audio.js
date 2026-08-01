/**
 * Web Audio：flOw 气质的温暖有机环境乐（无缝循环）
 * + 升级音效 + 攻击性生物逼近层
 * 设置持久化到 localStorage
 */

const STORAGE_KEY = "microflow-audio";

/** 五声音阶（Hz），偏水下、开放、不刺耳 */
const PENT = {
  D3: 146.83,
  E3: 164.81,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  D4: 293.66,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  D5: 587.33,
  E5: 659.25,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export class AudioManager {
  constructor() {
    const saved = loadSettings() || {};
    this.musicEnabled = saved.musicEnabled !== false;
    this.sfxEnabled = saved.sfxEnabled !== false;
    this.musicVolume = saved.musicVolume ?? 0.42;
    this.sfxVolume = saved.sfxVolume ?? 0.5;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.threatGain = null;
    this.musicBus = null;
    this.reverb = null;
    this.bgmNodes = [];
    this.threatNodes = [];
    this.started = false;
    this._threatLevel = 0;
    this._melodyTimer = 0;
    this._stopMelody = false;
  }

  getSettings() {
    return {
      musicEnabled: this.musicEnabled,
      sfxEnabled: this.sfxEnabled,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
    };
  }

  applySettings({ musicEnabled, sfxEnabled, musicVolume, sfxVolume } = {}) {
    if (musicEnabled != null) this.musicEnabled = !!musicEnabled;
    if (sfxEnabled != null) this.sfxEnabled = !!sfxEnabled;
    if (musicVolume != null) this.musicVolume = Math.max(0, Math.min(1, musicVolume));
    if (sfxVolume != null) this.sfxVolume = Math.max(0, Math.min(1, sfxVolume));
    this._syncGains();
    saveSettings(this.getSettings());
  }

  async unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.threatGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.threatGain.connect(this.master);
      this.threatGain.gain.value = 0;

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 1;
      this.reverb = this._makeReverb();
      this.musicBus.connect(this.musicGain);
      this.musicBus.connect(this.reverb.input);
      this.reverb.output.connect(this.musicGain);

      this._syncGains();
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    if (!this.started) {
      this._startBgm();
      this._startThreatPad();
      this._scheduleMelodyLoop();
      this.started = true;
    }
    return true;
  }

  _syncGains() {
    if (!this.musicGain || !this.sfxGain) return;
    const t = this.ctx?.currentTime || 0;
    const music = this.musicEnabled ? this.musicVolume : 0;
    const sfx = this.sfxEnabled ? this.sfxVolume : 0;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setTargetAtTime(music * 0.85, t, 0.1);
    this.sfxGain.gain.cancelScheduledValues(t);
    this.sfxGain.gain.setTargetAtTime(sfx, t, 0.05);
    if (this.threatGain) {
      const threat = this.musicEnabled ? this.musicVolume * this._threatLevel * 0.55 : 0;
      this.threatGain.gain.setTargetAtTime(threat, t, 0.2);
    }
  }

  /** 简易反馈延迟混响：鱼缸感、湿润空间 */
  _makeReverb() {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const delay1 = ctx.createDelay(1.5);
    const delay2 = ctx.createDelay(1.5);
    const fb1 = ctx.createGain();
    const fb2 = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const wet = ctx.createGain();
    delay1.delayTime.value = 0.28;
    delay2.delayTime.value = 0.41;
    fb1.gain.value = 0.42;
    fb2.gain.value = 0.35;
    filter.type = "lowpass";
    filter.frequency.value = 2200;
    wet.gain.value = 0.55;
    input.connect(delay1);
    input.connect(delay2);
    delay1.connect(filter);
    delay2.connect(filter);
    filter.connect(wet);
    filter.connect(fb1);
    fb1.connect(delay1);
    filter.connect(fb2);
    fb2.connect(delay2);
    return { input, output: wet };
  }

  _lfo(freq, depth, dest, param = "frequency") {
    const lfo = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = freq;
    g.gain.value = depth;
    lfo.connect(g);
    g.connect(dest[param]);
    lfo.start();
    this.bgmNodes.push(lfo, g);
    return [lfo, g];
  }

  /** 双振荡轻微失谐 → 温暖合唱感 */
  _warmVoice(freq, amp, type = "sine") {
    const ctx = this.ctx;
    const out = this.musicBus;
    const merge = ctx.createGain();
    merge.gain.value = amp;
    merge.connect(out);
    const voices = [];
    for (const cents of [-7, 0, 9]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq * Math.pow(2, cents / 1200);
      g.gain.value = cents === 0 ? 0.55 : 0.28;
      osc.connect(g);
      g.connect(merge);
      osc.start();
      voices.push(osc, g);
    }
    this.bgmNodes.push(merge, ...voices);
    return merge;
  }

  _startBgm() {
    const ctx = this.ctx;
    const out = this.musicBus;

    // 底层暖垫：开放五度 + 九度，极慢呼吸
    const padNotes = [
      { f: PENT.D3, a: 0.055 },
      { f: PENT.A3, a: 0.04 },
      { f: PENT.E4, a: 0.028 },
      { f: PENT.G4, a: 0.018 },
    ];
    for (let i = 0; i < padNotes.length; i += 1) {
      const { f, a } = padNotes[i];
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900 + i * 180;
      filter.Q.value = 0.35;
      const breath = ctx.createGain();
      breath.gain.value = a;
      const voice = this._warmVoice(f, 1, i < 2 ? "sine" : "triangle");
      // 重接：voice 已连 musicBus，改为经呼吸包络
      voice.disconnect();
      voice.connect(filter);
      filter.connect(breath);
      breath.connect(out);
      // 极慢振幅起伏（催眠呼吸）
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      lfo.frequency.value = 0.035 + i * 0.008;
      lfoG.gain.value = a * 0.45;
      lfo.connect(lfoG);
      lfoG.connect(breath.gain);
      lfo.start();
      this._lfo(0.02 + i * 0.01, 1.2 + i * 0.4, filter);
      this.bgmNodes.push(filter, breath, lfo, lfoG);
    }

    // 柔和“合唱”高垫：更像远处人声/弦乐
    const choir = this._warmVoice(PENT.D4 * 2, 0.012, "sine");
    const choirFilter = ctx.createBiquadFilter();
    choirFilter.type = "bandpass";
    choirFilter.frequency.value = 720;
    choirFilter.Q.value = 0.7;
    choir.disconnect();
    choir.connect(choirFilter);
    const choirGain = ctx.createGain();
    choirGain.gain.value = 1;
    choirFilter.connect(choirGain);
    choirGain.connect(out);
    this._lfo(0.05, 40, choirFilter);
    const swell = ctx.createOscillator();
    const swellG = ctx.createGain();
    swell.frequency.value = 0.045;
    swellG.gain.value = 0.008;
    swell.connect(swellG);
    swellG.connect(choirGain.gain);
    swell.start();
    this.bgmNodes.push(choirFilter, choirGain, swell, swellG);

    // 极轻粉噪白：水下氛围，不是沙沙刺耳
    const noiseBuf = this._pinkNoiseBuffer(6);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = "lowpass";
    nFilter.frequency.value = 280;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.012;
    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(out);
    noise.start();
    this.bgmNodes.push(noise, nFilter, nGain);
  }

  _pinkNoiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = pink * 0.08;
    }
    // 淡入淡出，循环无缝
    const fade = Math.floor(ctx.sampleRate * 0.08);
    for (let i = 0; i < fade; i += 1) {
      const w = i / fade;
      data[i] *= w;
      data[len - 1 - i] *= w;
    }
    return buffer;
  }

  /** 稀疏长笛/竖琴式短句，缓慢推进，贴合 flOw 的“轻轻前行” */
  _scheduleMelodyLoop() {
    this._stopMelody = false;
    const phrases = [
      [PENT.A4, PENT.B4, PENT.D5],
      [PENT.G4, PENT.A4, PENT.E4],
      [PENT.E5, PENT.D5, PENT.B4, PENT.A4],
      [PENT.D4, PENT.G4, PENT.A4],
      [PENT.B4, PENT.A4, PENT.G4, PENT.E4],
      [PENT.D5, PENT.B4, PENT.G4],
    ];
    let phraseIdx = 0;

    const tick = () => {
      if (this._stopMelody || !this.ctx) return;
      if (!this.musicEnabled) {
        this._melodyTimer = window.setTimeout(tick, 4000);
        return;
      }
      const phrase = phrases[phraseIdx % phrases.length];
      phraseIdx += 1;
      const now = this.ctx.currentTime + 0.05;
      phrase.forEach((f, i) => {
        this._playFluteNote(f, now + i * 0.55, 1.4 + (i % 2) * 0.2, 0.045);
      });
      // 偶尔加一颗更远的铃
      if (phraseIdx % 3 === 0) {
        const last = phrase[phrase.length - 1] * 2;
        this._playFluteNote(last, now + phrase.length * 0.55 + 0.3, 2.2, 0.02);
      }
      const gap = 5200 + Math.random() * 3800;
      this._melodyTimer = window.setTimeout(tick, gap);
    };
    this._melodyTimer = window.setTimeout(tick, 2200);
  }

  _playFluteNote(freq, when, dur, amp) {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc2.type = "triangle";
    osc.frequency.setValueAtTime(freq, when);
    osc2.frequency.setValueAtTime(freq * 2.005, when);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, when);
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(amp, when + 0.12);
    gain.gain.exponentialRampToValueAtTime(amp * 0.55, when + dur * 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    if (this.reverb) gain.connect(this.reverb.input);
    osc.start(when);
    osc2.start(when);
    osc.stop(when + dur + 0.05);
    osc2.stop(when + dur + 0.05);
  }

  _startThreatPad() {
    const ctx = this.ctx;
    const out = this.threatGain;
    // 柔和阴郁：正弦小二度，不用锯齿
    const freqs = [PENT.D3 * 0.5, PENT.D3 * 0.5 * (16 / 15), PENT.A3 * 0.5];
    for (let i = 0; i < freqs.length; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "sine";
      osc.frequency.value = freqs[i];
      filter.type = "lowpass";
      filter.frequency.value = 180;
      gain.gain.value = 0.07 - i * 0.012;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      lfo.frequency.value = 0.08;
      lfoG.gain.value = 1.5;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      lfo.start();
      osc.start();
      this.threatNodes.push(osc, gain, filter, lfo, lfoG);
    }
  }

  setThreatLevel(level) {
    this._threatLevel = Math.max(0, Math.min(1, level));
    if (!this.threatGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    const v = this.musicEnabled ? this.musicVolume * this._threatLevel * 0.6 : 0;
    this.threatGain.gain.setTargetAtTime(v, t, 0.25);
  }

  /** 升级：轻柔五声琶音，像竖琴掠过水面 */
  playEvolve() {
    if (!this.ctx || !this.sfxEnabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const g5 = 783.99;
    const seq = [PENT.A4, PENT.D5, PENT.E5, g5, PENT.A4 * 2];
    seq.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "sine";
      osc2.type = "triangle";
      osc.frequency.value = f;
      osc2.frequency.value = f * 2.01;
      filter.type = "lowpass";
      filter.frequency.value = 2800;
      const t0 = now + i * 0.11;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      if (this.reverb) gain.connect(this.reverb.input);
      osc.start(t0);
      osc2.start(t0);
      osc.stop(t0 + 1.15);
      osc2.stop(t0 + 1.15);
    });
  }

  playPortalCue() {
    if (!this.ctx || !this.sfxEnabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [PENT.D4, PENT.A4, PENT.D5];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t0 = now + i * 0.14;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.1, t0 + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      if (this.reverb) gain.connect(this.reverb.input);
      osc.start(t0);
      osc.stop(t0 + 0.95);
    });
  }
}

export const audio = new AudioManager();
