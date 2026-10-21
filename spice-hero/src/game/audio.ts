/**
 * 効果音とBGM（Web Audio API で音をコードで作る。音声ファイル不要）。
 * ブラウザの決まりで、最初のタップ/キー入力のあとに音が出る。
 */
import type { Settings } from '../core/state.ts';

type Note = [number | null, number]; // [MIDI番号 or null（休み）, 拍数]
interface Theme { bpm: number; lead: Note[]; bass: Note[]; leadWave?: OscillatorType; leadGain?: number }

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

// 南アジアっぽい音階（ミ・ファ・ソ#・ラ・シ・ド・レ）を、フィールドと戦闘で使う
const THEMES: Record<string, Theme> = {
  village: {
    bpm: 96, leadWave: 'triangle', leadGain: 0.22,
    lead: [[72, 1], [76, 1], [79, 1], [76, 1], [74, 1], [77, 1], [81, 2], [79, 1], [76, 1], [72, 1], [76, 1], [74, 2], [null, 2],
      [72, 1], [76, 1], [79, 1], [84, 1], [83, 1], [79, 1], [76, 2], [77, 1], [74, 1], [71, 1], [74, 1], [72, 2], [null, 2]],
    bass: [[48, 2], [55, 2], [53, 2], [55, 2], [48, 2], [55, 2], [53, 2], [55, 2], [48, 2], [55, 2], [53, 2], [55, 2], [47, 2], [55, 2], [48, 4]],
  },
  field: {
    bpm: 112, leadWave: 'square', leadGain: 0.12,
    lead: [[69, 1], [72, 1], [73, 1], [76, 2], [74, 1], [72, 1], [69, 2], [71, 1], [72, 1], [74, 1], [76, 1], [77, 2], [76, 2],
      [76, 1], [77, 1], [80, 1], [81, 2], [80, 1], [77, 1], [76, 2], [74, 1], [72, 1], [71, 1], [69, 3], [null, 1]],
    bass: [[45, 1], [52, 1], [45, 1], [52, 1], [45, 1], [52, 1], [45, 1], [52, 1], [41, 1], [48, 1], [41, 1], [48, 1], [44, 1], [51, 1], [44, 1], [51, 1],
      [45, 1], [52, 1], [45, 1], [52, 1], [41, 1], [48, 1], [41, 1], [48, 1], [44, 1], [51, 1], [45, 3]],
  },
  inn: {
    bpm: 80, leadWave: 'triangle', leadGain: 0.2,
    lead: [[72, 2], [76, 1], [79, 1], [84, 2], [79, 2], [77, 2], [76, 1], [72, 1], [74, 4], [null, 2]],
    bass: [[48, 4], [53, 4], [55, 4], [48, 4]],
  },
  battle: {
    bpm: 150, leadWave: 'square', leadGain: 0.11,
    lead: [[76, 0.5], [77, 0.5], [80, 1], [81, 0.5], [80, 0.5], [77, 1], [76, 1], [null, 1], [74, 0.5], [76, 0.5], [77, 1], [80, 1], [81, 1], [84, 2], [83, 1], [81, 1],
      [80, 0.5], [81, 0.5], [84, 1], [83, 0.5], [81, 0.5], [80, 1], [77, 2], [76, 0.5], [77, 0.5], [76, 1], [74, 1], [72, 1], [69, 3], [null, 1]],
    bass: [[45, 0.5], [45, 0.5], [57, 0.5], [45, 0.5], [45, 0.5], [57, 0.5], [45, 0.5], [57, 0.5], [41, 0.5], [41, 0.5], [53, 0.5], [41, 0.5], [41, 0.5], [53, 0.5], [41, 0.5], [53, 0.5],
      [44, 0.5], [44, 0.5], [56, 0.5], [44, 0.5], [44, 0.5], [56, 0.5], [44, 0.5], [56, 0.5], [45, 0.5], [45, 0.5], [57, 0.5], [45, 0.5], [45, 0.5], [57, 0.5], [45, 0.5], [57, 0.5]],
  },
  boss: {
    bpm: 168, leadWave: 'sawtooth', leadGain: 0.09,
    lead: [[69, 0.5], [70, 0.5], [73, 1], [69, 0.5], [70, 0.5], [73, 1], [76, 1], [75, 1], [73, 1], [70, 1], [69, 2], [null, 2],
      [81, 0.5], [80, 0.5], [77, 1], [76, 1], [73, 1], [76, 0.5], [77, 0.5], [80, 1], [81, 2], [null, 2]],
    bass: [[33, 0.5], [33, 0.5], [45, 0.5], [33, 0.5], [33, 0.5], [45, 0.5], [33, 0.5], [45, 0.5], [34, 0.5], [34, 0.5], [46, 0.5], [34, 0.5], [34, 0.5], [46, 0.5], [34, 0.5], [46, 0.5]],
  },
};

