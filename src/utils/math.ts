export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Framerate-unabhaengiges Daempfen Richtung Ziel (exponentieller Zerfall). */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function len2(x: number, z: number): number {
  return x * x + z * z;
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

/**
 * Kuerzeste Distanz² zwischen Punkt (px,pz) und Strecke (ax,az)->(bx,bz).
 * Swept-Check fuer Projektile gegen Kreis-Hitboxen (kein Tunneling).
 */
export function segPointDist2(
  ax: number, az: number,
  bx: number, bz: number,
  px: number, pz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const abLen2 = abx * abx + abz * abz;
  if (abLen2 === 0) return dist2(ax, az, px, pz);
  let t = ((px - ax) * abx + (pz - az) * abz) / abLen2;
  t = clamp(t, 0, 1);
  return dist2(ax + abx * t, az + abz * t, px, pz);
}
