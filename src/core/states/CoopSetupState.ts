import type { GameState } from '../StateMachine';
import type { Game } from '../Game';

/** Koop-Aufstellung — die Arena laeuft dekorativ im Hintergrund weiter. */
export class CoopSetupState implements GameState {
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private readonly game: Game) {}

  enter(): void {
    const g = this.game;
    g.hud.hide();
    // Frische Zuordnung: alte Slots verwerfen, P2 tritt gleich neu bei
    g.input.setSolo();
    g.coopSetupScreen.refresh();
    g.ui.showScreen('screen-coop-setup');
    // Tastatur-Beitritt (ShiftRight/Enter) — Pad-Beitritt pollt render()
    this.keyHandler = (e: KeyboardEvent): void => {
      g.coopSetupScreen.handleKeyJoin(e.code);
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  exit(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.game.ui.showScreen(null);
  }

  update(dt: number): void {
    void dt;
  }

  render(alpha: number, rawDt: number): void {
    this.game.coopSetupScreen.pollJoin();
    this.game.renderBackdrop(alpha, rawDt);
  }
}
