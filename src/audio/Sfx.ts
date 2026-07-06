import type { EventBus } from '../core/EventBus';
import type { AudioEngine } from './AudioEngine';

type OscType = OscillatorType;

/**
 * Alle Soundeffekte als kleine Synth-Rezepte (Oszillatoren + Noise-Buffer).
 * Abonniert den EventBus — Gameplay-Code weiss nichts von Sounds.
 * Regeln: kurz, variiert (Detune), nichts lauter als der Spieler-Treffer,
 * keine Dauerenergie ueber 8 kHz.
 */
export class Sfx {
  private readonly unsubs: Array<() => void> = [];
  private pickupStep = 0;
  private lastPickupTime = 0;

  constructor(
    private readonly engine: AudioEngine,
    events: EventBus,
  ) {
    const u = this.unsubs;
    u.push(
      events.on('shotFired', () => this.shoot()),
      events.on('enemyShot', () => this.enemyShoot()),
      events.on('enemyHit', (e) => (e.crit ? this.crit() : this.hit())),
      events.on('enemyKilled', (e) => this.pop(e.scale)),
      events.on('playerHit', () => this.playerHit()),
      events.on('playerHealed', () => this.heal()),
      events.on('playerDashed', () => this.dash()),
      events.on('dashReady', () => this.ready()),
      events.on('pickupCollected', (e) => {
        if (e.kind === 'core') this.pickup();
        else if (e.kind === 'heart') this.heal();
        else this.magnet();
      }),
      events.on('explosion', () => this.explosion()),
      events.on('upgradeChosen', (e) => (e.rarity === 'legendary' ? this.legendaryChosen() : this.upgrade())),
      events.on('waveStarted', (e) => (e.isBossWave ? this.bossIntro() : this.waveStart())),
      events.on('waveCleared', () => this.fanfare()),
      events.on('bossTelegraph', () => this.warning()),
      events.on('bossDied', () => this.bossDeath()),
      events.on('playerDied', () => this.gameOver()),
      events.on('playerRevived', () => this.revive()),
      events.on('uiHover', () => this.uiHover()),
      events.on('uiClick', () => this.uiClick()),
      // Neue Inhalte
      events.on('legendaryRevealed', () => this.legendaryFanfare()),
      events.on('orbitalStrike', () => this.orbitalZap()),
      events.on('enemyFuse', () => this.fuseWarning()),
      events.on('eliteSpawned', () => this.eliteSting()),
      events.on('eliteShieldBroken', () => this.shieldBreak()),
      events.on('goldenWave', () => this.goldenFanfare()),
      events.on('capsuleIncoming', () => this.capsuleSting()),
      events.on('capsuleReward', () => this.reward()),
      events.on('coreStolen', () => this.stolenBlip()),
      events.on('thiefEscaped', () => this.thiefWhoosh()),
      events.on('blackHole', () => this.blackHoleRumble()),
      events.on('stickerUnlocked', () => this.stickerFanfare()),
      // Koop: Down = dumpfer Fall, Partner-Rettung = Revive-Fanfare
      events.on('playerDowned', () => this.playerDownedThud()),
      events.on('playerCoopRevived', () => this.revive()),
    );
  }

  /** Koop: Spieler geht zu Boden — schwerer, dumpfer Fall. */
  private playerDownedThud(): void {
    if (!this.engine.acquireVoice('downed', 600, 1.0)) return;
    this.tone('sine', 130, 36, 0.45, 0.5);
    this.noise(0.35, 0.3, 'lowpass', 500, 120, 1);
  }

  /**
   * Sticker freigeschaltet: kurzes helles Dreiklang-Arpeggio — deutlich
   * leiser/kuerzer als die Legendaer-Fanfare (kein Gameplay-Moment).
   * Public: der Album-Screen nutzt sie auch fuer Belohnungs-Claims.
   */
  stickerFanfare(): void {
    if (!this.engine.acquireVoice('sticker', 800, 0.6)) return;
    this.tone('triangle', 1047, 1047, 0.12, 0.16); // C6
    this.tone('triangle', 1319, 1319, 0.12, 0.16, 0.09); // E6
    this.tone('triangle', 1568, 1568, 0.22, 0.18, 0.18); // G6
    this.noise(0.25, 0.05, 'highpass', 6000, 9000, 1, 0.18);
  }

  // ------------------------------------------------ Bausteine

