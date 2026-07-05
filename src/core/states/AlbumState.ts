import type { GameState } from '../StateMachine';
import type { Game } from '../Game';

/** Sticker-Album — die Arena laeuft dekorativ im Hintergrund weiter. */
export class AlbumState implements GameState {
  constructor(private readonly game: Game) {}

  enter(): void {
    this.game.hud.hide();
    this.game.albumScreen.render();
    this.game.ui.showScreen('screen-album');
  }

  exit(): void {
    // NEU-Badges gelten genau fuer einen Besuch
    this.game.albumScreen.commitSeen();
    this.game.ui.showScreen(null);
  }

  update(dt: number): void {
    void dt;
  }

  render(alpha: number, rawDt: number): void {
    this.game.renderBackdrop(alpha, rawDt);
  }
}
