import { STR } from '../../config/strings.de';
import type { UpgradeDef } from '../../config/upgrades';
import type { Player } from '../../entities/Player';

export interface UpgradeCallbacks {
  onChoose: (index: number) => void;
  onReroll: () => void;
}

/** Koop: wessen Wahl gerade laeuft und welche Quellen zugreifen duerfen. */
export interface UpgradeCoopContext {
  slot: 0 | 1;
  label: string;
  /** true = der Waehler ist eine Tastatur-Quelle (Tasten 1/2/3/R erlaubt). */
  allowKeys: boolean;
  /** true = der Waehler ist die Maus-Quelle (sonst Maus-Klicks sperren). */
  allowMouse: boolean;
}

/**
 * Upgrade-Wahl zwischen den Wellen: 3 Karten, waehlbar per Maus ODER
 * Tasten 1/2/3, 1 Gratis-Reroll. Die Zeit steht (timeScale 0), die Szene
 * wird abgedunkelt weiter gerendert.
 */
export class UpgradeScreen {
  private readonly root: HTMLElement;
  private headingEl!: HTMLElement;
  private forEl!: HTMLElement;
  private cardsWrap!: HTMLElement;
  private rerollBtn!: HTMLButtonElement;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private choosing = false;
  private chooseTimeout = 0;
  /** Zeremonie-Sperre: solange die legendaere Karte noch verdeckt ist. */
  private revealLocked = false;
  private revealTimeout = 0;
  /** Koop-Gating: Tasten 1/2/3/R nur fuer die Tastatur-Quelle des Waehlers. */
  private acceptDigits = true;

  constructor(private readonly cb: UpgradeCallbacks) {
    this.root = document.getElementById('screen-upgrade') as HTMLElement;
    this.root.innerHTML = `
      <div class="upgrade-for"></div>
      <h2 class="title-glow upgrade-heading">${STR.chooseUpgrade}</h2>
      <div class="upgrade-cards"></div>
      <div class="upgrade-footer">
        <button class="btn btn-magenta upgrade-reroll" data-nav-button="3">🎲 ${STR.reroll}</button>
      </div>
    `;
    this.headingEl = this.root.querySelector('.upgrade-heading') as HTMLElement;
    this.forEl = this.root.querySelector('.upgrade-for') as HTMLElement;
    this.cardsWrap = this.root.querySelector('.upgrade-cards') as HTMLElement;
    this.rerollBtn = this.root.querySelector('.upgrade-reroll') as HTMLButtonElement;
    this.rerollBtn.addEventListener('click', () => {
      // Kein Reroll mehr, sobald eine Karte gewaehlt wurde (260-ms-Animation!)
      if (!this.choosing) this.cb.onReroll();
    });
  }

  show(offers: UpgradeDef[], canReroll: boolean, player: Player, coop?: UpgradeCoopContext): void {
    this.hide(); // evtl. alten Key-Handler entfernen (Reroll)
    this.choosing = false;
    // Koop: Kopfzeile zeigt den Waehler; fremde Maus/Tasten sind gesperrt
    this.acceptDigits = coop ? coop.allowKeys : true;
    this.forEl.textContent = coop ? coop.label : '';
    this.forEl.classList.toggle('p2', coop?.slot === 1);
    this.headingEl.textContent = STR.chooseUpgrade;
    this.root.classList.toggle('input-locked', coop ? !coop.allowMouse : false);
    this.cardsWrap.innerHTML = '';
    // Zeremonie: legendaere Karte erscheint als LETZTE, der Screen kriegt
    // einen Andock-Punkt fuer Gold-Styling (has-legendary)
    const hasLegendary = offers.some((o) => o.rarity === 'legendary');
    this.root.classList.toggle('has-legendary', hasLegendary);
    // Wahl erst nach dem Aufdecken — sonst waehlt ein hastiger Tastendruck
    // die goldene Karte, bevor sie ueberhaupt sichtbar war
    this.revealLocked = hasLegendary;
    window.clearTimeout(this.revealTimeout);
    if (hasLegendary) {
      this.revealTimeout = window.setTimeout(() => {
        this.revealLocked = false;
      }, 550);
    }
    offers.forEach((def, i) => {
      const info = STR.upgrades[def.id] ?? { name: def.id, desc: '' };
      const stacks = player.stackOf(def.id);
      const isLegendary = def.rarity === 'legendary';
      const card = document.createElement('button');
      card.className = 'upgrade-card appear';
      if (i === 0) card.setAttribute('data-nav-default', '');
      card.dataset.key = `upgrade-${i}`;
      if (isLegendary) card.classList.add('legendary');
      card.style.setProperty('--rarity', `var(--rarity-${def.rarity})`);
      card.style.animationDelay = isLegendary ? '0.45s' : `${i * 0.08}s`;
      // Legendaere sind Einmal-Karten — kein "Stufe 1/1"-Label
      const stacksLabel = def.instant || isLegendary
        ? ''
        : `<span class="upgrade-stacks">${STR.stacksLabel} ${stacks + 1}/${def.maxStacks}</span>`;
      card.innerHTML = `
        <span class="upgrade-rarity-label">${STR.rarities[def.rarity] ?? def.rarity}</span>
        <span class="upgrade-icon">${def.icon}</span>
        <span class="upgrade-name">${info.name}</span>
        <span class="upgrade-desc">${info.desc}</span>
        ${stacksLabel}
        <span class="upgrade-key keycap">${i + 1}</span>
      `;
      card.addEventListener('click', () => this.choose(i));
      this.cardsWrap.appendChild(card);
    });

    this.rerollBtn.disabled = !canReroll;
    this.rerollBtn.textContent = canReroll ? `🎲 ${STR.reroll}` : `🎲 ${STR.rerollUsed}`;

    this.keyHandler = (e: KeyboardEvent): void => {
      if (!this.acceptDigits) return;
      if (e.code === 'Digit1' || e.code === 'Numpad1') this.choose(0);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') this.choose(1);
      else if (e.code === 'Digit3' || e.code === 'Numpad3') this.choose(2);
      else if (e.code === 'KeyR' && !this.rerollBtn.disabled && !this.choosing) this.cb.onReroll();
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private choose(index: number): void {
    if (this.choosing || this.revealLocked) return;
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
    window.clearTimeout(this.revealTimeout);
    this.revealLocked = false;
    this.root.classList.remove('input-locked');
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }
}
