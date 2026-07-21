import { STR } from '../../config/strings.de';
import type { Difficulty } from '../../config/balance';
import type { InputManager, InputSource } from '../../input/InputManager';
import type { SaveManager } from '../../save/SaveManager';
import { escapeHtml } from '../../utils/html';

export interface CoopSetupCallbacks {
  onBack: () => void;
  onStart: (p2ProfileId: string | null, p2Name: string, difficulty: Difficulty) => void;
}

/**
 * "Wer spielt mit?" — Koop-Aufstellung: P1 ist das aktive Profil, P2
 * waehlt ein anderes Profil oder spielt als Gast. Spieler 2 tritt bei,
 * indem er seine Dash-Taste drueckt (Pad A/RT, Pfeile-Umschalt/Enter);
 * P1 behaelt automatisch die uebrige Quelle. Kein Daily im Koop.
 */
export class CoopSetupScreen {
  private readonly root: HTMLElement;
  private p2ListEl!: HTMLElement;
  private p1SourceEl!: HTMLElement;
  private p2SourceEl!: HTMLElement;
  private diffSeg!: HTMLElement;
  private hintEl!: HTMLElement;
  private startBtn!: HTMLButtonElement;
  private selectedP2: string | null = null; // null = Gast
  private difficulty: Difficulty = 'normal';
  private p2Source: InputSource | null = null;

  constructor(
    private readonly save: SaveManager,
    private readonly input: InputManager,
    private readonly cb: CoopSetupCallbacks,
  ) {
    this.root = document.getElementById('screen-coop-setup') as HTMLElement;
    this.root.innerHTML = `
      <h2 class="title-glow coop-title">🤝 ${STR.coopSetupTitle}</h2>
      <div class="coop-columns">
        <div class="coop-col panel">
          <div class="coop-col-title">${STR.coopP1Label}</div>
          <div class="coop-p1-name"></div>
          <div class="coop-source coop-p1-source"></div>
        </div>
        <div class="coop-col panel">
          <div class="coop-col-title p2">${STR.coopP2Label}</div>
          <div class="coop-p2-list"></div>
          <div class="coop-source coop-p2-source"></div>
        </div>
      </div>
      <div class="coop-join-hint">${STR.coopJoinHint}</div>
      <div class="toggle-row coop-diff-row"><span class="option-label">${STR.difficulty}</span><span class="segmented coop-diff"></span></div>
      <div class="coop-hint text-dim"></div>
      <div class="coop-buttons">
        <button class="btn btn-primary coop-start" data-nav-default>${STR.coopStart}</button>
        <button class="btn coop-back" data-nav-back>${STR.back}</button>
      </div>
    `;
    this.p2ListEl = this.root.querySelector('.coop-p2-list') as HTMLElement;
    this.p1SourceEl = this.root.querySelector('.coop-p1-source') as HTMLElement;
    this.p2SourceEl = this.root.querySelector('.coop-p2-source') as HTMLElement;
    this.diffSeg = this.root.querySelector('.coop-diff') as HTMLElement;
    this.hintEl = this.root.querySelector('.coop-hint') as HTMLElement;
    this.startBtn = this.root.querySelector('.coop-start') as HTMLButtonElement;
    (this.root.querySelector('.coop-back') as HTMLButtonElement).addEventListener('click', () => this.cb.onBack());
    this.startBtn.addEventListener('click', () => this.tryStart());
  }

  /** Beim Betreten des Screens. */
  refresh(): void {
    this.selectedP2 = this.save.profiles.length > 1 ? null : null;
    this.p2Source = null;
    this.difficulty = this.save.data.settings.difficulty;
    this.hintEl.textContent = '';
    (this.root.querySelector('.coop-p1-name') as HTMLElement).textContent = this.save.activeName;
    this.renderP2List();
    this.renderDiff();
    this.renderSources();
  }

  /**
   * Pro Frame vom State aufgerufen: Beitritts-Druecke einsammeln.
   * Pads meldet der InputManager; die Tastatur-Haelften kommen ueber
   * den eigenen keydown-Listener des Screens (Edge-Puffer sind Sim-gebunden).
   */
  pollJoin(): void {
    const src = this.input.consumeJoinPress();
    if (src) this.assignP2(src);
  }

