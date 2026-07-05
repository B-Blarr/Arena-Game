import { ARENA_RADIUS, PLAYER } from '../config/balance';
import { UPGRADE_VALUES as UV } from '../config/upgrades';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import { projectileHasHit, projectileMarkHit, type Projectile } from '../entities/Projectile';
import { segPointDist2 } from '../utils/math';
import type { CombatSystem } from './CombatSystem';

const projQueryBuf: number[] = [];
const contactQueryBuf: number[] = [];

/**
 * Bewegt Projektile (inkl. Bumerang), prueft alle Kollisionen:
 * Spieler-Projektile vs. Gegner/Boss/Minis (Swept-Segment — kein Tunneling),
 * Gegner-Projektile vs. Spieler, Kontakt- und Boss-Schaden.
 * Der Spatial Hash wird hier pro Step neu befuellt.
 */
export class CollisionSystem {
  constructor(
    private readonly world: World,
    private readonly events: EventBus,
    private readonly combat: CombatSystem,
  ) {}

  /** Muss VOR behaviors/Kampf laufen: Hash mit aktuellen Positionen fuellen. */
  fillSpatialHash(): void {
    const hash = this.world.spatialHash;
    hash.clear();
    const pool = this.world.enemies;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.get(i);
      hash.insert(i, e.x, e.z);
    }
  }

  update(dt: number): void {
    this.updatePlayerProjectiles(dt);
    this.updateEnemyProjectiles(dt);
    this.updateContactDamage();
  }

  // ------------------------------------------- Spieler-Projektile

  private updatePlayerProjectiles(dt: number): void {
    const pool = this.world.playerProjectiles;
    const p = this.world.player;

    for (let i = pool.count - 1; i >= 0; i--) {
      const proj = pool.get(i);
      proj.prevX = proj.x;
      proj.prevZ = proj.z;

      if (proj.boomerang && !proj.returning && proj.traveled >= proj.range) {
        // Umkehrpunkt: Treffer-Liste leeren -> Rueckweg trifft erneut
        proj.returning = true;
        proj.hitCount = 0;
      }

      if (proj.returning) {
        // Homing zurueck zum Spieler
        const dx = p.x - proj.x;
        const dz = p.z - proj.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7) {
          pool.despawn(i);
          continue;
        }
        const speed = Math.hypot(proj.vx, proj.vz) || 14;
        proj.vx = (dx / d) * speed;
        proj.vz = (dz / d) * speed;
      }

      proj.x += proj.vx * dt;
      proj.z += proj.vz * dt;
      proj.traveled += Math.hypot(proj.vx, proj.vz) * dt;

      if (!proj.boomerang && proj.traveled >= proj.range) {
        pool.despawn(i);
        continue;
      }
      if (this.hitWall(proj)) {
        pool.despawn(i);
        continue;
      }
      if (this.collideWithTargets(proj)) {
        pool.despawn(i);
        continue;
      }
    }
  }

  private hitWall(proj: Projectile): boolean {
    if (Math.hypot(proj.x, proj.z) >= ARENA_RADIUS - 0.2) {
      this.events.emit('projectileWallHit', { x: proj.x, z: proj.z });
      return true;
    }
    return false;
  }

  /** true = Projektil verbraucht. */
  private collideWithTargets(proj: Projectile): boolean {
    const world = this.world;
    const searchR = Math.hypot(proj.x - proj.prevX, proj.z - proj.prevZ) + 1.4;
    const midX = (proj.x + proj.prevX) / 2;
    const midZ = (proj.z + proj.prevZ) / 2;
    const found = world.spatialHash.queryCircle(midX, midZ, searchR, projQueryBuf);

    // Naechsten getroffenen Gegner auf dem Segment finden (fairer bei Durchschlag)
    let hitIdx = -1;
    let bestD2 = Infinity;
    for (let n = 0; n < found; n++) {
      const idx = projQueryBuf[n] as number;
      if (idx >= world.enemies.count) continue;
      const e = world.enemies.get(idx);
      if (e.hp <= 0 || projectileHasHit(proj, e.uid)) continue;
      const rr = e.radius + proj.radius;
      const d2 = segPointDist2(proj.prevX, proj.prevZ, proj.x, proj.z, e.x, e.z);
      if (d2 < rr * rr) {
        const distToStart =
          (e.x - proj.prevX) * (e.x - proj.prevX) + (e.z - proj.prevZ) * (e.z - proj.prevZ);
        if (distToStart < bestD2) {
          bestD2 = distToStart;
          hitIdx = idx;
        }
      }
    }

    if (hitIdx >= 0) {
      const e = world.enemies.get(hitIdx);
      projectileMarkHit(proj, e.uid);
      this.combat.hitEnemy(e, proj.damage, true, proj.prevX, proj.prevZ, 7 + proj.knockback);

      if (proj.pierceLeft > 0) {
        proj.pierceLeft--;
        return false;
      }
      if (proj.ricochetLeft > 0) {
        return !this.ricochet(proj);
      }
      return !proj.boomerang || this.consumeBoomerangHit(proj);
    }

    // Boss + Minis
    const boss = world.boss;
    if (boss && boss.alive && !boss.hidden) {
      const rr = boss.def.radius + proj.radius;
      if (segPointDist2(proj.prevX, proj.prevZ, proj.x, proj.z, boss.x, boss.z) < rr * rr) {
        const crit = Math.random() < world.player.stats.critChance;
        const damage = Math.round(proj.damage * (crit ? world.player.stats.critMultiplier : 1));
        boss.takeDamage(damage, this.events);
        this.events.emit('enemyHit', { x: proj.x, z: proj.z, damage, crit, enemyType: -1 });
        if (proj.pierceLeft > 0) {
          proj.pierceLeft--;
          return false;
        }
        return true;
      }
    }
    if (boss) {
      for (const m of boss.minis) {
        if (!m.active || m.hp <= 0) continue;
        const rr = m.radius + proj.radius;
        if (segPointDist2(proj.prevX, proj.prevZ, proj.x, proj.z, m.x, m.z) < rr * rr) {
          const crit = Math.random() < world.player.stats.critChance;
          const damage = Math.round(proj.damage * (crit ? world.player.stats.critMultiplier : 1));
          m.hp -= damage;
          m.flashTimer = 0.08;
          m.scalePop = 0.2;
          this.events.emit('enemyHit', { x: proj.x, z: proj.z, damage, crit, enemyType: -1 });
          if (m.hp <= 0) {
            this.events.emit('enemyKilled', { x: m.x, z: m.z, enemyType: -1, points: 250, scale: 1.4 });
            m.active = false;
          }
          if (proj.pierceLeft > 0) {
            proj.pierceLeft--;
            return false;
          }
          return true;
        }
      }
    }
    return false;
  }

  /** Abpraller: Projektil springt zum naechsten noch nicht getroffenen Gegner. */
  private ricochet(proj: Projectile): boolean {
    const world = this.world;
    let bestIdx = -1;
    let bestD2 = UV.ricochetRange * UV.ricochetRange;
    for (let i = 0; i < world.enemies.count; i++) {
      const e = world.enemies.get(i);
      if (e.hp <= 0 || projectileHasHit(proj, e.uid)) continue;
      const dx = e.x - proj.x;
      const dz = e.z - proj.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) return false;
    const target = world.enemies.get(bestIdx);
    const dx = target.x - proj.x;
    const dz = target.z - proj.z;
    const d = Math.hypot(dx, dz) || 1;
    const speed = Math.hypot(proj.vx, proj.vz);
    proj.vx = (dx / d) * speed;
    proj.vz = (dz / d) * speed;
    proj.damage *= UV.ricochetDamageMult;
    proj.ricochetLeft--;
    proj.traveled = 0; // frische Reichweite fuer den Sprung
    return true;
  }

  /** Bumerang fliegt nach Treffern weiter; true = trotzdem verbraucht. */
  private consumeBoomerangHit(proj: Projectile): boolean {
    void proj;
    return false;
  }

  // ------------------------------------------- Gegner-Projektile

  private updateEnemyProjectiles(dt: number): void {
    const pool = this.world.enemyProjectiles;
    const p = this.world.player;

    for (let i = pool.count - 1; i >= 0; i--) {
      const proj = pool.get(i);
      proj.prevX = proj.x;
      proj.prevZ = proj.z;
      proj.x += proj.vx * dt;
      proj.z += proj.vz * dt;
      proj.traveled += Math.hypot(proj.vx, proj.vz) * dt;

      if (proj.traveled >= proj.range || Math.hypot(proj.x, proj.z) >= ARENA_RADIUS - 0.15) {
        pool.despawn(i);
        continue;
      }

      if (p.alive) {
        const rr = PLAYER.radius + proj.radius;
        if (segPointDist2(proj.prevX, proj.prevZ, proj.x, proj.z, p.x, p.z) < rr * rr) {
          const hit = p.takeDamage(proj.damage);
          if (hit) {
            pool.despawn(i);
            continue;
          }
        }
      }
    }
  }

  // ------------------------------------------- Kontakt-Schaden

  private updateContactDamage(): void {
    const p = this.world.player;
    if (!p.alive || p.hasIFrames) return;

    const found = this.world.spatialHash.queryCircle(p.x, p.z, 2.2, contactQueryBuf);
    for (let n = 0; n < found; n++) {
      const idx = contactQueryBuf[n] as number;
      if (idx >= this.world.enemies.count) continue;
      const e = this.world.enemies.get(idx);
      if (e.hp <= 0 || e.spawnProtection > 0) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const rr = e.radius + PLAYER.radius;
      if (dx * dx + dz * dz < rr * rr) {
        p.takeDamage(e.damage);
        return; // i-Frames aktiv — mehr Checks unnoetig
      }
    }

    const boss = this.world.boss;
    if (boss && boss.alive && !boss.hidden && boss.contactDamageNow > 0) {
      const dx = boss.x - p.x;
      const dz = boss.z - p.z;
      const rr = boss.def.radius + PLAYER.radius;
      if (dx * dx + dz * dz < rr * rr) {
        p.takeDamage(Math.round(boss.contactDamageNow * this.world.mods.enemyDamage));
        return;
      }
    }
    if (boss) {
      for (const m of boss.minis) {
        if (!m.active || m.hp <= 0) continue;
        const dx = m.x - p.x;
        const dz = m.z - p.z;
        const rr = m.radius + PLAYER.radius;
        if (dx * dx + dz * dz < rr * rr) {
          p.takeDamage(Math.round(15 * this.world.mods.enemyDamage));
          return;
        }
      }
    }
  }
}
