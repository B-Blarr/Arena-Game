import type { GameState } from '../StateMachine';
import type { Game } from '../Game';
import type { GameOverResult } from '../../ui/screens/GameOverScreen';

/** "Runde vorbei!" — Score-Abrechnung, Kerne-Gutschrift, schneller Neustart. */
export class GameOverState implements GameState {
  /** Wird von RunState vor dem Wechsel gesetzt. */
  result: GameOverResult = {
    score: 0,
    wave: 1,
    isRecord: false,
    best: 0,
    coresEarned: 0,
    totalCores: 0,
    teaser: null,
    dps: 0,
    strongestHit: 0,
    maxCombo: 1,
    build: [],
    build2: null,
    buildLabels: null,
    newStickers: [],
  };

  constructor(private readonly game: Game) {}

  enter(): void {
    this.game.hud.hide();
    this.game.music.stop();
    this.game.gameOverScreen.show(this.result);
    this.game.ui.showScreen('screen-gameover');
  }

  exit(): void {
    this.game.gameOverScreen.hide();
    this.game.ui.showScreen(null);
  }

  update(dt: number): void {
    // Partikel duerfen hinter dem Overlay ausklingen
    this.game.particles.update(dt);
    this.game.world.elapsed += dt;
  }

  render(alpha: number, rawDt: number): void {
    this.game.renderBackdrop(alpha, rawDt);
  }
}
