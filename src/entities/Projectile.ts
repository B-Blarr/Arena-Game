/**
 * Projektil als flaches, poolbares Daten-Struct (kein Mesh!).
 * prevX/prevZ dienen dem Swept-Segment-Check gegen Tunneling
 * und der Render-Interpolation.
 */
export interface Projectile {
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  vx: number;
  vz: number;
  damage: number;
  pierceLeft: number;
  ricochetLeft: number;
  traveled: number;
  range: number;
  radius: number;
  knockback: number;
  boomerang: boolean;
  returning: boolean;
  /** UIDs bereits getroffener Gegner (kein Doppel-Treffer bei Durchschlag). */
  hitUids: number[];
  hitCount: number;
  /** Koop: Index des Schuetzen (Crit/Boost/Bumerang-Rueckkehr). */
  ownerIdx: number;
  /** NEU: Gegner-Projektil stammt vom BOSS -> vom "Zeitbruch"-Slow ausgenommen. */
  fromBoss: boolean;
  /** NEU: Prisma-Salve-Kugel (mythisch) -> prismatisch/Regenbogen gerendert. */
  prism: boolean;
}

export function makeProjectile(): Projectile {
  return {
    x: 0, z: 0, prevX: 0, prevZ: 0, vx: 0, vz: 0,
    damage: 0, pierceLeft: 0, ricochetLeft: 0,
    traveled: 0, range: 10, radius: 0.15, knockback: 0,
    boomerang: false, returning: false,
    hitUids: [], hitCount: 0, ownerIdx: 0, fromBoss: false, prism: false,
  };
}

export function initProjectile(
  p: Projectile,
  x: number, z: number,
  dirX: number, dirZ: number,
  speed: number, damage: number, range: number,
): void {
  p.x = x;
  p.z = z;
  p.prevX = x;
  p.prevZ = z;
  p.vx = dirX * speed;
  p.vz = dirZ * speed;
  p.damage = damage;
  p.pierceLeft = 0;
  p.ricochetLeft = 0;
  p.traveled = 0;
  p.range = range;
  p.radius = 0.15;
  p.knockback = 0;
  p.boomerang = false;
  p.returning = false;
  p.hitCount = 0;
  p.ownerIdx = 0;
  p.fromBoss = false; // NEU: Standard normaler Gegner (Boss setzt es beim Spawn explizit)
  p.prism = false; // NEU: Prisma-Salve setzt es beim Spawn explizit
}

export function projectileHasHit(p: Projectile, uid: number): boolean {
  for (let i = 0; i < p.hitCount; i++) {
    if (p.hitUids[i] === uid) return true;
  }
  return false;
}

export function projectileMarkHit(p: Projectile, uid: number): void {
  if (p.hitCount < p.hitUids.length) p.hitUids[p.hitCount] = uid;
  else p.hitUids.push(uid);
  p.hitCount++;
}
