import {
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  Scene,
} from 'three';
import { ELITE, ENEMIES, type EnemyDef } from '../config/enemies';
import { BOSS_ROTATION } from '../config/bosses';
import { HEROES, type HeroDef } from '../config/heroes';
import { ARENA_RADIUS, COOP, PICKUPS, POOLS } from '../config/balance';
import { UPGRADE_VALUES as UV } from '../config/upgrades';
import { PICKUP_CORE } from '../entities/Pickup';
import type { World } from '../core/World';
import type { EventBus } from '../core/EventBus';
import type { AssetRegistry } from './AssetRegistry';
import { HERO_SHAPES, type HeroPartGeo, type HeroShape } from './heroShapes';
import type { ColorwayDef } from '../config/stickers';
import { lerp } from '../utils/math';

const dummy = new Object3D();
const flashColor = new Color(5, 5, 5);
/** NEU (mythisch "Prisma-Salve"): wiederverwendete Farbe fuer die Regenbogen-Kugeln. */
const prismColor = new Color();
/** Elite-Schild aktiv: kalt-weisse Tönung statt Typfarbe. */
const shieldColor = new Color(2.2, 3.2, 3.8);
const streakColorEnemy = new Color(0xff3b30).multiplyScalar(1.6);
const MAX_ORBS = 3;
const STREAK_CAP = POOLS.playerProjectiles + POOLS.enemyProjectiles;
const ELITE_RING_CAP = 64;
const GHOST_COUNT = 3;
const GHOST_LIFE = 0.25;
const BEAM_TIME = 0.35;
/** NEU (mythisch "Prisma-Salve"): Regenbogen-Zyklen pro Sekunde fuer die Kugel-Faerbung. */
const PRISM_HUE_SPEED = 0.6;
/** Part-Slots pro Helden-Figur (Rumpf + 2 Anbauten + Triebwerk). */
const HERO_PART_SLOTS = 4;
/** Maximal 2 Spieler-Figuren (Koop). */
const MAX_FIGURES = 2;

/** Alle Szene-Objekte EINER Spieler-Figur (P1/P2 identisch aufgebaut). */
interface PlayerFigure {
  group: Group;
  parts: Mesh[];
  ring: Mesh;
  blob: Mesh;
  cloneGroup: Group;
  cloneParts: Mesh[];
  bodyMat: MeshBasicMaterial;
  engineMat: MeshBasicMaterial;
  cloneBodyMat: MeshBasicMaterial;
  ringBase: number;
  ghostRotX: number;
  ghostY: number;
  ghostMeshes: Mesh[];
  ghostMats: MeshBasicMaterial[];
  ghostLife: number[];
  ghostCursor: number;
  ghostSpawnTimer: number;
  orbMeshes: Mesh[];
  /** Koop-Down: blasser Zonen-Ring ("hier hinstellen") + Fortschritts-Ring. */
  reviveZone: Mesh;
  reviveProg: Mesh;
  reviveProgMat: MeshBasicMaterial;
  /** Aktuelle Basisfarbe (Held/Farbvariante) fuer Dimmen + Muzzle. */
  bodyColor: number;
  /** Animierte Farbvariante (Regenbogen): pro Frame neu einfaerben. */
  animatedColorway: boolean;
}

/**
 * Schreibt pro Frame die Optik aller dynamischen Entities:
 * InstancedMeshes fuer Gegner (1 pro Typ), Projektile + Streaks, Pickups,
 * Elite-Ringe — plus Spieler-, Klon-, Boss- und Mini-Meshes. Alles wird
 * einmalig gebaut, Sichtbarkeit/Matrizen werden nur noch geschrieben.
 */
export class InstancedRenderer {
  /** "Effekte reduzieren" daempft Ghost-/Klon-Transparenzen. */
  fxIntensity = 1;
  /** Menue-Modus: Figur ist Helden-Vorschau (immer sichtbar, ohne Klon/Orbs). */
  heroPreview = false;
  /** Zeitakku fuer animierte Farbvarianten (Regenbogen „prismatisch"). */
  private fxTime = 0;
  private readonly animColor = new Color();

  private readonly enemyMeshes: InstancedMesh[] = [];
  private readonly playerProj: InstancedMesh;
  private readonly enemyProj: InstancedMesh;
  private readonly streaks: InstancedMesh;
  private readonly eliteRings: InstancedMesh;
  private readonly pickupMeshes: InstancedMesh[] = [];
  /** Zwei komplette Spieler-Figuren (Solo nutzt nur Index 0). */
  private readonly figures: PlayerFigure[] = [];
  /** Koop-Revive-Fortschritt [0..1] je Figur — RunState schreibt pro Frame. */
  readonly reviveProgress: [number, number] = [0, 0];
  /** Trail-Farben der Spieler-Projektile je Owner (folgt Held/Farbvariante). */
  private readonly streakColors: [Color, Color] = [
    new Color(0x00e5ff).multiplyScalar(1.8),
    new Color(0xff3df2).multiplyScalar(1.8),
  ];
  private readonly bossGroups = new Map<string, Group>();
  private readonly bossWireMats = new Map<string, MeshBasicMaterial>();
  private readonly miniMeshes: Mesh[] = [];
  private readonly beamMesh: Mesh;
  private readonly beamMat: MeshBasicMaterial;
  private beamTimer = 0;
  /** NEU (mythisch "Prisma-Salve"): eigenes Projektil-Mesh fuer die Regenbogen-Kugeln
   *  (weisses Material + instanceColor -> echte prismatische Faerbung pro Kugel). */
  private readonly prismProj: InstancedMesh;
  private readonly muzzle: PointLight;
  private muzzleTimer = 0;
  private readonly unsubs: Array<() => void> = [];

