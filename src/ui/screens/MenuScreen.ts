import { STR } from '../../config/strings.de';
import { HEROES } from '../../config/heroes';
import type { Difficulty } from '../../config/balance';
import type { SaveManager } from '../../save/SaveManager';

export interface MenuCallbacks {
  onPlay: (daily: boolean) => void;
  onShop: () => void;
  onSettingChanged: () => void;
}

const HERO_GLYPHS: Record<string, string> = { volt: '▲', blitz: '⚡', brocken: '⬢' };
const HERO_COLORS: Record<string, string> = { volt: '#00e5ff', blitz: '#ffe97a', brocken: '#ff8a5c' };

/** Startmenue: Spielen, Heldenwahl, Schwierigkeit, Auto-Aim, Daily, Shop. */
export class MenuScreen {
  private readonly root: HTMLElement;
  private heroRow!: HTMLElement;
  private diffSeg!: HTMLElement;
  private aimSeg!: HTMLElement;
  private dailySeg!: HTMLElement;
  private bestEl!: HTMLElement;
  private coresEl!: HTMLElement;
  private warnEl!: HTMLElement;
  private dailyMode = false;

  constructor(
    private readonly save: SaveManager,
    private readonly cb: MenuCallbacks,
  ) {
    this.root = document.getElementById('screen-menu') as HTMLElement;
    this.build();
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="menu-corner left"><span>⬡</span><span class="menu-cores">0</span></div>
      <div class="menu-corner right">${STR.bestScore}: <span class="menu-best">0</span></div>
      <h1 class="title-glow menu-title"><span class="accent">NEON</span> ARENA</h1>
      <div class="menu-subtitle">${STR.subtitle}</div>
      <div class="hero-row"></div>
      <div class="menu-buttons">
        <button class="btn btn-primary menu-play">${STR.play}</button>
        <button class="btn menu-shop">🛠 ${STR.shop}</button>
      </div>
      <div class="menu-options">
        <div class="toggle-row"><span class="option-label">${STR.difficulty}</span><span class="segmented seg-diff"></span></div>
        <div class="toggle-row"><span class="option-label">${STR.autoAim}</span><span class="segmented seg-aim"></span></div>
        <div class="toggle-row"><span class="option-label" title="${STR.dailySeedHint}">${STR.dailySeed}</span><span class="segmented seg-daily"></span></div>
      </div>
      <div class="menu-hint">
        <span><span class="keycap">W</span><span class="keycap">A</span><span class="keycap">S</span><span class="keycap">D</span> / Pfeile: Laufen</span>
        <span><span class="keycap">Leertaste</span> Dash</span>
        <span><span class="keycap">P</span>/<span class="keycap">Esc</span> Pause</span>
      </div>
      <div class="menu-warn text-dim" style="position:absolute; bottom:64px; font-size:1rem; color:#ffb84d;"></div>
    `;
    this.heroRow = this.root.querySelector('.hero-row') as HTMLElement;
    this.diffSeg = this.root.querySelector('.seg-diff') as HTMLElement;
    this.aimSeg = this.root.querySelector('.seg-aim') as HTMLElement;
    this.dailySeg = this.root.querySelector('.seg-daily') as HTMLElement;
    this.bestEl = this.root.querySelector('.menu-best') as HTMLElement;
    this.coresEl = this.root.querySelector('.menu-cores') as HTMLElement;
    this.warnEl = this.root.querySelector('.menu-warn') as HTMLElement;

    (this.root.querySelector('.menu-play') as HTMLButtonElement).addEventListener('click', () => {
      this.cb.onPlay(this.dailyMode);
    });
    (this.root.querySelector('.menu-shop') as HTMLButtonElement).addEventListener('click', () => {
      this.cb.onShop();
    });
  }

  refresh(): void {
    const save = this.save.data;
    this.coresEl.textContent = String(save.cores);
    this.bestEl.textContent = String(save.bestScores[save.settings.difficulty]);
    this.warnEl.textContent = this.save.storageAvailable ? '' : STR.saveWarning;

    // Helden-Karten
    this.heroRow.innerHTML = '';
    for (const hero of HEROES) {
      const unlocked = save.unlockedHeroes.includes(hero.id);
      const selected = save.settings.heroId === hero.id;
      const info = STR.heroes[hero.id] ?? { name: hero.id, trait: '' };
      const card = document.createElement('button');
      card.className = `hero-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      card.style.color = HERO_COLORS[hero.id] ?? '#00e5ff';
      card.innerHTML = `
        <span class="hero-avatar">${HERO_GLYPHS[hero.id] ?? '▲'}</span>
        <span class="hero-name">${info.name}</span>
        <span class="hero-trait">${unlocked ? info.trait : STR.locked}</span>
        ${unlocked ? '' : `<span class="hero-price">⬡ ${hero.price}</span>`}
      `;
      card.addEventListener('click', () => {
        if (!unlocked) {
          this.cb.onShop();
          return;
        }
        save.settings.heroId = hero.id;
        this.cb.onSettingChanged();
        this.refresh();
      });
      this.heroRow.appendChild(card);
    }

    // Schwierigkeit
    this.diffSeg.innerHTML = '';
    const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
    for (const d of diffs) {
      const btn = document.createElement('button');
      btn.textContent = STR.difficulties[d] ?? d;
      const lockedHard = d === 'hard' && !save.hardUnlocked;
      if (lockedHard) {
        btn.disabled = true;
        btn.title = STR.hardLockedHint;
        btn.textContent = `🔒 ${btn.textContent}`;
      }
      btn.classList.toggle('active', save.settings.difficulty === d);
      btn.addEventListener('click', () => {
        save.settings.difficulty = d;
        this.cb.onSettingChanged();
        this.refresh();
      });
      this.diffSeg.appendChild(btn);
    }

    // Auto-Aim
    this.aimSeg.innerHTML = '';
    for (const on of [true, false]) {
      const btn = document.createElement('button');
      btn.textContent = on ? STR.on : STR.off;
      btn.classList.toggle('active', save.settings.autoAim === on);
      btn.addEventListener('click', () => {
        save.settings.autoAim = on;
        this.cb.onSettingChanged();
        this.refresh();
      });
      this.aimSeg.appendChild(btn);
    }

    // Tages-Arena
    this.dailySeg.innerHTML = '';
    for (const on of [false, true]) {
      const btn = document.createElement('button');
      btn.textContent = on ? STR.on : STR.off;
      btn.classList.toggle('active', this.dailyMode === on);
      btn.addEventListener('click', () => {
        this.dailyMode = on;
        this.refresh();
      });
      this.dailySeg.appendChild(btn);
    }
  }
}
