import { STR } from '../../config/strings.de';
import type { RoomOffer } from '../../systems/PathSystem';

export interface PathCallbacks {
  onChoose: (index: number) => void;
}

/** Farbe pro Raum-Typ (fuer Rahmen/Glow via --rarity). Mystery wird prismatisch. */
const ROOM_COLOR: Record<string, string> = {
  normal: '#8ab4ff',
  treasure: '#ffd24d',
  elite: '#c060ff',
  storm: '#ff5c5c',
  oasis: '#5cff9a',
  horde: '#4de6ff',
  mystery: '#ff5ce1',
};

/**
 * NEU (Reise-Modus): Weg-Wahl zwischen den Wellen. Klon der Upgrade-Wahl, aber
 * OHNE Reroll (man committet sich) und OHNE data-nav-back (Pflicht-Wahl). Die Zeit
 * steht (timeScale 0). Koop ist eine GETEILTE Team-Entscheidung: der RunState setzt
 * setInputFilter(null), beide Spieler duerfen waehlen, erster Klick gewinnt.
 */
export class PathScreen {
  private readonly root: HTMLElement;
  private headingEl!: HTMLElement;
  private forEl!: HTMLElement;
  private cardsWrap!: HTMLElement;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private choosing = false;
  private chooseTimeout = 0;

  constructor(private readonly cb: PathCallbacks) {
    this.root = document.getElementById('screen-path') as HTMLElement;
    this.root.innerHTML = `
      <div class="upgrade-for path-for"></div>
      <h2 class="title-glow path-heading">${STR.chooseRoom}</h2>
      <div class="upgrade-cards path-cards"></div>
    `;
    this.headingEl = this.root.querySelector('.path-heading') as HTMLElement;
    this.forEl = this.root.querySelector('.path-for') as HTMLElement;
    this.cardsWrap = this.root.querySelector('.path-cards') as HTMLElement;
  }

  /** coopLabel gesetzt = Koop-Kopfzeile ("Waehlt euren Weg"), sonst Solo. */
  show(offers: RoomOffer[], coopLabel?: string): void {
    this.hide();
    this.choosing = false;
    this.headingEl.textContent = STR.chooseRoom;
    this.forEl.textContent = coopLabel ?? '';
    this.cardsWrap.innerHTML = '';

    offers.forEach((offer, i) => {
      const def = offer.def;
      const isMystery = def.id === 'mystery';
      const info = STR.rooms[def.id] ?? { name: def.id, risk: '', reward: '' };
      const card = document.createElement('button');
      card.className = 'upgrade-card path-card appear';
      if (i === 0) card.setAttribute('data-nav-default', '');
      card.dataset.key = `path-${i}`;
      // Mystery bekommt den animierten Regenbogen-Rahmen (wie mythische Upgrades)
      if (isMystery) card.classList.add('mythic');
      card.style.setProperty('--rarity', ROOM_COLOR[def.id] ?? ROOM_COLOR.normal ?? '#8ab4ff');
      card.style.animationDelay = `${i * 0.08}s`;
      card.innerHTML = `
        <span class="upgrade-icon">${def.icon}</span>
        <span class="upgrade-name">${info.name}</span>
        <span class="path-lines">
          <span class="path-risk">${info.risk}</span>
          <span class="path-reward">${info.reward}</span>
        </span>
        <span class="upgrade-key keycap">${i + 1}</span>
      `;
      card.addEventListener('click', () => this.choose(i));
      this.cardsWrap.appendChild(card);
    });

    this.keyHandler = (e: KeyboardEvent): void => {
      if (e.code === 'Digit1' || e.code === 'Numpad1') this.choose(0);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') this.choose(1);
      else if (e.code === 'Digit3' || e.code === 'Numpad3') this.choose(2);
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private choose(index: number): void {
    if (this.choosing) return;
    if (index < 0 || index >= this.cardsWrap.children.length) return;
    this.choosing = true;
    const cards = this.cardsWrap.children;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as HTMLElement;
      card.classList.remove('appear');
      card.style.animationDelay = '0s';
      card.classList.add(i === index ? 'chosen' : 'dismissed');
    }
    this.chooseTimeout = window.setTimeout(() => this.cb.onChoose(index), 260);
  }

  /** Notausgang (Pad des Waehlers getrennt): Sperren aufheben. Symmetrisch zur Upgrade-Wahl. */
  unlockInputs(): void {
    this.root.classList.remove('input-locked');
  }

  hide(): void {
    window.clearTimeout(this.chooseTimeout);
    this.root.classList.remove('input-locked');
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }
}