  constructor(
    private readonly scene: Scene,
    private readonly assets: AssetRegistry,
    events: EventBus,
  ) {
    // Gegner: ein InstancedMesh pro Typ (eigene Form, Farbe via instanceColor)
    for (const def of ENEMIES) {
      const mesh = new InstancedMesh(assets.geometryFor(def.shape), assets.matEnemy, POOLS.enemies);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      // instanceColor-Buffer sofort anlegen und als dynamisch markieren
      // (sonst erzeugt three ihn beim ersten setColorAt mit StaticDrawUsage)
      mesh.setColorAt(0, flashColor);
      mesh.instanceColor?.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      this.enemyMeshes.push(mesh);
    }

    this.playerProj = new InstancedMesh(assets.geoPlayerProjectile, assets.matPlayerProjectile, POOLS.playerProjectiles);
    this.enemyProj = new InstancedMesh(assets.geoEnemyProjectile, assets.matEnemyProjectile, POOLS.enemyProjectiles);
    for (const m of [this.playerProj, this.enemyProj]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }

    // Projektil-Streaks: EIN additives Mesh fuer Spieler (cyan) + Gegner (rot)
    this.streaks = new InstancedMesh(assets.geoStreak, assets.matStreak, STREAK_CAP);
    this.streaks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.streaks.setColorAt(0, this.streakColors[0]);
    this.streaks.instanceColor?.setUsage(DynamicDrawUsage);
    this.streaks.frustumCulled = false;
    this.streaks.count = 0;
    scene.add(this.streaks);

    // Elite-Marker: goldene Boden-Ringe
    this.eliteRings = new InstancedMesh(assets.geoRing, assets.matEliteRing, ELITE_RING_CAP);
    this.eliteRings.instanceMatrix.setUsage(DynamicDrawUsage);
    this.eliteRings.frustumCulled = false;
    this.eliteRings.count = 0;
    scene.add(this.eliteRings);

    const pickupGeos = [assets.geoCore, assets.geoHeart, assets.geoMagnet, assets.geoCapsule];
    const pickupMats = [assets.matCore, assets.matHeart, assets.matMagnet, assets.matCapsule];
    for (let k = 0; k < pickupGeos.length; k++) {
      const m = new InstancedMesh(pickupGeos[k], pickupMats[k], 256);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      this.pickupMeshes.push(m);
    }

    // Zwei komplette Spieler-Figuren (Figur, Ring, Blob, Klon, Ghosts,
    // Orbs, Revive-Ringe) — alles statisch vorgebaut, nie zur Laufzeit
    for (let f = 0; f < MAX_FIGURES; f++) this.figures.push(this.buildFigure());

    // Orbital-Laser: goldener Saeulen-Beam
    this.beamMat = assets.makeGlowTransparent(0xffc83d, 2.2, 0.7, true);
    this.beamMesh = new Mesh(assets.geoBeam, this.beamMat);
    this.beamMesh.visible = false;
    scene.add(this.beamMesh);

    // NEU (mythisch "Prisma-Salve"): eigenes Projektil-Mesh fuer die Regenbogen-Kugeln.
    // Weisses Material (matEnemy) + instanceColor -> jede Kugel eine eigene HSL-Farbe.
    this.prismProj = new InstancedMesh(assets.geoPlayerProjectile, assets.matEnemy, POOLS.playerProjectiles);
    this.prismProj.instanceMatrix.setUsage(DynamicDrawUsage);
    this.prismProj.setColorAt(0, prismColor); // instanceColor-Buffer sofort anlegen (sonst statisch)
    this.prismProj.instanceColor?.setUsage(DynamicDrawUsage);
    this.prismProj.frustumCulled = false;
    this.prismProj.count = 0;
    scene.add(this.prismProj);

    // Bosse: alle 3 vorbauen, Sichtbarkeit wird getoggelt
    for (const def of BOSS_ROTATION) {
      const group = new Group();
      const main = new Mesh(assets.geometryFor(def.shape), assets.makeGlow(def.color, 1.7));
      main.scale.setScalar(def.scale);
      const wireMat = assets.makeGlowTransparent(0xffffff, 2.2, 0.15);
      const wire = new Mesh(assets.geometryFor(def.shape), wireMat);
      wire.scale.setScalar(def.scale * 1.02);
      (wire.material as MeshBasicMaterial).wireframe = true;
      group.add(main, wire);
      group.visible = false;
      scene.add(group);
      this.bossGroups.set(def.id, group);
      this.bossWireMats.set(def.id, wireMat);
    }

    // HYDRA-Minis
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(assets.geoSphere, assets.makeGlow(0x00f5d4, 1.9));
      m.visible = false;
      scene.add(m);
      this.miniMeshes.push(m);
    }

