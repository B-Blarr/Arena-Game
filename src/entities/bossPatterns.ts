import { ARENA_RADIUS, PLAYER } from '../config/balance';
import { ENEMY_BOMBER, ENEMY_SPLITTER, ENEMY_SWARM } from '../config/enemies';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import type { Boss } from './Boss';

/**
 * Boss-Muster. Alle Telegraphs sind sichtbar (Event -> FX) und lang genug,
 * dass auch ein 7-Jaehriger reagieren kann.
 */
export function updateBoss(boss: Boss, dt: number, world: World, events: EventBus): void {
  // FIX: Der Boss-Schaden faellt in collision/combat NACH diesem update; ein Boss,
  // dessen hp im Vorframe auf 0 geklemmt wurde, wuerde hier sonst noch ein volles
  // Muster fahren (letzte Salve) bzw. die Hydra wuerde bei hp=0 ueber eine Schwelle
  // noch verwaiste Minis spawnen. Tot = kein Muster mehr; RunState.handleBossDeath
  // uebernimmt den Tod im selben Frame. Waehrend der Hydra-Mini-Phase ist der Boss
  // 'hidden' und unverwundbar -> hp bleibt > 0, der Guard greift dort nie.
  if (boss.hp <= 0) return;
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
    case 'minos':
      updateMinos(boss, dt, world, events);
      break;
    case 'hydra':
      updateHydra(boss, dt, world, events);
      break;
    case 'vortex':
      updateVortex(boss, dt, world, events);
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

/** Verfolgt den jeweils NAECHSTEN angreifbaren Spieler (Solo: identisch). */
function moveTowardPlayer(boss: Boss, dt: number, world: World, speed: number): void {
  const target = world.nearestAlivePlayer(boss.x, boss.z);
  const dx = target.x - boss.x;
  const dz = target.z - boss.z;
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

/**
 * Gezielte Einzelschuesse in kurzen Abstaenden (PRISMA-Trio, MINOS-Funken,
 * WIRBEL-Doppelschuss). Nutzt trioTimer/trioShotsLeft/trioGapTimer.
 */
function updateTrioShots(boss: Boss, dt: number, world: World, events: EventBus): void {
  const def = boss.def;
  if (def.trioInterval === undefined) return;
  if (boss.trioShotsLeft > 0) {
    boss.trioGapTimer -= dt;
    if (boss.trioGapTimer <= 0) {
      boss.trioShotsLeft--;
      boss.trioGapTimer = def.trioShotGap ?? 0.3;
      // Ziel pro Schuss neu: im Koop wandert das Trio zwischen den Spielern
      const target = world.nearestAlivePlayer(boss.x, boss.z);
      const dx = target.x - boss.x;
      const dz = target.z - boss.z;
      const d = Math.hypot(dx, dz) || 1;
      world.spawnEnemyProjectile(
        boss.x, boss.z, dx / d, dz / d,
        (def.trioProjectileSpeed ?? 8) * boss.projSpeedMult,
        Math.round(boss.projectileDamage * 1.2), 40,
        true, // NEU: Boss-Projektil -> vom "Zeitbruch"-Slow ausgenommen
      );
      events.emit('enemyShot', { x: boss.x, z: boss.z });
    }
  } else {
    boss.trioTimer -= dt;
    if (boss.trioTimer <= 0) {
      boss.trioTimer = def.trioInterval * boss.cdMult;
      boss.trioShotsLeft = def.trioShots ?? 3;
      boss.trioGapTimer = def.trioTelegraph ?? 0.5;
      boss.telegraphGlow = def.trioTelegraph ?? 0.5;
    }
  }
}

/**
 * Expandierender Schockwellen-Ring: trifft JEDEN Spieler genau einmal an
 * der Ringkante (Bitmaske pro playerIndex), per Dash-i-Frames
 * ueberspringbar. Gibt true zurueck, solange aktiv.
 */
function tickShockRing(
  state: { r: number; hitMask: number },
  centerX: number, centerZ: number,
  maxRadius: number, ringSpeed: number, damage: number,
  dt: number, world: World,
): boolean {
  state.r += ringSpeed * dt;
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i];
    if (!p || !p.targetable || (state.hitMask & (1 << i)) !== 0) continue;
    const pd = Math.hypot(p.x - centerX, p.z - centerZ);
    if (Math.abs(pd - state.r) < 0.6) {
      state.hitMask |= 1 << i;
      p.takeDamage(damage);
    }
  }
  return state.r < maxRadius;
}

