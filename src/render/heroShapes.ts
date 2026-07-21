/**
 * Helden-Silhouetten: pro Held eine eigene, von schraeg oben sofort
 * unterscheidbare Figur aus 2-4 Primitiven (Part-Slot-System im
 * InstancedRenderer). Rein visuelle Zahlen — gehoeren zur Render-Domaene.
 * Modellraum: +z = vorn (Blickrichtung), y = hoch.
 */

export type HeroPartGeo =
  | 'coneHull' // klassischer Pfeil-Kegel (VOLT)
  | 'dartHull' // schlanker 4-seitiger Kegel (BLITZ)
  | 'wedgeHull' // flaches Dreiecks-Prisma (BROCKEN)
  | 'fin' // kleine Flosse
  | 'wing' // gepfeilter Fluegel
  | 'shoulder' // Panzer-Schulterplatte
  | 'engine' // Triebwerks-Glut
  // NEU (Premium-Helden):
  | 'bastion' // breites niedriges Hex-Prisma (KOLOSS)
  | 'stealthHull' // flache gepfeilte Raute (PHANTOM)
  | 'crystalHull' // facettiertes Ikosaeder (KRISTALL)
  | 'orbCore' // leuchtender Kern (ORBIT)
  | 'halo'; // duenner Ring, rotiert (ORBIT)

export interface HeroShapePart {
  geo: HeroPartGeo;
  x: number;
  y: number;
  z: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  /** Uniforme Skalierung (Default 1) — oder sx/sy/sz fuer non-uniform. */
  scale?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  mat: 'body' | 'engine';
  /** NEU: Eigenrotation um die Y-Achse (rad/s), addiert pro Frame auf rotY.
   *  0/undefined = statisch (Standard). Nur ORBITs Halo/Splitter nutzen es. */
  spin?: number;
}

export interface HeroShape {
  /** parts[0] MUSS der Rumpf sein — Dash-Ghosts zeigen nur ihn. */
  parts: HeroShapePart[];
  /** Ghost-Pose: Kipp-Rotation + Hoehe des Rumpfs. */
  hullRotX: number;
  hullY: number;
  ringScale: number;
  blobScale: number;
  engineColor: number;
  engineIntensity: number;
}

