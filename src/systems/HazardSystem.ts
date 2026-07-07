import { PLAYER } from '../config/balance';
import type { HazardDef } from '../config/rooms';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';

interface HazardZone {
  active: boolean;
  x: number;
  z: number;
  fuseLeft: number;
  radius: number;
  damage: number;
  /** Explosionsfarbe dieser Zone (beim Setzen fixiert). */
  color: number;
}

const ZONE_POOL = 8;
/** Standard-Explosionsfarbe (Minenfeld, orange), wenn der Raum keine eigene setzt. */
const HAZARD_COLOR = 0xff8c1a;

/**
 * NEU (Reise-Ausbau, Minenfeld/Sturm): periodische Gefahren-Zonen am Boden. Warn-Ringe
 * (enemyFuse) zuenden nach kurzer Vorwarnung und treffen NUR den Spieler (farbiger Ring =
 * ausweichen) — Wiederverwendung des MINOS-Bomben-Musters (siehe bossPatterns.updateMinos).
 * Aktiv NUR wenn der aktuelle Raum ein `hazard` traegt (Reise-Modus); im Klassik wird
 * `rngHazard` nie gezogen -> Daily byte-identisch.
 *
 * NEU (Skalierung): Zonen-Zahl waechst und das Intervall sinkt mit der Welle (relativ zur
 * Raum-minWave). NEU (Muster): jede Salve waehlt Streu/Ring/Linie (rngHazard, Reise-only).
 * NEU (Farbe): Warn-/Explosionsfarbe pro Raum (Sturm-Blitze elektrisch-blau).
 */
export class HazardSystem {
  private readonly zones: HazardZone[] = [];
  private salvoTimer = 0;
  /** Aktuelle Wellennummer (von reset gesetzt) fuer die Skalierung. */
  private currentWave = 1;

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
  ) {
    for (let i = 0; i < ZONE_POOL; i++) {
      this.zones.push({ active: false, x: 0, z: 0, fuseLeft: 0, radius: 0, damage: 0, color: HAZARD_COLOR });
    }
  }

  /** Wellenstart: alle Zonen loeschen + Timer setzen (erste Salve nicht sofort). */
  reset(wave: number): void {
    for (const z of this.zones) z.active = false;
    this.currentWave = wave;
    const h = this.world.roomMods.hazard;
    this.salvoTimer = h ? Math.min(1.0, h.interval) : 0;
  }

  update(dt: number): void {
    // 1) Detonationen laufen IMMER (auch wenn gerade kein Hazard-Raum aktiv ist —
    //    dann sind aber keine Zonen aktiv, also ist die Schleife folgenlos).
    for (const z of this.zones) {
      if (!z.active) continue;
      z.fuseLeft -= dt;
      if (z.fuseLeft > 0) continue;
      z.active = false;
      this.events.emit('explosion', { x: z.x, z: z.z, radius: z.radius, color: z.color });
      for (let i = 0; i < this.world.players.length; i++) {
        const p = this.world.players[i];
        if (!p || !p.targetable) continue;
        if (Math.hypot(p.x - z.x, p.z - z.z) < z.radius + PLAYER.radius) p.takeDamage(z.damage);
      }
    }

    // 2) Neue Salve NUR im Hazard-Raum -> im Klassik kein rngHazard-Draw.
    const h = this.world.roomMods.hazard;
    if (!h) return;
    this.salvoTimer -= dt;
    if (this.salvoTimer > 0) return;
    // NEU (Skalierung): Zonen-Zahl + Intervall aus Basis + Welle, relativ zur Raum-minWave
    // (Minenfeld ab W4, Sturm ab W2). Ohne Ramp-Felder bleibt es konstant (No-Op).
    const ramp = Math.max(0, this.currentWave - this.world.roomMods.minWave);
    const count = h.countRampEvery
      ? Math.min(h.countMax ?? h.count, h.count + Math.floor(ramp / h.countRampEvery))
      : h.count;
    const interval = Math.max(h.intervalMin ?? h.interval, h.interval - ramp * (h.intervalRampPerWave ?? 0));
    this.salvoTimer = interval;
    const damage = Math.max(1, Math.round(h.damage * this.world.mods.enemyDamage));
    this.plantSalvo(h, damage, count);
  }

  /** Eine Salve nach einem zufaellig gewaehlten Muster setzen (rngHazard, Reise-only). */
  private plantSalvo(h: HazardDef, damage: number, count: number): void {
    const rng = this.world.rngHazard;
    const patterns = h.patterns ?? ['scatter'];
    const pattern = patterns[Math.floor(rng.next() * patterns.length)] ?? 'scatter';
    // Rand-Marge, damit die Zone ganz in der Arena liegt.
    const maxR = Math.max(2, this.world.arenaRadius - h.radius - 1);
    if (pattern === 'ring') {
      // Zonen gleichmaessig auf einem Kreis, zufaellige Startrotation -> "es wird eng".
      const ringR = maxR * 0.7;
      const rot = rng.next() * Math.PI * 2;
      for (let n = 0; n < count; n++) {
        const a = rot + (n / count) * Math.PI * 2;
        this.spawnZone(Math.cos(a) * ringR, Math.sin(a) * ringR, h, damage);
      }
    } else if (pattern === 'line') {
      // Zonen in einer Reihe entlang einer zufaelligen Achse quer durch die Arena.
      const axis = rng.next() * Math.PI * 2;
      const dx = Math.cos(axis);
      const dz = Math.sin(axis);
      const span = maxR * 1.4;
      for (let n = 0; n < count; n++) {
        const t = count > 1 ? n / (count - 1) - 0.5 : 0;
        this.spawnZone(dx * t * span, dz * t * span, h, damage);
      }
    } else {
      // scatter (wie bisher): sqrt-gleichverteilt ueber die Flaeche (gegen Mitte-Klumpung).
      for (let n = 0; n < count; n++) {
        const angle = rng.next() * Math.PI * 2;
        const dist = Math.sqrt(rng.next()) * maxR;
        this.spawnZone(Math.cos(angle) * dist, Math.sin(angle) * dist, h, damage);
      }
    }
  }

  /** Eine einzelne Zone belegen + Warnring ausgeben. Explosion faerbt sich pro Raum
   *  (h.color), der Warnring bleibt ohne h.color rot (Minenfeld-Standard). */
  private spawnZone(x: number, z: number, h: HazardDef, damage: number): void {
    const zone = this.zones.find((zz) => !zz.active);
    if (!zone) return;
    zone.active = true;
    zone.x = x;
    zone.z = z;
    zone.fuseLeft = h.warn;
    zone.radius = h.radius;
    zone.damage = damage;
    zone.color = h.color ?? HAZARD_COLOR;
    this.events.emit('enemyFuse', { x, z, radius: h.radius, duration: h.warn, color: h.color });
  }
}
