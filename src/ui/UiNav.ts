import { NAV, PAD_BTN } from '../config/input';
import type { EventBus } from '../core/EventBus';
import type { InputManager } from '../input/InputManager';

/**
 * Fokus-Navigation fuer alle Screens per Gamepad (D-Pad/linker Stick/A/B)
 * und Pfeiltasten. Nutzt echten DOM-Fokus plus `.nav-focus`-Markierung
 * (`:focus-visible` matcht nach programmatischem focus() nicht zuverlaessig).
 *
 * Screens bleiben Besitzer ihrer Semantik und deklarieren sie per Attribut:
 * - `data-nav-default`  Startfokus des Screens
 * - `data-nav-back`     Ziel von B/Escape ("Zurueck")
 * - `data-nav-button="N"` Pad-Button N klickt dieses Element (z.B. 3 = Y)
 * - `data-key`          stabiler Schluessel fuer Fokus-Restore nach Rebuilds
 *
 * Maus und Pad wechseln sich ab ("letzter gewinnt") — Mausnutzer sehen
 * keinen Fokus-Ring. Button 9 (Start) ist tabu: der gehoert dem RunState.
 */
export class UiNav {
  private screen: HTMLElement | null = null;
  private items: HTMLElement[] = [];
  private dirty = true;
  private focused: HTMLElement | null = null;
  private lastFocusKey: string | null = null;
  /** -1 = auf diesem Screen war noch nie etwas fokussiert (-> Default). */
  private lastFocusIndex = -1;
  private lastInput: 'pointer' | 'nav' = 'pointer';
  private inputFilter: 0 | 1 | null = null;

  // Richtungs-Wiederholung (Pad)
  private heldX = 0;
  private heldZ = 0;
  private repeatTimer = 0;

  private readonly observer: MutationObserver;
  private readonly disposers: Array<() => void> = [];

  constructor(
    private readonly events: EventBus,
    private readonly input: InputManager,
  ) {
    this.observer = new MutationObserver(() => {
      this.dirty = true;
    });

    // Maus meldet sich zurueck -> Fokus-Ring weg (kein Doppel-Highlight)
    const onPointer = (): void => {
      if (this.lastInput === 'pointer') return;
      this.lastInput = 'pointer';
      this.setFocus(null);
    };
    document.addEventListener('mousemove', onPointer);
    document.addEventListener('pointerdown', onPointer);

    // Pfeiltasten/Enter/Escape: event-basiert (Browser-Autorepeat gratis)
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!this.screen) return;
      if (!this.keyboardAllowed()) return;
      const target = e.target as HTMLElement | null;
      // Im Textfeld (Profil-Name) nicht navigieren
      if (target instanceof HTMLInputElement && target.type === 'text') return;

      const focusedRange = this.focused instanceof HTMLInputElement && this.focused.type === 'range';
      switch (e.code) {
        case 'ArrowLeft':
        case 'ArrowRight':
          if (focusedRange) return; // native Slider-Bedienung + input-Event
          if (!this.wakeNav()) this.moveFocus(e.code === 'ArrowLeft' ? -1 : 1, 0);
          e.preventDefault();
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          if (!this.wakeNav()) this.moveFocus(0, e.code === 'ArrowUp' ? -1 : 1);
          e.preventDefault();
          break;
        case 'Enter':
        case 'NumpadEnter':
          if (this.lastInput === 'nav' && this.focused) {
            this.focused.click();
            e.preventDefault();
          }
          break;
        case 'Escape': {
          // Im Run gehoert Escape dem Pause-Handler des RunState. Die Weg-Wahl
          // (screen-path) ist wie die Upgrade-Wahl eine Pflicht-Wahl: kein Abbrechen.
          const id = this.screen.id;
          if (id === 'screen-pause' || id === 'screen-upgrade' || id === 'screen-path') return;
          this.clickBack();
          break;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);

    this.disposers.push(
      () => document.removeEventListener('mousemove', onPointer),
      () => document.removeEventListener('pointerdown', onPointer),
      () => window.removeEventListener('keydown', onKeyDown),
      () => this.observer.disconnect(),
    );
  }

  /** Vom UiManager bei jedem Screen-Wechsel aufgerufen. */
  setScreen(el: HTMLElement | null): void {
    if (el === this.screen) return;
    this.observer.disconnect();
    this.screen = el;
    this.setFocus(null);
    this.lastFocusKey = null;
    this.lastFocusIndex = -1;
    this.dirty = true;
    if (el) {
      this.observer.observe(el, { childList: true, subtree: true });
      // Pad-Nutzer bekommen sofort einen Fokus, Mausnutzer nicht
      if (this.lastInput === 'nav') {
        this.collect();
        this.focusDefault();
      }
    }
  }

