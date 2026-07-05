import { STR } from '../../config/strings.de';
import type { SaveManager } from '../../save/SaveManager';

export interface PauseCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onSettingsChanged: () => void;
}

/** Pause mit Optionen: Lautstaerken, Effekte reduzieren, Schadenszahlen, Auto-Aim. */
export class PauseScreen {
  private readonly root: HTMLElement;

  constructor(
    private readonly save: SaveManager,
    private readonly cb: PauseCallbacks,
  ) {
    this.root = document.getElementById('screen-pause') as HTMLElement;
    this.build();
  }

  private slider(label: string, key: 'masterVolume' | 'sfxVolume' | 'musicVolume'): string {
    return `
      <label class="toggle-row"><span class="option-label">${label}</span>
        <input type="range" min="0" max="100" data-vol="${key}" />
      </label>
    `;
  }

  private toggle(label: string, key: 'reduceFx' | 'damageNumbers' | 'autoAim' | 'vibration'): string {
    return `
      <div class="toggle-row"><span class="option-label">${label}</span>
        <span class="segmented" data-toggle="${key}">
          <button data-val="1">${STR.on}</button><button data-val="0">${STR.off}</button>
        </span>
      </div>
    `;
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="panel pause-panel">
        <h2 class="title-glow pause-title">${STR.pause}</h2>
        <button class="btn btn-primary pause-resume" data-nav-default data-nav-back>${STR.resume}</button>
        <div class="options-grid">
          ${this.slider(STR.volumeMaster, 'masterVolume')}
          ${this.slider(STR.volumeSfx, 'sfxVolume')}
          ${this.slider(STR.volumeMusic, 'musicVolume')}
          ${this.toggle(STR.reduceFx, 'reduceFx')}
          ${this.toggle(STR.damageNumbers, 'damageNumbers')}
          ${this.toggle(STR.autoAim, 'autoAim')}
          ${this.toggle(STR.vibration, 'vibration')}
        </div>
        <button class="btn pause-restart">${STR.restart}</button>
        <button class="btn pause-menu">${STR.mainMenu}</button>
      </div>
    `;
    (this.root.querySelector('.pause-resume') as HTMLButtonElement).addEventListener('click', () => this.cb.onResume());
    (this.root.querySelector('.pause-restart') as HTMLButtonElement).addEventListener('click', () => this.cb.onRestart());
    (this.root.querySelector('.pause-menu') as HTMLButtonElement).addEventListener('click', () => this.cb.onMenu());

    for (const input of this.root.querySelectorAll<HTMLInputElement>('input[type=range]')) {
      input.addEventListener('input', () => {
        const key = input.dataset.vol as 'masterVolume' | 'sfxVolume' | 'musicVolume';
        this.save.data.settings[key] = Number(input.value) / 100;
        this.cb.onSettingsChanged();
      });
    }
    for (const seg of this.root.querySelectorAll<HTMLElement>('[data-toggle]')) {
      seg.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('button');
        if (!btn) return;
        const key = seg.dataset.toggle as 'reduceFx' | 'damageNumbers' | 'autoAim' | 'vibration';
        this.save.data.settings[key] = btn.dataset.val === '1';
        this.cb.onSettingsChanged();
        this.refresh();
      });
    }
  }

  refresh(): void {
    const s = this.save.data.settings;
    for (const input of this.root.querySelectorAll<HTMLInputElement>('input[type=range]')) {
      const key = input.dataset.vol as 'masterVolume' | 'sfxVolume' | 'musicVolume';
      input.value = String(Math.round(s[key] * 100));
    }
    for (const seg of this.root.querySelectorAll<HTMLElement>('[data-toggle]')) {
      const key = seg.dataset.toggle as 'reduceFx' | 'damageNumbers' | 'autoAim' | 'vibration';
      const val = s[key];
      seg.querySelectorAll('button').forEach((btn) => {
        btn.classList.toggle('active', (btn.dataset.val === '1') === val);
      });
    }
  }
}
