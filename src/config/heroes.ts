/**
 * Spielbare Helden + Startwaffen. DPS-Check (Basis, Einzelziel):
 * VOLT 25 · BLITZ 24 (schneller/fragiler) · BROCKEN ~33 auf Nahdistanz.
 * Unterschiedliches Spielgefuehl bei aehnlicher Staerke.
 */

export interface WeaponDef {
  id: string;
  /** Schuss pro Sekunde. */
  fireRate: number;
  damage: number;
  projectileSpeed: number;
  range: number;
  projectileCount: number;
  /** Faecher-Winkel in Radiant zwischen den Projektilen. */
  spreadAngle: number;
  pierce: number;
  knockback: number;
  /** Bumerang: fliegt raus, kehrt um und darf auf dem Rueckweg erneut treffen. */
  boomerang: boolean;
}

export interface HeroDef {
  id: string;
  color: number;
  price: number;
  maxHp: number;
  speed: number;
  dashCooldown: number;
  weapon: WeaponDef;
}

export const WEAPON_BLASTER: WeaponDef = {
  id: 'blaster', fireRate: 2.5, damage: 10, projectileSpeed: 18, range: 14,
  projectileCount: 1, spreadAngle: 0, pierce: 0, knockback: 0, boomerang: false,
};

export const WEAPON_PULSE: WeaponDef = {
  id: 'pulse', fireRate: 4, damage: 6, projectileSpeed: 20, range: 14,
  projectileCount: 1, spreadAngle: 0, pierce: 0, knockback: 0, boomerang: false,
};

export const WEAPON_SPREAD: WeaponDef = {
  id: 'spread', fireRate: 1.6, damage: 7, projectileSpeed: 16, range: 12,
  projectileCount: 3, spreadAngle: (15 * Math.PI) / 180, pierce: 0, knockback: 4, boomerang: false,
};

/** Freischaltbare Zusatzwaffen (im Shop, fuer alle Helden waehlbar). */
export const WEAPON_LASER: WeaponDef = {
  id: 'laser', fireRate: 1.2, damage: 22, projectileSpeed: 32, range: 16,
  projectileCount: 1, spreadAngle: 0, pierce: 999, knockback: 0, boomerang: false,
};

export const WEAPON_STARTHROWER: WeaponDef = {
  id: 'star', fireRate: 1.8, damage: 12, projectileSpeed: 14, range: 10,
  projectileCount: 1, spreadAngle: 0, pierce: 2, knockback: 0, boomerang: true,
};

export const UNLOCKABLE_WEAPONS: ReadonlyArray<{ weapon: WeaponDef; price: number }> = [
  { weapon: WEAPON_LASER, price: 600 },
  { weapon: WEAPON_STARTHROWER, price: 900 },
];

// NEU (Premium-Helden): feste Startwaffen der 4 neuen Helden. Alle im bestehenden
// Einzelziel-DPS-Band (~24-27, vgl. blaster 25 / laser 26.4) -> balancierte Sidegrades,
// nur das Spielgefuehl unterscheidet sich (Wucht / Sniper / Schneide / Praezision).
/** KOLOSS: langsamer schwerer Wuchtschlag mit Rueckstoss (1.1 x 24 = 26.4 DPS). */
export const WEAPON_MOERSER: WeaponDef = {
  id: 'moerser', fireRate: 1.1, damage: 24, projectileSpeed: 14, range: 11,
  projectileCount: 1, spreadAngle: 0, pierce: 1, knockback: 6, boomerang: false,
};
/** PHANTOM: Sniper-Burst, langsam + brutaler Einzelschuss, bestraft Verfehlen (0.8 x 34 = 27.2 DPS). */
export const WEAPON_RAILGUN: WeaponDef = {
  id: 'railgun', fireRate: 0.8, damage: 34, projectileSpeed: 40, range: 20,
  projectileCount: 1, spreadAngle: 0, pierce: 3, knockback: 0, boomerang: false,
};
/** KRISTALL: schneidender, durchdringender Kristallbolzen (2.4 x 10 = 24 DPS). */
export const WEAPON_PRISMA: WeaponDef = {
  id: 'prisma', fireRate: 2.4, damage: 10, projectileSpeed: 20, range: 13,
  projectileCount: 1, spreadAngle: 0, pierce: 2, knockback: 0, boomerang: false,
};
/** ORBIT: praeziser, sauberer Schuss (1.9 x 13 = 24.7 DPS). */
export const WEAPON_ORBITER: WeaponDef = {
  id: 'orbiter', fireRate: 1.9, damage: 13, projectileSpeed: 19, range: 14,
  projectileCount: 1, spreadAngle: 0, pierce: 1, knockback: 0, boomerang: false,
};

