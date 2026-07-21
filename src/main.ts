import './ui/styles/base.css';
import './ui/styles/hud.css';
import './ui/styles/screens.css';
import { Game } from './core/Game';
import { requireCanvas, showFatalError } from './utils/dom';

// Gamepad-Mock fuer Browser-Tests (?padmock) — Pads werden dynamisch
// gepollt, deshalb darf der Patch auch kurz nach Spielstart landen
if (import.meta.env.DEV && location.search.includes('padmock')) {
  void import('./debug/padMock').then((m) => m.installPadMock());
}

// Fehler-Boundary: schlaegt der Start fehl (fehlendes Canvas, WebGL-Fehler,
// Konstruktor-Ausnahme), sieht der Spieler eine Meldung statt eines schwarzen
// Bildschirms. `game` bleibt undefined, falls die Konstruktion wirft.
let game: Game | undefined;
try {
  const canvas = requireCanvas('game');
  game = new Game(canvas);
  game.start();
} catch (err) {
  console.error(err);
  showFatalError(err instanceof Error ? err.message : String(err));
}

// Nur im Dev-Modus: Zugriff fuer Browser-Tests/Debugging
if (import.meta.env.DEV && game) {
  (window as unknown as Record<string, unknown>).__game = game;
}

// Vite-HMR: alten Renderer/Loop/Listener sauber abbauen — sonst leakt
// jeder Hot-Reload einen kompletten WebGL-Kontext.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.dispose();
  });
}
