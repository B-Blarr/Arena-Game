import { STR } from '../../config/strings.de';
import { MAX_PROFILES, MAX_PROFILE_NAME_LEN, type SaveManager } from '../../save/SaveManager';
import { escapeHtml } from '../../utils/html';

export interface ProfilesCallbacks {
  onBack: () => void;
  /** Nach erfolgreichem Wechsel (Settings/Optik neu anwenden + zurueck ins Menue). */
  onSwitched: () => void;
}

/**
 * "Wer spielt?" — lokale Spieler-Profile ohne Passwort. Klick auf eine Karte
 * wechselt den Spieler (eigener Save/Highscore), plus Anlegen und Loeschen
 * (Zweitklick-Bestaetigung). Das letzte Profil ist unloeschbar.
 */
export class ProfilesScreen {
  private readonly root: HTMLElement;
  private listEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private createBtn!: HTMLButtonElement;
  private hintEl!: HTMLElement;
  /** Profil-ID, deren Loesch-Button gerade auf Bestaetigung wartet. */
  private confirmDeleteId: string | null = null;

  constructor(
    private readonly save: SaveManager,
    private readonly cb: ProfilesCallbacks,
  ) {
    this.root = document.getElementById('screen-profiles') as HTMLElement;
    this.build();
  }

  private build(): void {
    this.root.innerHTML = `
      <h2 class="title-glow profiles-title">${STR.profilesTitle}</h2>
      <div class="profile-list"></div>
      <div class="profile-create panel">
        <span class="profile-create-label">${STR.newProfileTitle}:</span>
        <input class="profile-name-input" type="text" maxlength="${MAX_PROFILE_NAME_LEN}"
               placeholder="${STR.newProfilePlaceholder}" />
        <button class="btn profile-create-btn">${STR.createProfile}</button>
      </div>
      <div class="profile-hint text-dim"></div>
      <button class="btn profiles-back" data-nav-back>${STR.back}</button>
    `;
    this.listEl = this.root.querySelector('.profile-list') as HTMLElement;
    this.inputEl = this.root.querySelector('.profile-name-input') as HTMLInputElement;
    this.createBtn = this.root.querySelector('.profile-create-btn') as HTMLButtonElement;
    this.hintEl = this.root.querySelector('.profile-hint') as HTMLElement;

    (this.root.querySelector('.profiles-back') as HTMLButtonElement).addEventListener('click', () => this.cb.onBack());
    this.createBtn.addEventListener('click', () => this.create());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.create();
      // Spiel-Shortcuts (R, P, 1-3 ...) nicht ins Tippen funken lassen
      e.stopPropagation();
    });
  }

  private create(): void {
    const name = this.inputEl.value.trim();
    if (name.length === 0) {
      this.inputEl.focus();
      return;
    }
    const meta = this.save.createProfile(name);
    if (!meta) {
      this.hintEl.textContent = STR.profilesFull;
      return;
    }
    this.inputEl.value = '';
    // Neues Profil direkt aktivieren — so erwartet man es beim Anlegen
    this.save.switchProfile(meta.id);
    this.cb.onSwitched();
  }

  render(): void {
    this.confirmDeleteId = null;
    this.hintEl.textContent = '';
    this.inputEl.value = '';
    this.renderList();
    const full = this.save.profiles.length >= MAX_PROFILES;
    this.createBtn.disabled = full;
    this.inputEl.disabled = full;
    if (full) this.hintEl.textContent = STR.profilesFull;
  }

  private renderList(): void {
    this.listEl.innerHTML = '';
    const canDelete = this.save.profiles.length > 1;
    for (const meta of this.save.profiles) {
      const isActive = meta.id === this.save.activeId;
      const data = this.save.profileData(meta.id);
      const best = Math.max(data.bestScores.easy, data.bestScores.normal, data.bestScores.hard);

      const card = document.createElement('div');
      card.className = `profile-card panel${isActive ? ' active' : ''}`;
      card.innerHTML = `
        <button class="profile-select" data-key="profil-${meta.id}">
          <span class="profile-name">${escapeHtml(meta.name)}</span>
          <span class="profile-stats">⬡ ${data.cores} · ${STR.bestScore}: ${best}</span>
          ${isActive ? `<span class="profile-badge">${STR.activeBadge}</span>` : ''}
        </button>
        ${canDelete ? `<button class="btn profile-delete" data-key="profil-del-${meta.id}">🗑</button>` : ''}
      `;
      (card.querySelector('.profile-select') as HTMLButtonElement).addEventListener('click', () => {
        if (isActive) {
          this.cb.onBack();
          return;
        }
        this.save.switchProfile(meta.id);
        this.cb.onSwitched();
      });
      const delBtn = card.querySelector('.profile-delete') as HTMLButtonElement | null;
      delBtn?.addEventListener('click', () => {
        // Zweitklick-Bestaetigung statt Dialog
        if (this.confirmDeleteId !== meta.id) {
          // vorher gearmte Buttons entwaffnen — sonst zeigen zwei Buttons
          // die Bestaetigungsfrage, aber nur einer ist scharf
          this.listEl.querySelectorAll('.profile-delete').forEach((b) => {
            b.textContent = '🗑';
            b.classList.remove('btn-danger');
          });
          this.confirmDeleteId = meta.id;
          delBtn.textContent = STR.deleteConfirm;
          delBtn.classList.add('btn-danger');
          return;
        }
        const wasActive = meta.id === this.save.activeId;
        this.save.deleteProfile(meta.id);
        if (wasActive) {
          // Loeschen des aktiven Profils wechselt intern -> Settings neu anwenden
          this.cb.onSwitched();
        } else {
          // Fremdes Profil geloescht: im Screen bleiben, Liste auffrischen
          this.render();
        }
      });
      this.listEl.appendChild(card);
    }
  }
}
