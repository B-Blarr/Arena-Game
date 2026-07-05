import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Material,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  SphereGeometry,
  TetrahedronGeometry,
  TorusGeometry,
} from 'three';
import { ENEMIES, type EnemyShape } from '../config/enemies';

/**
 * ALLE geteilten Geometrien und Materialien entstehen genau einmal hier.
 * Waehrend des Gameplays wird nichts erzeugt oder disposed — zentrale
 * dispose()-Methode fuer den Teardown (HMR/Seitenwechsel).
 *
 * HDR-Trick fuers Neon: MeshBasicMaterial (unlit) mit Farbwerten > 1
 * ueberschreitet den Bloom-Luminanz-Threshold und glueht.
 */
export class AssetRegistry {
  // MUSS vor den Material-Feldern stehen: makeGlow() pusht hierhin,
  // und Klassenfelder initialisieren in Deklarations-Reihenfolge.
  private extraMaterials: Material[] = [];

  // Geometrien
  readonly geoCube = new BoxGeometry(0.9, 0.9, 0.9);
  readonly geoOctahedron = new OctahedronGeometry(0.65);
  readonly geoTetrahedron = new TetrahedronGeometry(0.7);
  readonly geoSphere = new SphereGeometry(0.55, 12, 8);
  readonly geoPlayerProjectile = new SphereGeometry(0.15, 8, 6);
  readonly geoEnemyProjectile = new SphereGeometry(0.19, 8, 6);
  readonly geoCore = new OctahedronGeometry(0.22);
  readonly geoHeart = new SphereGeometry(0.24, 10, 8);
  readonly geoMagnet = new IcosahedronGeometry(0.26);
  readonly geoOrb = new SphereGeometry(0.3, 10, 8);
  readonly geoParticle = new BoxGeometry(0.14, 0.14, 0.14);
  readonly geoRing = new RingGeometry(0.85, 1, 48);
  readonly geoBlob = new CircleGeometry(0.6, 24);
  readonly geoPlayerBody = new ConeGeometry(0.42, 1.1, 6);
  readonly geoPlayerRing = new TorusGeometry(0.45, 0.06, 8, 24);
  readonly geoTelegraphLine = new BoxGeometry(1, 0.05, 1);
  /** Kern-Dieb: silberner Kristall. */
  readonly geoIcosahedron = new IcosahedronGeometry(0.6);
  /** Boss MINOS: aufrecht rotierender Ring. */
  readonly geoTorusBoss = new TorusGeometry(0.6, 0.22, 10, 24);
  /** Versorgungskapsel: goldener Wuerfel. */
  readonly geoCapsule = new BoxGeometry(0.5, 0.5, 0.5);
  /** Orbital-Laser: Saeulen-Beam (Einheit, wird gestreckt). */
  readonly geoBeam = new CylinderGeometry(0.25, 0.4, 1, 12, 1, true);
  /** Projektil-Streak: gestreckte Box mit gebackenem Vertex-Gradient
   *  (Kopf weiss, Heck schwarz) — bei additivem Blending gratis-Fade. */
  readonly geoStreak = AssetRegistry.makeStreakGeometry();
  // Helden-Silhouetten (heroShapes.ts): Rumpf-/Anbau-Teile
  readonly geoHeroDartHull = new ConeGeometry(0.26, 1.4, 4);
  /** 3 Radialsegmente = flaches Dreiecks-Prisma — der Panzer-Keil. */
  readonly geoHeroWedgeHull = new CylinderGeometry(0.58, 0.66, 0.42, 3);
  readonly geoHeroFin = new BoxGeometry(0.5, 0.06, 0.34);
  readonly geoHeroWing = new BoxGeometry(0.72, 0.05, 0.2);
  readonly geoHeroShoulder = new BoxGeometry(0.26, 0.42, 0.52);
  readonly geoHeroEngine = new SphereGeometry(0.12, 8, 6);

  // Gegner: weisses Material, Farbe kommt pro Instanz (instanceColor)
  readonly matEnemy = new MeshBasicMaterial({ color: 0xffffff });

