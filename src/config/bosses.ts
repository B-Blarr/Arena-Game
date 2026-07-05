import type { EnemyShape } from './enemies';

/**
 * Boss-Definitionen. Alle Telegraphs >= 0.8 s Reaktionsfenster
 * (sichtbar + Warnton), damit auch Kinder ausweichen lernen.
 * Rotation: W5 PRISMA, W10 GOLIATH, W15 MINOS, W20 HYDRA-KERN, W25 WIRBEL;
 * ab W30 "+"-Varianten (Cooldowns kuerzer, Projektile schneller).
 */

export interface BossDef {
  id: string;
  color: number;
  shape: EnemyShape;
  radius: number;
  scale: number;
  speed: number;
  contactDamage: number;

  // PRISMA: Kreis-Salve + Ziel-Trio (Trio wird auch von MINOS/WIRBEL genutzt)
  salvoInterval?: number;
  salvoCount?: number;
  salvoTelegraph?: number;
  salvoProjectileSpeed?: number;
  trioInterval?: number;
  trioTelegraph?: number;
  trioShotGap?: number;
  trioProjectileSpeed?: number;
  /** Anzahl Schuesse pro Trio-Zyklus (PRISMA 3, WIRBEL 2). */
  trioShots?: number;
  /** Phase 2 (<50 %): dichtere, rotierende Salven. */
  salvoCountP2?: number;
  salvoIntervalP2?: number;
  salvoRotationStep?: number;

  // GOLIATH: Aufladeangriff + Schockwelle + Beschwoerung
  chargeInterval?: number;
  chargeTelegraph?: number;
  chargeSpeed?: number;
  chargeDamage?: number;
  chargeStunTime?: number;
  chargeStunTimeP2?: number;
  /** Betaeubt an der Wand: erlittener Schaden vervielfacht (Belohnungsfenster). */
  stunDamageTakenMult?: number;
  shockInterval?: number;
  shockTelegraph?: number;
  shockRadius?: number;
  shockDamage?: number;
  shockRingSpeed?: number;
  summonIntervalP2?: number;
  chargeIntervalP2?: number;
  /** v2: Truemmer-Steine bei jedem Wandaufprall (Faecher Richtung Mitte). */
  stompRockCount?: number;
  stompRockCountP2?: number;
  stompRockSpeed?: number;
  stompRockSpread?: number;
  /** v2 Phase 2: Charge prallt 1x von der Wand ab (Billard, telegrafiert). */
  chargeBouncesP2?: number;
  bounceTelegraph?: number;
  /** v2 Phase 2: zweite Schockwelle nach dieser Verzoegerung (Einfach: laenger). */
  shock2Delay?: number;
  shock2DelayEasy?: number;
  /** v2 Phase 2: schnelleres Verfolgen. */
  speedP2?: number;

  // HYDRA-KERN: Faecher + Ruf + Teilung
  fanInterval?: number;
  fanTelegraph?: number;
  fanCount?: number;
  fanAngle?: number;
  fanProjectileSpeed?: number;
  callInterval?: number;
  /** Teilungs-Schwellen (HP-Anteile); jede spawnt 2 Mini-Kerne. */
  splitThresholds?: readonly number[];
  miniHpFrac?: number;
  miniSpeed?: number;
  miniFanInterval?: number;

  // MINOS: Bomben-Zonen + Orbit-Movement
  plantInterval?: number;
  plantIntervalP2?: number;
  bombFuse?: number;
  bombRadius?: number;
  bombDamageMult?: number;
  bombClusterSize?: number;
  bombLineSizeP2?: number;
  bombLineSpacing?: number;
  bombLineStagger?: number;
  /** Hartes Limit aktiver Bomben (schuetzt auch den Ring-Pool der FX). */
  maxBombs?: number;
  orbitRange?: number;
  orbitApproach?: number;
  orbitRetreat?: number;
  strafeSpeed?: number;
  strafeFlip?: number;

  // WIRBEL: Sog + Spiral-Salven + Kollaps
  suctionInterval?: number;
  suctionIntervalP2?: number;
  suctionTelegraph?: number;
  suctionDuration?: number;
  /** Spieler-Zuggeschwindigkeit (x enemySpeed-Mod — Einfach automatisch sanfter). */
  suctionPull?: number;
  suctionPullP2?: number;
  suctionRange?: number;
  suctionRangeP2?: number;
  spiralInterval?: number;
  spiralIntervalP2?: number;
  spiralCount?: number;
  spiralCountP2?: number;
  spiralProjectileSpeed?: number;
  collapseRadius?: number;
  collapseRadiusP2?: number;
  collapseRingSpeed?: number;
}

export const BOSS_PRISMA: BossDef = {
  id: 'prisma', color: 0xff3df2, shape: 'octahedron', radius: 1.6, scale: 3.0,
  speed: 1.2, contactDamage: 20,
  salvoInterval: 4, salvoCount: 12, salvoTelegraph: 0.8, salvoProjectileSpeed: 6,
  trioInterval: 6, trioTelegraph: 0.5, trioShotGap: 0.3, trioProjectileSpeed: 8, trioShots: 3,
  salvoCountP2: 16, salvoIntervalP2: 3, salvoRotationStep: (11 * Math.PI) / 180,
};