    // Muzzle-Flash: EIN gepooltes PointLight, positioniert aus dem
    // Event-Payload (klebt im Koop nicht mehr an Spieler 1)
    this.muzzle = new PointLight(0x00e5ff, 0, 6);
    scene.add(this.muzzle);
    this.unsubs.push(
      events.on('shotFired', (e) => {
        this.muzzleTimer = 0.05;
        this.muzzle.position.set(e.x + e.dirX * 0.9, 0.7, e.z + e.dirZ * 0.9);
        const fig = this.figures[e.playerIndex];
        if (fig) this.muzzle.color.set(fig.bodyColor);
      }),
      events.on('orbitalStrike', (e) => {
        this.beamTimer = BEAM_TIME;
        this.beamMesh.position.set(e.x, 12, e.z);
      }),
    );

    // Default-Silhouetten (Menue-Backdrop zeigt sonst nichts)
    const firstHero = HEROES[0];
    if (firstHero) {
      this.setHero(firstHero);
      this.setHero(firstHero, undefined, 1);
    }
  }

  /** Baut eine komplette Spieler-Figur (einmalig im Konstruktor). */
  private buildFigure(): PlayerFigure {
    const assets = this.assets;
    const scene = this.scene;
    const bodyMat = assets.makeGlow(0x00e5ff, 1.9);
    const engineMat = assets.makeGlowTransparent(0xbff8ff, 2.6, 0.8, true);
    const group = new Group();
    const parts: Mesh[] = [];
    for (let i = 0; i < HERO_PART_SLOTS; i++) {
      const part = new Mesh(assets.geoPlayerBody, bodyMat);
      part.visible = false;
      group.add(part);
      parts.push(part);
    }
    const ring = new Mesh(assets.geoPlayerRing, assets.makeGlow(0xffffff, 1.4));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25;
    group.add(ring);
    group.visible = false;
    scene.add(group);
    const blob = new Mesh(assets.geoBlob, assets.matBlob);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    blob.visible = false;
    scene.add(blob);

    // Spiegelklon (legendaeres Upgrade): transluzenter Geist hinter dem Spieler
    const cloneGroup = new Group();
    const cloneBodyMat = assets.makeGlowTransparent(0x00e5ff, 1.6, 0.35, true);
    const cloneParts: Mesh[] = [];
    for (let i = 0; i < HERO_PART_SLOTS; i++) {
      const part = new Mesh(assets.geoPlayerBody, cloneBodyMat);
      part.visible = false;
      cloneGroup.add(part);
      cloneParts.push(part);
    }
    const cloneRing = new Mesh(assets.geoPlayerRing, assets.makeGlowTransparent(0xffffff, 1.2, 0.22, true));
    cloneRing.rotation.x = Math.PI / 2;
    cloneRing.position.y = 0.25;
    cloneGroup.add(cloneRing);
    cloneGroup.visible = false;
    scene.add(cloneGroup);

    // Dash-Afterimages: 3 gepoolte Geister mit eigenem Fade-Material.
    // Euler-Order YXZ: erst Yaw, dann Kippen — wie die Spieler-Group-
    // Komposition; mit Default-XYZ zeigten die Kegel immer nach Welt-+Z.
    const ghostMeshes: Mesh[] = [];
    const ghostMats: MeshBasicMaterial[] = [];
    const ghostLife: number[] = [];
    for (let i = 0; i < GHOST_COUNT; i++) {
      const mat = assets.makeGlowTransparent(0x00e5ff, 1.6, 0.5, true);
      const ghost = new Mesh(assets.geoPlayerBody, mat);
      ghost.rotation.order = 'YXZ';
      ghost.rotation.x = Math.PI / 2;
      ghost.visible = false;
      scene.add(ghost);
      ghostMeshes.push(ghost);
      ghostMats.push(mat);
      ghostLife.push(0);
    }

    // Schutz-Orbs (pro Figur eigene — im Koop kreisen beide Wolken)
    const orbMeshes: Mesh[] = [];
    for (let k = 0; k < MAX_ORBS; k++) {
      const orb = new Mesh(assets.geoOrb, assets.matOrb);
      orb.visible = false;
      scene.add(orb);
      orbMeshes.push(orb);
    }

    // Koop-Down: Zonen-Ring ("hier hinstellen") + goldener Fortschritts-Ring
    const zoneMat = assets.makeGlowTransparent(0xffffff, 1.2, 0.35, true);
    const reviveZone = new Mesh(assets.geoRing, zoneMat);
    reviveZone.rotation.x = -Math.PI / 2;
    reviveZone.position.y = 0.04;
    reviveZone.scale.setScalar(COOP.revive.radius);
    reviveZone.visible = false;
    scene.add(reviveZone);
    const reviveProgMat = assets.makeGlowTransparent(0xffc83d, 1.8, 0.6, true);
    const reviveProg = new Mesh(assets.geoRing, reviveProgMat);
    reviveProg.rotation.x = -Math.PI / 2;
    reviveProg.position.y = 0.05;
    reviveProg.visible = false;
    scene.add(reviveProg);

    return {
      group, parts, ring, blob, cloneGroup, cloneParts,
      bodyMat, engineMat, cloneBodyMat,
      ringBase: 1, ghostRotX: Math.PI / 2, ghostY: 0.55,
      ghostMeshes, ghostMats, ghostLife, ghostCursor: 0, ghostSpawnTimer: 0,
      orbMeshes, reviveZone, reviveProg, reviveProgMat,
      bodyColor: 0x00e5ff,
      animatedColorway: false,
    };
  }

  private heroGeo(key: HeroPartGeo) {
    const a = this.assets;
    switch (key) {
      case 'coneHull': return a.geoPlayerBody;
      case 'dartHull': return a.geoHeroDartHull;
      case 'wedgeHull': return a.geoHeroWedgeHull;
      case 'fin': return a.geoHeroFin;
      case 'wing': return a.geoHeroWing;
      case 'shoulder': return a.geoHeroShoulder;
      case 'engine': return a.geoHeroEngine;
    }
  }

  /**
   * Held fuer eine Figur setzen: eigene Silhouette (Part-Slots) + Farben
   * fuer Figur, Spiegelklon, Dash-Geister, Projektil-Trails — alles
   * allokationsfrei (Geometrie-Tausch). Optionale Farbvariante aus dem
   * Sticker-Album uebersteuert Rumpf-/Trail-/Triebwerksfarbe.
   */
  setHero(hero: HeroDef, colorway?: ColorwayDef, figureIdx: 0 | 1 = 0): void {
    const fig = this.figures[figureIdx];
    if (!fig) return;
    const shape = (HERO_SHAPES[hero.id] ?? HERO_SHAPES.volt) as HeroShape;
    const body = colorway?.body ?? hero.color;
    const engine = colorway?.engine ?? shape.engineColor;
    fig.bodyColor = body;
    fig.animatedColorway = !!colorway?.animated;
    fig.bodyMat.color.set(body).multiplyScalar(1.9);
    fig.cloneBodyMat.color.set(body).multiplyScalar(1.6);
    for (const mat of fig.ghostMats) mat.color.set(body).multiplyScalar(1.6);
    fig.engineMat.color.set(engine).multiplyScalar(shape.engineIntensity);
    (this.streakColors[figureIdx] as Color).set(body).multiplyScalar(1.8);
    fig.ringBase = shape.ringScale;
    fig.blob.scale.setScalar(shape.blobScale);
    fig.ghostRotX = shape.hullRotX;
    fig.ghostY = shape.hullY;

    // Dash-Geister zeigen nur den Rumpf (parts[0]) des aktiven Helden
    const hull = shape.parts[0];
    if (hull) {
      const hullGeo = this.heroGeo(hull.geo);
      for (const ghost of fig.ghostMeshes) ghost.geometry = hullGeo;
    }

    const apply = (slots: Mesh[], isClone: boolean): void => {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i] as Mesh;
        const part = shape.parts[i];
        // Der Geist braucht kein Triebwerk (spart ein Material)
        if (!part || (isClone && part.mat === 'engine')) {
          slot.visible = false;
          continue;
        }
        slot.visible = true;
        slot.geometry = this.heroGeo(part.geo);
        slot.position.set(part.x, part.y, part.z);
        slot.rotation.set(part.rotX ?? 0, part.rotY ?? 0, part.rotZ ?? 0);
        if (part.sx !== undefined) slot.scale.set(part.sx, part.sy ?? 1, part.sz ?? 1);
        else slot.scale.setScalar(part.scale ?? 1);
        slot.material = part.mat === 'engine'
          ? fig.engineMat
          : (isClone ? fig.cloneBodyMat : fig.bodyMat);
      }
    };
    apply(fig.parts, false);
    apply(fig.cloneParts, true);
  }

  /**
   * Regenbogen-Farbvariante („prismatisch"): faerbt betroffene Figuren pro
   * Frame neu — Rumpf (via bodyColor -> renderPlayer), Klon, Dash-Geister und
   * Projektil-Trail. Laeuft in Menue-Vorschau UND im Spiel.
   */
  private updateAnimatedColorways(rawDt: number): void {
    this.fxTime += rawDt;
    for (let i = 0; i < this.figures.length; i++) {
      const fig = this.figures[i];
      if (!fig?.animatedColorway) continue;
      const hue = (this.fxTime * 0.12) % 1;
      this.animColor.setHSL(hue, 0.9, 0.58);
      fig.bodyColor = this.animColor.getHex(); // renderPlayer setzt bodyMat/Muzzle daraus
      fig.cloneBodyMat.color.copy(this.animColor).multiplyScalar(1.6);
      for (const m of fig.ghostMats) m.color.copy(this.animColor).multiplyScalar(1.6);
      (this.streakColors[i] as Color).copy(this.animColor).multiplyScalar(1.8);
    }
  }

  /** simRunning=false (Pause/Upgrade/Menue): keine neuen Dash-Ghosts spawnen. */
  render(world: World, alpha: number, rawDt: number, simRunning = true): void {
    this.updateAnimatedColorways(rawDt);
    this.renderEnemies(world, alpha);
    this.renderProjectiles(world, alpha);
    this.renderPickups(world, alpha);
    this.renderPlayer(world, alpha, rawDt, simRunning);
    this.renderBoss(world, alpha);
    this.renderMuzzle(world, rawDt);
    this.renderBeam(rawDt);
  }

  private renderEnemies(world: World, alpha: number): void {
    const counters = new Array<number>(this.enemyMeshes.length).fill(0);
    let eliteIdx = 0;
    const pool = world.enemies;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.get(i);
      const def = ENEMIES[e.type] as EnemyDef;
      const mesh = this.enemyMeshes[e.type] as InstancedMesh;
      const idx = counters[e.type] as number;
      if (idx >= 192) continue;
      counters[e.type] = idx + 1;

      const x = lerp(e.prevX, e.x, alpha);
      const z = lerp(e.prevZ, e.z, alpha);
      const bob = Math.sin(world.elapsed * 5 + e.bobPhase) * (def.id === 'tank' ? 0.03 : 0.1);
      let scale = def.scale * (1 + e.scalePop);
      if (e.spawnProtection > 0) scale *= Math.max(0.3, 1 - e.spawnProtection * 1.5);
      const isElite = e.eliteAffix > 0;
      if (isElite) {
        // sichtbar groesser + leichter Puls (kein Strobe)
        scale *= ELITE.visualScale * (1 + 0.05 * Math.sin(world.elapsed * 6 + e.bobPhase));
      }
      dummy.position.set(x, e.radius + 0.25 + bob, z);
      dummy.rotation.set(0, e.yRot, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      // Weiss-Flash bei Treffern; Eliten gleissen heller, Schild toent kalt
      const baseColor = isElite
        ? (e.shieldHp > 0 ? shieldColor : (this.assets.eliteColors[e.type] as Color))
        : (this.assets.enemyColors[e.type] as Color);
      mesh.setColorAt(idx, e.flashTimer > 0 ? flashColor : baseColor);

      // Goldener Boden-Ring markiert Eliten
      if (isElite && eliteIdx < ELITE_RING_CAP) {
        const pulse = 1 + 0.08 * Math.sin(world.elapsed * 6 + e.bobPhase);
        dummy.position.set(x, 0.04, z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.setScalar(e.radius * 2.4 * pulse);
        dummy.updateMatrix();
        this.eliteRings.setMatrixAt(eliteIdx, dummy.matrix);
        eliteIdx++;
      }
    }
    for (let t = 0; t < this.enemyMeshes.length; t++) {
      const mesh = this.enemyMeshes[t] as InstancedMesh;
      mesh.count = counters[t] as number;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.eliteRings.count = eliteIdx;
    this.eliteRings.instanceMatrix.needsUpdate = true;
  }

  private renderProjectiles(world: World, alpha: number): void {
    let streakIdx = 0;

    const pp = world.playerProjectiles;
    // NEU: Prisma-Salve-Kugeln laufen ueber ein eigenes Mesh (Regenbogen-instanceColor).
    let normalIdx = 0;
    let prismIdx = 0;
    for (let i = 0; i < pp.count; i++) {
      const p = pp.get(i);
      const x = lerp(p.prevX, p.x, alpha);
      const z = lerp(p.prevZ, p.z, alpha);
      // Mega-Kugeln: Kollisionsradius treibt die sichtbare Groesse
      const rScale = p.radius / UV.projectileRadiusBase;
      dummy.position.set(x, 0.6, z);
      const s = rScale * (p.boomerang ? 1.6 : 1);
      dummy.rotation.set(0, p.boomerang ? world.elapsed * 20 : 0, 0);
      // leichte Streckung in Flugrichtung
      dummy.scale.set(s, s, s * 1.4);
      if (!p.boomerang) dummy.rotation.y = Math.atan2(p.vx, p.vz);
      dummy.updateMatrix();
      if (p.prism) {
        // Regenbogen: HSL-Zyklus + Index-Versatz -> bunt gemischte Kugeln; HDR (>1) fuer Bloom.
        prismColor.setHSL((this.fxTime * PRISM_HUE_SPEED + i * 0.08) % 1, 0.95, 0.6).multiplyScalar(2);
        this.prismProj.setMatrixAt(prismIdx, dummy.matrix);
        this.prismProj.setColorAt(prismIdx, prismColor);
        prismIdx++;
        streakIdx = this.writeStreak(streakIdx, p.vx, p.vz, x, z, rScale, prismColor);
      } else {
        this.playerProj.setMatrixAt(normalIdx, dummy.matrix);
        normalIdx++;
        streakIdx = this.writeStreak(
          streakIdx, p.vx, p.vz, x, z, rScale,
          (this.streakColors[p.ownerIdx] ?? this.streakColors[0]) as Color,
        );
      }
    }
    this.playerProj.count = normalIdx;
    this.playerProj.instanceMatrix.needsUpdate = true;
    this.prismProj.count = prismIdx;
    this.prismProj.instanceMatrix.needsUpdate = true;
    if (this.prismProj.instanceColor) this.prismProj.instanceColor.needsUpdate = true;

    const ep = world.enemyProjectiles;
    for (let i = 0; i < ep.count; i++) {
      const p = ep.get(i);
      const x = lerp(p.prevX, p.x, alpha);
      const z = lerp(p.prevZ, p.z, alpha);
      dummy.position.set(x, 0.6, z);
      const pulse = 1 + 0.15 * Math.sin(world.elapsed * 14 + i);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(pulse);
      dummy.updateMatrix();
      this.enemyProj.setMatrixAt(i, dummy.matrix);
      // rote Streaks verbessern die Ausweich-Lesbarkeit
      streakIdx = this.writeStreak(streakIdx, p.vx, p.vz, x, z, 1, streakColorEnemy);
    }
    this.enemyProj.count = ep.count;
    this.enemyProj.instanceMatrix.needsUpdate = true;

    this.streaks.count = streakIdx;
    this.streaks.instanceMatrix.needsUpdate = true;
    if (this.streaks.instanceColor) this.streaks.instanceColor.needsUpdate = true;
  }

  /** Streak hinter dem Projektil, laengenskaliert mit dem Tempo. */
  private writeStreak(
    idx: number,
    vx: number,
    vz: number,
    x: number,
    z: number,
    thickness: number,
    color: Color,
  ): number {
    if (idx >= STREAK_CAP) return idx;
    const speed = Math.hypot(vx, vz);
    if (speed < 0.01) return idx;
    const len = Math.min(Math.max(speed * 0.05, 0.4), 1.5);
    const inv = 1 / speed;
    dummy.position.set(x - vx * inv * (len / 2 + 0.15), 0.6, z - vz * inv * (len / 2 + 0.15));
    dummy.rotation.set(0, Math.atan2(vx, vz), 0);
    dummy.scale.set(thickness, thickness, len);
    dummy.updateMatrix();
    this.streaks.setMatrixAt(idx, dummy.matrix);
    this.streaks.setColorAt(idx, color);
    return idx + 1;
  }

  private renderPickups(world: World, alpha: number): void {
    const counters = new Array<number>(this.pickupMeshes.length).fill(0);
    const pool = world.pickups;
    for (let i = 0; i < pool.count; i++) {
      const p = pool.get(i);
      const mesh = this.pickupMeshes[p.kind] as InstancedMesh;
      const idx = counters[p.kind] as number;
      if (idx >= 256) continue;

      // Ablaufende Pickups (Herzen, Kapseln) blinken die letzten Sekunden
      if (p.lifetime > 0) {
        const remaining = p.lifetime - p.age;
        if (remaining < PICKUPS.heartBlinkTime && Math.sin(p.age * 16) < -0.2) continue;
      }
      counters[p.kind] = idx + 1;

      const bob = Math.sin(world.elapsed * 4 + p.bobPhase) * 0.12;
      dummy.position.set(lerp(p.prevX, p.x, alpha), 0.45 + bob, lerp(p.prevZ, p.z, alpha));
      dummy.rotation.set(0, world.elapsed * 2 + p.bobPhase, p.kind === PICKUP_CORE ? 0.6 : 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    }
    for (let k = 0; k < this.pickupMeshes.length; k++) {
      const mesh = this.pickupMeshes[k] as InstancedMesh;
      mesh.count = counters[k] as number;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private renderPlayer(world: World, alpha: number, rawDt: number, simRunning: boolean): void {
    for (let fi = 0; fi < MAX_FIGURES; fi++) {
      const fig = this.figures[fi] as PlayerFigure;
      const p = world.players[fi];
      // Figur 2 nur im Koop; in der Menue-Vorschau nur Figur 1
      const inUse = !!p && !(fi > 0 && this.heroPreview);
      if (!p || !inUse) {
        this.hideFigure(fig);
        continue;
      }
      this.renderFigure(fig, fi, p, world, alpha, rawDt, simRunning);
    }
  }

  private hideFigure(fig: PlayerFigure): void {
    fig.group.visible = false;
    fig.blob.visible = false;
    fig.cloneGroup.visible = false;
    fig.reviveZone.visible = false;
    fig.reviveProg.visible = false;
    for (const o of fig.orbMeshes) o.visible = false;
  }

  private renderFigure(
    fig: PlayerFigure,
    fi: number,
    p: World['players'][number],
    world: World,
    alpha: number,
    rawDt: number,
    simRunning: boolean,
  ): void {
    const x = lerp(p.prevX, p.x, alpha);
    const z = lerp(p.prevZ, p.z, alpha);
    fig.group.position.set(x, 0, z);
    fig.group.rotation.y = Math.atan2(p.faceX, p.faceZ);
    // Dash: Streckung in Bewegungsrichtung
    const stretch = p.isDashing ? 1.35 : 1;
    fig.group.scale.set(1, 1, stretch);
    // dezenter Idle-Puls des Neon-Rings (ringBase = Helden-Skalierung)
    fig.ring.scale.setScalar(fig.ringBase * (1 + 0.04 * Math.sin(world.elapsed * 3)));
    // Triebwerks-Flackern: beim Dash volle Flamme
    fig.engineMat.opacity = p.isDashing ? 1.0 : 0.6 + 0.2 * Math.sin(world.elapsed * 22);

    // Koop-Down: Figur kippt, sinkt und dimmt; Triebwerk aus;
    // Zonen-Ring zeigt Kindern "hier hinstellen", Gold-Ring den Fortschritt.
    // heroPreview (Menue nach Koop-Game-Over): Figur steht IMMER aufrecht
    if (p.downed && !this.heroPreview) {
      fig.group.rotation.x = 1.15;
      fig.group.position.y = -0.2;
      fig.bodyMat.color.set(fig.bodyColor).multiplyScalar(0.55);
      fig.engineMat.opacity = 0;
      fig.reviveZone.position.set(x, 0.04, z);
      fig.reviveZone.visible = true;
      const prog = this.reviveProgress[fi as 0 | 1];
      fig.reviveProg.position.set(x, 0.05, z);
      fig.reviveProg.scale.setScalar(Math.max(0.001, COOP.revive.radius * prog));
      fig.reviveProgMat.opacity = 0.65 * this.fxIntensity;
      fig.reviveProg.visible = prog > 0.01;
    } else {
      fig.group.rotation.x = 0;
      fig.group.position.y = 0;
      fig.bodyMat.color.set(fig.bodyColor).multiplyScalar(1.9);
      fig.reviveZone.visible = false;
      fig.reviveProg.visible = false;
    }

    // Unverwundbarkeits-Blinken: 8 Hz, 60 % sichtbar.
    // Helden-Vorschau im Menue: immer sichtbar (alive vom letzten Run egal)
    let visible = this.heroPreview || p.alive;
    if (!this.heroPreview && p.alive && !p.downed && p.iFrames > 0 && !p.isDashing) {
      visible = (world.elapsed * 8) % 1 < 0.6;
    }
    fig.group.visible = visible;
    fig.blob.position.set(x, 0.02, z);
    fig.blob.visible = this.heroPreview || p.alive;

    // Spiegelklon: Geist spiegelverkehrt hinter dem Spieler
    // (in die Arena geclampt, wie der Feuer-Ursprung im CombatSystem);
    // in der Menue-Vorschau nie (Run-Rest des letzten Builds)
    const hasClone = !this.heroPreview && p.targetable && p.stats.cloneDamageFrac > 0;
    fig.cloneGroup.visible = hasClone;
    if (hasClone) {
      let cx = x - p.faceX * UV.mirrorCloneOffset;
      let cz = z - p.faceZ * UV.mirrorCloneOffset;
      const cd = Math.hypot(cx, cz);
      const maxR = ARENA_RADIUS - 0.5;
      if (cd > maxR) {
        cx = (cx / cd) * maxR;
        cz = (cz / cd) * maxR;
      }
      fig.cloneGroup.position.set(cx, 0, cz);
      fig.cloneGroup.rotation.y = fig.group.rotation.y;
    }

    // Dash-Afterimages: waehrend des Dashs alle 40 ms ein Schnappschuss
    // (nur bei laufender Sim — sonst pulsiert es hinter dem Pause-Screen)
    fig.ghostSpawnTimer -= rawDt;
    if (simRunning && p.targetable && p.isDashing && fig.ghostSpawnTimer <= 0) {
      fig.ghostSpawnTimer = 0.04;
      const ghost = fig.ghostMeshes[fig.ghostCursor] as Mesh;
      ghost.position.set(x, fig.ghostY, z);
      ghost.rotation.set(fig.ghostRotX, fig.group.rotation.y, 0);
      ghost.visible = true;
      fig.ghostLife[fig.ghostCursor] = GHOST_LIFE;
      fig.ghostCursor = (fig.ghostCursor + 1) % GHOST_COUNT;
    }
    for (let i = 0; i < GHOST_COUNT; i++) {
      const life = fig.ghostLife[i] as number;
      if (life <= 0) continue;
      const next = life - rawDt;
      fig.ghostLife[i] = next;
      const ghost = fig.ghostMeshes[i] as Mesh;
      if (next <= 0) {
        ghost.visible = false;
      } else {
        (fig.ghostMats[i] as MeshBasicMaterial).opacity = 0.5 * (next / GHOST_LIFE) * this.fxIntensity;
      }
    }

    // Schutz-Orbs (in der Menue-Vorschau ausgeblendet)
    const orbCount = this.heroPreview || p.downed ? 0 : Math.min(p.stats.orbCount, MAX_ORBS);
    for (let k = 0; k < MAX_ORBS; k++) {
      const orb = fig.orbMeshes[k] as Mesh;
      if (k < orbCount && p.alive) {
        const angle = p.orbAngle + (k / orbCount) * Math.PI * 2;
        orb.position.set(
          x + Math.cos(angle) * UV.orbRadius,
          0.7 + Math.sin(world.elapsed * 6 + k) * 0.1,
          z + Math.sin(angle) * UV.orbRadius,
        );
        orb.visible = true;
      } else {
        orb.visible = false;
      }
    }
  }

  private renderBoss(world: World, alpha: number): void {
    const boss = world.boss;
    for (const [id, group] of this.bossGroups) {
      const active = !!boss && boss.alive && boss.def.id === id && !boss.hidden;
      group.visible = active;
      if (active && boss) {
        const x = lerp(boss.prevX, boss.x, alpha);
        const z = lerp(boss.prevZ, boss.z, alpha);
        const hover = 1.4 + Math.sin(world.elapsed * 2) * 0.15;
        group.position.set(x, hover, z);
        group.rotation.y = boss.yRot;
        let scale = 1 + boss.scalePop;
        if (boss.telegraphGlow > 0) scale *= 1 + 0.06 * Math.sin(world.elapsed * 30);
        group.scale.setScalar(scale);
        const wireMat = this.bossWireMats.get(id);
        if (wireMat) wireMat.opacity = boss.flashTimer > 0 ? 0.9 : boss.phase2 ? 0.35 : 0.15;
      }
    }

    // Minis
    for (let i = 0; i < this.miniMeshes.length; i++) {
      const mesh = this.miniMeshes[i] as Mesh;
      const m = boss?.minis[i];
      const active = !!boss && !!m && m.active && m.hp > 0;
      mesh.visible = active;
      if (active && m) {
        mesh.position.set(
          lerp(m.prevX, m.x, alpha),
          0.8 + Math.sin(world.elapsed * 5 + i * 2) * 0.15,
          lerp(m.prevZ, m.z, alpha),
        );
        mesh.scale.setScalar(1.5 * (1 + m.scalePop));
      }
    }
  }

  private renderMuzzle(world: World, rawDt: number): void {
    void world;
    if (this.muzzleTimer > 0) {
      // Position setzt der shotFired-Handler (Koop: am jeweiligen Schuetzen)
      this.muzzleTimer -= rawDt;
      this.muzzle.intensity = 3 * Math.max(0, this.muzzleTimer / 0.05);
    } else {
      this.muzzle.intensity = 0;
    }
  }

  /** Orbital-Laser-Saeule: kurz sichtbar, dann ausblenden. */
  private renderBeam(rawDt: number): void {
    if (this.beamTimer <= 0) {
      this.beamMesh.visible = false;
      return;
    }
    this.beamTimer -= rawDt;
    const t = Math.max(0, this.beamTimer / BEAM_TIME);
    this.beamMesh.visible = t > 0;
    this.beamMesh.scale.set(1 + (1 - t) * 0.6, 24, 1 + (1 - t) * 0.6);
    this.beamMat.opacity = 0.7 * t;
  }

  reset(): void {
    for (const mesh of this.enemyMeshes) mesh.count = 0;
    this.playerProj.count = 0;
    this.enemyProj.count = 0;
    this.streaks.count = 0;
    this.eliteRings.count = 0;
    for (const mesh of this.pickupMeshes) mesh.count = 0;
    for (const group of this.bossGroups.values()) group.visible = false;
    for (const m of this.miniMeshes) m.visible = false;
    for (const fig of this.figures) {
      this.hideFigure(fig);
      for (let i = 0; i < GHOST_COUNT; i++) {
        fig.ghostLife[i] = 0;
        (fig.ghostMeshes[i] as Mesh).visible = false;
      }
      fig.ghostSpawnTimer = 0;
    }
    this.reviveProgress[0] = 0;
    this.reviveProgress[1] = 0;
    this.beamTimer = 0;
    this.beamMesh.visible = false;
    this.prismProj.count = 0; // NEU (mythisch "Prisma-Salve")
    this.muzzleTimer = 0;
    this.muzzle.intensity = 0;
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    for (const mesh of this.enemyMeshes) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.playerProj.dispose();
    this.enemyProj.dispose();
    this.streaks.dispose();
    this.eliteRings.dispose();
    for (const mesh of this.pickupMeshes) mesh.dispose();
  }
}
