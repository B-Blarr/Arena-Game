import './ui/styles/base.css';
import './ui/styles/hud.css';
import './ui/styles/screens.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// Nur im Dev-Modus: Zugriff fuer Browser-Tests/Debugging
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__game = game;
}

// Vite-HMR: alten Renderer/Loop/Listener sauber abbauen — sonst leakt
// jeder Hot-Reload einen kompletten WebGL-Kontext.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
