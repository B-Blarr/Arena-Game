import { STR } from '../config/strings.de';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import type { ScoreSystem } from '../systems/ScoreSystem';
import type { Sfx } from '../audio/Sfx';

/**
 * HUD: HP-Balken mit Delayed-Damage-Chunk, Welle, Punkte + Combo-Ring,
 * Dash-Cooldown-Kreis, Kerne, Boss-Leiste, Mute-Button, Low-HP-Vignette.
 * DOM wird einmal gebaut; Updates schreiben nur Texte/Custom Properties.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpChunk: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly hpWrap: HTMLElement;
  private readonly waveLabel: HTMLElement;
  private readonly waveEnemies: HTMLElement;
  private readonly scoreValue: HTMLElement;
  private readonly comboEl: HTMLElement;
  private readonly comboText: HTMLElement;
  private readonly coresEl: HTMLElement;
  private readonly coresVal: HTMLElement;
  private readonly dashEl: HTMLElement;
  private readonly bossWrap: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly vignette: HTMLElement | null;

  private readonly unsubs: Array<() => void> = [];
  private heartbeatTimer = 0;
  private lowHp = false;
  private dashWasReady = true;

  onMuteToggle: (() => void) | null = null;

  constructor(events: EventBus, private readonly sfx: Sfx) {
    this.root = document.getElementById('hud') as HTMLElement;
    this.root.innerHTML = `
      <div class="hud-cores"><span class="core-icon">⬡</span><span class="hud-cores-val">0</span></div>
      <div class="hud-wave">
        <div class="hud-wave-label">${STR.wave} 1</div>
        <div class="hud-wave-enemies"></div>
      </div>
      <div class="hud-score">
        <div class="hud-score-value">0</div>
        <div class="hud-combo"><div class="hud-combo-ring"></div><span class="hud-combo-text"></span></div>
      </div>
      <button class="hud-mute" aria-label="Ton an/aus">🔊</button>
      <div class="hud-boss hidden">
        <div class="hud-boss-name"></div>
        <div class="hud-boss-bar"><div class="hud-boss-fill"></div></div>
      </div>
      <div class="hud-hp">
        <span class="hud-hp-icon">❤</span>
        <div class="hud-hp-bar"><div class="hud-hp-chunk"></div><div class="hud-hp-fill"></div></div>
        <span class="hud-hp-text"></span>
      </div>
      <div class="hud-dash"><div class="hud-dash-inner">⚡</div></div>
    `;
    const q = (sel: string): HTMLElement => this.root.querySelector(sel) as HTMLElement;
    this.hpFill = q('.hud-hp-fill');
    this.hpChunk = q('.hud-hp-chunk');
    this.hpText = q('.hud-hp-text');
    this.hpWrap = q('.hud-hp');
    this.waveLabel = q('.hud-wave-label');
    this.waveEnemies = q('.hud-wave-enemies');
    this.scoreValue = q('.hud-score-value');
    this.comboEl = q('.hud-combo');
    this.comboText = q('.hud-combo-text');
    this.coresEl = q('.hud-cores');
    this.coresVal = q('.hud-cores-val');
    this.dashEl = q('.hud-dash');
    this.bossWrap = q('.hud-boss');
    this.bossName = q('.hud-boss-name');
    this.bossFill = q('.hud-boss-fill');
    this.muteBtn = q('.hud-mute') as HTMLButtonElement;
    this.vignette = document.getElementById('vignette');

    this.muteBtn.addEventListener('click', () => this.onMuteToggle?.());

    this.unsubs.push(
      events.on('playerHit', (e) => this.setHp(e.hp, e.maxHp, true)),
      events.on('playerHealed', (e) => this.setHp(e.hp, e.maxHp, false)),
      events.on('playerRevived', () => this.flashHpBar()),
      events.on('waveStarted', (e) => {
        this.waveLabel.textContent = e.isBossWave ? `${STR.wave} ${e.wave} — BOSS` : `${STR.wave} ${e.wave}`;
      }),
      events.on('scoreChanged', (e) => {
        this.scoreValue.textContent = String(e.score);
        this.scoreValue.classList.remove('pop');
        void this.scoreValue.offsetWidth;
        this.scoreValue.classList.add('pop');
      }),
      events.on('comboChanged', (e) => {
        if (e.multiplier > 1) {
          this.comboEl.classList.add('visible');
          this.comboEl.classList.remove('c1', 'c2', 'c3');
          this.comboEl.classList.add(e.multiplier >= 3 ? 'c3' : e.multiplier >= 2 ? 'c2' : 'c1');
          this.comboText.textContent = `×${e.multiplier}`;
        }
      }),
      events.on('comboBroken', () => this.comboEl.classList.remove('visible')),
      events.on('coresChanged', (e) => {
        this.coresVal.textContent = String(e.runCores);
        this.coresEl.classList.remove('pop');
        void this.coresEl.offsetWidth;
        this.coresEl.classList.add('pop');
      }),
      events.on('bossSpawned', (e) => {
        this.bossWrap.classList.remove('hidden');
        this.bossName.textContent =
          (STR.bosses[e.name] ?? e.name.toUpperCase());
        // Drama: Leiste fuellt sich in 1 s von 0 auf 100 %
        this.bossFill.style.transition = 'none';
        this.bossFill.style.transform = 'scaleX(0)';
        void this.bossFill.offsetWidth;
        this.bossFill.style.transition = 'transform 1s ease';
        this.bossFill.style.transform = 'scaleX(1)';
        window.setTimeout(() => {
          this.bossFill.style.transition = 'transform 0.2s ease';
        }, 1100);
      }),
      events.on('bossHpChanged', (e) => {
        this.bossFill.style.transform = `scaleX(${Math.max(0, e.hp / e.maxHp).toFixed(3)})`;
      }),
      events.on('bossDied', () => this.bossWrap.classList.add('hidden')),
      events.on('dashReady', () => {
        this.dashEl.classList.add('ready');
        window.setTimeout(() => this.dashEl.classList.remove('ready'), 250);
      }),
    );
  }

  private setHp(hp: number, maxHp: number, damaged: boolean): void {
    const frac = Math.max(0, hp / maxHp);
    this.hpFill.style.transform = `scaleX(${frac.toFixed(3)})`;
    // Delayed-Damage-Chunk laeuft per CSS-Transition verzoegert nach
    this.hpChunk.style.transform = `scaleX(${frac.toFixed(3)})`;
    this.hpText.textContent = `${Math.max(0, Math.ceil(hp))}`;
    this.lowHp = frac < 0.3 && hp > 0;
    this.hpWrap.classList.toggle('low', this.lowHp);
    this.vignette?.classList.toggle('active', this.lowHp);
    if (damaged) this.flashHpBar();
  }

  private flashHpBar(): void {
    this.hpWrap.style.filter = 'brightness(2.5)';
    window.setTimeout(() => {
      this.hpWrap.style.filter = '';
    }, 120);
  }

  /** Pro Frame (Echtzeit): Dash-Ring, Combo-Ring, Gegner-Zaehler, Herzschlag. */
  update(rawDt: number, world: World, score: ScoreSystem, enemiesLeft: number): void {
    const dashFrac = world.player.dashChargeFrac;
    this.dashEl.style.setProperty('--dash-t', dashFrac.toFixed(3));
    const ready = dashFrac >= 1;
    if (ready !== this.dashWasReady) this.dashWasReady = ready;

    this.comboEl.style.setProperty('--combo-t', score.comboTimeFrac.toFixed(3));

    this.waveEnemies.textContent = enemiesLeft > 0 ? `${enemiesLeft} ${STR.enemiesLeft}` : '';

    if (this.lowHp && world.player.alive) {
      this.heartbeatTimer -= rawDt;
      if (this.heartbeatTimer <= 0) {
        this.heartbeatTimer = 1.1;
        this.sfx.heartbeat();
      }
    }
  }

  setMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.vignette?.classList.remove('active');
  }

  /** Beim Runstart: Anzeigen auf Anfangswerte. */
  resetForRun(world: World): void {
    this.setHp(world.player.hp, world.player.stats.maxHp, false);
    this.scoreValue.textContent = '0';
    this.coresVal.textContent = '0';
    this.comboEl.classList.remove('visible');
    this.bossWrap.classList.add('hidden');
    this.waveEnemies.textContent = '';
  }

  dispose(): void {
    for (const u of this.unsubs) u();
  }
}
