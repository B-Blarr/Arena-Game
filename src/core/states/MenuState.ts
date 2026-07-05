import type { GameState } from '../StateMachine';
import type { Game } from '../Game';

/** Startmenue — die Arena laeuft dekorativ im Hintergrund weiter. */
export class MenuState implements GameState {
  constructor(private readonly game: Game) {}

  enter(): void {
    this.game.hud.hide();
    this.game.menuScreen.refresh();
    this.game.ui.showScreen('screen-menu');
    this.game.music.stop();
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
