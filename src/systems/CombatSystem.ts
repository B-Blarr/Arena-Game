import { AIM } from '../config/balance';
import { ENEMY_SPLITTER, ENEMY_SPLITTER_CHILD, SPLITTER } from '../config/enemies';
import { UPGRADE_VALUES as UV } from '../config/upgrades';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import type { Enemy } from '../entities/Enemy';
import { initProjectile } from '../entities/Projectile';
import type { InputState } from '../input/InputManager';
import type { PickupSystem } from './PickupSystem';

const orbQueryBuf: number[] = [];
const dashQueryBuf: number[] = [];
/** Gegner stehen nur punktweise im Hash — Query um max. Gegnerradius (Tank 1.0) erweitern. */
const MAX_ENEMY_RADIUS = 1.0;

/**
 * Feuern (Auto-Aim/manuell), Schutz-Orbs, Dash-Klinge, Schadens- und
 * Kill-Verarbeitung inkl. Lebensraub, Frost, Nova-Ketten und Splitter-Kindern.
 * Gegner sterben nie sofort — sie werden markiert und am Step-Ende in
 * einem Sweep entfernt (stabile Pool-Indizes waehrend der Kollisionen).
 */
export class CombatSystem {
  /** Aus den Settings: Auto-Aim an/aus. */
  autoAimEnabled = true;

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
    private readonly pickups: PickupSystem,
  ) {}

  update(dt: number, input: InputState): void {
    const p = this.world.player;
    if (!p.alive) return;

    this.updateFiring(input);
    this.updateOrbs(dt);
    this.updateDashBlade();
    this.sweepDead();
  }

  // ---------------------------------------------------------- Feuern

  private updateFiring(input: InputState): void {
    const p = this.world.player;
    const stats = p.stats;

    let aimX = 0;
    let aimZ = 0;
    let haveTarget = false;
    let manual = false;

    if (!this.autoAimEnabled && input.hasManualAim) {
      aimX = input.aimDirX;
      aimZ = input.aimDirZ;
      haveTarget = true;
      manual = true;
    } else {
      // Naechstes Ziel (Gegner, Boss, Minis) im Auto-Aim-Radius
      let bestD2 = AIM.autoRange * AIM.autoRange;
      const pool = this.world.enemies;
      for (let i = 0; i < pool.count; i++) {
        const e = pool.get(i);
        if (e.hp <= 0) continue;
        const dx = e.x - p.x;
        const dz = e.z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          aimX = dx;
          aimZ = dz;
          haveTarget = true;
        }
      }
      const boss = this.world.boss;
      if (boss && boss.alive && !boss.hidden) {
        const dx = boss.x - p.x;
        const dz = boss.z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          aimX = dx;
          aimZ = dz;
          haveTarget = true;
        }
      }
      if (boss) {
        for (const m of boss.minis) {
          if (!m.active || m.hp <= 0) continue;
          const dx = m.x - p.x;
          const dz = m.z - p.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) {
            bestD2 = d2;
            aimX = dx;
            aimZ = dz;
            haveTarget = true;
          }
        }
      }
      if (haveTarget) {
        const len = Math.hypot(aimX, aimZ) || 1;
        aimX /= len;
        aimZ /= len;
      }
    }

    if (!haveTarget) return;

    // Figur schaut KONTINUIERLICH in die Zielrichtung (nicht nur im
    // Moment des Abdrueckens) — Blick und Schussrichtung stimmen sichtbar
    // ueberein. Laeuft nach Player.update, ueberschreibt also die
    // Laufrichtung; ohne Ziel bleibt der Blick in Laufrichtung.
    p.faceX = aimX;
    p.faceZ = aimZ;

    if (p.fireCooldown > 0) return;
    p.fireCooldown = 1 / stats.fireRate;

    // Skill-Anreiz: manuelles Zielen gibt +10 % Schaden
    const damage = stats.damage * (manual ? AIM.manualDamageBonus : 1);
    const count = stats.projectileCount;
    const baseAngle = Math.atan2(aimZ, aimX);
    for (let i = 0; i < count; i++) {
      const proj = this.world.playerProjectiles.spawn();
      if (!proj) break;
      const t = count > 1 ? i - (count - 1) / 2 : 0;
      const a = baseAngle + t * stats.spreadAngle;
      initProjectile(proj, p.x, p.z, Math.cos(a), Math.sin(a), stats.projectileSpeed, damage, stats.range);
      proj.pierceLeft = stats.pierce;
      proj.ricochetLeft = stats.ricochet;
      proj.knockback = stats.knockback;
      proj.boomerang = stats.boomerang;
    }
    this.events.emit('shotFired', { x: p.x, z: p.z, dirX: aimX, dirZ: aimZ });
  }

  // ---------------------------------------------------------- Orbs

  private updateOrbs(dt: number): void {
    const p = this.world.player;
    const stats = p.stats;
    if (stats.orbCount <= 0) return;
    void dt;

    for (let k = 0; k < stats.orbCount; k++) {
      const angle = p.orbAngle + (k / stats.orbCount) * Math.PI * 2;
      const ox = p.x + Math.cos(angle) * UV.orbRadius;
      const oz = p.z + Math.sin(angle) * UV.orbRadius;
      const found = this.world.spatialHash.queryCircle(ox, oz, 0.9 + MAX_ENEMY_RADIUS, orbQueryBuf);
      for (let n = 0; n < found; n++) {
        const idx = orbQueryBuf[n] as number;
        if (idx >= this.world.enemies.count) continue;
        const e = this.world.enemies.get(idx);
        if (e.hp <= 0 || e.orbCooldown > 0) continue;
        const dx = e.x - ox;
        const dz = e.z - oz;
        if (dx * dx + dz * dz < (0.35 + e.radius) * (0.35 + e.radius)) {
          e.orbCooldown = UV.orbHitCooldown;
          this.hitEnemy(e, stats.orbDamage, false, ox, oz, 4);
        }
      }
    }
  }

  // ---------------------------------------------------------- Dash-Klinge

  private updateDashBlade(): void {
    const p = this.world.player;
    if (!p.isDashing || p.stats.dashDamage <= 0) return;
    const found = this.world.spatialHash.queryCircle(p.x, p.z, 1.3 + MAX_ENEMY_RADIUS, dashQueryBuf);
    for (let n = 0; n < found; n++) {
      const idx = dashQueryBuf[n] as number;
      if (idx >= this.world.enemies.count) continue;
      const e = this.world.enemies.get(idx);
      if (e.hp <= 0 || e.dashHitToken === p.dashId) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const rr = e.radius + 0.8;
      if (dx * dx + dz * dz < rr * rr) {
        e.dashHitToken = p.dashId;
        this.hitEnemy(e, p.stats.dashDamage, false, p.x, p.z, 8);
      }
    }
  }

  // ---------------------------------------------------------- Schaden & Tod

  /** Schaden auf einen Gegner anwenden (crit wird hier gerollt, wenn erlaubt). */
  hitEnemy(
    e: Enemy,
    baseDamage: number,
    allowCrit: boolean,
    sourceX: number,
    sourceZ: number,
    knockback: number,
  ): void {
    if (e.hp <= 0) return;
    const p = this.world.player;
    const crit = allowCrit && Math.random() < p.stats.critChance;
    const damage = Math.round(baseDamage * (crit ? p.stats.critMultiplier : 1));
    e.hp -= damage;
    e.flashTimer = 0.08;
    e.scalePop = 0.22;

    if (e.mass > 0 && knockback > 0) {
      const dx = e.x - sourceX;
      const dz = e.z - sourceZ;
      const d = Math.hypot(dx, dz) || 1;
      const kb = knockback * e.mass;
      e.kvx += (dx / d) * kb;
      e.kvz += (dz / d) * kb;
      const kLen = Math.hypot(e.kvx, e.kvz);
      if (kLen > 10) {
        e.kvx = (e.kvx / kLen) * 10;
        e.kvz = (e.kvz / kLen) * 10;
      }
    }

    // Frost
    if (p.stats.frostSlow > 0 && allowCrit) {
      e.slowFactor = 1 - p.stats.frostSlow;
      e.slowTimer = p.stats.frostDuration;
    }

    this.events.emit('enemyHit', { x: e.x, z: e.z, damage, crit, enemyType: e.type });
  }

  /**
   * Tote Gegner am Step-Ende entfernen (rueckwaerts wegen swap-remove).
   * Kill-Verarbeitung: Punkte-Event, Lebensraub, Drops, Splitter-Kinder, Nova.
   */
  sweepDead(): void {
    const pool = this.world.enemies;
    for (let i = pool.count - 1; i >= 0; i--) {
      const e = pool.get(i);
      if (e.hp > 0) continue;
      this.processKill(e);
      pool.despawn(i);
    }
  }

  private processKill(e: Enemy): void {
    const p = this.world.player;
    const def = e.type;

    this.events.emit('enemyKilled', {
      x: e.x, z: e.z, enemyType: def, points: e.points,
      scale: def === 3 ? 1.8 : 1,
    });

    if (p.stats.lifestealPerKill > 0) p.heal(p.stats.lifestealPerKill);
    this.pickups.dropFrom(e);

    // Splitter teilt sich in 2 Kinder (Kinder splitten NIE erneut)
    if (def === ENEMY_SPLITTER) {
      const scaling = this.world.scalingForWave(this.world.wave);
      const baseAngle = Math.atan2(e.z - p.z, e.x - p.x);
      for (let c = 0; c < SPLITTER.childCount; c++) {
        const a = baseAngle + (c === 0 ? SPLITTER.childAngle : -SPLITTER.childAngle);
        const child = this.world.spawnEnemy(
          ENEMY_SPLITTER_CHILD,
          e.x + Math.cos(a) * 0.5,
          e.z + Math.sin(a) * 0.5,
          scaling,
        );
        if (child) child.spawnProtection = SPLITTER.childSpawnProtection;
      }
    }

    // Nova-Kill: Explosionskette mit begrenzter Tiefe
    const depth = e.novaDepth;
    if (p.stats.novaChance > 0 && depth < UV.novaChainDepth && Math.random() < p.stats.novaChance) {
      this.explode(e.x, e.z, UV.novaRadius, p.stats.novaDamage, depth + 1);
    }
  }

  /**
   * AoE-Schaden (Nova). Getroffene sterben erst im naechsten Sweep.
   * Bewusst linear ueber den Pool statt ueber den Spatial Hash: explode()
   * laeuft aus processKill() MITTEN im sweepDead — swap-remove hat die
   * Hash-Indizes dann bereits invalidiert (lebende Gegner wuerden verfehlt).
   */
  explode(x: number, z: number, radius: number, damage: number, depth: number): void {
    this.events.emit('explosion', { x, z, radius, color: 0xffc83d });
    const pool = this.world.enemies;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.get(i);
      if (e.hp <= 0) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      const rr = radius + e.radius;
      if (dx * dx + dz * dz < rr * rr) {
        if (e.novaDepth < depth) e.novaDepth = depth;
        this.hitEnemy(e, damage, false, x, z, 6);
      }
    }
    const boss = this.world.boss;
    if (boss && boss.alive && !boss.hidden) {
      const dx = boss.x - x;
      const dz = boss.z - z;
      const rr = radius + boss.def.radius;
      if (dx * dx + dz * dz < rr * rr) boss.takeDamage(damage, this.events);
    }
  }
}
