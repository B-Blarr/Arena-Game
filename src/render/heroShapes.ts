/**
 * Helden-Silhouetten: pro Held eine eigene, von schraeg oben sofort
 * unterscheidbare Figur aus 2-4 Primitiven (Part-Slot-System im
 * InstancedRenderer). Rein visuelle Zahlen — gehoeren zur Render-Domaene.
 * Modellraum: +z = vorn (Blickrichtung), y = hoch.
 */

export type HeroPartGeo =
  | 'coneHull'   // klassischer Pfeil-Kegel (VOLT)
  | 'dartHull'   // schlanker 4-seitiger Kegel (BLITZ)
  | 'wedgeHull'  // flaches Dreiecks-Prisma (BROCKEN)
  | 'fin'        // kleine Flosse
  | 'wing'       // gepfeilter Fluegel
  | 'shoulder'   // Panzer-Schulterplatte
  | 'engine';    // Triebwerks-Glut

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
};
