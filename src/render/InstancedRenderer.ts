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
import { ARENA_RADIUS, PICKUPS } from '../config/balance';
import { UPGRADE_VALUES as UV } from '../config/upgrades';
import { PICKUP_CORE } from '../entities/Pickup';
import type { World } from '../core/World';
import type { EventBus } from '../core/EventBus';
import type { AssetRegistry } from './AssetRegistry';
import { lerp } from '../utils/math';

const dummy = new Object3D();
const flashColor = new Color(5, 5, 5);
/** Elite-Schild aktiv: kalt-weisse Tönung statt Typfarbe. */
const shieldColor = new Color(2.2, 3.2, 3.8);
const streakColorPlayer = new Color(0x00e5ff).multiplyScalar(1.8);
const streakColorEnemy = new Color(0xff3b30).multiplyScalar(1.6);
const MAX_ORBS = 3;
const STREAK_CAP = 384;
const ELITE_RING_CAP = 64;
const GHOST_COUNT = 3;
const GHOST_LIFE = 0.25;
const BEAM_TIME = 0.35;

/**
 * Schreibt pro Frame die Optik aller dynamischen Entities:
 * InstancedMeshes fuer Gegner (1 pro Typ), Projektile + Streaks, Pickups,
 * Elite-Ringe — plus Spieler-, Klon-, Boss- und Mini-Meshes. Alles wird
 * einmalig gebaut, Sichtbarkeit/Matrizen werden nur noch geschrieben.
 */
export class InstancedRenderer {
  /** "Effekte reduzieren" daempft Ghost-/Klon-Transparenzen. */
  fxIntensity = 1;

  private readonly enemyMeshes: InstancedMesh[] = [];
  private readonly playerProj: InstancedMesh;
  private readonly enemyProj: InstancedMesh;
  private readonly streaks: InstancedMesh;
  private readonly eliteRings: InstancedMesh;
  private readonly pickupMeshes: InstancedMesh[] = [];
  private readonly orbMeshes: Mesh[] = [];
  private readonly playerGroup: Group;
  private readonly playerRing: Mesh;
  private readonly playerBlob: Mesh;
  private readonly cloneGroup: Group;
  private readonly cloneBodyMat: MeshBasicMaterial;
  private readonly bossGroups = new Map<string, Group>();
  private readonly bossWireMats = new Map<string, MeshBasicMaterial>();
  private readonly miniMeshes: Mesh[] = [];
  private readonly ghostMeshes: Mesh[] = [];
  private readonly ghostMats: MeshBasicMaterial[] = [];
  private readonly ghostLife: number[] = [];
  private ghostCursor = 0;
  private ghostSpawnTimer = 0;
  private readonly beamMesh: Mesh;
  private readonly beamMat: MeshBasicMaterial;
  private beamTimer = 0;
  private readonly muzzle: PointLight;
  private muzzleTimer = 0;
  private readonly unsubs: Array<() => void> = [];

