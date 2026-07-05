import type { GameState } from '../StateMachine';
import type { Game } from '../Game';

/** Lokale Bestenliste aller Profile. */
export class LeaderboardState implements GameState {
  constructor(private readonly game: Game) {}

  enter(): void {
    this.game.hud.hide();
    this.game.leaderboardScreen.render();
    this.game.ui.showScreen('screen-leaderboard');
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
