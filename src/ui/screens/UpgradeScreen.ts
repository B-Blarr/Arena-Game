import { STR } from '../../config/strings.de';
import type { UpgradeDef } from '../../config/upgrades';
import type { Player } from '../../entities/Player';

export interface UpgradeCallbacks {
  onChoose: (index: number) => void;
  onReroll: () => void;
}

/**
 * Upgrade-Wahl zwischen den Wellen: 3 Karten, waehlbar per Maus ODER
 * Tasten 1/2/3, 1 Gratis-Reroll. Die Zeit steht (timeScale 0), die Szene
 * wird abgedunkelt weiter gerendert.
 */
export class UpgradeScreen {
  private readonly root: HTMLElement;
  private cardsWrap!: HTMLElement;
  private rerollBtn!: HTMLButtonElement;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private choosing = false;
  private chooseTimeout = 0;

  constructor(private readonly cb: UpgradeCallbacks) {
    this.root = document.getElementById('screen-upgrade') as HTMLElement;
    this.root.innerHTML = `
      <h2 class="title-glow upgrade-heading">${STR.chooseUpgrade}</h2>
      <div class="upgrade-cards"></div>
      <div class="upgrade-footer">
        <button class="btn btn-magenta upgrade-reroll">🎲 ${STR.reroll}</button>
      </div>
    `;
    this.cardsWrap = this.root.querySelector('.upgrade-cards') as HTMLElement;
    this.rerollBtn = this.root.querySelector('.upgrade-reroll') as HTMLButtonElement;
    this.rerollBtn.addEventListener('click', () => {
      // Kein Reroll mehr, sobald eine Karte gewaehlt wurde (260-ms-Animation!)
      if (!this.choosing) this.cb.onReroll();
    });
  }

  show(offers: UpgradeDef[], canReroll: boolean, player: Player): void {
    this.hide(); // evtl. alten Key-Handler entfernen (Reroll)
    this.choosing = false;
    this.cardsWrap.innerHTML = '';
    offers.forEach((def, i) => {
      const info = STR.upgrades[def.id] ?? { name: def.id, desc: '' };
      const stacks = player.stackOf(def.id);
      const card = document.createElement('button');
      card.className = 'upgrade-card appear';
      card.style.setProperty('--rarity', `var(--rarity-${def.rarity})`);
      card.style.animationDelay = `${i * 0.08}s`;
      card.innerHTML = `
        <span class="upgrade-rarity-label">${STR.rarities[def.rarity] ?? def.rarity}</span>
        <span class="upgrade-icon">${def.icon}</span>
        <span class="upgrade-name">${info.name}</span>
        <span class="upgrade-desc">${info.desc}</span>
        ${def.instant ? '' : `<span class="upgrade-stacks">${STR.stacksLabel} ${stacks + 1}/${def.maxStacks}</span>`}
        <span class="upgrade-key keycap">${i + 1}</span>
      `;
      card.addEventListener('click', () => this.choose(i));
      this.cardsWrap.appendChild(card);
    });

    this.rerollBtn.disabled = !canReroll;
    this.rerollBtn.textContent = canReroll ? `🎲 ${STR.reroll}` : `🎲 ${STR.rerollUsed}`;

    this.keyHandler = (e: KeyboardEvent): void => {
      if (e.code === 'Digit1' || e.code === 'Numpad1') this.choose(0);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') this.choose(1);
      else if (e.code === 'Digit3' || e.code === 'Numpad3') this.choose(2);
      else if (e.code === 'KeyR' && !this.rerollBtn.disabled && !this.choosing) this.cb.onReroll();
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private choose(index: number): void {
    if (this.choosing) return;
    this.choosing = true;
    const cards = this.cardsWrap.children;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as HTMLElement;
      card.classList.remove('appear');
      card.style.animationDelay = '0s';
      card.classList.add(i === index ? 'chosen' : 'dismissed');
    }
    // kurze Auswahl-Animation abwarten, dann weiter
    this.chooseTimeout = window.setTimeout(() => this.cb.onChoose(index), 260);
  }

  hide(): void {
    window.clearTimeout(this.chooseTimeout);
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }
}
