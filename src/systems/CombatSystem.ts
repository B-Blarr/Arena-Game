import { AIM, PLAYER, SURPRISE } from '../config/balance';
import {
  BOMBER_AI,
  ENEMY_BOMBER,
  ENEMY_SPLITTER,
  ENEMY_SPLITTER_CHILD,
  ENEMY_TANK,
  ENEMY_THIEF,
  SPLITTER,
  THIEF_AI,
  ELITE,
} from '../config/enemies';
import { UPGRADE_VALUES as UV } from '../config/upgrades';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { initProjectile } from '../entities/Projectile';
import type { InputState } from '../input/InputManager';
import type { PickupSystem } from './PickupSystem';

const orbQueryBuf: number[] = [];
const dashQueryBuf: number[] = [];
const holeQueryBuf: number[] = [];
/** Gegner stehen nur punktweise im Hash — Query um max. Gegnerradius (Tank 1.0) erweitern. */
const MAX_ENEMY_RADIUS = 1.0;

/**
 * Feuern (Auto-Aim/manuell), Schutz-Orbs, Dash-Klinge, Schadens- und
 * Kill-Verarbeitung inkl. Lebensraub, Frost, Nova-Ketten und Splitter-Kindern.
 * Dazu die legendaeren Effekte: Spiegelklon-Salve, Orbital-Laser,
 * Schwarzes-Loch-Dash und Ueberladung (damageBoost).
 * Koop: laeuft pro Spieler; Kills werden dem Verursacher (lastAttacker)
 * zugerechnet, damit Lifesteal/Nova/Crit beim Richtigen landen.
 * Gegner sterben nie sofort — sie werden markiert und am Step-Ende in
 * einem Sweep entfernt (stabile Pool-Indizes waehrend der Kollisionen).
 */
export class CombatSystem {
  constructor(
    private readonly world: World,
    private readonly events: EventBus,
    private readonly pickups: PickupSystem,
  ) {}

  update(dt: number, inputs: readonly InputState[]): void {
    const players = this.world.players;
    for (let i = 0; i < players.length; i++) {
      const p = players[i] as Player;
      // Geworfenes Schwarzes Loch tickt weiter, auch wenn der Werfer faellt
      this.updateBlackHole(p, dt);
      // NEU (mythisch "Phoenixkern"): Aufersteh-Schockwelle ausloesen (Poll-Muster
      // wie Schwarzes Loch). explode() bringt Schaden, Ring, Partikel, Sound + Shake mit.
      if (p.phoenixBlastPending) {
        p.phoenixBlastPending = false;
        this.explode(p.x, p.z, UV.phoenixBlastRadius, UV.phoenixBlastDamage, 0, 0xffc83d, true, p.index);
      }
      if (!p.targetable) continue;
      const input = inputs[i];
      if (input) this.updateFiring(p, input);
      this.updateOrbs(p, dt);
      this.updateDashBlade(p);
      this.updateOrbital(p, dt);
    }
    this.sweepDead();
  }

  // ---------------------------------------------------------- Feuern

