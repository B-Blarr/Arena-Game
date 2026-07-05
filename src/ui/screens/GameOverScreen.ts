import { STR } from '../../config/strings.de';
import type { Sfx } from '../../audio/Sfx';
import type { BuildEntry } from '../../systems/RunStats';

export interface GameOverResult {
  score: number;
  wave: number;
  isRecord: boolean;
  best: number;
  coresEarned: number;
  totalCores: number;
  /** "Nur noch X Kerne bis ..." oder null. */
  teaser: string | null;
  /** Lauf-Statistik (fuer Optimierer — Kinder ignorieren sie einfach). */
  dps: number;
  strongestHit: number;
  maxCombo: number;
  build: BuildEntry[];
}

export interface GameOverCallbacks {
  onAgain: () => void;
  onMenu: () => void;
}

/**
 * "RUNDE VORBEI!" — bewusst kein bestrafendes "GAME OVER".
 * Punktzahl-Count-up mit Tick-Sound, Kerne fliegen einzeln in den Zaehler,
 * grosser NOCHMAL-Button + Taste R (Restart-Loop < 2 s).
 */
export class GameOverScreen {
  private readonly root: HTMLElement;
  private scoreEl!: HTMLElement;
  private waveEl!: HTMLElement;
  private recordEl!: HTMLElement;
  private coresEl!: HTMLElement;
  private statsEl!: HTMLElement;
  private buildEl!: HTMLElement;
  private teaserEl!: HTMLElement;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private animFrame = 0;
  private coresInterval = 0;

  constructor(
    private readonly cb: GameOverCallbacks,
    private readonly sfx: Sfx,
  ) {
    this.root = document.getElementById('screen-gameover') as HTMLElement;
    this.root.innerHTML = `
      <h2 class="title-glow gameover-title">${STR.gameOverTitle}</h2>
      <div class="record-banner" style="display:none">🏆 ${STR.newRecord}</div>
      <div class="gameover-score">0</div>
      <div class="gameover-sub gameover-wave"></div>
      <div class="gameover-cores">⬡ <span class="cores-val">0</span> ${STR.coresEarned}</div>
      <div class="gameover-stats"></div>
      <div class="gameover-build"></div>
      <div class="gameover-teaser"></div>
      <div class="gameover-buttons">
        <button class="btn btn-primary pulse-soft go-again">${STR.again}</button>
        <button class="btn go-menu">${STR.toMenu}</button>
      </div>
      <div class="gameover-sub" style="margin-top:1rem">${STR.restartHint}</div>
    `;
    this.scoreEl = this.root.querySelector('.gameover-score') as HTMLElement;
    this.waveEl = this.root.querySelector('.gameover-wave') as HTMLElement;
    this.recordEl = this.root.querySelector('.record-banner') as HTMLElement;
    this.coresEl = this.root.querySelector('.cores-val') as HTMLElement;
    this.statsEl = this.root.querySelector('.gameover-stats') as HTMLElement;
    this.buildEl = this.root.querySelector('.gameover-build') as HTMLElement;
    this.teaserEl = this.root.querySelector('.gameover-teaser') as HTMLElement;
    (this.root.querySelector('.go-again') as HTMLButtonElement).addEventListener('click', () => this.cb.onAgain());
    (this.root.querySelector('.go-menu') as HTMLButtonElement).addEventListener('click', () => this.cb.onMenu());
  }

  show(result: GameOverResult): void {
    this.recordEl.style.display = result.isRecord ? 'block' : 'none';
    this.waveEl.textContent = `${STR.reachedWave}: ${result.wave} · ${STR.bestScore}: ${result.best}`;
    this.teaserEl.textContent = result.teaser ?? '';
    this.coresEl.textContent = '0';

    // Lauf-Statistik + Build-Anzeige ("Dein Build")
    this.statsEl.textContent =
      `⚔ ${result.dps} ${STR.runSummary.dps} · ` +
      `💥 ${STR.runSummary.strongestHit} ${result.strongestHit} · ` +
      `🔥 ${STR.runSummary.bestCombo} ×${result.maxCombo}`;
    this.buildEl.innerHTML = '';
    if (result.build.length > 0) {
      const label = document.createElement('span');
      label.className = 'build-label';
      label.textContent = `${STR.runSummary.build}: `;
      this.buildEl.appendChild(label);
      for (const entry of result.build) {
        const chip = document.createElement('span');
        chip.className = `build-chip${entry.rarity === 'legendary' ? ' legendary' : ''}`;
        chip.title = STR.upgrades[entry.id]?.name ?? entry.id;
        chip.textContent = entry.stacks > 1 ? `${entry.icon}×${entry.stacks}` : entry.icon;
        this.buildEl.appendChild(chip);
      }
    }

    // Punktzahl-Count-up (1.2 s, easeOutExpo) mit aufsteigendem Tick
    const start = performance.now();
    const dur = 1200;
    let lastTick = -1;
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / dur);
      const eased = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
      this.scoreEl.textContent = String(Math.round(result.score * eased));
      const tickStep = Math.floor(t * 14);
      if (tickStep !== lastTick && t < 1) {
        lastTick = tickStep;
        this.sfx.tick(tickStep);
      }
      if (t < 1) {
        this.animFrame = requestAnimationFrame(step);
      } else {
        this.countCores(result.coresEarned);
      }
    };
    this.animFrame = requestAnimationFrame(step);

    this.keyHandler = (e: KeyboardEvent): void => {
      if (e.code === 'KeyR') this.cb.onAgain();
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private countCores(total: number): void {
    if (total <= 0) return;
    let shown = 0;
    const stepSize = Math.max(1, Math.ceil(total / 25));
    this.coresInterval = window.setInterval(() => {
      shown = Math.min(total, shown + stepSize);
      this.coresEl.textContent = String(shown);
      this.sfx.tick(8);
      if (shown >= total) window.clearInterval(this.coresInterval);
    }, 50);
  }

  hide(): void {
    cancelAnimationFrame(this.animFrame);
    window.clearInterval(this.coresInterval);
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }
}
