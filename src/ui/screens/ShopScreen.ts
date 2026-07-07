import { STR } from '../../config/strings.de';
import { HEROES, PERMA_BONI, UNLOCKABLE_WEAPONS } from '../../config/heroes';
import type { SaveManager } from '../../save/SaveManager';

export interface ShopCallbacks {
  onBack: () => void;
  /** Nach jedem Kauf/Auswahl (Game persistiert + refresht Menue). */
  onChanged: () => void;
}

const HERO_GLYPHS: Record<string, string> = {
  volt: '▲', blitz: '⚡', brocken: '⬢',
  // NEU (Premium-Helden)
  koloss: '🗿', kristall: '💎', phantom: '👁', orbit: '🪐',
};
const HERO_COLORS: Record<string, string> = {
  volt: '#00e5ff', blitz: '#ffe97a', brocken: '#ff8a5c',
  // NEU (Premium-Helden)
  koloss: '#ffb060', kristall: '#bff6ff', phantom: '#b57aff', orbit: '#bff8ff',
};
const WEAPON_GLYPHS: Record<string, string> = { laser: '✦', star: '✶' };

/** Werkstatt: Helden, Startwaffen und dauerhafte Boni gegen Kerne. */
export class ShopScreen {
  private readonly root: HTMLElement;
  private wrap!: HTMLElement;
  /** Nach einem Kauf: data-key des Elements, das nach dem Re-Render blitzen soll. */
  private flashKey: string | null = null;

  constructor(
    private readonly save: SaveManager,
    private readonly cb: ShopCallbacks,
  ) {
    this.root = document.getElementById('screen-shop') as HTMLElement;
    this.root.innerHTML = `<div class="shop-wrap"></div>`;
    this.wrap = this.root.querySelector('.shop-wrap') as HTMLElement;
  }

  private trySpend(price: number, sourceEl: HTMLElement): boolean {
    if (this.save.data.cores >= price) {
      this.save.data.cores -= price;
      return true;
    }
    // Zu teuer: kurz schuetteln + Preis rot
    sourceEl.classList.remove('shake');
    void sourceEl.offsetWidth;
    sourceEl.classList.add('shake');
    const priceEl = sourceEl.querySelector('.hero-price, .price');
    priceEl?.classList.add('price-bad');
    window.setTimeout(() => priceEl?.classList.remove('price-bad'), 600);
    return false;
  }

  render(): void {
    const save = this.save.data;
    this.wrap.innerHTML = `
      <h2 class="title-glow shop-title">🛠 ${STR.shopTitle}</h2>
      <div class="shop-cores">⬡ ${save.cores} ${STR.cores}</div>
      <div class="shop-section-title">${STR.heroesSection}</div>
      <div class="hero-row shop-heroes"></div>
      <div class="shop-section-title">${STR.weaponsSection}</div>
      <div class="hero-row shop-weapons"></div>
      <div class="shop-section-title">${STR.boniSection}</div>
      <div class="shop-bonus-list"></div>
      <button class="btn shop-back" data-nav-back data-key="shop-back">← ${STR.back}</button>
    `;
    (this.wrap.querySelector('.shop-back') as HTMLButtonElement).addEventListener('click', () => this.cb.onBack());

    this.renderHeroes();
    this.renderWeapons();
    this.renderBoni();

    // Kauf-Blitz auf dem NEU gerenderten Element (render() ersetzt das DOM)
    if (this.flashKey) {
      this.wrap.querySelector(`[data-key="${this.flashKey}"]`)?.classList.add('flash-buy');
      this.flashKey = null;
    }
  }

