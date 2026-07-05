import type { GameState } from '../StateMachine';
import type { Game } from '../Game';

/** "Wer spielt?" — Profil-Auswahl/-Verwaltung, Arena laeuft dekorativ im Hintergrund. */
export class ProfilesState implements GameState {
  constructor(private readonly game: Game) {}

  enter(): void {
    this.game.hud.hide();
    this.game.profilesScreen.render();
    this.game.ui.showScreen('screen-profiles');
  }

  exit(): void {
    this.game.ui.showScreen(null);
  }

  update(dt: number): void {
    void dt;
  }

  render(alpha: number, rawDt: number): void {
    this.game.renderBackdrop(alpha, rawDt);
  }
}
