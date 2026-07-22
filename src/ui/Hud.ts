import { STR } from '../config/strings.de';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import type { Player } from '../entities/Player';
import type { CoopSystem } from '../systems/CoopSystem';
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
  // Koop: zweites Spieler-Panel (Solo versteckt)
  private hpFill2!: HTMLElement;
  private hpChunk2!: HTMLElement;
  private hpText2!: HTMLElement;
  private hpWrap2!: HTMLElement;
  private dashEl2!: HTMLElement;
  private abilityEl2!: HTMLElement;
  private coopActive = false;
  private readonly downed: [boolean, boolean] = [false, false];
  private readonly waveLabel: HTMLElement;
  private readonly waveEnemies: HTMLElement;
  private readonly scoreValue: HTMLElement;
  private readonly comboEl: HTMLElement;
  private readonly comboText: HTMLElement;
  private readonly coresEl: HTMLElement;
  private readonly coresVal: HTMLElement;
  private readonly dashEl: HTMLElement;
  private readonly abilityEl: HTMLElement;
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

  constructor(
    events: EventBus,
    private readonly sfx: Sfx,
  ) {
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
      <div class="hud-hp p1">
        <span class="hud-hp-name"></span>
        <span class="hud-hp-icon">❤</span>
        <div class="hud-hp-bar"><div class="hud-hp-chunk"></div><div class="hud-hp-fill"></div></div>
        <span class="hud-hp-text"></span>
      </div>
      <div class="hud-dash p1"><div class="hud-dash-inner">⚡</div></div>
      <div class="hud-ability p1 hidden"><div class="hud-ability-inner">💥</div></div>
      <div class="hud-hp p2 hidden">
        <span class="hud-hp-name"></span>
        <span class="hud-hp-icon">❤</span>
        <div class="hud-hp-bar"><div class="hud-hp-chunk"></div><div class="hud-hp-fill"></div></div>
        <span class="hud-hp-text"></span>
      </div>
      <div class="hud-dash p2 hidden"><div class="hud-dash-inner">⚡</div></div>
      <div class="hud-ability p2 hidden"><div class="hud-ability-inner">💥</div></div>
    `;
    const q = (sel: string): HTMLElement => this.root.querySelector(sel) as HTMLElement;
    this.hpFill = q('.hud-hp.p1 .hud-hp-fill');
    this.hpChunk = q('.hud-hp.p1 .hud-hp-chunk');
    this.hpText = q('.hud-hp.p1 .hud-hp-text');
    this.hpWrap = q('.hud-hp.p1');
    this.hpFill2 = q('.hud-hp.p2 .hud-hp-fill');
    this.hpChunk2 = q('.hud-hp.p2 .hud-hp-chunk');
    this.hpText2 = q('.hud-hp.p2 .hud-hp-text');
    this.hpWrap2 = q('.hud-hp.p2');
    this.dashEl2 = q('.hud-dash.p2');
    this.abilityEl2 = q('.hud-ability.p2');
    this.waveLabel = q('.hud-wave-label');
    this.waveEnemies = q('.hud-wave-enemies');
    this.scoreValue = q('.hud-score-value');
    this.comboEl = q('.hud-combo');
    this.comboText = q('.hud-combo-text');
    this.coresEl = q('.hud-cores');
    this.coresVal = q('.hud-cores-val');
    this.dashEl = q('.hud-dash.p1');
    this.abilityEl = q('.hud-ability.p1');
    this.bossWrap = q('.hud-boss');
    this.bossName = q('.hud-boss-name');
    this.bossFill = q('.hud-boss-fill');
    this.muteBtn = q('.hud-mute') as HTMLButtonElement;
    this.vignette = document.getElementById('vignette');

    this.muteBtn.addEventListener('click', () => this.onMuteToggle?.());

    this.unsubs.push(
      events.on('playerHit', (e) => this.setHp(e.playerIndex, e.hp, e.maxHp, true)),
      events.on('playerHealed', (e) => this.setHp(e.playerIndex, e.hp, e.maxHp, false)),
      events.on('playerRevived', (e) => this.flashHpBar(e.playerIndex)),
      events.on('playerDowned', (e) => {
        this.downed[e.playerIndex as 0 | 1] = true;
        this.panelFor(e.playerIndex).classList.add('downed');
      }),
      events.on('playerCoopRevived', (e) => {
        this.downed[e.playerIndex as 0 | 1] = false;
        this.panelFor(e.playerIndex).classList.remove('downed');
        this.flashHpBar(e.playerIndex);
      }),
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
        this.bossName.textContent = STR.bosses[e.name] ?? e.name.toUpperCase();
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
      events.on('dashReady', (e) => {
        const el = e.playerIndex === 1 ? this.dashEl2 : this.dashEl;
        el.classList.add('ready');
        window.setTimeout(() => el.classList.remove('ready'), 250);
      }),
      events.on('abilityReady', (e) => {
        const el = e.playerIndex === 1 ? this.abilityEl2 : this.abilityEl;
        el.classList.add('ready');
        window.setTimeout(() => el.classList.remove('ready'), 250);
      }),
    );
  }

  private panelFor(idx: number): HTMLElement {
    return idx === 1 ? this.hpWrap2 : this.hpWrap;
  }

  /** Faehigkeits-Ring: Glyph setzen + verbergen, wenn der Held keine Faehigkeit hat. */
  private setAbilityRing(el: HTMLElement, player: Player | null): void {
    const icon = player?.abilityIcon ?? '';
    el.classList.toggle('hidden', icon === '');
    const inner = el.querySelector('.hud-ability-inner');
    if (inner && icon) inner.textContent = icon;
  }

  private setHp(idx: number, hp: number, maxHp: number, damaged: boolean): void {
    const frac = Math.max(0, hp / maxHp);
    const fill = idx === 1 ? this.hpFill2 : this.hpFill;
    const chunk = idx === 1 ? this.hpChunk2 : this.hpChunk;
    const text = idx === 1 ? this.hpText2 : this.hpText;
    const wrap = this.panelFor(idx);
    fill.style.transform = `scaleX(${frac.toFixed(3)})`;
    // Delayed-Damage-Chunk laeuft per CSS-Transition verzoegert nach
    chunk.style.transform = `scaleX(${frac.toFixed(3)})`;
    text.textContent = `${Math.max(0, Math.ceil(hp))}`;
    const low = frac < 0.3 && hp > 0;
    wrap.classList.toggle('low', low);
    // Herzschlag/Vignette: reagiert, sobald IRGENDEIN Spieler knapp ist
    this.lowHp = this.hpWrap.classList.contains('low') || (this.coopActive && this.hpWrap2.classList.contains('low'));
    this.vignette?.classList.toggle('active', this.lowHp);
    if (damaged) this.flashHpBar(idx);
  }

  private flashHpBar(idx = 0): void {
    const wrap = this.panelFor(idx);
    wrap.style.filter = 'brightness(2.5)';
    window.setTimeout(() => {
      wrap.style.filter = '';
    }, 120);
  }

  /** Pro Frame (Echtzeit): Dash-Ringe, Combo-Ring, Gegner-Zaehler, Herzschlag. */
  update(rawDt: number, world: World, score: ScoreSystem, enemiesLeft: number, coop?: CoopSystem): void {
    const p0 = world.players[0] ?? world.player;
    const dashFrac = p0.dashChargeFrac;
    this.dashEl.style.setProperty('--dash-t', dashFrac.toFixed(3));
    this.abilityEl.style.setProperty('--ability-t', p0.abilityChargeFrac.toFixed(3));
    const ready = dashFrac >= 1;
    if (ready !== this.dashWasReady) this.dashWasReady = ready;

    const p2 = world.players[1];
    if (this.coopActive && p2) {
      this.dashEl2.style.setProperty('--dash-t', p2.dashChargeFrac.toFixed(3));
      this.abilityEl2.style.setProperty('--ability-t', p2.abilityChargeFrac.toFixed(3));
      // Down-Panels: Text zeigt den Revive-Fortschritt statt HP
      for (let i = 0; i < 2; i++) {
        if (!this.downed[i as 0 | 1] || !coop) continue;
        const text = i === 1 ? this.hpText2 : this.hpText;
        const fill = i === 1 ? this.hpFill2 : this.hpFill;
        const prog = coop.progressOf(i);
        text.textContent = STR.hudDown;
        fill.style.transform = `scaleX(${prog.toFixed(3)})`;
      }
    }

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

  /** Beim Runstart: Anzeigen auf Anfangswerte (Koop: zweites Panel an). */
  resetForRun(world: World, names?: [string, string]): void {
    this.coopActive = world.isCoop;
    this.downed[0] = false;
    this.downed[1] = false;
    this.root.classList.toggle('coop', this.coopActive);
    this.hpWrap.classList.remove('downed', 'low');
    this.hpWrap2.classList.remove('downed', 'low');
    this.hpWrap2.classList.toggle('hidden', !this.coopActive);
    this.dashEl2.classList.toggle('hidden', !this.coopActive);
    const p0 = world.players[0] ?? world.player;
    this.setHp(0, p0.hp, p0.stats.maxHp, false);
    const p1 = world.players[1];
    if (this.coopActive && p1) this.setHp(1, p1.hp, p1.stats.maxHp, false);
    // Faehigkeits-Ringe: Glyph je Held setzen, ohne Faehigkeit ausblenden
    this.setAbilityRing(this.abilityEl, p0);
    this.setAbilityRing(this.abilityEl2, this.coopActive ? (p1 ?? null) : null);
    // Namen nur im Koop anzeigen (Solo bleibt exakt wie bisher)
    const nameEls = this.root.querySelectorAll<HTMLElement>('.hud-hp-name');
    nameEls.forEach((el, i) => {
      el.textContent = this.coopActive && names ? (names[i] ?? '') : '';
    });
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
