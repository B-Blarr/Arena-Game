import type { EventBus } from '../core/EventBus';
import type { Time } from '../core/Time';
import type { World } from '../core/World';
import type { CameraRig } from '../render/CameraRig';
import type { Renderer } from '../render/Renderer';

/**
 * Uebersetzt Gameplay-Events in Game-Feel: Trauma-Screenshake, Hitstop,
 * Zeitlupe, Weissblitz, Chromatic-Aberration-Kicks. Bewusst EIN Blitz
 * beim Boss-Tod, kein Strobe (Fotosensibilitaet, Kinder-Zielgruppe).
 */
export class JuiceDirector {
  private readonly unsubs: Array<() => void> = [];
  private readonly flashEl: HTMLElement | null;

  constructor(
    events: EventBus,
    private readonly time: Time,
    private readonly rig: CameraRig,
    private readonly world: World,
    private readonly renderer: Renderer,
  ) {
    this.flashEl = document.getElementById('screen-flash');

    this.unsubs.push(
      events.on('playerHit', () => {
        this.rig.addTrauma(0.4);
        this.renderer.kickAberration(0.5);
      }),
      events.on('enemyKilled', () => this.rig.addTrauma(0.06)),
      events.on('explosion', (e) => {
        // Koop: Distanz zum NAECHSTEN Spieler bestimmt das Beben
        let d = Infinity;
        for (let i = 0; i < this.world.players.length; i++) {
          const p = this.world.players[i];
          if (!p) continue;
          const pd = Math.hypot(e.x - p.x, e.z - p.z);
          if (pd < d) d = pd;
        }
        this.rig.addTrauma(0.3 * Math.max(0, 1 - d / 15));
      }),
      events.on('bossStomp', () => this.rig.addTrauma(0.5)),
      events.on('enemyHit', (e) => {
        if (e.crit) this.time.hitstop(0.04);
      }),
      events.on('playerDashed', () => {
        this.rig.dashKick();
        this.renderer.kickAberration(0.35);
      }),
      // Schwarzes Loch: kurzes Beben, der Kollaps laeuft ueber explosion
      events.on('blackHole', () => {
        this.rig.addTrauma(0.15);
        this.renderer.kickAberration(0.4);
      }),
      // Boss-Intro: kurzer Zeitlupen-Moment + Beben — KEIN Weissblitz
      // (der bleibt exklusiv beim Boss-Tod)
      events.on('bossSpawned', () => {
        this.time.slowmo(0.55, 0.7, 0.3);
        this.rig.addTrauma(0.25);
        this.renderer.kickAberration(0.6);
      }),
      events.on('bossDied', () => {
        // Mega-Event: Hitstop -> Zeitlupe -> EIN Weissblitz -> Trauma
        this.time.hitstop(0.12);
        this.time.slowmo(0.25, 0.8, 0.4);
        this.flash();
        this.rig.addTrauma(0.7);
        this.renderer.kickAberration(1);
      }),
      events.on('playerDied', () => {
        this.time.slowmo(0.3, 1.0, 0.5);
        this.rig.addTrauma(0.6);
      }),
      events.on('playerRevived', () => this.flash()),
      // Koop: Down = kurzer Schreck-Moment, Revive = Weissblitz
      events.on('playerDowned', () => {
        this.time.slowmo(0.5, 0.4, 0.3);
        this.rig.addTrauma(0.5);
        this.renderer.kickAberration(0.6);
      }),
      events.on('playerCoopRevived', () => this.flash()),
      // Legendaer gewaehlt: Rueckkehr ins Spiel in Zeitlupe + Blitz
      events.on('upgradeChosen', (e) => {
        if (e.rarity === 'legendary') {
          this.flash();
          this.time.slowmo(0.3, 0.5, 0.4);
          this.renderer.kickAberration(0.8);
        }
      }),
    );
  }

  private flash(): void {
    const el = this.flashEl;
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth; // Reflow erzwingen -> Animation startet neu
    el.classList.add('flash');
  }

  dispose(): void {
    for (const u of this.unsubs) u();
  }
}