  /** Oszillator mit Frequenz-Sweep und perkussiver Huellkurve. */
  private tone(
    type: OscType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    startDelay = 0,
    attack = 0.002,
  ): void {
    const ctx = this.engine.context;
    const bus = this.engine.sfxBus;
    if (!ctx || !bus) return;
    const t0 = ctx.currentTime + startDelay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Noise-Burst durch Filter (Hit/Whoosh/Explosion). */
  private noise(
    dur: number,
    vol: number,
    filterType: BiquadFilterType,
    f0: number,
    f1: number,
    q = 1,
    startDelay = 0,
  ): void {
    const ctx = this.engine.context;
    const bus = this.engine.sfxBus;
    const buf = this.engine.noiseBuffer;
    if (!ctx || !bus || !buf) return;
    const t0 = ctx.currentTime + startDelay;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(30, f0), t0);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ------------------------------------------------ Rezepte

  private shoot(): void {
    if (!this.engine.acquireVoice('shoot', 45, 0.1)) return;
    const detune = 1 + (Math.random() - 0.5) * 0.14;
    this.tone('sawtooth', 880 * detune, 220 * detune, 0.09, 0.2);
  }

  private enemyShoot(): void {
    if (!this.engine.acquireVoice('eshoot', 80, 0.12)) return;
    this.tone('square', 330, 180, 0.12, 0.12);
  }

  private hit(): void {
    if (!this.engine.acquireVoice('hit', 60, 0.06)) return;
    this.noise(0.05, 0.28, 'bandpass', 1800, 1800, 8);
    this.tone('sine', 300, 150, 0.05, 0.15);
  }

  private crit(): void {
    if (!this.engine.acquireVoice('crit', 90, 0.12)) return;
    this.noise(0.06, 0.3, 'bandpass', 2400, 2400, 6);
    this.tone('square', 700, 350, 0.1, 0.22);
  }

  private pop(scale: number): void {
    if (!this.engine.acquireVoice('pop', 40, 0.15)) return;
    const pitch = scale > 1.4 ? 0.6 : 1 + (Math.random() - 0.5) * 0.2;
    this.tone('triangle', 600 * pitch, 100 * pitch, 0.12, 0.35);
    this.noise(0.08, 0.2, 'highpass', 1200, 1200);
  }

  private playerHit(): void {
    if (!this.engine.acquireVoice('phit', 150, 0.25)) return;
    this.tone('sine', 180, 60, 0.2, 0.5);
    this.tone('triangle', 660, 660, 0.1, 0.2);
  }

  private dash(): void {
    if (!this.engine.acquireVoice('dash', 120, 0.3)) return;
    this.noise(0.25, 0.32, 'bandpass', 400, 2600, 2);
  }

  private ready(): void {
    if (!this.engine.acquireVoice('ready', 300, 0.1)) return;
    this.tone('sine', 900, 1200, 0.07, 0.12);
  }

  private pickup(): void {
    // Combo-Pitch: +1 Halbton pro schnellem Pickup (Pentatonik, Reset nach 1.5 s)
    const now = performance.now();
    if (now - this.lastPickupTime > 1500) this.pickupStep = 0;
    else this.pickupStep = Math.min(this.pickupStep + 1, 12);
    this.lastPickupTime = now;
    if (!this.engine.acquireVoice('pickup', 40, 0.16)) return;
    const penta = [0, 2, 4, 7, 9, 12];
    const semis = penta[this.pickupStep % penta.length] as number + 12 * Math.floor(this.pickupStep / penta.length);
    const f = 880 * Math.pow(2, semis / 12);
    this.tone('sine', f, f, 0.15, 0.25);
    this.tone('sine', f * 2, f * 2, 0.12, 0.1);
  }

  private magnet(): void {
    if (!this.engine.acquireVoice('magnet', 200, 0.4)) return;
    this.tone('sine', 440, 1320, 0.35, 0.25);
  }

  private heal(): void {
    if (!this.engine.acquireVoice('heal', 200, 0.35)) return;
    const notes = [523.25, 659.25, 783.99]; // C5-E5-G5
    notes.forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.3, i * 0.09));
  }

  private explosion(): void {
    if (!this.engine.acquireVoice('boom', 100, 0.5)) return;
    this.noise(0.45, 0.4, 'lowpass', 5000, 200);
    this.tone('sine', 120, 40, 0.3, 0.35);
  }

  private upgrade(): void {
    if (!this.engine.acquireVoice('upgrade', 200, 0.5)) return;
    this.tone('triangle', 523.25, 523.25, 0.4, 0.3);
    this.tone('triangle', 784, 784, 0.4, 0.25);
  }

  private waveStart(): void {
    if (!this.engine.acquireVoice('wave', 400, 0.7)) return;
    this.tone('sawtooth', 110, 440, 0.5, 0.3);
    this.noise(0.2, 0.25, 'lowpass', 200, 200);
  }

  private fanfare(): void {
    if (!this.engine.acquireVoice('fanfare', 500, 1.0)) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5-E5-G5-C6
    notes.forEach((f, i) => {
      const dur = i === notes.length - 1 ? 0.4 : 0.12;
      this.tone('triangle', f, f, dur, 0.3, i * 0.12);
      this.tone('square', f, f, dur, 0.07, i * 0.12);
    });
    this.noise(0.3, 0.1, 'highpass', 6000, 6000, 1, 0.45);
  }

  private warning(): void {
    if (!this.engine.acquireVoice('warn', 600, 0.5)) return;
    this.tone('square', 600, 600, 0.12, 0.14);
    this.tone('square', 750, 750, 0.12, 0.14, 0.16);
  }

  private bossIntro(): void {
    if (!this.engine.acquireVoice('bossintro', 1000, 1.6)) return;
    for (let i = 0; i < 3; i++) this.tone('sine', 55, 55, 0.15, 0.5, i * 0.22);
    this.tone('sawtooth', 800, 100, 0.7, 0.3, 0.6);
    this.tone('square', 600, 600, 0.12, 0.2, 1.0);
    this.tone('square', 750, 750, 0.12, 0.2, 1.2);
  }

  private bossDeath(): void {
    if (!this.engine.acquireVoice('bossdeath', 1000, 1.6)) return;
    this.tone('sine', 90, 30, 0.8, 0.55);
    this.noise(0.7, 0.45, 'lowpass', 6000, 200);
    const notes = [659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => this.tone('triangle', f, f, 0.15, 0.3, 0.5 + i * 0.12));
  }

  private gameOver(): void {
    if (!this.engine.acquireVoice('gameover', 1000, 1.8)) return;
    // sanft-melancholisch absteigend, nicht bestrafend
    const notes = [440, 392, 329.63, 261.63]; // A4-G4-E4-C4
    notes.forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.35, i * 0.32));
  }

  private revive(): void {
    if (!this.engine.acquireVoice('revive', 500, 1.0)) return;
    const notes = [261.63, 329.63, 392, 523.25];
    notes.forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.35, i * 0.1));
  }

  private uiHover(): void {
    if (!this.engine.acquireVoice('uihover', 60, 0.04)) return;
    this.tone('sine', 1200, 1200, 0.03, 0.08);
  }

  private uiClick(): void {
    if (!this.engine.acquireVoice('uiclick', 60, 0.08)) return;
    this.tone('sine', 880, 880, 0.06, 0.18);
    this.noise(0.03, 0.08, 'highpass', 4000, 4000);
  }

  // ------------------------------------------------ Neue Inhalte

  /** Goldene Fanfare beim Aufdecken einer legendaeren Karte. */
  private legendaryFanfare(): void {
    if (!this.engine.acquireVoice('legendary', 2000, 1.6)) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5-E5-G5-C6-E6
    notes.forEach((f, i) => {
      const dur = i === notes.length - 1 ? 0.5 : 0.14;
      this.tone('triangle', f, f, dur, 0.32, 0.45 + i * 0.13);
      this.tone('square', f, f, dur, 0.08, 0.45 + i * 0.13);
    });
    // Glitzer-Schimmer obendrauf
    this.noise(0.5, 0.1, 'highpass', 7000, 7000, 1, 1.0);
  }

  /** Fettere Wahl-Bestaetigung fuer Legendaere. */
  private legendaryChosen(): void {
    if (!this.engine.acquireVoice('legchosen', 500, 1.0)) return;
    this.tone('triangle', 523.25, 523.25, 0.5, 0.32);
    this.tone('triangle', 784, 784, 0.5, 0.28, 0.08);
    this.tone('triangle', 1046.5, 1046.5, 0.6, 0.24, 0.16);
    this.tone('sine', 130, 65, 0.4, 0.3);
  }

  /** Orbital-Laser-Einschlag: Zap von oben. */
  private orbitalZap(): void {
    if (!this.engine.acquireVoice('orbital', 300, 0.5)) return;
    this.tone('sawtooth', 2400, 200, 0.25, 0.28);
    this.noise(0.3, 0.3, 'lowpass', 4000, 300);
  }

  /** Bomber-Zuendung: tiefes, draengendes Doppel-Ticken. */
  private fuseWarning(): void {
    if (!this.engine.acquireVoice('fuse', 400, 0.4)) return;
    this.tone('square', 420, 420, 0.09, 0.16);
    this.tone('square', 420, 420, 0.09, 0.16, 0.22);
    this.tone('square', 520, 520, 0.09, 0.18, 0.5);
  }

  /** Elite betritt die Arena: kurzes dunkles Signal. */
  private eliteSting(): void {
    if (!this.engine.acquireVoice('elite', 600, 0.6)) return;
    this.tone('sawtooth', 160, 320, 0.25, 0.22);
    this.tone('square', 640, 640, 0.1, 0.12, 0.2);
  }

  /** Elite-Schild zerbricht: Klirren. */
  private shieldBreak(): void {
    if (!this.engine.acquireVoice('shield', 200, 0.3)) return;
    this.noise(0.15, 0.3, 'highpass', 3500, 3500, 3);
    this.tone('triangle', 1800, 900, 0.12, 0.2);
  }

  /** Goldene Welle: kurze Gold-Fanfare. */
  private goldenFanfare(): void {
    if (!this.engine.acquireVoice('golden', 1000, 1.0)) return;
    const notes = [659.25, 783.99, 1046.5]; // E5-G5-C6
    notes.forEach((f, i) => this.tone('triangle', f, f, 0.16, 0.3, i * 0.11));
    this.noise(0.3, 0.08, 'highpass', 6000, 6000, 1, 0.35);
  }

  /** Versorgungskapsel im Anflug. */
  private capsuleSting(): void {
    if (!this.engine.acquireVoice('capsule', 800, 0.7)) return;
    this.tone('sine', 660, 990, 0.2, 0.22);
    this.tone('sine', 990, 990, 0.15, 0.16, 0.22);
  }

  /** Kapsel-Belohnung eingesammelt. */
  private reward(): void {
    if (!this.engine.acquireVoice('reward', 300, 0.6)) return;
    const notes = [523.25, 659.25, 1046.5];
    notes.forEach((f, i) => this.tone('triangle', f, f, 0.14, 0.28, i * 0.08));
  }

  /** Dieb frisst einen Kern: tiefer, "falscher" Blip. */
  private stolenBlip(): void {
    if (!this.engine.acquireVoice('stolen', 150, 0.15)) return;
    this.tone('sine', 440, 220, 0.12, 0.2);
  }

  /** Dieb entkommt: absteigender Whoosh. */
  private thiefWhoosh(): void {
    if (!this.engine.acquireVoice('thief', 500, 0.5)) return;
    this.noise(0.35, 0.25, 'bandpass', 2600, 300, 2);
    this.tone('sine', 600, 150, 0.3, 0.15);
  }

  /** Schwarzes Loch: absteigendes Wummern + Sog-Rauschen. */
  private blackHoleRumble(): void {
    if (!this.engine.acquireVoice('bhole', 400, 0.9)) return;
    this.tone('sine', 90, 28, 0.75, 0.4);
    this.noise(0.8, 0.22, 'lowpass', 900, 120, 1);
    this.tone('sine', 45, 45, 0.5, 0.25, 0.05);
  }

  /** Punktzahl-Countup-Tick im Game-Over-Screen. */
  tick(step: number): void {
    if (!this.engine.acquireVoice('tick', 30, 0.05)) return;
    const f = 600 + step * 30;
    this.tone('sine', f, f, 0.04, 0.1);
  }

  /** Herzschlag bei niedrigem HP (vom HUD getaktet). */
  heartbeat(): void {
    if (!this.engine.acquireVoice('heart', 400, 0.3)) return;
    this.tone('sine', 60, 55, 0.08, 0.15);
    this.tone('sine', 60, 50, 0.08, 0.12, 0.12);
  }

  dispose(): void {
    for (const u of this.unsubs) u();
  }
}