export type SeName =
  | 'confirm' | 'cancel' | 'cursor' | 'save' | 'unlock' | 'hit' | 'crit' | 'miss' | 'heal' | 'spell' | 'step' | 'door'
  | 'chest' | 'levelup' | 'victory' | 'defeat' | 'run' | 'coconut' | 'buff' | 'enemy_hit';

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bgmGain!: GainNode;
  private seGain!: GainNode;
  private timer: number | null = null;
  private current: string | null = null;
  private nextTime = 0;
  private idx = { lead: 0, bass: 0 };
  private t = { lead: 0, bass: 0 };

  constructor(private getSettings: () => Settings) {
    const unlock = () => { this.ensure(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.seGain = this.ctx.createGain();
      this.bgmGain.connect(this.master);
      this.seGain.connect(this.master);
      this.applyVolume();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  applyVolume(): void {
    if (!this.ctx) return;
    const s = this.getSettings();
    this.bgmGain.gain.value = s.bgm * 0.5;
    this.seGain.gain.value = s.se * 0.7;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, dest: AudioNode, slideTo?: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private noise(start: number, dur: number, gain: number, dest: AudioNode, freq = 1800): void {
    const c = this.ctx!;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(dest);
    src.start(start);
  }

  se(name: SeName): void {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime;
    const d = this.seGain;
    const seq = (notes: [number, number][], type: OscillatorType = 'square', gain = 0.25, step = 0.07) =>
      notes.forEach(([m, len], i) => this.tone(mtof(m), t + i * step, len, type, gain, d));
    switch (name) {
      case 'confirm': seq([[79, 0.06], [84, 0.1]], 'square', 0.2, 0.05); break;
      case 'cancel': seq([[72, 0.06], [67, 0.1]], 'square', 0.2, 0.05); break;
      case 'cursor': this.tone(mtof(84), t, 0.04, 'square', 0.12, d); break;
      case 'step': this.noise(t, 0.03, 0.05, d, 400); break;
      case 'door': seq([[60, 0.08], [55, 0.12]], 'triangle', 0.3, 0.07); break;
      case 'save': seq([[72, 0.1], [76, 0.1], [79, 0.1], [84, 0.25]], 'triangle', 0.3, 0.09); break;
      case 'unlock': seq([[67, 0.08], [72, 0.08], [76, 0.08], [79, 0.08], [84, 0.3]], 'square', 0.2, 0.07); break;
      case 'chest': seq([[72, 0.08], [76, 0.08], [79, 0.2]], 'triangle', 0.3, 0.07); break;
      case 'coconut': this.tone(180, t, 0.12, 'triangle', 0.4, d, 90); this.tone(mtof(79), t + 0.12, 0.12, 'square', 0.15, d); break;
      case 'hit': this.noise(t, 0.14, 0.5, d, 900); this.tone(160, t, 0.12, 'square', 0.25, d, 70); break;
      case 'enemy_hit': this.noise(t, 0.16, 0.5, d, 600); this.tone(120, t, 0.14, 'sawtooth', 0.2, d, 50); break;
      case 'crit': this.noise(t, 0.2, 0.6, d, 1400); seq([[84, 0.06], [91, 0.14]], 'square', 0.25, 0.05); break;
      case 'miss': this.tone(mtof(72), t, 0.2, 'triangle', 0.15, d, mtof(60)); break;
      case 'heal': seq([[72, 0.08], [76, 0.08], [79, 0.08], [84, 0.08], [88, 0.2]], 'triangle', 0.25, 0.06); break;
      case 'buff': seq([[69, 0.08], [74, 0.08], [81, 0.2]], 'triangle', 0.25, 0.07); break;
      case 'spell': this.tone(mtof(60), t, 0.4, 'sawtooth', 0.12, d, mtof(96)); this.noise(t + 0.1, 0.3, 0.15, d, 3000); break;
      case 'run': this.noise(t, 0.35, 0.3, d, 500); break;
      case 'levelup': seq([[72, 0.1], [76, 0.1], [79, 0.1], [84, 0.1], [79, 0.1], [84, 0.1], [88, 0.4]], 'square', 0.2, 0.09); break;
      case 'victory': seq([[72, 0.12], [72, 0.12], [72, 0.12], [76, 0.12], [79, 0.12], [76, 0.12], [79, 0.5]], 'square', 0.2, 0.13); break;
      case 'defeat': seq([[67, 0.2], [64, 0.2], [60, 0.2], [55, 0.6]], 'triangle', 0.3, 0.22); break;
    }
  }

  bgm(name: string | null): void {
    if (name === this.current) return;
    this.current = name;
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    const c = this.ensure();
    if (!c || !name || !THEMES[name]) return;
    const th = THEMES[name];
    this.idx = { lead: 0, bass: 0 };
    this.nextTime = c.currentTime + 0.1;
    this.t = { lead: this.nextTime, bass: this.nextTime };
    const beat = 60 / th.bpm;
    const pump = () => {
      const now = c.currentTime;
      while (this.t.lead < now + 0.4) {
        const [m, b] = th.lead[this.idx.lead];
        if (m !== null) this.tone(mtof(m), this.t.lead, b * beat * 0.9, th.leadWave ?? 'square', th.leadGain ?? 0.12, this.bgmGain);
        this.t.lead += b * beat;
        this.idx.lead = (this.idx.lead + 1) % th.lead.length;
      }
      while (this.t.bass < now + 0.4) {
        const [m, b] = th.bass[this.idx.bass];
        if (m !== null) this.tone(mtof(m), this.t.bass, b * beat * 0.85, 'triangle', 0.22, this.bgmGain);
        this.t.bass += b * beat;
        this.idx.bass = (this.idx.bass + 1) % th.bass.length;
      }
    };
    pump();
    this.timer = window.setInterval(pump, 120);
  }

  stopBgm(): void { this.bgm(null); }
}