// Wiederverwendete Puffer fuer tickShockRing (allokationsfrei)
const shockBuf = { r: 0, hitMask: 0 };

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
      world.spawnEnemyProjectile(boss.x, boss.z, Math.cos(a), Math.sin(a), speed, boss.projectileDamage, 40, true);
    }
    events.emit('enemyShot', { x: boss.x, z: boss.z });
  }

  updateTrioShots(boss, dt, world, events);
}

// ---------------------------------------------------------------- GOLIATH

/** Truemmer-Faecher beim Wandaufprall: Steine fliegen zurueck in die Arena. */
function goliathStompRocks(boss: Boss, world: World, events: EventBus): void {
  const def = boss.def;
  const count = boss.phase2 ? (def.stompRockCountP2 ?? 5) : (def.stompRockCount ?? 3);
  const d = Math.hypot(boss.x, boss.z) || 1;
  // Richtung Arenamitte (dorthin, wo der Spieler dem Charge ausgewichen ist)
  const nx = -boss.x / d;
  const nz = -boss.z / d;
  fireFan(
    world, boss.x, boss.z, nx, nz,
    count, def.stompRockSpread ?? 1.75,
    (def.stompRockSpeed ?? 4.5) * world.mods.enemySpeed,
    boss.projectileDamage,
  );
  events.emit('enemyShot', { x: boss.x, z: boss.z });
}

