// Âm thanh tự sinh bằng Web Audio, không dùng file nào.
// - AudioContext chỉ được tạo trong lần chạm/bấm phím đầu tiên (chính sách autoplay của trình duyệt).
// - Tab ẩn: tạm dừng context và bộ lên lịch nhạc; hiện lại thì chạy tiếp.
// - Mỗi "giọng" (nốt, tiếng động) tự ngắt kết nối khi kết thúc để không rò bộ nhớ.
import { generateSong, midiToHz, STEPS_PER_BAR, type Song } from './synth';

export type SoundName =
  'keyboard' | 'ting' | 'printer' | 'coffee' | 'levelup' | 'fanfare' | 'alert';

export interface AudioSettings {
  enabled: boolean;
  /** 0..1 */
  volume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { enabled: true, volume: 0.6 };

export interface AudioStats {
  unlocked: boolean;
  enabled: boolean;
  state: AudioContextState | 'none';
  activeVoices: number;
  musicRunning: boolean;
}

const LOOKAHEAD_SECONDS = 0.25;
const SCHEDULER_MS = 60;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private settings: AudioSettings;
  private readonly song: Song;
  private schedulerId: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private activeVoices = 0;
  private disposed = false;

  private readonly onVisibility = (): void => {
    this.syncRunning();
  };