  /**
   * Koop-Upgrade-Gating: nur die Quellen dieses Slots duerfen navigieren.
   * null = jeder darf (Solo/Menues).
   */
  setInputFilter(slot: 0 | 1 | null): void {
    this.inputFilter = slot;
  }

  /** 1x pro Render-Frame nach pollPads(). */
  update(rawDt: number): void {
    if (!this.screen) return;
    if (this.dirty) {
      this.collect();
      this.restoreFocus();
    }

    // Richtung + Aktionen aller berechtigten Pads einsammeln
    let dirX = 0;
    let dirZ = 0;
    let activate = false;
    let back = false;
    let extraBtn = -1;

    const pads = this.input.pads;
    for (let i = 0; i < pads.pads.length; i++) {
      const p = pads.pads[i];
      if (!p?.connected || !this.padAllowed(i)) continue;

      // Stick mit Hysterese: ab stickThreshold aktiv, erst unter
      // stickRelease wieder los (kein Flackern an der Kante)
      const sx = this.stickDir(p.moveX, this.heldX);
      const sz = this.stickDir(p.moveZ, this.heldZ);
      const dx = sx !== 0 ? sx : pads.isDown(i, PAD_BTN.dpadLeft) ? -1 : pads.isDown(i, PAD_BTN.dpadRight) ? 1 : 0;
      const dz = sz !== 0 ? sz : pads.isDown(i, PAD_BTN.dpadUp) ? -1 : pads.isDown(i, PAD_BTN.dpadDown) ? 1 : 0;
      if (dx !== 0) dirX = dx;
      if (dz !== 0) dirZ = dz;

      if (pads.uiPressed(i, PAD_BTN.a)) activate = true;
      if (pads.uiPressed(i, PAD_BTN.b)) back = true;
      if (pads.uiPressed(i, PAD_BTN.x)) extraBtn = PAD_BTN.x;
      if (pads.uiPressed(i, PAD_BTN.y)) extraBtn = PAD_BTN.y;
    }

    // Bewegungs-Flanken + Repeat
    if (dirX !== this.heldX || dirZ !== this.heldZ) {
      this.heldX = dirX;
      this.heldZ = dirZ;
      if (dirX !== 0 || dirZ !== 0) {
        if (!this.wakeNav()) this.step(dirX, dirZ);
        this.repeatTimer = NAV.repeatDelayMs / 1000;
      }
    } else if (dirX !== 0 || dirZ !== 0) {
      this.repeatTimer -= rawDt;
      if (this.repeatTimer <= 0) {
        this.step(dirX, dirZ);
        this.repeatTimer = NAV.repeatIntervalMs / 1000;
      }
    }

    if (activate && this.lastInput === 'nav' && this.focused) {
      this.focused.click();
    } else if (activate) {
      // Erster A-Druck ohne Fokus: nur aufwachen
      this.wakeNav();
    }
    if (back) this.clickBack();
    if (extraBtn >= 0) {
      const target = this.screen.querySelector<HTMLElement>(`[data-nav-button="${extraBtn}"]`);
      target?.click();
    }
  }

  /** Stick-Richtung mit Hysterese gegen die aktuell gehaltene Richtung. */
  private stickDir(axis: number, held: number): number {
    const mag = Math.abs(axis);
    if (mag >= NAV.stickThreshold) return Math.sign(axis);
    if (held !== 0 && Math.sign(axis) === held && mag >= NAV.stickRelease) return held;
    return 0;
  }

