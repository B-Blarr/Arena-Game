import { STR } from '../../config/strings.de';
import { HEROES } from '../../config/heroes';
import { COLORWAYS } from '../../config/stickers';
import type { Difficulty } from '../../config/balance';
import type { SaveManager } from '../../save/SaveManager';

export interface MenuCallbacks {
  onPlay: (daily: boolean) => void;
  onShop: () => void;
  onProfiles: () => void;
  onLeaderboard: () => void;
  onAlbum: () => void;
  onSettingChanged: () => void;
}

// Mini-Silhouetten (Top-View) der Helden-Figuren; fill=currentColor erbt die Kartenfarbe
const HERO_GLYPHS: Record<string, string> = {
  volt: `<svg width="40" height="40" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
    <polygon points="24,4 31,34 24,28 17,34"/>
    <polygon points="15,28 6,38 17,35"/>
    <polygon points="33,28 42,38 31,35"/>
  </svg>`,
  blitz: `<svg width="40" height="40" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
    <polygon points="24,2 28,38 24,32 20,38"/>
    <polygon points="19,24 2,42 20,34"/>
    <polygon points="29,24 46,42 28,34"/>
  </svg>`,
  brocken: `<svg width="40" height="40" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
    <polygon points="24,8 40,36 8,36"/>
    <rect x="2" y="26" width="9" height="14" rx="2"/>
    <rect x="37" y="26" width="9" height="14" rx="2"/>
  </svg>`,
};
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
      <button class="menu-profile" title="${STR.profilesTitle}">👤 <span class="menu-profile-name"></span></button>
      <h1 class="title-glow menu-title"><span class="accent">NEON</span> ARENA</h1>
      <div class="menu-subtitle">${STR.subtitle}</div>
      <div class="hero-row"></div>
      <div class="menu-colorways"></div>
      <div class="menu-buttons">
        <button class="btn btn-primary menu-play" data-nav-default data-key="menu-play">${STR.play}</button>
        <div class="menu-buttons-row">
          <button class="btn menu-shop" data-key="menu-shop">🛠 ${STR.shop}</button>
          <button class="btn btn-gold menu-leaderboard" data-key="menu-lb">🏆 ${STR.leaderboard}</button>
          <button class="btn btn-magenta menu-album" data-key="menu-album">📔 ${STR.album}<span class="menu-album-new"></span></button>
        </div>
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
      <div class="menu-hint menu-hint-pad">
        <span>${STR.padHint}</span>
        <span>${STR.padNavHint}</span>
      </div>
      <div class="menu-sound-hint">${STR.padSoundHint}</div>
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
    (this.root.querySelector('.menu-leaderboard') as HTMLButtonElement).addEventListener('click', () => {
      this.cb.onLeaderboard();
    });
    (this.root.querySelector('.menu-album') as HTMLButtonElement).addEventListener('click', () => {
      this.cb.onAlbum();
    });
    (this.root.querySelector('.menu-profile') as HTMLButtonElement).addEventListener('click', () => {
      this.cb.onProfiles();
    });
  }

  refresh(): void {
    const save = this.save.data;
    this.coresEl.textContent = String(save.cores);
    this.bestEl.textContent = String(save.bestScores[save.settings.difficulty]);
    this.warnEl.textContent = this.save.storageAvailable ? '' : STR.saveWarning;
    (this.root.querySelector('.menu-profile-name') as HTMLElement).textContent = this.save.activeName;
    // Gold-Punkt am Album-Button, wenn es neue Sticker seit dem letzten Besuch gibt
    const seen = save.lastAlbumSeen;
    const hasNews = Object.values(save.stickers).some((at) => seen === '' || at > seen);
    (this.root.querySelector('.menu-album-new') as HTMLElement).classList.toggle('show', hasNews);

    // Helden-Karten
    this.heroRow.innerHTML = '';
    for (const hero of HEROES) {
      const unlocked = save.unlockedHeroes.includes(hero.id);
      const selected = save.settings.heroId === hero.id;
      const info = STR.heroes[hero.id] ?? { name: hero.id, trait: '' };
      const card = document.createElement('button');
      card.className = `hero-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      card.dataset.key = `hero-${hero.id}`;
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

    // Farbvarianten-Chips (nur sichtbar, wenn im Album welche freigeschaltet sind)
    const cwRow = this.root.querySelector('.menu-colorways') as HTMLElement;
    cwRow.innerHTML = '';
    if (save.unlockedColorways.length > 0) {
      const label = document.createElement('span');
      label.className = 'menu-colorways-label';
      label.textContent = `${STR.colorLabel}:`;
      cwRow.appendChild(label);
      const heroColor = HEROES.find((h) => h.id === save.settings.heroId)?.color ?? 0x00e5ff;
      const options: Array<{ id: string; color: number; name: string }> = [
        { id: 'default', color: heroColor, name: STR.colorDefault },
      ];
      for (const cw of COLORWAYS) {
        if (save.unlockedColorways.includes(cw.id)) {
          options.push({ id: cw.id, color: cw.body, name: STR.colorways[cw.id] ?? cw.id });
        }
      }
      for (const opt of options) {
        const chip = document.createElement('button');
        chip.className = `color-chip-btn${save.settings.colorwayId === opt.id ? ' active' : ''}`;
        chip.dataset.key = `colorway-${opt.id}`;
        chip.title = opt.name;
        chip.style.setProperty('--chip', `#${opt.color.toString(16).padStart(6, '0')}`);
        chip.addEventListener('click', () => {
          save.settings.colorwayId = opt.id;
          this.cb.onSettingChanged();
          this.refresh();
        });
        cwRow.appendChild(chip);
      }
    }

    // Schwierigkeit
    this.diffSeg.innerHTML = '';
    const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
    for (const d of diffs) {
      const btn = document.createElement('button');
      btn.dataset.key = `diff-${d}`;
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
      btn.dataset.key = `aim-${on ? 1 : 0}`;
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
      btn.dataset.key = `daily-${on ? 1 : 0}`;
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
