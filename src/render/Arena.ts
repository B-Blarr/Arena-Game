import {
  BufferGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  Scene,
  TorusGeometry,
  AdditiveBlending,
  BoxGeometry,
} from 'three';
import { ARENA_RADIUS } from '../config/balance';
import { Rng } from '../core/Rng';

/**
 * Statische Arena: Neon-Grid-Boden (prozedurale CanvasTexture, kein
 * Asset-Download), leuchtende Ring-Wand, Pylonen, Sternenhimmel, Fog.
 * Wird einmalig gebaut und ueberlebt alle Run-Restarts.
 */
export class Arena {
  private readonly disposables: Array<BufferGeometry | Material | CanvasTexture> = [];
  private floorMat!: MeshStandardMaterial;
  private beatPulse = 0;

  constructor(scene: Scene) {
    scene.background = new Color(0x050510);
    scene.fog = new FogExp2(0x050510, 0.018);

    this.buildLights(scene);
    this.buildFloor(scene);
    this.buildWall(scene);
    this.buildPylons(scene);
    this.buildStars(scene);
  }

  private track<T extends BufferGeometry | Material | CanvasTexture>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  private buildLights(scene: Scene): void {
    // Nur der Boden ist lit — alles Leuchtende ist unlit + Bloom.
    const hemi = new HemisphereLight(0x3a4a8a, 0x0a0a18, 0.9);
    const dir = new DirectionalLight(0x8090ff, 0.5);
    dir.position.set(10, 30, 10);
    scene.add(hemi, dir);
  }

  private makeGridTexture(): CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#05060d';
      ctx.fillRect(0, 0, size, size);
      const cells = 4;
      const step = size / cells;
      for (let i = 0; i <= cells; i++) {
        const p = i * step;
        // weicher Glow unter der Linie
        const grad = ctx.createLinearGradient(p - 8, 0, p + 8, 0);
        grad.addColorStop(0, 'rgba(0,229,255,0)');
        grad.addColorStop(0.5, 'rgba(0,229,255,0.35)');
        grad.addColorStop(1, 'rgba(0,229,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(p - 8, 0, 16, size);
        const gradH = ctx.createLinearGradient(0, p - 8, 0, p + 8);
        gradH.addColorStop(0, 'rgba(0,229,255,0)');
        gradH.addColorStop(0.5, 'rgba(0,229,255,0.35)');
        gradH.addColorStop(1, 'rgba(0,229,255,0)');
        ctx.fillStyle = gradH;
        ctx.fillRect(0, p - 8, size, 16);
        // scharfe Kernlinie
        ctx.fillStyle = 'rgba(120,245,255,0.9)';
        ctx.fillRect(p - 1, 0, 2, size);
        ctx.fillRect(0, p - 1, size, 2);
      }
    }
    const tex = new CanvasTexture(canvas);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.repeat.set(10, 10);
    tex.anisotropy = 4;
    return this.track(tex);
  }

  private buildFloor(scene: Scene): void {
    const gridTex = this.makeGridTexture();
    const geo = this.track(new PlaneGeometry(90, 90));
    // Grid liegt in der Emissive-Map: der Puls steuert emissiveIntensity,
    // die Grundflaeche bleibt dunkel (bloomt nicht).
    this.floorMat = this.track(
      new MeshStandardMaterial({
        color: 0x0b0e1e,
        roughness: 0.85,
        metalness: 0.1,
        emissive: 0xffffff,
        emissiveMap: gridTex,
        emissiveIntensity: 0.5,
      }),
    ) as MeshStandardMaterial;
    const floor = new Mesh(geo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);
  }

  private buildWall(scene: Scene): void {
    // Transluzente Energie-Wand
    const wallGeo = this.track(new CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 2.4, 64, 1, true));
    const wallMat = this.track(
      new MeshBasicMaterial({
        color: new Color(0x00e5ff).multiplyScalar(0.6),
        transparent: true,
        opacity: 0.12,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    const wall = new Mesh(wallGeo, wallMat);
    wall.position.y = 1.2;
    scene.add(wall);

    // Leuchtende Neon-Ringe oben/unten
    const ringGeo = this.track(new TorusGeometry(ARENA_RADIUS, 0.09, 8, 96));
    const ringMat = this.track(
      new MeshBasicMaterial({ color: new Color(0x00e5ff).multiplyScalar(2.2) }),
    );
    const bottom = new Mesh(ringGeo, ringMat);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = 0.05;
    const top = new Mesh(ringGeo, ringMat);
    top.rotation.x = Math.PI / 2;
    top.position.y = 2.4;
    scene.add(bottom, top);
  }

  private buildPylons(scene: Scene): void {
    const geo = this.track(new BoxGeometry(0.5, 1, 0.5));
    const mat = this.track(
      new MeshBasicMaterial({ color: new Color(0xff3df2).multiplyScalar(1.6) }),
    );
    const rng = new Rng(1337);
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const h = 1.5 + rng.next() * 3;
      const pylon = new Mesh(geo, mat);
      pylon.scale.y = h;
      pylon.position.set(
        Math.cos(angle) * (ARENA_RADIUS + 2.5),
        h / 2,
        Math.sin(angle) * (ARENA_RADIUS + 2.5),
      );
      scene.add(pylon);
    }
  }

  private buildStars(scene: Scene): void {
    const count = 800;
    const rng = new Rng(4242);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const cyan = new Color(0x9adfff);
    const white = new Color(0xffffff);
    const magenta = new Color(0xffb3f4);
    for (let i = 0; i < count; i++) {
      // Kuppel ueber der Arena
      const theta = rng.next() * Math.PI * 2;
      const phi = rng.next() * Math.PI * 0.48;
      const r = 70 + rng.next() * 50;
      positions[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
      positions[i * 3 + 1] = Math.cos(phi) * r * 0.6 + 5;
      positions[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
      const c = rng.next() < 0.15 ? magenta : rng.next() < 0.5 ? cyan : white;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = this.track(new BufferGeometry());
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    const mat = this.track(
      new PointsMaterial({
        size: 0.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    const stars = new Points(geo, mat);
    scene.add(stars);
  }

  /** Beat-Puls vom Musik-Sequencer: Grid leuchtet kurz auf. */
  pulse(): void {
    this.beatPulse = 1;
  }

  update(rawDt: number): void {
    if (this.beatPulse > 0) this.beatPulse = Math.max(0, this.beatPulse - rawDt * 3);
    this.floorMat.emissiveIntensity = 0.5 + this.beatPulse * 0.25;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
