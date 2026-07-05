import { ARENA_RADIUS } from '../config/balance';
import { ENEMY_SPLITTER, ENEMY_SWARM } from '../config/enemies';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import type { Boss } from './Boss';

/**
 * Boss-Muster. Alle Telegraphs sind sichtbar (Event -> FX) und lang genug,
 * dass auch ein 7-Jaehriger reagieren kann.
 */
export function updateBoss(boss: Boss, dt: number, world: World, events: EventBus): void {
  boss.prevX = boss.x;
  boss.prevZ = boss.z;
  if (boss.flashTimer > 0) boss.flashTimer -= dt;
  if (boss.scalePop > 0) boss.scalePop = Math.max(0, boss.scalePop - dt * 4);
  if (boss.telegraphGlow > 0) boss.telegraphGlow -= dt;
  boss.yRot += dt * 0.8;

  switch (boss.def.id) {
    case 'prisma':
      updatePrisma(boss, dt, world, events);
      break;
    case 'goliath':
      updateGoliath(boss, dt, world, events);
      break;
    case 'hydra':
      updateHydra(boss, dt, world, events);
      break;
  }

  clampToArena(boss);
}

function clampToArena(boss: Boss): void {
  const maxR = ARENA_RADIUS - boss.def.radius;
  const d = Math.hypot(boss.x, boss.z);
  if (d > maxR) {
    boss.x = (boss.x / d) * maxR;
    boss.z = (boss.z / d) * maxR;
  }
}

function moveTowardPlayer(boss: Boss, dt: number, world: World, speed: number): void {
  const dx = world.player.x - boss.x;
  const dz = world.player.z - boss.z;
  const d = Math.hypot(dx, dz);
  if (d > boss.def.radius + 1) {
    boss.x += (dx / d) * speed * dt;
    boss.z += (dz / d) * speed * dt;
  }
}

function checkPhase2(boss: Boss, threshold: number, events: EventBus): void {
  if (!boss.phase2 && boss.hp <= boss.maxHp * threshold) {
    boss.phase2 = true;
    boss.scalePop = 0.3;
    events.emit('bossPhase', { phase: 2 });
  }
}

// ---------------------------------------------------------------- PRISMA

function updatePrisma(boss: Boss, dt: number, world: World, events: EventBus): void {
  const def = boss.def;
  checkPhase2(boss, 0.5, events);
  moveTowardPlayer(boss, dt, world, def.speed);

  // Kreis-Salve
  const salvoInterval = (boss.phase2 ? (def.salvoIntervalP2 ?? 3) : (def.salvoInterval ?? 4)) * boss.cdMult;
  const telegraph = def.salvoTelegraph ?? 0.8;
  boss.salvoTimer -= dt;
  if (boss.salvoTimer <= telegraph && !boss.salvoTelegraphed) {
    boss.salvoTelegraphed = true;
    boss.telegraphGlow = telegraph;
    events.emit('bossTelegraph', { kind: 'salvo', x: boss.x, z: boss.z, duration: telegraph });
  }
  if (boss.salvoTimer <= 0) {
    boss.salvoTimer = salvoInterval;
    boss.salvoTelegraphed = false;
    const count = boss.phase2 ? (def.salvoCountP2 ?? 16) : (def.salvoCount ?? 12);
    if (boss.phase2) boss.salvoAngle += def.salvoRotationStep ?? 0.19;
    const speed = (def.salvoProjectileSpeed ?? 6) * boss.projSpeedMult;
    for (let i = 0; i < count; i++) {
      const a = boss.salvoAngle + (i / count) * Math.PI * 2;
      world.spawnEnemyProjectile(boss.x, boss.z, Math.cos(a), Math.sin(a), speed, boss.projectileDamage, 40);
    }
    events.emit('enemyShot', { x: boss.x, z: boss.z });
  }

  // Ziel-Trio: 3 gezielte Schuesse in kurzen Abstaenden
  if (boss.trioShotsLeft > 0) {
    boss.trioGapTimer -= dt;
    if (boss.trioGapTimer <= 0) {
      boss.trioShotsLeft--;
      boss.trioGapTimer = def.trioShotGap ?? 0.3;
      const dx = world.player.x - boss.x;
      const dz = world.player.z - boss.z;
      const d = Math.hypot(dx, dz) || 1;
      world.spawnEnemyProjectile(
        boss.x, boss.z, dx / d, dz / d,
        (def.trioProjectileSpeed ?? 8) * boss.projSpeedMult,
        Math.round(boss.projectileDamage * 1.2), 40,
      );
      events.emit('enemyShot', { x: boss.x, z: boss.z });
    }
  } else {
    boss.trioTimer -= dt;
    if (boss.trioTimer <= 0) {
      boss.trioTimer = (def.trioInterval ?? 6) * boss.cdMult;
      boss.trioShotsLeft = 3;
      boss.trioGapTimer = def.trioTelegraph ?? 0.5;
      boss.telegraphGlow = def.trioTelegraph ?? 0.5;
    }
  }
}