  /** Ein Navigations-Schritt: Slider anpassen oder Fokus bewegen. */
  private step(dirX: number, dirZ: number): void {
    if (dirX !== 0 && this.focused instanceof HTMLInputElement && this.focused.type === 'range') {
      const el = this.focused;
      const next = Math.min(
        Number(el.max || 100),
        Math.max(Number(el.min || 0), Number(el.value) + dirX * NAV.sliderStep),
      );
      el.value = String(next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    this.moveFocus(dirX, dirZ);
  }

  /** true = Navigation ist gerade erst aufgewacht (erster Druck zeigt nur den Fokus). */
  private wakeNav(): boolean {
    if (this.lastInput === 'nav' && this.focused) return false;
    this.lastInput = 'nav';
    if (!this.focused) {
      this.collect();
      this.restoreFocus();
      if (!this.focused) this.focusDefault();
    }
    return true;
  }

  // ------------------------------------------------ Fokus-Verwaltung

  private collect(): void {
    this.dirty = false;
    this.items.length = 0;
    if (!this.screen) return;
    const nodes = this.screen.querySelectorAll<HTMLElement>('button, input[type="range"]');
    for (const el of nodes) {
      if ((el as HTMLButtonElement).disabled) continue;
      if (el.offsetParent === null) continue; // unsichtbar
      this.items.push(el);
    }
    // Fokus zeigt evtl. auf ein ersetztes Element
    if (this.focused && !this.items.includes(this.focused)) {
      this.focused.classList.remove('nav-focus');
      this.focused = null;
    }
  }

  private restoreFocus(): void {
    if (this.lastInput !== 'nav' || this.focused || this.items.length === 0) return;
    // Noch nie fokussiert -> kein Restore; wakeNav/setScreen setzen den Default
    if (this.lastFocusKey === null && this.lastFocusIndex < 0) return;
    let target: HTMLElement | null = null;
    if (this.lastFocusKey) {
      target =
        this.items.find(
          (el) => el.dataset.key === this.lastFocusKey || el.closest(`[data-key="${this.lastFocusKey}"]`) === el,
        ) ?? null;
    }
    if (!target) target = this.items[Math.max(0, Math.min(this.lastFocusIndex, this.items.length - 1))] ?? null;
    if (target) this.setFocus(target);
  }

  private focusDefault(): void {
    if (this.items.length === 0) return;
    const def = this.items.find((el) => el.hasAttribute('data-nav-default')) ?? this.items[0] ?? null;
    this.setFocus(def);
  }

  private setFocus(el: HTMLElement | null): void {
    if (this.focused === el) return;
    if (this.focused) {
      this.focused.classList.remove('nav-focus');
      if (!el) this.focused.blur();
    }
    this.focused = el;
    if (el) {
      el.classList.add('nav-focus');
      el.focus({ preventScroll: true });
      this.lastFocusKey = el.dataset.key ?? null;
      this.lastFocusIndex = Math.max(0, this.items.indexOf(el));
      this.events.emit('uiHover', {});
    }
  }

  /**
   * Raeumliche Fokus-Wahl ueber Bounding-Rects (nicht DOM-Reihenfolge).
   * Zwei Paesse: erst Kandidaten, die mit der Quelle in einer Reihe/Spalte
   * liegen (Band-Ueberlappung) — sonst schlaegt ein naher diagonaler
   * Nachbar das Element direkt daneben. Dann erst freie Diagonale.
   */
  private moveFocus(dirX: number, dirZ: number): void {
    if (this.items.length === 0) return;
    if (!this.focused) {
      this.focusDefault();
      return;
    }
    const from = this.focused.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;

    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    let bestAligned = false;
    for (const el of this.items) {
      if (el === this.focused) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - fx;
      const dy = r.top + r.height / 2 - fy;
      const primary = dirX !== 0 ? dx * dirX : dy * dirZ;
      if (primary <= 1) continue; // nicht in der Zielrichtung
      const ortho = dirX !== 0 ? Math.abs(dy) : Math.abs(dx);
      const band = dirX !== 0 ? (from.height + r.height) / 2 : (from.width + r.width) / 2;
      const aligned = ortho < band;
      if (bestAligned && !aligned) continue; // Reihen-Kandidat schlaegt Diagonale immer
      // In der Reihe dominiert die Hauptdistanz (naechste Reihe gewinnt),
      // quer zaehlt nur als Tiebreaker — diagonal bleibt teuer
      const score = primary + (aligned ? NAV.alignedOrthoPenalty : NAV.orthoPenalty) * ortho;
      if ((aligned && !bestAligned) || score < bestScore) {
        bestScore = score;
        best = el;
        bestAligned = aligned;
      }
    }
    if (best) this.setFocus(best);
  }

  private clickBack(): void {
    this.screen?.querySelector<HTMLElement>('[data-nav-back]')?.click();
  }

  // ------------------------------------------------ Berechtigungen

  private padAllowed(index: number): boolean {
    if (this.inputFilter === null) return true;
    return this.input.padIndexOfSlot(this.inputFilter) === index;
  }

  private keyboardAllowed(): boolean {
    if (this.inputFilter === null) return true;
    // Pfeiltasten/Enter gehoeren der 'arrows'-Haelfte
    return this.input.sourceOfSlot(this.inputFilter) === 'arrows';
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }
}