  private updateFiring(p: Player, input: InputState): void {
    const stats = p.stats;

    let aimX = 0;
    let aimZ = 0;
    let haveTarget = false;
    let manual = false;

    if (!p.autoAim && input.hasManualAim) {
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

    // NEU (mythisch "Prisma-Salve"): ersetzt das normale Feuern durch extrem
    // schnelles Schiessen mit dicken, durchschlagenden, prismatischen Kugeln.
    // Feste Rate (fireRate-unabhaengig) -> nur der Schaden pro Kugel skaliert.
    if (stats.prismShotDamage > 0) {
      if (!haveTarget) return;
      p.faceX = aimX;
      p.faceZ = aimZ;
      if (p.fireCooldown > 0) return;
      p.fireCooldown = UV.prismShotInterval;
      this.firePrismShot(p, aimX, aimZ);
      // sustained: Renderer fuehrt das Muendungslicht als Dauergluehen (kein 20-Hz-Blinken)
      this.events.emit('shotFired', { x: p.x, z: p.z, dirX: aimX, dirZ: aimZ, playerIndex: p.index, sustained: true });
      return;
    }

    if (!haveTarget) return;

    // Figur schaut KONTINUIERLICH in die Zielrichtung (nicht nur im
    // Moment des Abdrueckens) — Blick und Schussrichtung stimmen sichtbar
    // ueberein. Laeuft nach Player.update, ueberschreibt also die
    // Laufrichtung; ohne Ziel bleibt der Blick in Laufrichtung.
    p.faceX = aimX;
    p.faceZ = aimZ;

    if (p.fireCooldown > 0) return;
    // "Turbofeuer!"-Kapselbuff: Cooldown verkuerzt
    const cooldownMult = p.rapidFireTimer > 0 ? SURPRISE.capsule.rapidFireCooldownMult : 1;
    p.fireCooldown = (1 / stats.fireRate) * cooldownMult;

    // Skill-Anreiz: manuelles Zielen gibt +10 % Schaden
    const damage = stats.damage * (manual ? AIM.manualDamageBonus : 1);
    this.fireSalvo(p, p.x, p.z, aimX, aimZ, damage);
    // Spiegelklon: Geist hinter dem Spieler feuert dieselbe Salve mit.
    // Ursprung in die Arena clampen — mit dem Ruecken zur Wand laege er
    // sonst hinter der Projektil-Despawn-Grenze und die Salve verpufft.
    if (stats.cloneDamageFrac > 0) {
      let cx = p.x - aimX * UV.mirrorCloneOffset;
      let cz = p.z - aimZ * UV.mirrorCloneOffset;
      const cd = Math.hypot(cx, cz);
      const maxR = p.arenaRadius - PLAYER.radius;
      if (cd > maxR) {
        cx = (cx / cd) * maxR;
        cz = (cz / cd) * maxR;
      }
      this.fireSalvo(p, cx, cz, aimX, aimZ, damage * stats.cloneDamageFrac);
    }
    this.events.emit('shotFired', { x: p.x, z: p.z, dirX: aimX, dirZ: aimZ, playerIndex: p.index });
  }

  /** Eine komplette Faecher-Salve ab (x, z) in Zielrichtung. */
  private fireSalvo(p: Player, x: number, z: number, aimX: number, aimZ: number, damage: number): void {
    const stats = p.stats;
    const count = stats.projectileCount;
    const baseAngle = Math.atan2(aimZ, aimX);
    for (let i = 0; i < count; i++) {
      const proj = this.world.playerProjectiles.spawn();
      if (!proj) break;
      const t = count > 1 ? i - (count - 1) / 2 : 0;
      const a = baseAngle + t * stats.spreadAngle;
      initProjectile(proj, x, z, Math.cos(a), Math.sin(a), stats.projectileSpeed, damage, stats.range);
      proj.radius = stats.projectileRadius;
      proj.pierceLeft = stats.pierce;
      proj.ricochetLeft = stats.ricochet;
      proj.knockback = stats.knockback;
      proj.boomerang = stats.boomerang;
      proj.ownerIdx = p.index;
    }
  }

  /** NEU (mythisch "Prisma-Salve"): eine dicke, durchschlagende, prismatische Kugel
   *  in Zielrichtung. Der Renderer faerbt sie regenbogenbunt (ueber proj.prism).
   *  Durchschlag (pierce) macht sie wie den alten Strahl zur Linien-Waffe. */
  private firePrismShot(p: Player, aimX: number, aimZ: number): void {
    const proj = this.world.playerProjectiles.spawn();
    if (!proj) return;
    initProjectile(proj, p.x, p.z, aimX, aimZ, UV.prismShotSpeed, p.stats.prismShotDamage, UV.prismShotRange);
    proj.radius = UV.prismShotRadius;
    proj.pierceLeft = UV.prismShotPierce;
    proj.ownerIdx = p.index;
    proj.prism = true;
  }

  // ---------------------------------------------------------- Orbs

  private updateOrbs(p: Player, dt: number): void {
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
          this.hitEnemy(e, stats.orbDamage, false, ox, oz, 4, true, p.index);
        }
      }
    }
  }

  // ---------------------------------------------------------- Dash-Klinge

  private updateDashBlade(p: Player): void {
    if (!p.isDashing || p.stats.dashDamage <= 0) return;
    // Token pro Spieler versetzt — sonst ueberspringt P2s Dash Gegner,
    // die P1s gleichnummerierter Dash schon markiert hat
    const token = p.dashId * 2 + p.index;
    const found = this.world.spatialHash.queryCircle(p.x, p.z, 1.3 + MAX_ENEMY_RADIUS, dashQueryBuf);
    for (let n = 0; n < found; n++) {
      const idx = dashQueryBuf[n] as number;
      if (idx >= this.world.enemies.count) continue;
      const e = this.world.enemies.get(idx);
      if (e.hp <= 0 || e.dashHitToken === token) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const rr = e.radius + 0.8;
      if (dx * dx + dz * dz < rr * rr) {
        e.dashHitToken = token;
        this.hitEnemy(e, p.stats.dashDamage, false, p.x, p.z, 8, true, p.index);
      }
    }
  }

  // ---------------------------------------------------------- Schwarzes Loch

  /**
   * Legendaer: Die am Dash-Ende geworfene Singularitaet (Player.blackHole*)
   * saugt Gegner per DIREKTEM Positions-Versatz auf einen Fangring — die
   * alte kv-Variante wurde von der Knockback-Daempfung aufgefressen und war
   * praktisch unsichtbar. Am Lebensende: Kollaps-Explosion.
   */
  private updateBlackHole(p: Player, dt: number): void {
    if (p.blackHoleTimer <= 0) return;
    p.blackHoleTimer -= dt;
    const hx = p.blackHoleX;
    const hz = p.blackHoleZ;

    if (p.blackHoleTimer <= 0) {
      // Kollaps-Crunch: komplette Explosions-Pipeline gratis (Ring, Partikel,
      // Sfx, Trauma, Nova-Synergie); Knockback wirft den Knaeuel wieder auf
      this.events.emit('blackHoleCollapsed', { x: hx, z: hz });
      this.explode(hx, hz, UV.blackHoleCrushRadius, UV.blackHoleCrushDamage, 1, 0x9b5cff, true, p.index);
      return;
    }

    const found = this.world.spatialHash.queryCircle(hx, hz, UV.blackHoleRadius + MAX_ENEMY_RADIUS, holeQueryBuf);
    for (let n = 0; n < found; n++) {
      const idx = holeQueryBuf[n] as number;
      if (idx >= this.world.enemies.count) continue;
      const e = this.world.enemies.get(idx);
      if (e.hp <= 0 || e.mass <= 0) continue; // Tank immun (wie Knockback)
      // Zuendender Bomber bleibt fest — Warn-Ring und Blast deckungsgleich
      // (der Positions-Versatz laeuft an der kv-Daempfung vorbei!)
      if (e.type === ENEMY_BOMBER && e.telegraphTimer > 0) continue;
      const dx = hx - e.x;
      const dz = hz - e.z;
      const d = Math.hypot(dx, dz);
      if (d <= UV.blackHoleCaptureRadius || d > UV.blackHoleRadius + e.radius) continue;
      // Nahe dem Zentrum gedaempft, Schrittweite hart durch Restdistanz
      // begrenzt -> stabiler Knaeuel am Fangring, kein Durchfliegen
      const frac = Math.min(Math.max(d / UV.blackHoleSlowRadius, UV.blackHoleMinPullFrac), 1);
      const step = Math.min(p.stats.blackHolePull * frac * dt, d - UV.blackHoleCaptureRadius);
      e.x += (dx / d) * step;
      e.z += (dz / d) * step;
    }
  }

  // ---------------------------------------------------------- Orbital-Laser

  /** Legendaer: alle 5 s ein Einschlag auf den Boss bzw. den zaehesten Gegner. */
  private updateOrbital(p: Player, dt: number): void {
    if (p.stats.orbitalDamage <= 0) return;
    if (p.orbitalTimer > 0) {
      p.orbitalTimer -= dt;
      return;
    }
    const damage = Math.round(p.stats.orbitalDamage * p.damageBoost);
    const boss = this.world.boss;
    if (boss && boss.alive && !boss.hidden) {
      boss.takeDamage(damage, this.events);
      this.events.emit('enemyHit', { x: boss.x, z: boss.z, damage, crit: false, enemyType: -1 });
      this.events.emit('orbitalStrike', { x: boss.x, z: boss.z });
      p.orbitalTimer = UV.orbitalLaserInterval;
      return;
    }
    let best: Enemy | null = null;
    const pool = this.world.enemies;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.get(i);
      if (e.hp <= 0) continue;
      if (!best || e.hp > best.hp) best = e;
    }
    // Kein Ziel (Wellenpause): Timer bleibt bei 0 — feuert sofort beim naechsten Gegner
    if (!best) return;
    this.hitEnemy(best, p.stats.orbitalDamage, false, best.x, best.z, 6, true, p.index);
    this.events.emit('orbitalStrike', { x: best.x, z: best.z });
    p.orbitalTimer = UV.orbitalLaserInterval;
  }

  // ---------------------------------------------------------- Schaden & Tod

  /**
   * Schaden auf einen Gegner anwenden (crit wird hier gerollt, wenn erlaubt).
   * fromPlayer=false (Bomber-Detonation): kein Overcharge-Boost und der
   * Elite-Schild bleibt intakt — er schuetzt nur vor SPIELER-Treffern.
   * attackerIdx: welcher Spieler verursacht (Crit/Boost/Kill-Zurechnung).
   */
  hitEnemy(
    e: Enemy,
    baseDamage: number,
    allowCrit: boolean,
    sourceX: number,
    sourceZ: number,
    knockback: number,
    fromPlayer = true,
    attackerIdx = 0,
  ): void {
    if (e.hp <= 0) return;
    const p = (this.world.players[attackerIdx] ?? this.world.players[0]) as Player;

    // Elite-Schild: erster Spieler-Treffer wird nullifiziert — egal ob
    // Projektil, Orb, Dash-Klinge oder Nova (EIN Codepfad fuer alle Quellen).
    if (fromPlayer && e.shieldHp > 0) {
      e.shieldHp = 0;
      e.flashTimer = 0.15;
      this.events.emit('eliteShieldBroken', { x: e.x, z: e.z });
      return;
    }

    if (fromPlayer) e.lastAttacker = p.index;
    const crit = allowCrit && Math.random() < p.stats.critChance;
    // damageBoost: Ueberladung (legendaer) unter 30 % HP, nur Spieler-Quellen
    const boost = fromPlayer ? p.damageBoost : 1;
    const damage = Math.round(baseDamage * (crit ? p.stats.critMultiplier : 1) * boost);
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
      // Entkommener Dieb: kein Kill — keine Combo, kein Loot, keine Nova
      if (!e.escaped) this.processKill(e);
      pool.despawn(i);
    }
  }

  private processKill(e: Enemy): void {
    // Kill gehoert dem letzten Verursacher (Solo immer Spieler 0)
    const p = (this.world.players[e.lastAttacker] ?? this.world.players[0]) as Player;
    const def = e.type;

    this.events.emit('enemyKilled', {
      x: e.x,
      z: e.z,
      enemyType: def,
      points: e.points,
      scale: (def === ENEMY_TANK ? 1.8 : 1) * (e.eliteAffix > 0 ? ELITE.visualScale : 1),
      elite: e.eliteAffix > 0,
    });

    if (p.stats.lifestealPerKill > 0) p.healFractional(p.stats.lifestealPerKill);
    this.pickups.dropFrom(e);

    // Splitter teilt sich in 2 Kinder (Kinder splitten NIE erneut);
    // Fluchtwinkel weg vom Verursacher
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

    // Bomber: Tod WAEHREND der Zuendung -> Detonation. Auf Distanz getoetet
    // (Zuendung nie gestartet) stirbt er harmlos — der Auto-Aim-Konter.
    // Koop: der Blast prueft ALLE angreifbaren Spieler.
    if (def === ENEMY_BOMBER && e.telegraphTimer > 0) {
      const rr = BOMBER_AI.blastRadius + PLAYER.radius;
      for (let i = 0; i < this.world.players.length; i++) {
        const victim = this.world.players[i] as Player;
        if (!victim.targetable) continue;
        const dx = victim.x - e.x;
        const dz = victim.z - e.z;
        if (dx * dx + dz * dz < rr * rr) victim.takeDamage(e.damage);
      }
      // depth 99: Bomber-Explosionen zaehlen nicht als Nova-Kette;
      // fromPlayer=false: kein Overcharge-Boost, bricht keine Elite-Schilde
      this.explode(e.x, e.z, BOMBER_AI.blastRadius, e.damage * BOMBER_AI.enemyDamageMult, 99, 0xff3b30, false);
    }

    // Kern-Dieb: Beute + 1 Bonus-Kern fallen zurueck
    if (def === ENEMY_THIEF && e.carriedCores > 0) {
      const total = e.carriedCores + THIEF_AI.bonusCoresOnKill;
      for (let c = 0; c < total; c++) {
        const a = (c / total) * Math.PI * 2;
        this.pickups.spawnCore(e.x + Math.cos(a) * 0.4, e.z + Math.sin(a) * 0.4);
      }
    }

    // Nova-Kill: Explosionskette mit begrenzter Tiefe
    const depth = e.novaDepth;
    if (p.stats.novaChance > 0 && depth < UV.novaChainDepth && Math.random() < p.stats.novaChance) {
      this.explode(e.x, e.z, UV.novaRadius, p.stats.novaDamage, depth + 1, 0xffc83d, true, p.index);
    }
  }

  /**
   * AoE-Schaden (Nova/Bomber). Getroffene sterben erst im naechsten Sweep.
   * Bewusst linear ueber den Pool statt ueber den Spatial Hash: explode()
   * laeuft aus processKill() MITTEN im sweepDead — swap-remove hat die
   * Hash-Indizes dann bereits invalidiert (lebende Gegner wuerden verfehlt).
   */
  explode(
    x: number,
    z: number,
    radius: number,
    damage: number,
    depth: number,
    color = 0xffc83d,
    fromPlayer = true,
    attackerIdx = 0,
  ): void {
    this.events.emit('explosion', { x, z, radius, color });
    const pool = this.world.enemies;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.get(i);
      if (e.hp <= 0) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      const rr = radius + e.radius;
      if (dx * dx + dz * dz < rr * rr) {
        this.hitEnemy(e, damage, false, x, z, 6, fromPlayer, attackerIdx);
        // Ketten-Tiefe nur bei TOTEN stempeln: Ueberlebende (Tank, Schild-
        // Elite) sollen bei ihrem spaeteren Tod normal Nova rollen koennen.
        if (e.hp <= 0 && e.novaDepth < depth) e.novaDepth = depth;
      }
    }
    const boss = this.world.boss;
    if (boss && boss.alive && !boss.hidden) {
      const dx = boss.x - x;
      const dz = boss.z - z;
      const rr = radius + boss.def.radius;
      if (dx * dx + dz * dz < rr * rr) {
        const attacker = (this.world.players[attackerIdx] ?? this.world.players[0]) as Player;
        const boost = fromPlayer ? attacker.damageBoost : 1;
        boss.takeDamage(Math.round(damage * boost), this.events);
      }
    }
  }
}
