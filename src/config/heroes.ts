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

export const HEROES: readonly HeroDef[] = [
  { id: 'volt', color: 0x00e5ff, price: 0, maxHp: 100, speed: 6.0, dashCooldown: 2.5, weapon: WEAPON_BLASTER },
  { id: 'blitz', color: 0xffe97a, price: 250, maxHp: 70, speed: 7.2, dashCooldown: 2.0, weapon: WEAPON_PULSE },
  { id: 'brocken', color: 0xff8a5c, price: 500, maxHp: 150, speed: 5.0, dashCooldown: 3.0, weapon: WEAPON_SPREAD },
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