export const HERO_SHAPES: Record<string, HeroShape> = {
  // "Pfeil-Jaeger": vertraute Kegel-Silhouette + gepfeilte Heckflossen
  volt: {
    parts: [
      { geo: 'coneHull', x: 0, y: 0.55, z: 0, rotX: Math.PI / 2, mat: 'body' },
      { geo: 'fin', x: 0.32, y: 0.46, z: -0.28, rotY: 0.6, mat: 'body' },
      { geo: 'fin', x: -0.32, y: 0.46, z: -0.28, rotY: -0.6, mat: 'body' },
      { geo: 'engine', x: 0, y: 0.5, z: -0.6, scale: 1.1, mat: 'engine' },
    ],
    hullRotX: Math.PI / 2,
    hullY: 0.55,
    ringScale: 1.0,
    blobScale: 1.0,
    engineColor: 0xbff8ff,
    engineIntensity: 2.6,
  },
  // "Speeder-Dart": schmaler Klingen-Rumpf + stark gepfeilte Fluegel,
  // groesste Triebwerksflamme (der Schnelle)
  blitz: {
    parts: [
      { geo: 'dartHull', x: 0, y: 0.5, z: 0.05, rotX: Math.PI / 2, mat: 'body' },
      { geo: 'wing', x: 0.34, y: 0.45, z: -0.38, rotY: 0.9, mat: 'body' },
      { geo: 'wing', x: -0.34, y: 0.45, z: -0.38, rotY: -0.9, mat: 'body' },
      { geo: 'engine', x: 0, y: 0.45, z: -0.72, scale: 1.3, mat: 'engine' },
    ],
    hullRotX: Math.PI / 2,
    hullY: 0.5,
    ringScale: 0.85,
    blobScale: 0.85,
    engineColor: 0xfff3b0,
    engineIntensity: 2.8,
  },
  // "Panzer-Keil": flaches breites Dreiecks-Prisma + Schulterplatten,
  // breite flache Glut (der Wuchtige)
  brocken: {
    parts: [
      { geo: 'wedgeHull', x: 0, y: 0.5, z: 0.05, mat: 'body' },
      { geo: 'shoulder', x: 0.52, y: 0.62, z: -0.22, rotY: -0.25, mat: 'body' },
      { geo: 'shoulder', x: -0.52, y: 0.62, z: -0.22, rotY: 0.25, mat: 'body' },
      { geo: 'engine', x: 0, y: 0.45, z: -0.6, sx: 1.5, sy: 0.7, sz: 0.7, mat: 'engine' },
    ],
    hullRotX: 0,
    hullY: 0.5,
    ringScale: 1.25,
    blobScale: 1.3,
    engineColor: 0xffc9a0,
    engineIntensity: 2.4,
  },
  // NEU "Festungs-Keil": massiger Hex-Rumpf + wuchtige Schulterplatten, breite Glut (KOLOSS)
  koloss: {
    parts: [
      { geo: 'bastion', x: 0, y: 0.5, z: 0, mat: 'body' },
      { geo: 'shoulder', x: 0.6, y: 0.6, z: -0.1, rotY: -0.2, scale: 1.25, mat: 'body' },
      { geo: 'shoulder', x: -0.6, y: 0.6, z: -0.1, rotY: 0.2, scale: 1.25, mat: 'body' },
      { geo: 'engine', x: 0, y: 0.45, z: -0.52, sx: 1.7, sy: 0.7, sz: 0.7, mat: 'engine' },
    ],
    hullRotX: 0,
    hullY: 0.5,
    ringScale: 1.5,
    blobScale: 1.5,
    engineColor: 0xffb060,
    engineIntensity: 2.5,
  },
  // NEU "Schwebekristall": facettierter Gem-Rumpf + 2 langsam drehende Splitter, schimmernde Glut (KRISTALL)
  kristall: {
    parts: [
      { geo: 'crystalHull', x: 0, y: 0.58, z: 0, rotX: 0.3, rotZ: 0.4, scale: 1.15, mat: 'body', spin: 0.4 },
      { geo: 'crystalHull', x: 0.42, y: 0.5, z: -0.12, scale: 0.4, mat: 'body', spin: 1.2 },
      { geo: 'crystalHull', x: -0.42, y: 0.5, z: -0.12, scale: 0.4, mat: 'body', spin: -1.2 },
      { geo: 'engine', x: 0, y: 0.5, z: -0.42, scale: 1.0, mat: 'engine' },
    ],
    hullRotX: 0,
    hullY: 0.58,
    ringScale: 1.0,
    blobScale: 1.0,
    engineColor: 0xeaffff,
    engineIntensity: 3.0,
  },
  // NEU "Stealth-Klinge": flache gepfeilte Raute + stark zurueckgepfeilte Fluegel, gedimmte Glut (PHANTOM)
  phantom: {
    parts: [
      { geo: 'stealthHull', x: 0, y: 0.42, z: 0, sx: 0.5, sy: 0.32, sz: 1.5, mat: 'body' },
      { geo: 'wing', x: 0.34, y: 0.4, z: -0.34, rotY: 1.1, mat: 'body' },
      { geo: 'wing', x: -0.34, y: 0.4, z: -0.34, rotY: -1.1, mat: 'body' },
      { geo: 'engine', x: 0, y: 0.4, z: -0.62, scale: 0.9, mat: 'engine' },
    ],
    hullRotX: 0,
    hullY: 0.42,
    ringScale: 0.85,
    blobScale: 0.85,
    engineColor: 0x9a3dff,
    engineIntensity: 2.0,
  },
  // NEU "Kern + Halo": leuchtender Kern-Rumpf + 2 gegenlaeufig rotierende, gekippte Ringe (ORBIT)
  orbit: {
    parts: [
      { geo: 'orbCore', x: 0, y: 0.55, z: 0, mat: 'body' },
      { geo: 'halo', x: 0, y: 0.55, z: 0, rotX: 0.5, scale: 1.0, mat: 'body', spin: 1.6 },
      { geo: 'halo', x: 0, y: 0.55, z: 0, rotX: -0.5, rotZ: 0.35, scale: 0.78, mat: 'body', spin: -1.15 },
      { geo: 'engine', x: 0, y: 0.45, z: -0.34, scale: 0.9, mat: 'engine' },
    ],
    hullRotX: 0,
    hullY: 0.55,
    ringScale: 1.1,
    blobScale: 1.1,
    engineColor: 0xbff8ff,
    engineIntensity: 2.8,
  },
};