export const BOSS_GOLIATH: BossDef = {
  id: 'goliath', color: 0x7b2dff, shape: 'cube', radius: 1.9, scale: 3.5,
  speed: 1.4, contactDamage: 30,
  chargeInterval: 6, chargeTelegraph: 1.2, chargeSpeed: 14, chargeDamage: 30,
  chargeStunTime: 1.5, chargeStunTimeP2: 2.0, stunDamageTakenMult: 2.0,
  shockInterval: 8, shockTelegraph: 1.0, shockRadius: 6, shockDamage: 20, shockRingSpeed: 10,
  summonIntervalP2: 8, chargeIntervalP2: 5,
  // v2: Nachbeben-Steine + P2-Billard-Abpraller + Doppel-Schockwelle
  stompRockCount: 3, stompRockCountP2: 5, stompRockSpeed: 4.5,
  stompRockSpread: (100 * Math.PI) / 180,
  // bounceTelegraph >= 0.8: Telegraph-Minimum gilt auch fuer die Spiegel-Bahn.
  // shock2DelayEasy 0.95 < iFramesAfterHit 1.0: die Hit-i-Frames schlucken den
  // zweiten Ring wie auf Normal — 1.1 haette Einfach paradox HAERTER gemacht.
  chargeBouncesP2: 1, bounceTelegraph: 0.8,
  shock2Delay: 0.8, shock2DelayEasy: 0.95,
  speedP2: 1.8,
};

export const BOSS_MINOS: BossDef = {
  id: 'minos', color: 0xff8c1a, shape: 'torus', radius: 1.7, scale: 3.2,
  speed: 2.4, contactDamage: 25,
  plantInterval: 5.5, plantIntervalP2: 4.5,
  bombFuse: 2.5, bombRadius: 3.0, bombDamageMult: 1.4,
  bombClusterSize: 3, bombLineSizeP2: 5, bombLineSpacing: 3.5, bombLineStagger: 0.2,
  maxBombs: 6,
  orbitRange: 6.5, orbitApproach: 8, orbitRetreat: 5, strafeSpeed: 1.8, strafeFlip: 6,
  trioInterval: 6, trioTelegraph: 0.5, trioShotGap: 0.35, trioProjectileSpeed: 6.5, trioShots: 3,
  summonIntervalP2: 12,
};

export const BOSS_HYDRA: BossDef = {
  id: 'hydra', color: 0x00f5d4, shape: 'sphere', radius: 1.5, scale: 3.0,
  speed: 2.0, contactDamage: 20,
  fanInterval: 3.5, fanTelegraph: 0.6, fanCount: 5, fanAngle: (40 * Math.PI) / 180,
  fanProjectileSpeed: 7,
  callInterval: 10,
  splitThresholds: [0.6, 0.3], miniHpFrac: 0.25, miniSpeed: 3.2, miniFanInterval: 4.5,
};

export const BOSS_VORTEX: BossDef = {
  id: 'vortex', color: 0x3355ff, shape: 'icosahedron', radius: 1.7, scale: 3.2,
  speed: 1.6, contactDamage: 25,
  suctionInterval: 10, suctionIntervalP2: 8, suctionTelegraph: 1.0, suctionDuration: 4.0,
  suctionPull: 2.6, suctionPullP2: 3.2, suctionRange: 14, suctionRangeP2: 99,
  spiralInterval: 0.8, spiralIntervalP2: 0.7, spiralCount: 6, spiralCountP2: 8,
  spiralProjectileSpeed: 4.5,
  collapseRadius: 5, collapseRadiusP2: 6, collapseRingSpeed: 12,
  trioInterval: 5, trioTelegraph: 0.5, trioShotGap: 0.35, trioProjectileSpeed: 7, trioShots: 2,
};

export const BOSS_ROTATION: readonly BossDef[] = [
  BOSS_PRISMA, BOSS_GOLIATH, BOSS_MINOS, BOSS_HYDRA, BOSS_VORTEX,
];

export function bossForWave(wave: number): { def: BossDef; tier: number } {
  const bossNr = Math.floor(wave / 5); // 1, 2, 3, ...
  const def = BOSS_ROTATION[(bossNr - 1) % BOSS_ROTATION.length] as BossDef;
  // Tier 0 = Basis, 1 = "+", 2 = "++" ... (alle Cooldowns x0.8^tier, Deckel x0.5).
  // Mit 5 Bossen beginnt "+" erst ab W30 — Varianz ersetzt Cooldown-Schrauben.
  const tier = Math.floor((bossNr - 1) / BOSS_ROTATION.length);
  return { def, tier };
}

export function bossCooldownMult(tier: number): number {
  return Math.max(0.5, Math.pow(0.8, tier));
}

export function bossProjectileSpeedMult(tier: number): number {
  return Math.pow(1.2, Math.min(tier, 3));
}

export function bossHp(wave: number, hpFactor: number, diffHp: number): number {
  return Math.round((300 + 60 * wave) * hpFactor * diffHp);
}
