import { STR } from '../../config/strings.de';
import type { SaveManager } from '../../save/SaveManager';

export interface LeaderboardCallbacks {
  onBack: () => void;
}

/**
 * Lokale Bestenliste: aggregiert live die Bestwerte aller Profile
 * (kein separater Speicher noetig), sortiert nach hoechstem Bestwert.
 * NEU (Reise-Ausbau): Umschalter Klassik/Reise — Reise hat eine eigene Wertung
 * (leichter durch Rast/Schatz) und ist solo (keine Koop-Spalte).
 */
export class LeaderboardScreen {
  private readonly root: HTMLElement;
  private tableWrap!: HTMLElement;
  private mode: 'classic' | 'journey' = 'classic';

  constructor(
    private readonly save: SaveManager,
    private readonly cb: LeaderboardCallbacks,
  ) {
    this.root = document.getElementById('screen-leaderboard') as HTMLElement;
    this.build();
  }

  private build(): void {
    this.root.innerHTML = `
      <h2 class="title-glow leaderboard-title">🏆 ${STR.leaderboardTitle}</h2>
      <div class="lb-mode-toggle">
        <button class="album-tab lb-mode-btn" data-mode="classic">${STR.lbModeClassic}</button>
        <button class="album-tab lb-mode-btn" data-mode="journey">${STR.lbModeJourney}</button>
      </div>
      <div class="leaderboard-wrap panel"></div>
      <button class="btn leaderboard-back" data-nav-default data-nav-back>${STR.back}</button>
    `;
    this.tableWrap = this.root.querySelector('.leaderboard-wrap') as HTMLElement;
    this.root.querySelectorAll<HTMLButtonElement>('.lb-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.mode = (btn.dataset.mode as 'classic' | 'journey' | undefined) ?? 'classic';
        this.render();
      });
    });
    (this.root.querySelector('.leaderboard-back') as HTMLButtonElement)
      .addEventListener('click', () => this.cb.onBack());
  }

  render(): void {
    const journey = this.mode === 'journey';
    // Aktiven Umschalter markieren
    this.root.querySelectorAll<HTMLButtonElement>('.lb-mode-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn.dataset.mode ?? 'classic') === this.mode);
    });

    const rows = this.save.profiles.map((meta) => {
      const data = this.save.profileData(meta.id);
      const scores = journey ? data.bestJourneyScores : data.bestScores;
      const waves = journey ? data.bestJourneyWaves : data.bestWaves;
      return {
        id: meta.id,
        name: meta.name,
        easy: scores.easy,
        normal: scores.normal,
        hard: scores.hard,
        // Reise ist solo -> keine Koop-Spalte
        coop: journey ? 0 : Math.max(data.bestScoresCoop.easy, data.bestScoresCoop.normal, data.bestScoresCoop.hard),
        bestWave: Math.max(waves.easy, waves.normal, waves.hard),
        best: Math.max(scores.easy, scores.normal, scores.hard),
      };
    });
    rows.sort((a, b) => b.best - a.best);

    const anyScore = rows.some((r) => r.best > 0 || r.coop > 0);
    let html = `
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th></th>
            <th class="lb-left">${STR.lbName}</th>
            <th>${STR.difficulties.easy}</th>
            <th>${STR.difficulties.normal}</th>
            <th>${STR.difficulties.hard}</th>
            ${journey ? '' : `<th>${STR.lbCoop}</th>`}
            <th>${STR.lbBestWave}</th>
          </tr>
        </thead>
        <tbody>
    `;
    rows.forEach((r, i) => {
      const medal = i === 0 && r.best > 0 ? '🥇' : i === 1 && r.best > 0 ? '🥈' : i === 2 && r.best > 0 ? '🥉' : String(i + 1);
      const active = r.id === this.save.activeId ? ' class="lb-active"' : '';
      html += `
        <tr${active}>
          <td>${medal}</td>
          <td class="lb-left">${escapeHtml(r.name)}</td>
          <td>${r.easy || '–'}</td>
          <td>${r.normal || '–'}</td>
          <td>${r.hard || '–'}</td>
          ${journey ? '' : `<td>${r.coop || '–'}</td>`}
          <td>${r.bestWave || '–'}</td>
        </tr>
      `;
    });
    html += '</tbody></table>';
    if (!anyScore) {
      html += `<div class="lb-empty text-dim">${STR.leaderboardEmptyHint}</div>`;
    }
    this.tableWrap.innerHTML = html;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
