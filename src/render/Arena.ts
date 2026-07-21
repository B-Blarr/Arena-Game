import {
  BufferGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  Scene,
  TorusGeometry,
  Vector3,
  AdditiveBlending,
  BoxGeometry,
} from 'three';
import { ARENA_RADIUS } from '../config/balance';
import type { RoomTheme } from '../config/rooms';
import { Rng } from '../core/Rng';

/**
 * Arena-Biome: alle 5 Wellen wechselt die Farbstimmung. Hintergruende
 * bleiben fast schwarz und meiden Rot/Orangerot — Rot ist exklusiv die
 * Gefahrenfarbe (Gegner-Projektile/Telegraphs) und muss immer knallen.
 */
interface BiomeDef {
  bg: number;
  grid: number;
  gridIntensity: number;
  wall: number;
  ring: number;
  pylon: number;
}

const BIOMES: readonly BiomeDef[] = [
  // W1-5 "Cyan-Nacht" (Klassiker)
  { bg: 0x050510, grid: 0x00e5ff, gridIntensity: 0.5, wall: 0x00e5ff, ring: 0x00e5ff, pylon: 0xff3df2 },
  // W6-10 "Magenta-Daemmerung"
  { bg: 0x0c0514, grid: 0xe03df2, gridIntensity: 0.45, wall: 0xff3df2, ring: 0xff3df2, pylon: 0x00e5ff },
  // W11-15 "Matrix-Smaragd" (kuehler als das Schwarm-Lime)
  { bg: 0x02100c, grid: 0x00ff9c, gridIntensity: 0.5, wall: 0x00ff9c, ring: 0x00ff9c, pylon: 0xffc83d },
  // W16-20 "Blau-Eis" (einzige gegnerfreie Hue)
  { bg: 0x040918, grid: 0x4d8dff, gridIntensity: 0.5, wall: 0x4d8dff, ring: 0x4d8dff, pylon: 0xffffff },
  // W21+ "Gold-Inferno" (Grid gedimmt wegen Splitter-Gelb)
  { bg: 0x120a04, grid: 0xffc83d, gridIntensity: 0.4, wall: 0xffc83d, ring: 0xffc83d, pylon: 0xff3df2 },
];

const FOG_DENSITY = 0.018;
const FOG_DENSITY_BOSS = 0.024;

/**
 * Arena: Neon-Grid-Boden (prozedurale CanvasTexture, kein Asset-Download),
 * leuchtende Ring-Wand, instanzierte Pylonen, rotierender Sternenhimmel, Fog.
 * Wird einmalig gebaut und ueberlebt alle Run-Restarts; Biome faerben nur
 * die vorhandenen Materialien um (weicher Lerp in update()).
 */
export class Arena {
  private readonly disposables: Array<BufferGeometry | Material | CanvasTexture> = [];
  private floorMat!: MeshStandardMaterial;
  private wallMat!: MeshBasicMaterial;
  private ringMat!: MeshBasicMaterial;
  private pylonMat!: MeshBasicMaterial;
  private pylonMesh!: InstancedMesh;
  private stars!: Points;
  /** NEU (Sinnes-Signatur): Sternen-Material (Per-Raum-Toenung) + Dreh-Tempo-Faktor. */
  private starMat!: PointsMaterial;
  private starSpeedMult = 1;
  // NEU (Reise-Ausbau): Wand + Ringe fuer die per-Raum-Groesse skalierbar halten
  // (einmal mit ARENA_RADIUS gebaut, danach nur ueber .scale angepasst).
  private wallMesh!: Mesh;
  private readonly ringMeshes: Mesh[] = [];
  private currentRadius = ARENA_RADIUS;
  private targetRadius = ARENA_RADIUS;
  /** Aktive Raum-Optik (Render-only); null = reines Biome (Klassik/Normal). */
  private roomTheme: RoomTheme | null = null;
  /** NEU (Atmosphaere): laufende Optik-Animation der Raum-Optik. */
  private themeAnim?: 'pulseFog' | 'swirl' | 'flicker' | 'drift';
  private animTime = 0;
  private flickerTimer = 0;
  /** NEU (Windkanal): Wind-Vektor + Staerke fuer den Grid-Scroll-Telegraph (Render-only). */
  private driftX = 0;
  private driftZ = 0;
  private driftStrength = 0;
  /** Grid-Textur (fuer swirl-Rotation). */
  private gridTex!: CanvasTexture;
  private readonly bgColor = new Color(0x050510);
  private readonly fog = new FogExp2(0x050510, FOG_DENSITY);
  private beatPulse = 0;

  // Lerp-Ziele (vorallokiert, keine Frame-Allokationen)
  private readonly tBg = new Color();
  private readonly tGrid = new Color();
  private readonly tWall = new Color();
  private readonly tRing = new Color();
  private readonly tPylon = new Color();
  private tFogDensity = FOG_DENSITY;
  private tGridIntensity = 0.5;
  private gridIntensity = 0.5;