export const HEROES: readonly HeroDef[] = [
  { id: 'volt', color: 0x00e5ff, price: 0, maxHp: 100, speed: 6.0, dashCooldown: 2.5, weapon: WEAPON_BLASTER },
  { id: 'blitz', color: 0xffe97a, price: 250, maxHp: 70, speed: 7.2, dashCooldown: 2.0, weapon: WEAPON_PULSE },
  { id: 'brocken', color: 0xff8a5c, price: 500, maxHp: 150, speed: 5.0, dashCooldown: 3.0, weapon: WEAPON_SPREAD },
  // NEU (Premium-Helden, balancierte Sidegrades): teuer = Prestige + Optik + eigene Waffe, NICHT mehr Macht.
  { id: 'koloss', color: 0xffb060, price: 1200, maxHp: 200, speed: 4.4, dashCooldown: 3.4, weapon: WEAPON_MOERSER },
  // kristall/orbit: gesaettigte Default-Farbe (nicht fast-weiss) -> Facetten/Halo lesen auch OHNE
  // Farbvariante; die Colorway ueberschreibt sie weiterhin komplett.
  { id: 'kristall', color: 0x5ad2ff, price: 1500, maxHp: 110, speed: 6.2, dashCooldown: 2.3, weapon: WEAPON_PRISMA },
  { id: 'phantom', color: 0x9a3dff, price: 2000, maxHp: 75, speed: 7.0, dashCooldown: 1.9, weapon: WEAPON_RAILGUN },
  { id: 'orbit', color: 0x33d0ff, price: 2500, maxHp: 120, speed: 6.0, dashCooldown: 2.4, weapon: WEAPON_ORBITER },
];

export function getHero(id: string): HeroDef {
  return HEROES.find((h) => h.id === id) ?? (HEROES[0] as HeroDef);
}

export function getWeapon(id: string, hero: HeroDef): WeaponDef {
  if (id === 'laser') return WEAPON_LASER;
  if (id === 'star') return WEAPON_STARTHROWER;
  return hero.weapon;
}

/** Dauerhafte Shop-Boni (Stufen mit steigenden Preisen). */
export interface PermaBonusDef {
  id: string;
  prices: readonly number[];
  /** Wirkung pro Stufe, Interpretation je nach id im Player-Statsystem. */
  valuePerLevel: number;
}

export const PERMA_BONI: readonly PermaBonusDef[] = [
  { id: 'armor', prices: [60, 150, 350], valuePerLevel: 0.1 }, // +10 % Start-Max-HP
  { id: 'calibration', prices: [80, 200, 450], valuePerLevel: 0.06 }, // +6 % Schaden
  { id: 'turbo', prices: [70, 180], valuePerLevel: 0.05 }, // +5 % Tempo
  { id: 'luck', prices: [100, 250], valuePerLevel: 0.1 }, // +10 % Kern-Chance
  { id: 'headstart', prices: [300], valuePerLevel: 1 }, // Start mit 1 zufaelligen Common-Upgrade
  { id: 'secondChance', prices: [800], valuePerLevel: 1 }, // 1x Wiederbelebung mit 50 % HP
];
