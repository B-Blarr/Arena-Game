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
}

const ZONE_POOL = 8;

/**
 * NEU (Reise-Ausbau, Minenfeld): periodische Gefahren-Zonen am Boden. Rote
 * Warn-Ringe (enemyFuse) zuenden nach kurzer Vorwarnung und treffen NUR den
 * Spieler (rot = ausweichen) — reine Wiederverwendung des MINOS-Bomben-Musters
 * (siehe bossPatterns.updateMinos). Aktiv NUR wenn der aktuelle Raum ein
 * `hazard` traegt (Reise-Modus); im Klassik wird `rngHazard` nie gezogen.
 */
export class HazardSystem {
  private readonly zones: HazardZone[] = [];
  private salvoTimer = 0;

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
  ) {
    for (let i = 0; i < ZONE_POOL; i++) {
      this.zones.push({ active: false, x: 0, z: 0, fuseLeft: 0, radius: 0, damage: 0 });
    }
  }

  /** Wellenstart: alle Zonen loeschen + Timer setzen (erste Salve nicht sofort). */
  reset(): void {
    for (const z of this.zones) z.active = false;
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
      this.events.emit('explosion', { x: z.x, z: z.z, radius: z.radius, color: 0xff8c1a });
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
    this.salvoTimer = h.interval;
    const damage = Math.max(1, Math.round(h.damage * this.world.mods.enemyDamage));
    for (let n = 0; n < h.count; n++) this.plant(h, damage);
  }

  private plant(h: HazardDef, damage: number): void {
    const zone = this.zones.find((z) => !z.active);
    if (!zone) return;
    const rng = this.world.rngHazard;
    // Irgendwo in der Arena (Rand-Marge), gleichverteilt ueber die Flaeche
    // (sqrt gegen Mitte-Klumpung). Der Spieler MUSS aktiv ausweichen.
    const maxR = Math.max(2, this.world.arenaRadius - h.radius - 1);
    const angle = rng.next() * Math.PI * 2;
    const dist = Math.sqrt(rng.next()) * maxR;
    zone.active = true;
    zone.x = Math.cos(angle) * dist;
    zone.z = Math.sin(angle) * dist;
    zone.fuseLeft = h.warn;
    zone.radius = h.radius;
    zone.damage = damage;
    this.events.emit('enemyFuse', { x: zone.x, z: zone.z, radius: h.radius, duration: h.warn });
  }
}