  constructor(
    private readonly scene: Scene,
    private readonly assets: AssetRegistry,
    events: EventBus,
    heroColor: number,
  ) {
    // Gegner: ein InstancedMesh pro Typ (eigene Form, Farbe via instanceColor)
    for (const def of ENEMIES) {
      const mesh = new InstancedMesh(assets.geometryFor(def.shape), assets.matEnemy, 192);
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

    this.playerProj = new InstancedMesh(assets.geoPlayerProjectile, assets.matPlayerProjectile, 256);
    this.enemyProj = new InstancedMesh(assets.geoEnemyProjectile, assets.matEnemyProjectile, 128);
    for (const m of [this.playerProj, this.enemyProj]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }

    // Projektil-Streaks: EIN additives Mesh fuer Spieler (cyan) + Gegner (rot)
    this.streaks = new InstancedMesh(assets.geoStreak, assets.matStreak, STREAK_CAP);
    this.streaks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.streaks.setColorAt(0, streakColorPlayer);
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

    // Schutz-Orbs
    for (let k = 0; k < MAX_ORBS; k++) {
      const orb = new Mesh(assets.geoOrb, assets.matOrb);
      orb.visible = false;
      scene.add(orb);
      this.orbMeshes.push(orb);
    }

    // Spieler: Pfeilspitze + Neon-Ring + Blob-Schatten
    this.playerGroup = new Group();
    const body = new Mesh(assets.geoPlayerBody, assets.makeGlow(heroColor, 1.9));
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.55;
    this.playerRing = new Mesh(assets.geoPlayerRing, assets.makeGlow(0xffffff, 1.4));
    this.playerRing.rotation.x = Math.PI / 2;
    this.playerRing.position.y = 0.25;
    this.playerGroup.add(body, this.playerRing);
    scene.add(this.playerGroup);
    this.playerBlob = new Mesh(assets.geoBlob, assets.matBlob);
    this.playerBlob.rotation.x = -Math.PI / 2;
    this.playerBlob.position.y = 0.02;
    scene.add(this.playerBlob);

    // Spiegelklon (legendaeres Upgrade): transluzenter Geist hinter dem Spieler
    this.cloneGroup = new Group();
    this.cloneBodyMat = assets.makeGlowTransparent(heroColor, 1.6, 0.35, true);
    const cloneBody = new Mesh(assets.geoPlayerBody, this.cloneBodyMat);
    cloneBody.rotation.x = Math.PI / 2;
    cloneBody.position.y = 0.55;
    const cloneRing = new Mesh(assets.geoPlayerRing, assets.makeGlowTransparent(0xffffff, 1.2, 0.22, true));
    cloneRing.rotation.x = Math.PI / 2;
    cloneRing.position.y = 0.25;
    this.cloneGroup.add(cloneBody, cloneRing);
    this.cloneGroup.visible = false;
    scene.add(this.cloneGroup);

    // Dash-Afterimages: 3 gepoolte Geister mit eigenem Fade-Material.
    // Euler-Order YXZ: erst Yaw, dann Kippen — wie die Spieler-Group-
    // Komposition; mit Default-XYZ zeigten die Kegel immer nach Welt-+Z.
    for (let i = 0; i < GHOST_COUNT; i++) {
      const mat = assets.makeGlowTransparent(heroColor, 1.6, 0.5, true);
      const ghost = new Mesh(assets.geoPlayerBody, mat);
      ghost.rotation.order = 'YXZ';
      ghost.rotation.x = Math.PI / 2;
      ghost.visible = false;
      scene.add(ghost);
      this.ghostMeshes.push(ghost);
      this.ghostMats.push(mat);
      this.ghostLife.push(0);
    }

    // Orbital-Laser: goldener Saeulen-Beam
    this.beamMat = assets.makeGlowTransparent(0xffc83d, 2.2, 0.7, true);
    this.beamMesh = new Mesh(assets.geoBeam, this.beamMat);
    this.beamMesh.visible = false;
    scene.add(this.beamMesh);

    // Bosse: alle 3 vorbauen, Sichtbarkeit wird getoggelt
    for (const def of BOSS_ROTATION) {
      const group = new Group();
      const main = new Mesh(assets.geometryFor(def.shape), assets.makeGlow(def.color, 1.7));
      main.scale.setScalar(def.scale);
      const wireMat = assets.makeGlowTransparent(0xffffff, 2.2, 0.15);
      const wire = new Mesh(assets.geometryFor(def.shape), wireMat);
      wire.scale.setScalar(def.scale * 1.02);
      (wire.material as MeshBasicMaterial).wireframe = true;
      const blob = new Mesh(assets.geoBlob, assets.matBlob);
      blob.rotation.x = -Math.PI / 2;
      blob.scale.setScalar(def.radius * 2.2);
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

    // Muzzle-Flash: EIN gepooltes PointLight, Timer wird nur zurueckgesetzt
    this.muzzle = new PointLight(0x00e5ff, 0, 6);
    scene.add(this.muzzle);
    this.unsubs.push(
      events.on('shotFired', () => {
        this.muzzleTimer = 0.05;
      }),
      events.on('orbitalStrike', (e) => {
        this.beamTimer = BEAM_TIME;
        this.beamMesh.position.set(e.x, 12, e.z);
      }),
    );
  }

  /** Heldenfarbe beim Runstart setzen (Spieler, Klon, Dash-Geister). */
  setHeroColor(color: number): void {
    const body = this.playerGroup.children[0] as Mesh;
    (body.material as MeshBasicMaterial).color.set(color).multiplyScalar(1.9);
    this.cloneBodyMat.color.set(color).multiplyScalar(1.6);
    for (const mat of this.ghostMats) mat.color.set(color).multiplyScalar(1.6);
  }

  /** simRunning=false (Pause/Upgrade/Menue): keine neuen Dash-Ghosts spawnen. */
  render(world: World, alpha: number, rawDt: number, simRunning = true): void {
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
      this.playerProj.setMatrixAt(i, dummy.matrix);
      streakIdx = this.writeStreak(streakIdx, p.vx, p.vz, x, z, rScale, streakColorPlayer);
    }
    this.playerProj.count = pp.count;
    this.playerProj.instanceMatrix.needsUpdate = true;

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
    const p = world.player;
    const x = lerp(p.prevX, p.x, alpha);
    const z = lerp(p.prevZ, p.z, alpha);
    this.playerGroup.position.set(x, 0, z);
    this.playerGroup.rotation.y = Math.atan2(p.faceX, p.faceZ);
    // Dash: Streckung in Bewegungsrichtung
    const stretch = p.isDashing ? 1.35 : 1;
    this.playerGroup.scale.set(1, 1, stretch);
    // dezenter Idle-Puls des Neon-Rings
    this.playerRing.scale.setScalar(1 + 0.04 * Math.sin(world.elapsed * 3));

    // Unverwundbarkeits-Blinken: 8 Hz, 60 % sichtbar
    let visible = p.alive;
    if (p.alive && p.iFrames > 0 && !p.isDashing) {
      visible = (world.elapsed * 8) % 1 < 0.6;
    }
    this.playerGroup.visible = visible;
    this.playerBlob.position.set(x, 0.02, z);
    this.playerBlob.visible = p.alive;

    // Spiegelklon: Geist spiegelverkehrt hinter dem Spieler
    // (in die Arena geclampt, wie der Feuer-Ursprung im CombatSystem)
    const hasClone = p.alive && p.stats.cloneDamageFrac > 0;
    this.cloneGroup.visible = hasClone;
    if (hasClone) {
      let cx = x - p.faceX * UV.mirrorCloneOffset;
      let cz = z - p.faceZ * UV.mirrorCloneOffset;
      const cd = Math.hypot(cx, cz);
      const maxR = ARENA_RADIUS - 0.5;
      if (cd > maxR) {
        cx = (cx / cd) * maxR;
        cz = (cz / cd) * maxR;
      }
      this.cloneGroup.position.set(cx, 0, cz);
      this.cloneGroup.rotation.y = this.playerGroup.rotation.y;
    }

    // Dash-Afterimages: waehrend des Dashs alle 40 ms ein Schnappschuss
    // (nur bei laufender Sim — sonst pulsiert es hinter dem Pause-Screen)
    this.ghostSpawnTimer -= rawDt;
    if (simRunning && p.alive && p.isDashing && this.ghostSpawnTimer <= 0) {
      this.ghostSpawnTimer = 0.04;
      const ghost = this.ghostMeshes[this.ghostCursor] as Mesh;
      ghost.position.set(x, 0.55, z);
      ghost.rotation.set(Math.PI / 2, this.playerGroup.rotation.y, 0);
      ghost.visible = true;
      this.ghostLife[this.ghostCursor] = GHOST_LIFE;
      this.ghostCursor = (this.ghostCursor + 1) % GHOST_COUNT;
    }
    for (let i = 0; i < GHOST_COUNT; i++) {
      const life = this.ghostLife[i] as number;
      if (life <= 0) continue;
      const next = life - rawDt;
      this.ghostLife[i] = next;
      const ghost = this.ghostMeshes[i] as Mesh;
      if (next <= 0) {
        ghost.visible = false;
      } else {
        (this.ghostMats[i] as MeshBasicMaterial).opacity = 0.5 * (next / GHOST_LIFE) * this.fxIntensity;
      }
    }

    // Schutz-Orbs
    const orbCount = Math.min(p.stats.orbCount, MAX_ORBS);
    for (let k = 0; k < MAX_ORBS; k++) {
      const orb = this.orbMeshes[k] as Mesh;
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
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= rawDt;
      const p = world.player;
      this.muzzle.position.set(p.x + p.faceX * 0.9, 0.7, p.z + p.faceZ * 0.9);
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
    for (const o of this.orbMeshes) o.visible = false;
    this.cloneGroup.visible = false;
    for (let i = 0; i < GHOST_COUNT; i++) {
      this.ghostLife[i] = 0;
      (this.ghostMeshes[i] as Mesh).visible = false;
    }
    this.ghostSpawnTimer = 0;
    this.beamTimer = 0;
    this.beamMesh.visible = false;
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
