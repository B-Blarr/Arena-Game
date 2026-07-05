import type { GameState } from '../StateMachine';
import type { Game } from '../Game';

/** Werkstatt (Meta-Progression): Helden, Waffen, Dauer-Boni kaufen. */
export class ShopState implements GameState {
  constructor(private readonly game: Game) {}

  enter(): void {
    this.game.hud.hide();
    this.game.shopScreen.render();
    this.game.ui.showScreen('screen-shop');
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
