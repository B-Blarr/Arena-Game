/**
 * DOM-Helfer fuer den Bootstrap: statt stummer `as`-Casts wird beim Start
 * mit klarer Meldung gescheitert (defekte/veraenderte index.html), und im
 * Fehlerfall sieht der Spieler ein Overlay statt eines schwarzen Canvas.
 */

/** Holt das Canvas-Element oder wirft einen beschreibenden Fehler. */
export function requireCanvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLCanvasElement)) {
    throw new Error(`Neon Arena: <canvas id="${id}"> fehlt oder ist kein Canvas.`);
  }
  return el;
}

/**
 * Vollbild-Fehlermeldung mit Inline-Styles — funktioniert auch dann, wenn
 * das Stylesheet gar nicht geladen wurde oder der Fehler sehr frueh auftrat.
 */
export function showFatalError(message: string): void {
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'alert');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:9999',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:0.75rem',
    'padding:2rem',
    'background:#0a0a12',
    'color:#e6e6f0',
    'font-family:system-ui,sans-serif',
    'text-align:center',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Neon Arena konnte nicht starten';
  title.style.cssText = 'font-size:1.4rem;font-weight:700;color:#ff5a7a';

  const detail = document.createElement('div');
  detail.textContent = message;
  detail.style.cssText = 'font-size:0.95rem;opacity:0.85;max-width:38rem';

  const hint = document.createElement('div');
  hint.textContent = 'Seite neu laden. Besteht das Problem, aktualisiere den Browser.';
  hint.style.cssText = 'font-size:0.85rem;opacity:0.6';

  overlay.append(title, detail, hint);
  document.body.appendChild(overlay);
}