// ---------------------------------------------------------------- GOLIATH

function updateGoliath(boss: Boss, dt: number, world: World, events: EventBus): void {
  const def = boss.def;
  checkPhase2(boss, 0.4, events);

  switch (boss.state) {
    case 'chase': {
      moveTowardPlayer(boss, dt, world, def.speed);
      boss.contactDamageNow = def.contactDamage;
      boss.damageTakenMult = 1;

      // Aufladeangriff vorbereiten
      const chargeInterval = (boss.phase2 ? (def.chargeIntervalP2 ?? 5) : (def.chargeInterval ?? 7)) * boss.cdMult;
      boss.chargeTimer -= dt;
      if (boss.chargeTimer <= 0) {
        boss.chargeTimer = chargeInterval;
        boss.state = 'telegraph';
        boss.stateTimer = def.chargeTelegraph ?? 1.2;
        const dx = world.player.x - boss.x;
        const dz = world.player.z - boss.z;
        const d = Math.hypot(dx, dz) || 1;
        boss.chargeDirX = dx / d;
        boss.chargeDirZ = dz / d;
        boss.telegraphGlow = boss.stateTimer;
        events.emit('bossTelegraph', {
          kind: 'charge', x: boss.x, z: boss.z,
          dirX: boss.chargeDirX, dirZ: boss.chargeDirZ,
          length: ARENA_RADIUS * 2, duration: boss.stateTimer,
        });
        break;
      }

      // Schockwelle ankuendigen (Countdown laeuft unten ausserhalb des switch,
      // damit ein dazwischen startender Charge ihn nicht kapert)
      boss.shockTimer -= dt;
      if (boss.shockTimer <= 0 && !boss.shockActive && boss.shockTelegraphLeft <= 0) {
        boss.shockTimer = (def.shockInterval ?? 9) * boss.cdMult;
        boss.shockX = boss.x;
        boss.shockZ = boss.z;
        boss.shockTelegraphLeft = def.shockTelegraph ?? 1.0;
        boss.telegraphGlow = boss.shockTelegraphLeft;
        events.emit('bossTelegraph', {
          kind: 'shockwave', x: boss.shockX, z: boss.shockZ,
          radius: def.shockRadius ?? 6, duration: def.shockTelegraph ?? 1.0,
        });
      }

      // Phase 2: Schwaerme rufen
      if (boss.phase2) {
        boss.summonTimer -= dt;
        if (boss.summonTimer <= 0) {
          boss.summonTimer = (def.summonIntervalP2 ?? 8) * boss.cdMult;
          summonAtEdge(world, ENEMY_SWARM, 6, events);
        }
      }
      break;
    }

    case 'telegraph': {
      boss.stateTimer -= dt;
      if (boss.stateTimer <= 0) {
        boss.state = 'charging';
        boss.contactDamageNow = def.chargeDamage ?? 30;
      }
      break;
    }

    case 'charging': {
      const speed = def.chargeSpeed ?? 14;
      boss.x += boss.chargeDirX * speed * dt;
      boss.z += boss.chargeDirZ * speed * dt;
      const maxR = ARENA_RADIUS - boss.def.radius;
      if (Math.hypot(boss.x, boss.z) >= maxR - 0.05) {
        // Wand getroffen: betaeubt + verwundbar
        boss.state = 'stunned';
        boss.stateTimer = def.chargeStunTime ?? 1.5;
        boss.damageTakenMult = def.stunDamageTakenMult ?? 1.5;
        boss.contactDamageNow = 0;
        events.emit('bossStomp', { x: boss.x, z: boss.z, radius: 3, speed: 14 });
      }
      break;
    }

    case 'stunned': {
      boss.stateTimer -= dt;
      if (boss.stateTimer <= 0) {
        boss.state = 'chase';
        boss.damageTakenMult = 1;
        boss.contactDamageNow = def.contactDamage;
      }
      break;
    }
  }

  // Schock-Telegraph-Countdown (eigenes Feld, laeuft in jedem State weiter)
  if (boss.shockTelegraphLeft > 0) {
    boss.shockTelegraphLeft -= dt;
    if (boss.shockTelegraphLeft <= 0) {
      boss.shockActive = true;
      boss.shockR = 0;
      boss.shockHitDone = false;
      events.emit('bossStomp', {
        x: boss.shockX, z: boss.shockZ,
        radius: def.shockRadius ?? 6, speed: def.shockRingSpeed ?? 10,
      });
    }
  }

  // Expandierender Schockwellen-Ring (laeuft in jedem State weiter)
  if (boss.shockActive) {
    boss.shockR += (def.shockRingSpeed ?? 10) * dt;
    const player = world.player;
    const pd = Math.hypot(player.x - boss.shockX, player.z - boss.shockZ);
    if (!boss.shockHitDone && Math.abs(pd - boss.shockR) < 0.6) {
      boss.shockHitDone = true;
      // Per Dash-i-Frames ueberspringbar — lehrt Dash-Timing
      player.takeDamage(Math.round((def.shockDamage ?? 20) * world.mods.enemyDamage));
    }
    if (boss.shockR >= (def.shockRadius ?? 6)) boss.shockActive = false;
  }
}