  readonly matPlayerProjectile = this.makeGlow(0x00e5ff, 2.2);
  readonly matEnemyProjectile = this.makeGlow(0xff3b30, 2.2);
  readonly matCore = this.makeGlow(0x00e5ff, 2.0);
  readonly matHeart = this.makeGlow(0x4dff88, 2.0);
  readonly matMagnet = this.makeGlow(0xffc83d, 2.0);
  readonly matOrb = this.makeGlow(0x00e5ff, 2.4);
  readonly matParticle = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  readonly matBlob = new MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  readonly matTelegraph = new MeshBasicMaterial({
    color: new Color(0xff3b30).multiplyScalar(1.5),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  readonly matPortal = new MeshBasicMaterial({
    color: new Color(0x00e5ff).multiplyScalar(1.5),
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  readonly matShockwave = new MeshBasicMaterial({
    color: new Color(0xffffff).multiplyScalar(1.6),
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  readonly matCapsule = this.makeGlow(0xffc83d, 2.0);
  /** Streaks: Farbe pro Instanz (instanceColor) x Vertex-Gradient. */
  readonly matStreak = new MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  /** Elite-Marker: goldener additiver Boden-Ring. */
  readonly matEliteRing = this.makeGlowTransparent(0xffc83d, 2.0, 0.55, true);

  /** HDR-Farben pro Gegnertyp (fuer instanceColor), Faktor 1.8 -> bloomt. */
  readonly enemyColors: Color[] = ENEMIES.map((def) => new Color(def.color).multiplyScalar(1.8));
  /** Elite-Varianten: 50 % Richtung Weiss gelerpt und heisser — sichtbar "gleissend". */
  readonly eliteColors: Color[] = ENEMIES.map((def) =>
    new Color(def.color).lerp(new Color(0xffffff), 0.5).multiplyScalar(2.4),
  );

  geometryFor(shape: EnemyShape): BufferGeometry {
    switch (shape) {
      case 'cube':
        return this.geoCube;
      case 'octahedron':
        return this.geoOctahedron;
      case 'tetrahedron':
        return this.geoTetrahedron;
      case 'sphere':
        return this.geoSphere;
      case 'icosahedron':
        return this.geoIcosahedron;
      case 'torus':
        return this.geoTorusBoss;
    }
  }

  private static makeStreakGeometry(): BoxGeometry {
    const geo = new BoxGeometry(0.07, 0.07, 1);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      // Helligkeit entlang der Laengsachse: Kopf (z=+0.5) hell, Heck dunkel
      const v = Math.max(0, pos.getZ(i) + 0.5);
      colors[i * 3] = v;
      colors[i * 3 + 1] = v;
      colors[i * 3 + 2] = v;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    return geo;
  }

  makeGlow(hex: number, intensity: number): MeshBasicMaterial {
    const m = new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(intensity) });
    this.extraMaterials.push(m);
    return m;
  }

  makeGlowTransparent(hex: number, intensity: number, opacity: number, additive = false): MeshBasicMaterial {
    const m = new MeshBasicMaterial({
      color: new Color(hex).multiplyScalar(intensity),
      transparent: true,
      opacity,
      depthWrite: false,
      ...(additive ? { blending: AdditiveBlending } : {}),
    });
    this.extraMaterials.push(m);
    return m;
  }

  dispose(): void {
    const geos: BufferGeometry[] = [
      this.geoCube, this.geoOctahedron, this.geoTetrahedron, this.geoSphere,
      this.geoPlayerProjectile, this.geoEnemyProjectile, this.geoCore, this.geoHeart,
      this.geoMagnet, this.geoOrb, this.geoParticle, this.geoRing, this.geoBlob,
      this.geoPlayerBody, this.geoPlayerRing, this.geoTelegraphLine,
      this.geoIcosahedron, this.geoCapsule, this.geoBeam, this.geoStreak,
      this.geoTorusBoss,
      this.geoHeroDartHull, this.geoHeroWedgeHull, this.geoHeroFin,
      this.geoHeroWing, this.geoHeroShoulder, this.geoHeroEngine,
    ];
    for (const g of geos) g.dispose();
    const mats: Material[] = [
      this.matEnemy, this.matParticle, this.matBlob, this.matTelegraph,
      this.matPortal, this.matShockwave, this.matStreak, ...this.extraMaterials,
    ];
    for (const m of mats) m.dispose();
    this.extraMaterials = [];
  }
}
