/**
 * Web-Audio-Fundament: Lazy AudioContext (Unlock bei erster User-Geste),
 * Bus-Graph SFX/Musik -> Master -> Compressor (Sicherheits-Limiter fuer
 * Kinderohren) -> Ausgang. Stimmen-Limit + Throttling pro Sound.
 * 100 % prozedural — null Downloads, null Lizenzfragen.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private musicGainNode: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private voices = 0;
  private readonly maxVoices = 12;
  private readonly lastPlayed = new Map<string, number>();

  private masterVolume = 0.5;
  private sfxVolume = 0.8;
  private musicVolume = 0.5;
  private muted = false;
  private ducked = false;

  /** Bei erster Pointer-/Tasten-Geste aufrufen (Autoplay-Policy). */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch (err) {
        console.warn('Neon Arena: Web Audio nicht verfuegbar.', err);
        return;
      }
      const ctx = this.ctx;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      compressor.connect(ctx.destination);

      this.masterGain = ctx.createGain();
      this.masterGain.connect(compressor);
      this.sfxGainNode = ctx.createGain();
      this.sfxGainNode.connect(this.masterGain);
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 20000;
      this.musicGainNode = ctx.createGain();
      this.musicGainNode.connect(this.musicFilter);
      this.musicFilter.connect(this.masterGain);

      // 1 s weisses Rauschen, einmal erzeugt und wiederverwendet
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get sfxBus(): GainNode | null {
    return this.sfxGainNode;
  }

  get musicBus(): GainNode | null {
    return this.musicGainNode;
  }

  get noiseBuffer(): AudioBuffer | null {
    return this.noiseBuf;
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setVolumes(master: number, sfx: number, music: number, muted: boolean): void {
    this.masterVolume = master;
    this.sfxVolume = sfx;
    this.musicVolume = music;
    this.muted = muted;
    this.applyVolumes();
  }

  /** Upgrade-Screen: Musik auf 40 % + Lowpass 400 Hz ("Unterwasser"). */
  duckMusic(on: boolean): void {
    this.ducked = on;
    if (!this.ctx || !this.musicFilter) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.cancelScheduledValues(t);
    this.musicFilter.frequency.linearRampToValueAtTime(on ? 400 : 20000, t + 0.15);
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGainNode || !this.musicGainNode) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, t, 0.05);
    this.sfxGainNode.gain.setTargetAtTime(this.sfxVolume, t, 0.05);
    this.musicGainNode.gain.setTargetAtTime(this.musicVolume * (this.ducked ? 0.4 : 1), t, 0.1);
  }

  /**
   * Stimme anfordern: false bei Throttle/Limit. duration in Sekunden
   * fuer die automatische Freigabe.
   */
  acquireVoice(key: string, throttleMs: number, duration: number): boolean {
    if (!this.ctx) return false;
    const now = performance.now();
    const last = this.lastPlayed.get(key) ?? -Infinity;
    if (now - last < throttleMs) return false;
    if (this.voices >= this.maxVoices) return false;
    this.lastPlayed.set(key, now);
    this.voices++;
    window.setTimeout(
      () => {
        this.voices = Math.max(0, this.voices - 1);
      },
      duration * 1000 + 50,
    );
    return true;
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
