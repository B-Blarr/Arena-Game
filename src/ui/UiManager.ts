import type { EventBus } from '../core/EventBus';

const SCREEN_IDS = [
  'screen-menu', 'screen-upgrade', 'screen-pause', 'screen-gameover',
  'screen-shop', 'screen-profiles', 'screen-leaderboard', 'screen-album',
] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

/**
 * Zeigt/versteckt Screens (nur CSS-Klassen, DOM bleibt bestehen),
 * verwaltet Onboarding-Prompts und spielt UI-Sounds per Event-Delegation.
 */
export class UiManager {
  private readonly screens = new Map<ScreenId, HTMLElement>();
  private readonly promptLayer: HTMLElement;
  private readonly promptEl: HTMLElement;
  private lastHover: EventTarget | null = null;
  private readonly disposers: Array<() => void> = [];
  /** Hook fuer die Fokus-Navigation (UiNav) — kriegt den aktiven Screen. */
  onScreenShown: ((el: HTMLElement | null) => void) | null = null;

  constructor(events: EventBus) {
    for (const id of SCREEN_IDS) {
      const el = document.getElementById(id);
      if (el) this.screens.set(id, el);
    }
    this.promptLayer = document.getElementById('prompt-layer') as HTMLElement;
    this.promptEl = document.createElement('div');
    this.promptEl.className = 'prompt';
    this.promptEl.style.display = 'none';
    this.promptLayer.appendChild(this.promptEl);

    // UI-Sounds zentral per Delegation
    const ui = document.getElementById('ui') as HTMLElement;
    const onClick = (e: Event): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.btn, .hero-card, .upgrade-card, .segmented button, .hud-mute, .menu-profile, .profile-select')) {
        events.emit('uiClick', {});
      }
    };
    const onOver = (e: Event): void => {
      const target = (e.target as HTMLElement | null)?.closest(
        '.btn, .hero-card, .upgrade-card, .segmented button, .menu-profile, .profile-select',
      );
      if (target && target !== this.lastHover) {
        this.lastHover = target;
        events.emit('uiHover', {});
      }
    };
    ui.addEventListener('click', onClick);
    ui.addEventListener('mouseover', onOver);
    this.disposers.push(
      () => ui.removeEventListener('click', onClick),
      () => ui.removeEventListener('mouseover', onOver),
    );
  }

  /** Genau einen Screen zeigen (oder alle verstecken mit null). */
  showScreen(id: ScreenId | null): void {
    for (const [key, el] of this.screens) {
      el.classList.toggle('hidden', key !== id);
    }
    this.onScreenShown?.(id ? (this.screens.get(id) ?? null) : null);
  }

  showPrompt(html: string): void {
    this.promptEl.innerHTML = html;
    this.promptEl.style.display = 'flex';
  }

  hidePrompt(): void {
    this.promptEl.style.display = 'none';
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }
}
