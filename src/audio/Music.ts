import type { EventBus } from '../core/EventBus';
import type { AudioEngine } from './AudioEngine';

/**
 * Prozeduraler Synthwave-Loop: Lookahead-Sequencer ("A Tale of Two Clocks"),
 * 16 Steps pro Takt, Akkordfolge Am-F-C-G. Tempo und Layer wachsen mit den
 * Wellen, Bosse bekommen harmonisches Moll + Dauerdrohn. Sample-genau ueber
 * ctx.currentTime, unabhaengig vom Frame-Loop.
 */

// Akkorde: [Bass-Grundton, Bass-Quinte, Arp-Noten]
const CHORDS: ReadonlyArray<{ root: number; fifth: number; arp: readonly number[] }> = [
  { root: 110.0, fifth: 164.81, arp: [220, 261.63, 329.63, 440] }, // Am
  { root: 87.31, fifth: 130.81, arp: [174.61, 220, 261.63, 349.23] }, // F
  { root: 130.81, fifth: 196.0, arp: [261.63, 329.63, 392, 523.25] }, // C
  { root: 98.0, fifth: 146.83, arp: [196, 246.94, 293.66, 392] }, // G
];

// Boss-Variante: harmonisches Moll (Gis statt G im Arpeggio)
const CHORDS_BOSS: ReadonlyArray<{ root: number; fifth: number; arp: readonly number[] }> = [
  { root: 110.0, fifth: 164.81, arp: [220, 261.63, 329.63, 415.3] },
  { root: 87.31, fifth: 130.81, arp: [174.61, 220, 277.18, 349.23] },
  { root: 130.81, fifth: 196.0, arp: [261.63, 329.63, 415.3, 523.25] },
  { root: 103.83, fifth: 155.56, arp: [207.65, 246.94, 311.13, 415.3] }, // G#dim-artig
];

export class Music {
  private intervalId = 0;
  private nextNoteTime = 0;
  private step = 0;
  private wave = 1;
  private bossMode = false;
  private running = false;
  private drone: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;

  constructor(
    private readonly engine: AudioEngine,
    private readonly events: EventBus,
  ) {}

  private get bpm(): number {
    const base = Math.min(112 + (this.wave - 1) * 4, 152);
    return base + (this.bossMode ? 10 : 0);
  }

  private get stepDur(): number {
    // 16tel-Noten
    return 60 / this.bpm / 4;
  }

  start(): void {
    const ctx = this.engine.context;
    if (!ctx || this.running) return;
    this.running = true;
    this.step = 0;
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.intervalId = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    this.running = false;
    window.clearInterval(this.intervalId);
    this.stopDrone();
  }

  setWave(wave: number): void {
    this.wave = wave;
  }

  setBossMode(on: boolean): void {
    if (this.bossMode === on) return;
    this.bossMode = on;
    if (on) this.startDrone();
    else this.stopDrone();
  }

  private schedule(): void {
    const ctx = this.engine.context;
    if (!ctx || !this.running) return;
    // Nach Timer-Throttling (Tab im Hintergrund) NICHT alle verpassten
    // Steps nachholen — das waere ein Burst aus hunderten Oszillatoren.
    if (this.nextNoteTime < ctx.currentTime - 0.2) {
      this.nextNoteTime = ctx.currentTime + 0.05;
    }
    // Noten 0.1 s im Voraus planen — sample-genau, kein Jitter
    while (this.nextNoteTime < ctx.currentTime + 0.1) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += this.stepDur;
      this.step = (this.step + 1) % 64; // 4 Takte à 16 Steps
    }
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;
    const chords = this.bossMode ? CHORDS_BOSS : CHORDS;
    const chord = chords[bar] as (typeof CHORDS)[number];

    // Kick: jede Viertel (Boss: jede Achtel)
    const kickEvery = this.bossMode ? 2 : 4;
    if (stepInBar % kickEvery === 0) {
      this.kick(t);
      if (stepInBar % 4 === 0) this.events.emit('musicBeat', { step: stepInBar / 4 });
    }

    // Hat auf Offbeats ab Welle 5
    if (this.wave >= 5 && stepInBar % 4 === 2) this.hat(t);

    // Bass: Achtelnoten Grundton/Quinte
    if (stepInBar % 2 === 0) {
      const freq = stepInBar % 8 === 4 ? chord.fifth : chord.root;
      this.bass(freq, t);
    }

    // Arpeggio ab Welle 3
    if (this.wave >= 3 && stepInBar % 2 === 1) {
      const arpIdx = Math.floor(stepInBar / 2) % chord.arp.length;
      this.arp(chord.arp[arpIdx] as number, t);
    }
  }

  private kick(t: number): void {
    const ctx = this.engine.context;
    const bus = this.engine.musicBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.1);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  private hat(t: number): void {
    const ctx = this.engine.context;
    const bus = this.engine.musicBus;
    const buf = this.engine.noiseBuffer;
    if (!ctx || !bus || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(t);
    src.stop(t + 0.05);
  }

  private bass(freq: number, t: number): void {
    const ctx = this.engine.context;
    const bus = this.engine.musicBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + this.stepDur * 1.8);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    osc.start(t);
    osc.stop(t + this.stepDur * 2);
  }

  private arp(freq: number, t: number): void {
    const ctx = this.engine.context;
    const bus = this.engine.musicBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // Delay-Kette pro Note (kurzlebig) — instant Synthwave
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.23;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    gain.connect(bus);
    gain.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(bus);
    osc.start(t);
    osc.stop(t + 0.9); // Delay-Schwanz ausklingen lassen
  }

  private startDrone(): void {
    const ctx = this.engine.context;
    const bus = this.engine.musicBus;
    if (!ctx || !bus || this.drone) return;
    this.drone = ctx.createOscillator();
    this.droneGain = ctx.createGain();
    this.drone.type = 'sawtooth';
    this.drone.frequency.value = 55;
    this.droneGain.gain.setValueAtTime(0, ctx.currentTime);
    this.droneGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 1);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    this.drone.connect(filter);
    filter.connect(this.droneGain);
    this.droneGain.connect(bus);
    this.drone.start();
  }

  private stopDrone(): void {
    const ctx = this.engine.context;
    if (this.drone && this.droneGain && ctx) {
      this.droneGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      this.drone.stop(ctx.currentTime + 0.6);
    }
    this.drone = null;
    this.droneGain = null;
  }

  dispose(): void {
    this.stop();
  }
}
