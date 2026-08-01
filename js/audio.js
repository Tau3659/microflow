/**
 * Web Audio：舒缓空灵 BGM（无缝循环）+ 升级音效 + 攻击性生物逼近层
 * 设置持久化到 localStorage
 */

const STORAGE_KEY = "microflow-audio";

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
    this.musicVolume = saved.musicVolume ?? 0.45;
    this.sfxVolume = saved.sfxVolume ?? 0.55;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.threatGain = null;
    this.bgmNodes = [];
    this.threatNodes = [];
    this.started = false;
    this._threatLevel = 0;
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
    this.musicGain.gain.setTargetAtTime(music * 0.55, t, 0.08);
    this.sfxGain.gain.cancelScheduledValues(t);
    this.sfxGain.gain.setTargetAtTime(sfx, t, 0.05);
    // threat 叠在 music 总线旁，受 music 开关与音量影响
    if (this.threatGain) {
      const threat = this.musicEnabled ? this.musicVolume * this._threatLevel * 0.7 : 0;
      this.threatGain.gain.setTargetAtTime(threat, t, 0.12);
    }
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
    return [lfo, g];
  }

  _startBgm() {
    const ctx = this.ctx;
    const out = this.musicGain;
    // 空灵 pad：两层低通正弦 + 柔和噪声
    const freqs = [110, 164.81, 220, 329.63];
    for (let i = 0; i < freqs.length; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = freqs[i];
      filter.type = "lowpass";
      filter.frequency.value = 600 + i * 120;
      filter.Q.value = 0.4;
      gain.gain.value = 0.045 + (i === 0 ? 0.03 : 0);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      this._lfo(0.04 + i * 0.015, 6 + i * 2, osc);
      this._lfo(0.03 + i * 0.01, 80, filter);
      osc.start();
      this.bgmNodes.push(osc, gain, filter);
    }

    // 缓慢闪烁的高音铃片（极轻）
    const sparkle = ctx.createOscillator();
    const sparkleGain = ctx.createGain();
    const sparkleFilter = ctx.createBiquadFilter();
    sparkle.type = "sine";
    sparkle.frequency.value = 880;
    sparkleFilter.type = "bandpass";
    sparkleFilter.frequency.value = 1200;
    sparkleFilter.Q.value = 8;
    sparkleGain.gain.value = 0.012;
    sparkle.connect(sparkleFilter);
    sparkleFilter.connect(sparkleGain);
    sparkleGain.connect(out);
    const pulse = ctx.createOscillator();
    const pulseGain = ctx.createGain();
    pulse.frequency.value = 0.07;
    pulseGain.gain.value = 0.01;
    pulse.connect(pulseGain);
    pulseGain.connect(sparkleGain.gain);
    sparkle.start();
    pulse.start();
    this.bgmNodes.push(sparkle, sparkleGain, sparkleFilter, pulse, pulseGain);

    // 柔噪声底
    const bufferSize = ctx.sampleRate * 4;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * 0.15;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 400;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.02;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(out);
    noise.start();
    this.bgmNodes.push(noise, noiseFilter, noiseGain);
  }

  _startThreatPad() {
    const ctx = this.ctx;
    const out = this.threatGain;
    // 低沉不协和逼近层
    const freqs = [55, 58.5, 82.5];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      filter.type = "lowpass";
      filter.frequency.value = 220;
      gain.gain.value = 0.08;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      this._lfo(0.12, 3, osc);
      osc.start();
      this.threatNodes.push(osc, gain, filter);
    }
  }

  /** threat 0..1，距离越近越大 */
  setThreatLevel(level) {
    this._threatLevel = Math.max(0, Math.min(1, level));
    if (!this.threatGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    const v = this.musicEnabled ? this.musicVolume * this._threatLevel * 0.75 : 0;
    this.threatGain.gain.setTargetAtTime(v, t, 0.18);
  }

  /** 升级音效：空灵上行琶音，贴合 BGM */
  playEvolve() {
    if (!this.ctx || !this.sfxEnabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [329.63, 392.0, 493.88, 659.25, 783.99];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "sine";
      osc.frequency.value = f;
      filter.type = "lowpass";
      filter.frequency.value = 2400;
      const t0 = now + i * 0.09;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.85);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.9);
    });
  }

  playPortalCue() {
    if (!this.ctx || !this.sfxEnabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.5);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.75);
  }
}

export const audio = new AudioManager();
