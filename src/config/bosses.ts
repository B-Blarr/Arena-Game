/**
 * Boss-Definitionen. Alle Telegraphs >= 0.8 s Reaktionsfenster
 * (sichtbar + Warnton), damit auch Kinder ausweichen lernen.
 * Rotation: W5 PRISMA, W10 GOLIATH, W15 HYDRA-KERN, ab W20 "+"-Varianten.
 */

export interface BossDef {
  id: string;
  color: number;
  shape: 'octahedron' | 'cube' | 'sphere';
  radius: number;
  scale: number;
  speed: number;
  contactDamage: number;

  // PRISMA: Kreis-Salve + Ziel-Trio
  salvoInterval?: number;
  salvoCount?: number;
  salvoTelegraph?: number;
  salvoProjectileSpeed?: number;
  trioInterval?: number;
  trioTelegraph?: number;
  trioShotGap?: number;
  trioProjectileSpeed?: number;
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
  /** Betaeubt an der Wand: +50 % erlittener Schaden. */
  stunDamageTakenMult?: number;
  shockInterval?: number;
  shockTelegraph?: number;
  shockRadius?: number;
  shockDamage?: number;
  shockRingSpeed?: number;
  summonIntervalP2?: number;
  chargeIntervalP2?: number;

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
}

export const BOSS_PRISMA: BossDef = {
  id: 'prisma', color: 0xff3df2, shape: 'octahedron', radius: 1.6, scale: 3.0,
  speed: 1.2, contactDamage: 20,
  salvoInterval: 4, salvoCount: 12, salvoTelegraph: 0.8, salvoProjectileSpeed: 6,
  trioInterval: 6, trioTelegraph: 0.5, trioShotGap: 0.3, trioProjectileSpeed: 8,
  salvoCountP2: 16, salvoIntervalP2: 3, salvoRotationStep: (11 * Math.PI) / 180,
};

export const BOSS_GOLIATH: BossDef = {
  id: 'goliath', color: 0x7b2dff, shape: 'cube', radius: 1.9, scale: 3.5,
  speed: 1.4, contactDamage: 30,
  chargeInterval: 7, chargeTelegraph: 1.2, chargeSpeed: 14, chargeDamage: 30,
  chargeStunTime: 1.5, stunDamageTakenMult: 1.5,
  shockInterval: 9, shockTelegraph: 1.0, shockRadius: 6, shockDamage: 20, shockRingSpeed: 10,
  summonIntervalP2: 8, chargeIntervalP2: 5,
};

export const BOSS_HYDRA: BossDef = {
  id: 'hydra', color: 0x00f5d4, shape: 'sphere', radius: 1.5, scale: 3.0,
  speed: 2.0, contactDamage: 20,
  fanInterval: 3.5, fanTelegraph: 0.6, fanCount: 5, fanAngle: (40 * Math.PI) / 180,
  fanProjectileSpeed: 7,
  callInterval: 10,
  splitThresholds: [0.6, 0.3], miniHpFrac: 0.25, miniSpeed: 3.2, miniFanInterval: 4.5,
};

export const BOSS_ROTATION: readonly BossDef[] = [BOSS_PRISMA, BOSS_GOLIATH, BOSS_HYDRA];

export function bossForWave(wave: number): { def: BossDef; tier: number } {
  const bossNr = Math.floor(wave / 5); // 1, 2, 3, ...
  const def = BOSS_ROTATION[(bossNr - 1) % BOSS_ROTATION.length] as BossDef;
  // Tier 0 = Basis, 1 = "+", 2 = "++" ... (alle Cooldowns x0.8^tier, Deckel x0.5)
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