  constructor(settings: AudioSettings, melodySeed: string) {
    this.settings = { ...settings };
    this.song = generateSong(melodySeed);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Không khí trong ngày (lịch): thứ Hai chậm, thứ Sáu nhanh, ngày lương/Tết cao giọng. */
  private moodTempo = 1;
  private moodTranspose = 0;

  setMood(mood: 'tet' | 'payday' | 'monday' | 'friday' | 'weekend' | 'normal'): void {
    this.moodTempo = mood === 'monday' ? 0.85 : mood === 'friday' || mood === 'tet' ? 1.12 : 1;
    this.moodTranspose = mood === 'payday' ? 2 : mood === 'tet' ? 5 : mood === 'monday' ? -2 : 0;
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  /** Gọi trong trình xử lý sự kiện chạm/bấm phím của người dùng. */
  unlock(): void {
    if (this.ctx || this.disposed) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.masterLevel();
    this.master.connect(ctx.destination);

    // Nhạc đi qua bộ lọc thấp cho mềm, kiểu "lofi".
    const lofi = ctx.createBiquadFilter();
    lofi.type = 'lowpass';
    lofi.frequency.value = 2400;
    lofi.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(lofi);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.8;
    this.sfxBus.connect(this.master);

    this.noise = createNoiseBuffer(ctx, 2);
    this.startAirConditioner();
    this.syncRunning();
  }

  setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
    this.syncRunning();
  }

  setVolume(volume: number): void {
    this.settings.volume = Math.min(1, Math.max(0, volume));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.masterLevel(), this.ctx.currentTime, 0.05);
    }
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (ctx?.state !== 'running' || !this.sfxBus) return;
    const t = ctx.currentTime + 0.01;
    switch (name) {
      case 'keyboard':
        this.keyClick(t);
        break;
      case 'ting':
        this.ting(t);
        break;
      case 'printer':
        this.printer(t);
        break;
      case 'coffee':
        this.coffee(t);
        break;
      case 'levelup':
        this.levelUp(t);
        break;
      case 'fanfare':
        this.fanfare(t);
        break;
      case 'alert':
        this.alert(t);
        break;
    }
  }

  stats(): AudioStats {
    return {
      unlocked: this.ctx !== null,
      enabled: this.settings.enabled,
      state: this.ctx?.state ?? 'none',
      activeVoices: this.activeVoices,
      musicRunning: this.schedulerId !== null,
    };
  }

  dispose(): void {
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.stopScheduler();
    void this.ctx?.close();
    this.ctx = null;
  }

  // -------------------------------------------------------------------------

  private masterLevel(): number {
    // Tai người nghe âm lượng theo thang log: bình phương cho thanh trượt dễ chỉnh hơn.
    return this.settings.volume * this.settings.volume;
  }

  /** Chạy khi bật + đã mở khóa + tab đang hiện; ngược lại tạm dừng hẳn context. */
  private syncRunning(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const shouldRun = this.settings.enabled && !document.hidden;
    if (shouldRun) {
      void ctx.resume().then(() => {
        if (this.settings.enabled && !document.hidden) this.startScheduler();
      });
    } else {
      this.stopScheduler();
      void ctx.suspend();
    }
  }

  private startScheduler(): void {
    if (this.schedulerId !== null || !this.ctx) return;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.schedulerId = window.setInterval(() => {
      this.scheduleMusic();
    }, SCHEDULER_MS);
  }

  private stopScheduler(): void {
    if (this.schedulerId !== null) window.clearInterval(this.schedulerId);
    this.schedulerId = null;
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (ctx?.state !== 'running') return;
    // Lỡ nhịp quá lâu (máy giật): bắt nhịp lại thay vì phát dồn.
    if (this.nextStepTime < ctx.currentTime - 0.2) this.nextStepTime = ctx.currentTime + 0.05;
    const stepSeconds = 60 / (this.song.bpm * this.moodTempo) / 2;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD_SECONDS) {
      const totalSteps = this.song.melody.length;
      const i = this.step % totalSteps;
      const inBar = i % STEPS_PER_BAR;
      const bar = Math.floor(i / STEPS_PER_BAR);
      // Swing nhẹ: nốt phách lẻ chậm một chút.
      const t = this.nextStepTime + (inBar % 2 === 1 ? stepSeconds * 0.16 : 0);

      if (inBar === 0) this.pad(this.song.chords[bar] ?? [], t, stepSeconds * STEPS_PER_BAR);
      if (inBar === 0 || inBar === 4) this.kick(t);
      if (inBar % 2 === 1) this.hat(t, inBar === 3 || inBar === 7 ? 0.05 : 0.03);
      const note = this.song.melody[i];
      if (note !== null && note !== undefined)
        this.pluck(midiToHz(note + 12 + this.moodTranspose), t, stepSeconds * 1.8);

      this.step += 1;
      this.nextStepTime += stepSeconds;
    }
  }

  // ---------- Khối dựng âm thanh ----------

  /** Theo dõi số giọng đang phát; tự ngắt nối khi nguồn kết thúc. */
  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    this.activeVoices += 1;
    source.onended = () => {
      this.activeVoices -= 1;
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  private envelope(gain: GainNode, t: number, peak: number, attack: number, release: number): void {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  private tone(
    bus: AudioNode,
    type: OscillatorType,
    frequency: number,
    t: number,
    peak: number,
    attack: number,
    release: number,
    filterHz?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    this.envelope(gain, t, peak, attack, release);
    const nodes: AudioNode[] = [gain];
    if (filterHz) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterHz;
      osc.connect(filter).connect(gain);
      nodes.push(filter);
    } else {
      osc.connect(gain);
    }
    gain.connect(bus);
    osc.start(t);
    osc.stop(t + attack + release + 0.05);
    this.track(osc, nodes);
  }

  private noiseBurst(
    bus: AudioNode,
    t: number,
    duration: number,
    peak: number,
    filterType: BiquadFilterType,
    frequency: number,
    q = 1,
  ): BiquadFilterNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return null;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    this.envelope(gain, t, peak, Math.min(0.01, duration / 4), duration);
    source.connect(filter).connect(gain).connect(bus);
    source.start(t, Math.random() * 1.5);
    source.stop(t + duration + 0.05);
    this.track(source, [filter, gain]);
    return filter;
  }

  /** Tiếng điều hòa: nhiễu trắng qua hai tầng lọc thấp, lặp liên tục, "thở" rất chậm. */
  private startAirConditioner(): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.master) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const low1 = ctx.createBiquadFilter();
    low1.type = 'lowpass';
    low1.frequency.value = 380;
    const low2 = ctx.createBiquadFilter();
    low2.type = 'lowpass';
    low2.frequency.value = 600;
    const gain = ctx.createGain();
    gain.gain.value = 0.11;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(low1.frequency);
    source.connect(low1).connect(low2).connect(gain).connect(this.master);
    source.start();
    lfo.start();
  }

  private keyClick(t: number): void {
    if (!this.sfxBus) return;
    this.noiseBurst(
      this.sfxBus,
      t,
      0.035,
      0.18 + Math.random() * 0.1,
      'bandpass',
      2600 + Math.random() * 1600,
      1.4,
    );
    this.tone(this.sfxBus, 'square', 1700 + Math.random() * 300, t, 0.02, 0.002, 0.015, 3000);
  }

  private ting(t: number): void {
    if (!this.sfxBus) return;
    this.tone(this.sfxBus, 'sine', 1318.5, t, 0.22, 0.004, 1.1);
    this.tone(this.sfxBus, 'sine', 1975.5, t, 0.1, 0.004, 0.8);
    this.tone(this.sfxBus, 'sine', 1318.5, t + 0.12, 0.12, 0.004, 0.9);
  }

  private printer(t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    // Động cơ kéo giấy: sóng răng cưa trầm, lọc thấp, rung theo từng dòng in.
    for (let i = 0; i < 6; i += 1) {
      this.tone(this.sfxBus, 'sawtooth', 96 + (i % 2) * 6, t + i * 0.22, 0.09, 0.02, 0.16, 520);
      this.noiseBurst(this.sfxBus, t + i * 0.22 + 0.05, 0.12, 0.05, 'bandpass', 1800, 2);
    }
    // Giấy trượt ra.
    const filter = this.noiseBurst(this.sfxBus, t + 1.4, 0.45, 0.12, 'bandpass', 900, 0.8);
    filter?.frequency.exponentialRampToValueAtTime(3000, t + 1.85);
  }

  private coffee(t: number): void {
    if (!this.sfxBus) return;
    // Máy xay rè rè, nước chảy, rồi tiếng ly chạm đĩa.
    this.tone(this.sfxBus, 'sawtooth', 140, t, 0.05, 0.05, 0.6, 400);
    const pour = this.noiseBurst(this.sfxBus, t + 0.5, 1.2, 0.12, 'bandpass', 700, 1.2);
    pour?.frequency.linearRampToValueAtTime(1100, t + 1.7);
    this.tone(this.sfxBus, 'sine', 2637, t + 1.85, 0.12, 0.002, 0.35);
    this.tone(this.sfxBus, 'sine', 3951, t + 1.85, 0.06, 0.002, 0.25);
    this.tone(this.sfxBus, 'sine', 2793, t + 1.98, 0.05, 0.002, 0.3);
  }

  /** Lên cấp: arpeggio ngũ cung đi lên, ngắn gọn. */
  private levelUp(t: number): void {
    if (!this.sfxBus) return;
    [72, 76, 79, 84].forEach((note, i) => {
      if (this.sfxBus)
        this.tone(this.sfxBus, 'triangle', midiToHz(note), t + i * 0.07, 0.14, 0.005, 0.35, 3200);
    });
  }

  /** Thăng chức: kèn chiến thắng (hai hợp âm + giai điệu đi lên). */
  private fanfare(t: number): void {
    const bus = this.sfxBus;
    if (!bus) return;
    const melody: [number, number, number][] = [
      [67, 0, 0.18],
      [72, 0.18, 0.18],
      [76, 0.36, 0.18],
      [79, 0.54, 0.5],
      [76, 1.04, 0.16],
      [79, 1.2, 0.9],
    ];
    for (const [note, at, length] of melody) {
      this.tone(bus, 'sawtooth', midiToHz(note), t + at, 0.06, 0.02, length, 2200);
      this.tone(bus, 'square', midiToHz(note + 12), t + at, 0.025, 0.02, length * 0.8, 3000);
    }
    for (const [chord, at] of [
      [[60, 64, 67], 0.54],
      [[60, 65, 69], 1.2],
    ] as const) {
      for (const note of chord)
        this.tone(bus, 'triangle', midiToHz(note), t + at, 0.05, 0.05, 1.1, 1500);
    }
    this.noiseBurst(bus, t + 1.2, 0.6, 0.06, 'highpass', 6000);
  }

  /** Sự kiện phòng: hai tiếng "bíp" vui (không gắt). */
  private alert(t: number): void {
    const bus = this.sfxBus;
    if (!bus) return;
    this.tone(bus, 'square', midiToHz(81), t, 0.05, 0.005, 0.12, 2400);
    this.tone(bus, 'square', midiToHz(84), t + 0.16, 0.05, 0.005, 0.16, 2400);
  }

  private pluck(frequency: number, t: number, length: number): void {
    if (!this.musicBus) return;
    this.tone(this.musicBus, 'triangle', frequency, t, 0.16, 0.01, length, 1800);
    this.tone(this.musicBus, 'sine', frequency * 2, t, 0.03, 0.01, length * 0.6);
  }

  private pad(notes: readonly number[], t: number, length: number): void {
    if (!this.musicBus) return;
    for (const note of notes) {
      this.tone(
        this.musicBus,
        'sine',
        midiToHz(note) * (1 + (Math.random() - 0.5) * 0.002),
        t,
        0.045,
        0.4,
        length,
        900,
      );
    }
  }

  private kick(t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const gain = ctx.createGain();
    this.envelope(gain, t, 0.35, 0.005, 0.25);
    osc.connect(gain).connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.32);
    this.track(osc, [gain]);
  }

  private hat(t: number, peak: number): void {
    if (!this.musicBus) return;
    this.noiseBurst(this.musicBus, t, 0.04, peak, 'highpass', 7000);
  }
}

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}