function updateGoliath(boss: Boss, dt: number, world: World, events: EventBus): void {
  const def = boss.def;
  checkPhase2(boss, 0.4, events);

  switch (boss.state) {
    case 'chase': {
      moveTowardPlayer(boss, dt, world, boss.phase2 ? (def.speedP2 ?? def.speed) : def.speed);
      boss.contactDamageNow = def.contactDamage;
      boss.damageTakenMult = 1;

      // Aufladeangriff vorbereiten
      const chargeInterval = (boss.phase2 ? (def.chargeIntervalP2 ?? 5) : (def.chargeInterval ?? 7)) * boss.cdMult;
      boss.chargeTimer -= dt;
      if (boss.chargeTimer <= 0) {
        boss.chargeTimer = chargeInterval;
        boss.state = 'telegraph';
        boss.stateTimer = def.chargeTelegraph ?? 1.2;
        // Phase 2: ein Billard-Abpraller pro Charge
        boss.bouncesLeft = boss.phase2 ? (def.chargeBouncesP2 ?? 1) : 0;
        // Ziel: der zum Telegraph-Zeitpunkt naechste Spieler (lesbar, 1.2 s Vorwarnung)
        const target = world.nearestAlivePlayer(boss.x, boss.z);
        const dx = target.x - boss.x;
        const dz = target.z - boss.z;
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
        // Wandaufprall: immer Stomp + Truemmer-Steine
        events.emit('bossStomp', { x: boss.x, z: boss.z, radius: 3, speed: 14 });
        goliathStompRocks(boss, world, events);

        if (boss.bouncesLeft > 0) {
          // Phase 2: Billard-Abpraller — Richtung an der Wandnormalen
          // spiegeln, kurz telegrafieren, dann weiter (Stun erst am Ende)
          boss.bouncesLeft--;
          const d = Math.hypot(boss.x, boss.z) || 1;
          const nx = boss.x / d;
          const nz = boss.z / d;
          const dot = boss.chargeDirX * nx + boss.chargeDirZ * nz;
          boss.chargeDirX -= 2 * dot * nx;
          boss.chargeDirZ -= 2 * dot * nz;
          // leicht von der Wand loesen, sonst triggert der Aufprall sofort erneut
          boss.x = nx * (maxR - 0.3);
          boss.z = nz * (maxR - 0.3);
          boss.state = 'telegraph';
          boss.stateTimer = def.bounceTelegraph ?? 0.8;
          // waehrend des Bounce-Telegraphs kein Charge-Kontaktschaden
          boss.contactDamageNow = def.contactDamage;
          boss.telegraphGlow = boss.stateTimer;
          events.emit('bossTelegraph', {
            kind: 'charge', x: boss.x, z: boss.z,
            dirX: boss.chargeDirX, dirZ: boss.chargeDirZ,
            length: ARENA_RADIUS * 2, duration: boss.stateTimer,
          });
        } else {
          // Betaeubt + verwundbar: das Belohnungsfenster
          boss.state = 'stunned';
          boss.stateTimer = boss.phase2
            ? (def.chargeStunTimeP2 ?? def.chargeStunTime ?? 1.5)
            : (def.chargeStunTime ?? 1.5);
          boss.damageTakenMult = def.stunDamageTakenMult ?? 1.5;
          boss.contactDamageNow = 0;
        }
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
      boss.shockHitMask = 0;
      events.emit('bossStomp', {
        x: boss.shockX, z: boss.shockZ,
        radius: def.shockRadius ?? 6, speed: def.shockRingSpeed ?? 10,
      });
      // Phase 2: zweite Welle nach kurzer Pause (Einfach: laengere Pause).
      // Der Konter ist "raus aus dem Kreis" — der Dash ueberspringt bewusst
      // nur EINEN Ring (i-Frames 0.3 s decken den Abstand nie ab).
      if (boss.phase2) {
        boss.shock2Countdown = world.difficulty === 'easy'
          ? (def.shock2DelayEasy ?? 1.1)
          : (def.shock2Delay ?? 0.8);
      }
    }
  }

  const shockDamage = Math.round((def.shockDamage ?? 20) * world.mods.enemyDamage);

  // Expandierender Schockwellen-Ring (laeuft in jedem State weiter)
  if (boss.shockActive) {
    shockBuf.r = boss.shockR;
    shockBuf.hitMask = boss.shockHitMask;
    boss.shockActive = tickShockRing(
      shockBuf, boss.shockX, boss.shockZ,
      def.shockRadius ?? 6, def.shockRingSpeed ?? 10, shockDamage, dt, world,
    );
    boss.shockR = shockBuf.r;
    boss.shockHitMask = shockBuf.hitMask;
  }

  // Zweite Schockwelle (Phase 2)
  if (boss.shock2Countdown > 0) {
    boss.shock2Countdown -= dt;
    if (boss.shock2Countdown <= 0) {
      boss.shock2Active = true;
      boss.shock2R = 0;
      boss.shock2HitMask = 0;
      events.emit('bossStomp', {
        x: boss.shockX, z: boss.shockZ,
        radius: def.shockRadius ?? 6, speed: def.shockRingSpeed ?? 10,
      });
    }
  }
  if (boss.shock2Active) {
    shockBuf.r = boss.shock2R;
    shockBuf.hitMask = boss.shock2HitMask;
    boss.shock2Active = tickShockRing(
      shockBuf, boss.shockX, boss.shockZ,
      def.shockRadius ?? 6, def.shockRingSpeed ?? 10, shockDamage, dt, world,
    );
    boss.shock2R = shockBuf.r;
    boss.shock2HitMask = shockBuf.hitMask;
  }
}

// ---------------------------------------------------------------- MINOS

/** Legt eine Bombe (roter Warn-Ring + Ticken via enemyFuse-Event). */
function minosPlantBomb(boss: Boss, events: EventBus, x: number, z: number, fuse: number): void {
  const def = boss.def;
  // Hartes Limit: schuetzt den Ring-Pool der FX vor Verdraengung aktiver Warnringe
  let planted = 0;
  for (const b of boss.bombs) if (b.active) planted++;
  if (planted >= (def.maxBombs ?? 6)) return;
  const bomb = boss.bombs.find((b) => !b.active);
  if (!bomb) return;
  // In die Arena clampen (Teppich-Linien koennen ueber den Rand ragen)
  let bx = x;
  let bz = z;
  const d = Math.hypot(bx, bz);
  const maxR = ARENA_RADIUS - 1;
  if (d > maxR) {
    bx = (bx / d) * maxR;
    bz = (bz / d) * maxR;
  }
  bomb.active = true;
  bomb.x = bx;
  bomb.z = bz;
  bomb.fuseLeft = fuse;
  events.emit('enemyFuse', { x: bx, z: bz, radius: def.bombRadius ?? 3, duration: fuse });
}

function updateMinos(boss: Boss, dt: number, world: World, events: EventBus): void {
  const def = boss.def;
  checkPhase2(boss, 0.45, events);
  const player = world.nearestAlivePlayer(boss.x, boss.z);

  // Orbit-Movement: Abstand halten und um den naechsten Spieler tanzen
  const dx = player.x - boss.x;
  const dz = player.z - boss.z;
  const dist = Math.hypot(dx, dz) || 1;
  const nx = dx / dist;
  const nz = dz / dist;
  boss.strafeTimer -= dt;
  if (boss.strafeTimer <= 0) {
    boss.strafeTimer = def.strafeFlip ?? 6;
    boss.strafeSign *= -1;
  }
  if (dist > (def.orbitApproach ?? 8)) {
    boss.x += nx * def.speed * dt;
    boss.z += nz * def.speed * dt;
  } else if (dist < (def.orbitRetreat ?? 5)) {
    boss.x -= nx * def.speed * 0.85 * dt;
    boss.z -= nz * def.speed * 0.85 * dt;
  } else {
    const s = (def.strafeSpeed ?? 1.8) * boss.strafeSign;
    boss.x += -nz * s * dt;
    boss.z += nx * s * dt;
  }
  boss.contactDamageNow = def.contactDamage;

  // Bomben legen — Ziel alterniert im Koop deterministisch zwischen den
  // Spielern (bombTargetIdx, kein zusaetzlicher RNG-Zug)
  const fuseMult = world.difficulty === 'easy' ? 1.5 : 1;
  boss.plantTimer -= dt;
  if (boss.plantTimer <= 0) {
    const interval = (boss.phase2 ? (def.plantIntervalP2 ?? 4.5) : (def.plantInterval ?? 5.5)) * boss.cdMult;
    boss.plantTimer = interval;
    boss.telegraphGlow = 0.4;
    const fuse = (def.bombFuse ?? 2.5) * fuseMult;
    let bombTarget = world.players[boss.bombTargetIdx % world.players.length];
    if (!bombTarget || !bombTarget.targetable) bombTarget = player;
    boss.bombTargetIdx++;
    // Querachse: senkrecht zur Boss->Ziel-Linie
    const tdx = bombTarget.x - boss.x;
    const tdz = bombTarget.z - boss.z;
    const td = Math.hypot(tdx, tdz) || 1;
    const qx = -tdz / td;
    const qz = tdx / td;
    if (boss.phase2) {
      // Bomben-Teppich: 5er-Linie quer durch die Spielerposition, gestaffelt
      // gezuendet — das Domino zeigt die Fluchtrichtung (parallel zur Boss-Achse)
      const size = def.bombLineSizeP2 ?? 5;
      const spacing = def.bombLineSpacing ?? 3.5;
      const stagger = def.bombLineStagger ?? 0.2;
      for (let i = 0; i < size; i++) {
        const t = i - (size - 1) / 2;
        minosPlantBomb(
          boss, events,
          bombTarget.x + qx * t * spacing, bombTarget.z + qz * t * spacing,
          fuse + (i * stagger) * fuseMult,
        );
      }
    } else {
      // Cluster: eine auf den Spieler, zwei quer daneben (leichter Jitter)
      const spread = 4;
      minosPlantBomb(boss, events, bombTarget.x, bombTarget.z, fuse);
      for (const side of [-1, 1]) {
        const jx = (world.rngSummons.next() - 0.5) * 1.6;
        const jz = (world.rngSummons.next() - 0.5) * 1.6;
        minosPlantBomb(
          boss, events,
          bombTarget.x + qx * side * spread + jx, bombTarget.z + qz * side * spread + jz,
          fuse,
        );
      }
    }
  }

  // Bomben ticken + detonieren — jede Detonation prueft ALLE Spieler
  const bombRadius = def.bombRadius ?? 3;
  const bombDamage = Math.round(boss.projectileDamage * (def.bombDamageMult ?? 1.4));
  for (const b of boss.bombs) {
    if (!b.active) continue;
    b.fuseLeft -= dt;
    if (b.fuseLeft > 0) continue;
    b.active = false;
    events.emit('explosion', { x: b.x, z: b.z, radius: bombRadius, color: 0xff8c1a });
    for (let i = 0; i < world.players.length; i++) {
      const victim = world.players[i];
      if (!victim || !victim.targetable) continue;
      const pd = Math.hypot(victim.x - b.x, victim.z - b.z);
      if (pd < bombRadius + PLAYER.radius) victim.takeDamage(bombDamage);
    }
  }

  updateTrioShots(boss, dt, world, events);

  // Phase 2: der Minenkoenig ruft seine Zuender
  if (boss.phase2) {
    boss.summonTimer -= dt;
    if (boss.summonTimer <= 0) {
      boss.summonTimer = (def.summonIntervalP2 ?? 12) * boss.cdMult;
      summonAtEdge(world, ENEMY_BOMBER, 2, events);
    }
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
      // Koop: Mini i jagt Spieler i%n — das Team teilt sich die Mini-Phase
      const idx = boss.minis.indexOf(m) % world.players.length;
      const preferred = world.players[idx];
      const target = preferred?.targetable ? preferred : world.nearestAlivePlayer(m.x, m.z);
      const dx = target.x - m.x;
      const dz = target.z - m.z;
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
    const target = world.nearestAlivePlayer(boss.x, boss.z);
    const dx = target.x - boss.x;
    const dz = target.z - boss.z;
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

// ---------------------------------------------------------------- WIRBEL

function updateVortex(boss: Boss, dt: number, world: World, events: EventBus): void {
  const def = boss.def;
  checkPhase2(boss, 0.5, events);

  // Movement: beansprucht die Arena-Mitte (P2: jagt den Spieler)
  if (boss.phase2) {
    moveTowardPlayer(boss, dt, world, 2.2);
  } else {
    const d = Math.hypot(boss.x, boss.z);
    if (d > 1) {
      boss.x -= (boss.x / d) * def.speed * dt;
      boss.z -= (boss.z / d) * def.speed * dt;
    }
  }
  boss.contactDamageNow = def.contactDamage;
  // Waehrend des Sogs dreht der Strudel sichtbar schneller
  if (boss.suctionLeft > 0) boss.yRot += dt * 5;

  // Sog-Zyklus
  const telegraph = def.suctionTelegraph ?? 1.0;
  if (boss.suctionLeft <= 0) {
    boss.suctionTimer -= dt;
    if (boss.suctionTimer <= telegraph && !boss.suctionTelegraphed) {
      boss.suctionTelegraphed = true;
      boss.telegraphGlow = telegraph;
      events.emit('bossTelegraph', {
        kind: 'vortex', x: boss.x, z: boss.z,
        radius: boss.phase2 ? 16 : (def.suctionRange ?? 14), duration: telegraph,
      });
    }
    if (boss.suctionTimer <= 0) {
      boss.suctionTimer = ((boss.phase2 ? def.suctionIntervalP2 : def.suctionInterval) ?? 10) * boss.cdMult;
      boss.suctionTelegraphed = false;
      boss.suctionLeft = def.suctionDuration ?? 4.0;
      boss.spiralTimer = 0;
      boss.collapseTelegraphed = false;
    }
  } else {
    boss.suctionLeft -= dt;

    // Spieler-Pull: reine Positions-Spannung, macht selbst NULL Schaden.
    // Der Dash bricht den Sog immer (waehrenddessen kein Pull); Koop: der
    // Sog zieht ALLE angreifbaren Spieler (downed rutscht nicht mit).
    // Stoppgrenze MIT Marge ueber der Kontakt-Hitbox (radius + 0.5 = 2.2) und
    // geclampter Schritt — der Sog traegt den Spieler nie in den Kontaktschaden.
    const range = boss.phase2 ? (def.suctionRangeP2 ?? 99) : (def.suctionRange ?? 14);
    const pull = (boss.phase2 ? (def.suctionPullP2 ?? 3.2) : (def.suctionPull ?? 2.6)) * world.mods.enemySpeed;
    for (let i = 0; i < world.players.length; i++) {
      const player = world.players[i];
      if (!player || !player.targetable || player.isDashing) continue;
      const pdx = boss.x - player.x;
      const pdz = boss.z - player.z;
      const pd = Math.hypot(pdx, pdz);
      const stopR = boss.def.radius + 0.9;
      if (pd > stopR && pd <= range) {
        const step = Math.min(pull * dt, pd - stopR);
        player.x += (pdx / pd) * step;
        player.z += (pdz / pd) * step;
      }
    }

    // Spiral-Salven waehrend des Sogs (+ kontinuierliche Einwaerts-Ringe)
    boss.spiralTimer -= dt;
    if (boss.spiralTimer <= 0) {
      boss.spiralTimer = (boss.phase2 ? (def.spiralIntervalP2 ?? 0.7) : (def.spiralInterval ?? 0.8));
      const count = boss.phase2 ? (def.spiralCountP2 ?? 8) : (def.spiralCount ?? 6);
      boss.salvoAngle += 0.35;
      const speed = (def.spiralProjectileSpeed ?? 4.5) * boss.projSpeedMult;
      for (let i = 0; i < count; i++) {
        const a = boss.salvoAngle + (i / count) * Math.PI * 2;
        world.spawnEnemyProjectile(boss.x, boss.z, Math.cos(a), Math.sin(a), speed, boss.projectileDamage, 40, true);
      }
      events.emit('enemyShot', { x: boss.x, z: boss.z });
      // Wiederhol-Ring ist reine Kosmetik — bossTelegraph wuerde jedes Mal
      // den Gefahren-Warnton triggern ("Warnton = ausweichen" bliebe nicht lesbar)
      events.emit('vortexRing', {
        x: boss.x, z: boss.z,
        radius: boss.phase2 ? 16 : (def.suctionRange ?? 14), duration: 0.9,
      });
    }

    // Kollaps-Schockwelle am Sog-Ende (rot telegrafiert in den letzten 0.8 s)
    const collapseRadius = boss.phase2 ? (def.collapseRadiusP2 ?? 6) : (def.collapseRadius ?? 5);
    if (boss.suctionLeft <= 0.8 && !boss.collapseTelegraphed) {
      boss.collapseTelegraphed = true;
      boss.shockX = boss.x;
      boss.shockZ = boss.z;
      events.emit('bossTelegraph', {
        kind: 'shockwave', x: boss.shockX, z: boss.shockZ,
        radius: collapseRadius, duration: 0.8,
      });
    }
    if (boss.suctionLeft <= 0) {
      boss.shockActive = true;
      boss.shockR = 0;
      boss.shockHitMask = 0;
      events.emit('bossStomp', {
        x: boss.shockX, z: boss.shockZ,
        radius: collapseRadius, speed: def.collapseRingSpeed ?? 12,
      });
    }
  }

  // Kollaps-Ring (nutzt die generischen shock*-Felder)
  if (boss.shockActive) {
    const collapseRadius = boss.phase2 ? (def.collapseRadiusP2 ?? 6) : (def.collapseRadius ?? 5);
    shockBuf.r = boss.shockR;
    shockBuf.hitMask = boss.shockHitMask;
    boss.shockActive = tickShockRing(
      shockBuf, boss.shockX, boss.shockZ,
      collapseRadius, def.collapseRingSpeed ?? 12,
      Math.round(boss.projectileDamage * 1.2), dt, world,
    );
    boss.shockR = shockBuf.r;
    boss.shockHitMask = shockBuf.hitMask;
  }

  updateTrioShots(boss, dt, world, events);
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
    world.spawnEnemyProjectile(x, z, Math.cos(a), Math.sin(a), speed, damage, 40, true);
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
