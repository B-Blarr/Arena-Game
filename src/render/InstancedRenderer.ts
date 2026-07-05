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
import { ENEMIES, type EnemyDef } from '../config/enemies';
import { BOSS_ROTATION } from '../config/bosses';
import { PICKUPS } from '../config/balance';
import { UPGRADE_VALUES as UV } from '../config/upgrades';
import { PICKUP_CORE, PICKUP_HEART } from '../entities/Pickup';
import type { World } from '../core/World';
import type { EventBus } from '../core/EventBus';
import type { AssetRegistry } from './AssetRegistry';
import { lerp } from '../utils/math';

const dummy = new Object3D();
const flashColor = new Color(5, 5, 5);
const MAX_ORBS = 3;

/**
 * Schreibt pro Frame die Optik aller dynamischen Entities:
 * InstancedMeshes fuer Gegner (1 pro Typ), Projektile, Pickups —
 * plus Spieler-, Boss- und Mini-Meshes. Alles wird einmalig gebaut,
 * Sichtbarkeit/Matrizen werden nur noch geschrieben (~15 Draw Calls).
 */
export class InstancedRenderer {
  private readonly enemyMeshes: InstancedMesh[] = [];
  private readonly playerProj: InstancedMesh;
  private readonly enemyProj: InstancedMesh;
  private readonly pickupMeshes: InstancedMesh[] = [];
  private readonly orbMeshes: Mesh[] = [];
  private readonly playerGroup: Group;
  private readonly playerBlob: Mesh;
  private readonly bossGroups = new Map<string, Group>();
  private readonly bossWireMats = new Map<string, MeshBasicMaterial>();
  private readonly miniMeshes: Mesh[] = [];
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

    const pickupGeos = [assets.geoCore, assets.geoHeart, assets.geoMagnet];
    const pickupMats = [assets.matCore, assets.matHeart, assets.matMagnet];
    for (let k = 0; k < 3; k++) {
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
    const ring = new Mesh(assets.geoPlayerRing, assets.makeGlow(0xffffff, 1.4));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25;
    this.playerGroup.add(body, ring);
    scene.add(this.playerGroup);
    this.playerBlob = new Mesh(assets.geoBlob, assets.matBlob);
    this.playerBlob.rotation.x = -Math.PI / 2;
    this.playerBlob.position.y = 0.02;
    scene.add(this.playerBlob);

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
    );
  }

  /** Heldenfarbe beim Runstart setzen. */
  setHeroColor(color: number): void {
    const body = this.playerGroup.children[0] as Mesh;
    (body.material as MeshBasicMaterial).color.set(color).multiplyScalar(1.9);
  }

  render(world: World, alpha: number, rawDt: number): void {
    this.renderEnemies(world, alpha);
    this.renderProjectiles(world, alpha);
    this.renderPickups(world, alpha);
    this.renderPlayer(world, alpha);
    this.renderBoss(world, alpha);
    this.renderMuzzle(world, rawDt);
  }

  private renderEnemies(world: World, alpha: number): void {
    const counters = new Array<number>(this.enemyMeshes.length).fill(0);
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
      dummy.position.set(x, e.radius + 0.25 + bob, z);
      dummy.rotation.set(0, e.yRot, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      // Weiss-Flash bei Treffern, Telegraph-Glimmen beim Schuetzen
      mesh.setColorAt(idx, e.flashTimer > 0 ? flashColor : (this.assets.enemyColors[e.type] as Color));
    }
    for (let t = 0; t < this.enemyMeshes.length; t++) {
      const mesh = this.enemyMeshes[t] as InstancedMesh;
      mesh.count = counters[t] as number;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private renderProjectiles(world: World, alpha: number): void {
    const pp = world.playerProjectiles;
    for (let i = 0; i < pp.count; i++) {
      const p = pp.get(i);
      dummy.position.set(lerp(p.prevX, p.x, alpha), 0.6, lerp(p.prevZ, p.z, alpha));
      const s = p.boomerang ? 1.6 : 1;
      dummy.rotation.set(0, p.boomerang ? world.elapsed * 20 : 0, 0);
      // leichte Streckung in Flugrichtung
      dummy.scale.set(s, s, s * 1.4);
      if (!p.boomerang) dummy.rotation.y = Math.atan2(p.vx, p.vz);
      dummy.updateMatrix();
      this.playerProj.setMatrixAt(i, dummy.matrix);
    }
    this.playerProj.count = pp.count;
    this.playerProj.instanceMatrix.needsUpdate = true;

    const ep = world.enemyProjectiles;
    for (let i = 0; i < ep.count; i++) {
      const p = ep.get(i);
      dummy.position.set(lerp(p.prevX, p.x, alpha), 0.6, lerp(p.prevZ, p.z, alpha));
      const pulse = 1 + 0.15 * Math.sin(world.elapsed * 14 + i);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(pulse);
      dummy.updateMatrix();
      this.enemyProj.setMatrixAt(i, dummy.matrix);
    }
    this.enemyProj.count = ep.count;
    this.enemyProj.instanceMatrix.needsUpdate = true;
  }

  private renderPickups(world: World, alpha: number): void {
    const counters = [0, 0, 0];
    const pool = world.pickups;
    for (let i = 0; i < pool.count; i++) {
      const p = pool.get(i);
      const mesh = this.pickupMeshes[p.kind] as InstancedMesh;
      const idx = counters[p.kind] as number;
      if (idx >= 256) continue;

      // Ablaufende Herzen blinken die letzten Sekunden
      if (p.kind === PICKUP_HEART && p.lifetime > 0) {
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
    for (let k = 0; k < 3; k++) {
      const mesh = this.pickupMeshes[k] as InstancedMesh;
      mesh.count = counters[k] as number;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private renderPlayer(world: World, alpha: number): void {
    const p = world.player;
    const x = lerp(p.prevX, p.x, alpha);
    const z = lerp(p.prevZ, p.z, alpha);
    this.playerGroup.position.set(x, 0, z);
    this.playerGroup.rotation.y = Math.atan2(p.faceX, p.faceZ);
    // Dash: Streckung in Bewegungsrichtung
    const stretch = p.isDashing ? 1.35 : 1;
    this.playerGroup.scale.set(1, 1, stretch);

    // Unverwundbarkeits-Blinken: 8 Hz, 60 % sichtbar
    let visible = p.alive;
    if (p.alive && p.iFrames > 0 && !p.isDashing) {
      visible = (world.elapsed * 8) % 1 < 0.6;
    }
    this.playerGroup.visible = visible;
    this.playerBlob.position.set(x, 0.02, z);
    this.playerBlob.visible = p.alive;

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

  reset(): void {
    for (const mesh of this.enemyMeshes) mesh.count = 0;
    this.playerProj.count = 0;
    this.enemyProj.count = 0;
    for (const mesh of this.pickupMeshes) mesh.count = 0;
    for (const group of this.bossGroups.values()) group.visible = false;
    for (const m of this.miniMeshes) m.visible = false;
    for (const o of this.orbMeshes) o.visible = false;
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
    for (const mesh of this.pickupMeshes) mesh.dispose();
  }
}