  /**
   * GEAENDERT: Vom State-keydown (Capture-Phase). Solange P2 noch nicht
   * beigetreten ist, tritt Enter/ShiftRight verlaesslich der Pfeiltasten-
   * Haelfte bei und schluckt jeden konkurrierenden Handler (UiNav-Klick,
   * native Button-Aktivierung). Nach dem Beitritt macht Enter wieder die
   * normale Menue-Bestaetigung (Start-Button).
   */
  handleKeyJoin(e: KeyboardEvent): void {
    if (this.p2Source !== null) return; // schon beigetreten -> Enter normal
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'ShiftRight') {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.type === 'text') return; // Textfeld nicht kapern
      e.preventDefault();
      e.stopImmediatePropagation();
      this.assignP2('arrows');
    }
  }

  private assignP2(source: InputSource): void {
    this.p2Source = source;
    this.input.assignSlot(1, source);
    // P1 bekommt die verbleibende Standard-Quelle
    if (source === 'arrows') {
      this.input.assignSlot(0, 'wasd+mouse');
    } else {
      // P2 hat einen Pad: P1 nimmt WASD+Maus oder den ANDEREN Pad
      const p2Pad = Number(source.slice(4));
      let p1Pad = -1;
      for (let i = 0; i < 4; i++) {
        if (i !== p2Pad && this.input.pads.pads[i]?.connected) {
          p1Pad = i;
          break;
        }
      }
      this.input.assignSlot(0, p1Pad >= 0 ? (`pad:${p1Pad}` as InputSource) : 'wasd+mouse');
    }
    this.hintEl.textContent = '';
    this.renderSources();
  }

  private renderSources(): void {
    this.p1SourceEl.textContent = this.sourceLabel(this.input.sourceOfSlot(0) ?? 'wasd+mouse');
    this.p2SourceEl.textContent = this.p2Source ? this.sourceLabel(this.p2Source) : STR.coopSourceNone;
    this.p2SourceEl.classList.toggle('joined', this.p2Source !== null);
  }

  private sourceLabel(src: InputSource): string {
    if (src === 'wasd+mouse') return STR.coopSourceWasd;
    if (src === 'arrows') return STR.coopSourceArrows;
    return STR.coopSourcePad(Number(src.slice(4)) + 1);
  }

  private renderP2List(): void {
    this.p2ListEl.innerHTML = '';
    // Gast-Karte + alle ANDEREN Profile
    const options: Array<{ id: string | null; name: string; sub: string }> = [
      { id: null, name: STR.guest, sub: STR.guestHint },
    ];
    for (const meta of this.save.profiles) {
      if (meta.id === this.save.activeId) continue;
      const data = this.save.profileData(meta.id);
      options.push({ id: meta.id, name: meta.name, sub: `⬡ ${data.cores}` });
    }
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = `coop-p2-card${this.selectedP2 === opt.id ? ' selected' : ''}`;
      btn.dataset.key = `coop-p2-${opt.id ?? 'gast'}`;
      btn.innerHTML = `<span class="coop-p2-name">${escapeHtml(opt.name)}</span>
        <span class="coop-p2-sub">${opt.sub}</span>`;
      btn.addEventListener('click', () => {
        this.selectedP2 = opt.id;
        this.renderP2List();
      });
      this.p2ListEl.appendChild(btn);
    }
  }

  private renderDiff(): void {
    this.diffSeg.innerHTML = '';
    const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
    for (const d of diffs) {
      const btn = document.createElement('button');
      btn.dataset.key = `coop-diff-${d}`;
      btn.textContent = STR.difficulties[d] ?? d;
      const lockedHard = d === 'hard' && !this.save.data.hardUnlocked;
      if (lockedHard) {
        btn.disabled = true;
        btn.textContent = `🔒 ${btn.textContent}`;
      }
      btn.classList.toggle('active', this.difficulty === d);
      btn.addEventListener('click', () => {
        this.difficulty = d;
        this.renderDiff();
      });
      this.diffSeg.appendChild(btn);
    }
  }

  private tryStart(): void {
    if (!this.p2Source) {
      this.hintEl.textContent = STR.coopNeedsJoin;
      return;
    }
    const name = this.selectedP2
      ? (this.save.profiles.find((p) => p.id === this.selectedP2)?.name ?? STR.guest)
      : STR.guest;
    this.cb.onStart(this.selectedP2, name, this.difficulty);
  }
}