  private renderHeroes(): void {
    const save = this.save.data;
    const row = this.wrap.querySelector('.shop-heroes') as HTMLElement;
    for (const hero of HEROES) {
      const unlocked = save.unlockedHeroes.includes(hero.id);
      const selected = save.settings.heroId === hero.id;
      const info = STR.heroes[hero.id] ?? { name: hero.id, trait: '' };
      const card = document.createElement('button');
      card.className = `hero-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      card.style.color = HERO_COLORS[hero.id] ?? '#00e5ff';
      card.dataset.key = `hero-${hero.id}`;
      card.innerHTML = `
        <span class="hero-avatar">${HERO_GLYPHS[hero.id] ?? '▲'}</span>
        <span class="hero-name">${info.name}</span>
        <span class="hero-trait">${info.trait}</span>
        ${
          unlocked
            ? `<span class="hero-price" style="color:${selected ? 'var(--accent)' : 'var(--text-2)'}">${selected ? STR.selected : STR.select}</span>`
            : `<span class="hero-price">⬡ ${hero.price}</span>`
        }
      `;
      card.addEventListener('click', () => {
        if (unlocked) {
          save.settings.heroId = hero.id;
        } else {
          if (!this.trySpend(hero.price, card)) return;
          save.unlockedHeroes.push(hero.id);
          save.settings.heroId = hero.id;
          this.flashKey = `hero-${hero.id}`;
        }
        this.cb.onChanged();
        this.render();
      });
      row.appendChild(card);
    }
  }

  private renderWeapons(): void {
    const save = this.save.data;
    const row = this.wrap.querySelector('.shop-weapons') as HTMLElement;

    // Standard-Waffe des Helden
    const stdCard = document.createElement('button');
    const stdSelected = save.settings.weaponId === 'default';
    stdCard.className = `hero-card${stdSelected ? ' selected' : ''}`;
    stdCard.style.color = '#9aa7c7';
    stdCard.innerHTML = `
      <span class="hero-avatar">•</span>
      <span class="hero-name">Standard</span>
      <span class="hero-trait">Die Startwaffe des Helden</span>
      <span class="hero-price" style="color:${stdSelected ? 'var(--accent)' : 'var(--text-2)'}">${stdSelected ? STR.selected : STR.select}</span>
    `;
    stdCard.addEventListener('click', () => {
      save.settings.weaponId = 'default';
      this.cb.onChanged();
      this.render();
    });
    row.appendChild(stdCard);

    for (const { weapon, price } of UNLOCKABLE_WEAPONS) {
      const unlocked = save.unlockedWeapons.includes(weapon.id);
      const selected = save.settings.weaponId === weapon.id;
      const info = STR.weapons[weapon.id] ?? { name: weapon.id, desc: '' };
      const card = document.createElement('button');
      card.className = `hero-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      card.style.color = '#ffc83d';
      card.dataset.key = `weapon-${weapon.id}`;
      card.innerHTML = `
        <span class="hero-avatar">${WEAPON_GLYPHS[weapon.id] ?? '✦'}</span>
        <span class="hero-name">${info.name}</span>
        <span class="hero-trait">${info.desc}</span>
        ${
          unlocked
            ? `<span class="hero-price" style="color:${selected ? 'var(--accent)' : 'var(--text-2)'}">${selected ? STR.selected : STR.select}</span>`
            : `<span class="hero-price">⬡ ${price}</span>`
        }
      `;
      card.addEventListener('click', () => {
        if (unlocked) {
          save.settings.weaponId = weapon.id;
        } else {
          if (!this.trySpend(price, card)) return;
          save.unlockedWeapons.push(weapon.id);
          save.settings.weaponId = weapon.id;
          this.flashKey = `weapon-${weapon.id}`;
        }
        this.cb.onChanged();
        this.render();
      });
      row.appendChild(card);
    }
  }

  private renderBoni(): void {
    const save = this.save.data;
    const list = this.wrap.querySelector('.shop-bonus-list') as HTMLElement;
    for (const bonus of PERMA_BONI) {
      const level = save.permaUpgrades[bonus.id] ?? 0;
      const maxLevel = bonus.prices.length;
      const info = STR.permaBoni[bonus.id] ?? { name: bonus.id, desc: '' };
      const nextPrice = level < maxLevel ? (bonus.prices[level] as number) : null;

      const item = document.createElement('div');
      item.className = 'panel shop-bonus';
      item.dataset.key = `bonus-${bonus.id}`;
      const pips = Array.from({ length: maxLevel }, (_, i) =>
        `<span class="shop-pip${i < level ? ' filled' : ''}"></span>`,
      ).join('');
      item.innerHTML = `
        <div class="shop-bonus-info">
          <div class="shop-bonus-name">${info.name}</div>
          <div class="shop-bonus-desc">${info.desc}</div>
          <div class="shop-pips">${pips}</div>
        </div>
        <button class="btn shop-buy-btn" ${nextPrice === null ? 'disabled' : ''}>
          ${nextPrice === null ? STR.maxed : `<span class="price">⬡ ${nextPrice}</span>`}
        </button>
      `;
      const btn = item.querySelector('.shop-buy-btn') as HTMLButtonElement;
      if (nextPrice !== null) {
        btn.addEventListener('click', () => {
          if (!this.trySpend(nextPrice, item)) return;
          save.permaUpgrades[bonus.id] = level + 1;
          this.flashKey = `bonus-${bonus.id}`;
          this.cb.onChanged();
          this.render();
        });
      }
      list.appendChild(item);
    }
  }
}