  private currentBiome = 0;
  private bossMode = false;
  /** NEU (Boss-Auftritt): Akzentfarbe des aktuellen Bosses (Ringe/Grid/Sterne),
   *  null = kein Boss. Rein visuell. */
  private bossAccent: number | null = null;

  constructor(scene: Scene) {
    scene.background = this.bgColor;
    scene.fog = this.fog;

    this.buildLights(scene);
    this.buildFloor(scene);
    this.buildWall(scene);
    this.buildPylons(scene);
    this.buildStars(scene);

    this.setBiome(0, false);
    // Startzustand sofort einnehmen (kein Einblend-Lerp beim App-Start)
    this.snapToTargets();
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

  /** Grid in Weiss gebacken — die Faerbung uebernimmt floorMat.emissive (Biome). */
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
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(p - 8, 0, 16, size);
        const gradH = ctx.createLinearGradient(0, p - 8, 0, p + 8);
        gradH.addColorStop(0, 'rgba(255,255,255,0)');
        gradH.addColorStop(0.5, 'rgba(255,255,255,0.35)');
        gradH.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradH;
        ctx.fillRect(0, p - 8, size, 16);
        // scharfe Kernlinie
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
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
    this.gridTex = gridTex; // NEU (Atmosphaere): fuer swirl-Rotation
    const geo = this.track(new PlaneGeometry(90, 90));
    // Grid liegt in der Emissive-Map: der Puls steuert emissiveIntensity,
    // emissive-Farbe = Biome-Tint, die Grundflaeche bleibt dunkel.
    this.floorMat = this.track(
      new MeshStandardMaterial({
        color: 0x0b0e1e,
        roughness: 0.85,
        metalness: 0.1,
        emissive: 0x00e5ff,
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
    this.wallMat = this.track(
      new MeshBasicMaterial({
        color: new Color(0x00e5ff).multiplyScalar(0.6),
        transparent: true,
        opacity: 0.12,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    ) as MeshBasicMaterial;
    const wall = new Mesh(wallGeo, this.wallMat);
    wall.position.y = 1.2;
    this.wallMesh = wall;
    scene.add(wall);

    // Leuchtende Neon-Ringe oben/unten
    const ringGeo = this.track(new TorusGeometry(ARENA_RADIUS, 0.09, 8, 96));
    this.ringMat = this.track(
      new MeshBasicMaterial({ color: new Color(0x00e5ff).multiplyScalar(2.2) }),
    ) as MeshBasicMaterial;
    const bottom = new Mesh(ringGeo, this.ringMat);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = 0.05;
    const top = new Mesh(ringGeo, this.ringMat);
    top.rotation.x = Math.PI / 2;
    top.position.y = 2.4;
    this.ringMeshes.push(bottom, top);
    scene.add(bottom, top);
  }

  /** 10 Pylonen als EIN InstancedMesh (statt 10 Draw Calls). */
  private buildPylons(scene: Scene): void {
    const geo = this.track(new BoxGeometry(0.5, 1, 0.5));
    this.pylonMat = this.track(
      new MeshBasicMaterial({ color: new Color(0xff3df2).multiplyScalar(1.6) }),
    ) as MeshBasicMaterial;
    const rng = new Rng(1337);
    const count = 10;
    this.pylonMesh = new InstancedMesh(geo, this.pylonMat, count);
    const mat4 = new Matrix4();
    const pos = new Vector3();
    const quat = new Quaternion();
    const scl = new Vector3();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const h = 1.5 + rng.next() * 3;
      pos.set(Math.cos(angle) * (ARENA_RADIUS + 2.5), h / 2, Math.sin(angle) * (ARENA_RADIUS + 2.5));
      scl.set(1, h, 1);
      mat4.compose(pos, quat, scl);
      this.pylonMesh.setMatrixAt(i, mat4);
    }
    // Matrizen sind statisch — kein needsUpdate im Loop
    this.pylonMesh.instanceMatrix.needsUpdate = true;
    this.pylonMesh.frustumCulled = false;
    scene.add(this.pylonMesh);
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
    this.starMat = mat; // NEU (Sinnes-Signatur): fuer Per-Raum-Toenung gemerkt
    this.stars = new Points(geo, mat);
    scene.add(this.stars);
  }

  // ---------------------------------------------------------- Biomes

  /** Wird bei waveStarted gerufen: Biome-Index = floor((wave-1)/5) % 5. */
  setBiome(index: number, isBossWave: boolean): void {
    this.currentBiome = ((index % BIOMES.length) + BIOMES.length) % BIOMES.length;
    this.bossMode = isBossWave;
    this.refreshTargets();
  }

  /** Boss-Dramatik an/aus (bossDied -> aus), ohne das Biome zu wechseln. */
  setBossMode(on: boolean): void {
    this.bossMode = on;
    if (!on) {
      // Boss vorbei: Akzent loeschen + Sterne zurueck auf Raum-/Neutral-Toenung.
      this.bossAccent = null;
      if (this.starMat) this.starMat.color.set(this.roomTheme?.starTint ?? 0xffffff);
    }
    this.refreshTargets();
  }

  /** NEU (Boss-Auftritt): Akzentfarbe des Bosses setzen (Ringe/Grid/Sterne toenen).
   *  Game.ts ruft das im waveStarted-Handler NACH setRoomTheme, damit die Stern-Toenung
   *  gewinnt. color null = kein Boss (neutral). Rein visuell. */
  setBossAccent(color: number | null): void {
    this.bossAccent = color;
    if (this.starMat) this.starMat.color.set(color ?? this.roomTheme?.starTint ?? 0xffffff);
    this.refreshTargets();
  }

  /** NEU (Reise-Ausbau): Ziel-Arena-Radius; Wand + Ringe lerpen im update() weich
   *  dorthin (Klassik/Normal ruft immer mit ARENA_RADIUS -> keine Aenderung). */
  setRadius(r: number): void {
    this.targetRadius = r;
  }

  /** NEU (Windkanal): Wind-Vektor + Staerke fuer den Grid-Scroll-Telegraph (Render-only).
   *  strength 0 -> kein Scroll (Game.ts pusht das aus world.drift* daneben zum Radius). */
  setDrift(dx: number, dz: number, strength: number): void {
    this.driftX = dx;
    this.driftZ = dz;
    this.driftStrength = strength;
  }

  /** NEU (Reise-Ausbau): Raum-Optik setzen (null = reines Biome). */
  setRoomTheme(theme: RoomTheme | null): void {
    this.roomTheme = theme;
    this.themeAnim = theme?.anim;
    // Grid-Rotation nur im swirl-Raum; sonst zurueck auf achsen-parallel.
    if (this.themeAnim !== 'swirl' && this.gridTex) {
      this.gridTex.rotation = 0;
      this.gridTex.needsUpdate = true;
    } else if (this.themeAnim === 'swirl' && this.gridTex) {
      this.gridTex.center.set(0.5, 0.5);
    }
    // NEU (Windkanal): Grid-Offset nur im drift-Raum scrollen; sonst zuruecksetzen.
    if (this.themeAnim !== 'drift' && this.gridTex) {
      this.gridTex.offset.set(0, 0);
      this.gridTex.needsUpdate = true;
    }
    // NEU (Sinnes-Signatur): Sternenhimmel pro Raum toenen + Dreh-Tempo (undefined = neutral).
    if (this.starMat) this.starMat.color.set(theme?.starTint ?? 0xffffff);
    this.starSpeedMult = theme?.starSpeed ?? 1;
    this.refreshTargets();
  }

  private applyRadiusScale(): void {
    const f = this.currentRadius / ARENA_RADIUS;
    // Wand: Zylinder-Radius liegt in lokal XZ, Hoehe bleibt (lokal Y).
    this.wallMesh.scale.set(f, 1, f);
    // Ringe: Torus-Radius liegt in lokal XY (vor der X-Rotation), Rohr bleibt.
    for (const ring of this.ringMeshes) ring.scale.set(f, f, 1);
  }

  private refreshTargets(): void {
    const b = BIOMES[this.currentBiome] as BiomeDef;
    this.tBg.set(b.bg);
    this.tGrid.set(b.grid);
    this.tWall.set(b.wall).multiplyScalar(0.6);
    this.tRing.set(b.ring).multiplyScalar(2.2);
    this.tPylon.set(b.pylon).multiplyScalar(1.6);
    this.tFogDensity = FOG_DENSITY;
    this.tGridIntensity = b.gridIntensity;
    if (this.bossMode) {
      // NEU (Boss-Auftritt): deutlich dunkler + dichter Nebel + Ringe/Grid in der
      // Boss-Akzentfarbe (pro Boss eigen). Kein Strobe, nur Lerp.
      this.tBg.lerp(new Color(0x000000), 0.72);
      this.tFogDensity = FOG_DENSITY_BOSS;
      this.tGridIntensity = Math.min(this.tGridIntensity, 0.3);
      const acc = this.bossAccent ?? 0xffffff;
      this.tRing.set(acc).multiplyScalar(2.2);
      // Grid Richtung Boss-Farbe ziehen (halb) -> jeder Boss faerbt die Arena anders.
      this.tGrid.lerp(new Color(acc), 0.5);
    }
    // NEU (Reise-Ausbau): Raum-Optik ueberschreibt gesetzte Felder (Render-only).
    // Boss-Wellen nutzen ROOM_NORMAL -> roomTheme === null -> kein Konflikt.
    const rt = this.roomTheme;
    if (rt) {
      if (rt.bg !== undefined) this.tBg.set(rt.bg);
      if (rt.grid !== undefined) this.tGrid.set(rt.grid);
      if (rt.wall !== undefined) this.tWall.set(rt.wall).multiplyScalar(0.6);
      if (rt.ring !== undefined) this.tRing.set(rt.ring).multiplyScalar(2.2);
      if (rt.fogDensity !== undefined) this.tFogDensity = rt.fogDensity;
      if (rt.gridIntensity !== undefined) this.tGridIntensity = rt.gridIntensity;
    }
  }

  /** Zielwerte sofort einnehmen (nur beim App-Start / Run-Reset). */
  snapToTargets(): void {
    this.bgColor.copy(this.tBg);
    this.fog.color.copy(this.tBg);
    this.floorMat.emissive.copy(this.tGrid);
    this.wallMat.color.copy(this.tWall);
    this.ringMat.color.copy(this.tRing);
    this.pylonMat.color.copy(this.tPylon);
    this.fog.density = this.tFogDensity;
    this.gridIntensity = this.tGridIntensity;
    // NEU (Reise-Ausbau): Arena-Groesse sofort einnehmen (App-Start / Run-Reset).
    this.currentRadius = this.targetRadius;
    this.applyRadiusScale();
  }

  /** Beat-Puls vom Musik-Sequencer; bossStomp ruft mit strength 1.5. */
  pulse(strength = 1): void {
    this.beatPulse = Math.max(this.beatPulse, Math.min(1.5, strength));
  }

  update(rawDt: number): void {
    if (this.beatPulse > 0) this.beatPulse = Math.max(0, this.beatPulse - rawDt * 3);

    // Weicher Biome-Uebergang (~1.5-2 s), laeuft in Echtzeit weiter
    const k = 1 - Math.exp(-2.2 * rawDt);
    this.bgColor.lerp(this.tBg, k);
    this.fog.color.copy(this.bgColor);
    this.floorMat.emissive.lerp(this.tGrid, k);
    this.wallMat.color.lerp(this.tWall, k);
    this.ringMat.color.lerp(this.tRing, k);
    this.pylonMat.color.lerp(this.tPylon, k);
    this.fog.density += (this.tFogDensity - this.fog.density) * k;
    this.gridIntensity += (this.tGridIntensity - this.gridIntensity) * k;

    // NEU (Reise-Ausbau): Wand/Ringe weich auf die Raum-Groesse skalieren.
    if (this.currentRadius !== this.targetRadius) {
      this.currentRadius += (this.targetRadius - this.currentRadius) * k;
      if (Math.abs(this.currentRadius - this.targetRadius) < 0.01) this.currentRadius = this.targetRadius;
      this.applyRadiusScale();
    }

    // NEU (Atmosphaere): laufende Optik-Animation je Raum (rein visuell, kein RNG).
    if (this.themeAnim) {
      this.animTime += rawDt;
      if (this.themeAnim === 'pulseFog') {
        // Nebel "atmet" um den Zielwert (Finsternis wird dichter/lichter)
        this.fog.density = Math.max(0, this.tFogDensity + Math.sin(this.animTime * 1.5) * 0.01);
      } else if (this.themeAnim === 'swirl') {
        // Grid dreht sich langsam wie ein Strudel (Singularitaet)
        this.gridTex.rotation += rawDt * 0.15;
        this.gridTex.needsUpdate = true;
      } else if (this.themeAnim === 'flicker') {
        // Gewitter: gelegentlicher heller Grid-Blitz (Math.random ist rein visuell)
        this.flickerTimer -= rawDt;
        if (this.flickerTimer <= 0) {
          this.beatPulse = Math.max(this.beatPulse, 0.9);
          this.flickerTimer = 0.3 + Math.random() * 1.4;
        }
      } else if (this.themeAnim === 'drift') {
        // NEU (Windkanal): Grid scrollt in Windrichtung -> zeigt, wohin die Brise schiebt.
        if (this.gridTex && this.driftStrength > 0) {
          this.gridTex.offset.x += this.driftX * rawDt * 0.08;
          this.gridTex.offset.y += this.driftZ * rawDt * 0.08;
          this.gridTex.needsUpdate = true;
        }
      }
    }

    // NEU (Boss-Auftritt): im Boss-Modus atmet das Grid staerker mit dem Musik-Takt.
    this.floorMat.emissiveIntensity = this.gridIntensity + this.beatPulse * (this.bossMode ? 0.5 : 0.25);

    // Langsame Himmelsdrehung (NEU: Per-Raum-Tempo-Faktor der Sinnes-Signatur)
    this.stars.rotation.y += rawDt * 0.01 * this.starSpeedMult;
  }

  dispose(): void {
    this.pylonMesh.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