// ---------------------------------------------------------------- HYDRA

function updateHydra(boss: Boss, dt: number, world: World, events: EventBus): void {
  const def = boss.def;

  // Mini-Phase: Boss ist versteckt, zwei Mini-Kerne kaempfen
  if (boss.hidden) {
    let anyAlive = false;
    for (const m of boss.minis) {
      if (!m.active) continue;
      anyAlive = true;
      m.prevX = m.x;
      m.prevZ = m.z;
      if (m.flashTimer > 0) m.flashTimer -= dt;
      if (m.scalePop > 0) m.scalePop = Math.max(0, m.scalePop - dt * 6);
      const dx = world.player.x - m.x;
      const dz = world.player.z - m.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 3) {
        m.x += (dx / d) * (def.miniSpeed ?? 3.2) * dt;
        m.z += (dz / d) * (def.miniSpeed ?? 3.2) * dt;
      }
      const maxR = ARENA_RADIUS - m.radius;
      const md = Math.hypot(m.x, m.z);
      if (md > maxR) {
        m.x = (m.x / md) * maxR;
        m.z = (m.z / md) * maxR;
      }
      m.fireTimer -= dt;
      if (m.fireTimer <= 0) {
        m.fireTimer = (def.miniFanInterval ?? 4.5) * boss.cdMult;
        fireFan(world, m.x, m.z, dx / d, dz / d, 3, (def.fanAngle ?? 0.7) * 0.7,
          (def.fanProjectileSpeed ?? 7) * boss.projSpeedMult, Math.round(boss.projectileDamage * 0.8));
        events.emit('enemyShot', { x: m.x, z: m.z });
      }
    }
    if (!anyAlive) {
      // Phase vorbei: Boss kehrt zurueck
      boss.hidden = false;
      boss.x = 0;
      boss.z = 0;
      boss.prevX = 0;
      boss.prevZ = 0;
      boss.scalePop = 0.4;
      events.emit('bossPhase', { phase: 2 + boss.splitIndex });
    }
    return;
  }

  moveTowardPlayer(boss, dt, world, def.speed);

  // Teilung bei 60 % / 30 %
  const thresholds = def.splitThresholds ?? [];
  if (boss.splitIndex < thresholds.length && boss.hp <= boss.maxHp * (thresholds[boss.splitIndex] as number)) {
    boss.splitIndex++;
    boss.hidden = true;
    events.emit('explosion', { x: boss.x, z: boss.z, radius: 2.5, color: boss.def.color });
    for (let i = 0; i < boss.minis.length; i++) {
      const m = boss.minis[i] as typeof boss.minis[number];
      m.active = true;
      m.maxHp = Math.max(1, Math.round(boss.hp * (def.miniHpFrac ?? 0.25)));
      m.hp = m.maxHp;
      const side = i === 0 ? 1 : -1;
      m.x = boss.x + side * 3;
      m.z = boss.z + side * 1.5;
      m.prevX = m.x;
      m.prevZ = m.z;
      m.fireTimer = 1.5 + i;
      m.flashTimer = 0;
      m.scalePop = 0.3;
    }
    return;
  }

  // Faecher-Schuss
  const telegraph = def.fanTelegraph ?? 0.6;
  boss.fanTimer -= dt;
  if (boss.fanTimer <= telegraph && !boss.fanTelegraphed) {
    boss.fanTelegraphed = true;
    boss.telegraphGlow = telegraph;
  }
  if (boss.fanTimer <= 0) {
    boss.fanTimer = (def.fanInterval ?? 3.5) * boss.cdMult;
    boss.fanTelegraphed = false;
    const dx = world.player.x - boss.x;
    const dz = world.player.z - boss.z;
    const d = Math.hypot(dx, dz) || 1;
    fireFan(world, boss.x, boss.z, dx / d, dz / d, def.fanCount ?? 5, def.fanAngle ?? 0.7,
      (def.fanProjectileSpeed ?? 7) * boss.projSpeedMult, boss.projectileDamage);
    events.emit('enemyShot', { x: boss.x, z: boss.z });
  }

  // Splitter rufen
  boss.callTimer -= dt;
  if (boss.callTimer <= 0) {
    boss.callTimer = (def.callInterval ?? 10) * boss.cdMult;
    summonAtEdge(world, ENEMY_SPLITTER, 2, events);
  }
}

// ---------------------------------------------------------------- Helfer

function fireFan(
  world: World,
  x: number, z: number,
  dirX: number, dirZ: number,
  count: number, totalAngle: number, speed: number, damage: number,
): void {
  const baseAngle = Math.atan2(dirZ, dirX);
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) - 0.5 : 0;
    const a = baseAngle + t * totalAngle;
    world.spawnEnemyProjectile(x, z, Math.cos(a), Math.sin(a), speed, damage, 40);
  }
}

function summonAtEdge(world: World, type: number, count: number, events: EventBus): void {
  const scaling = world.scalingForWave(world.wave);
  for (let i = 0; i < count; i++) {
    // rngSummons, NICHT rngWaves: Beschwoerungs-Anzahl haengt vom Spieler ab
    // und wuerde sonst den deterministischen Wellen-Plan des Daily Seeds verschieben
    const a = world.rngSummons.next() * Math.PI * 2;
    const r = ARENA_RADIUS - 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const e = world.spawnEnemy(type, x, z, scaling);
    if (e) {
      e.spawnProtection = 0.5;
      events.emit('portalOpened', { x, z });
    }
  }
}
