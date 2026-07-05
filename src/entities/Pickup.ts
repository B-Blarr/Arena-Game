export const PICKUP_CORE = 0;
export const PICKUP_HEART = 1;
export const PICKUP_MAGNET = 2;

export interface Pickup {
  kind: number;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  vx: number;
  vz: number;
  age: number;
  /** 0 = despawnt nie (Kerne bleiben bis Wellenende liegen). */
  lifetime: number;
  /** Fliegt bereits zum Spieler (Magnet-Sog). */
  magnetized: boolean;
  bobPhase: number;
}

export function makePickup(): Pickup {
  return {
    kind: PICKUP_CORE,
    x: 0, z: 0, prevX: 0, prevZ: 0, vx: 0, vz: 0,
    age: 0, lifetime: 0, magnetized: false, bobPhase: 0,
  };
}

export function initPickup(p: Pickup, kind: number, x: number, z: number, lifetime: number): void {
  p.kind = kind;
  p.x = x;
  p.z = z;
  p.prevX = x;
  p.prevZ = z;
  // kleiner Auswurf-Impuls, damit Drops lebendig wirken
  const a = Math.random() * Math.PI * 2;
  const s = 1.5 + Math.random() * 2;
  p.vx = Math.cos(a) * s;
  p.vz = Math.sin(a) * s;
  p.age = 0;
  p.lifetime = lifetime;
  p.magnetized = false;
  p.bobPhase = Math.random() * Math.PI * 2;
}
