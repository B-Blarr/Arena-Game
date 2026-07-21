import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
} from 'three';
import { ENEMIES } from '../config/enemies';
import type { TrailDef } from '../config/trails';
import type { EventBus } from '../core/EventBus';
import type { AssetRegistry } from '../render/AssetRegistry';

const MAX_PARTICLES = 2048;
// 16: bis zu 4 Bomber-Zuendringe + Portale + Schockwellen + Kapsel gleichzeitig
const MAX_RINGS = 16;
const MAX_LINES = 2;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
  rot: number;
  rotV: number;
  gravity: number;
}

interface Ring {
  active: boolean;
  mode: 'expand' | 'hold';
  age: number;
  dur: number;
  r0: number;
  r1: number;
  x: number;
  z: number;
  baseOpacity: number;
  mesh: Mesh;
  mat: MeshBasicMaterial;
}

interface Line {
  active: boolean;
  age: number;
  dur: number;
  mesh: Mesh;
  mat: MeshBasicMaterial;
}

interface DelayedBurst {
  delay: number;
  x: number;
  z: number;
  color: number;
  count: number;
  speed: number;
}

export interface BurstOpts {
  speedMin?: number;
  speedMax?: number;
  upBias?: number;
  sizeMin?: number;
  sizeMax?: number;
  lifeMin?: number;
  lifeMax?: number;
  gravity?: number;
  whiteFrac?: number;
}

const tmpColor = new Color();
const dummy = new Object3D();

/**
 * Alle Welt-Effekte: Partikel-Bursts (1 InstancedMesh = 1 Draw Call),
 * Shockwave-/Portal-/Telegraph-Ringe und Charge-Linien aus festen Pools.
 * Abonniert den EventBus — Gameplay-Code kennt keine Partikel.
 */
export class ParticleSystem {
  private readonly particles: Particle[] = [];
  private count = 0;
  private readonly mesh: InstancedMesh;
  private readonly rings: Ring[] = [];
  private readonly lines: Line[] = [];
  private readonly delayed: DelayedBurst[] = [];
  /** Schwarzes Loch: solange > 0 spiralen Partikel einwaerts. */
  private vortexTimer = 0;
  private vortexX = 0;
  private vortexZ = 0;
  private readonly unsubs: Array<() => void> = [];

  constructor(scene: Scene, assets: AssetRegistry, events: EventBus) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 0.1,
        r: 1,
        g: 1,
        b: 1,
        rot: 0,
        rotV: 0,
        gravity: -12,
      });
    }
    this.mesh = new InstancedMesh(assets.geoParticle, assets.matParticle, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // instanceColor-Buffer als dynamisch anlegen (wird jedes Frame geschrieben)
    this.mesh.setColorAt(0, tmpColor.setRGB(1, 1, 1));
    this.mesh.instanceColor?.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);

    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        side: 2,
      });
      const mesh = new Mesh(assets.geoRing, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.06;
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({
        active: false,
        mode: 'expand',
        age: 0,
        dur: 1,
        r0: 0.5,
        r1: 3,
        x: 0,
        z: 0,
        baseOpacity: 0.8,
        mesh,
        mat,
      });
    }

    for (let i = 0; i < MAX_LINES; i++) {
      const mat = new MeshBasicMaterial({
        color: new Color(0xff3b30).multiplyScalar(1.6),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(assets.geoTelegraphLine, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.lines.push({ active: false, age: 0, dur: 1, mesh, mat });
    }

    this.subscribe(events);
  }

  private subscribe(events: EventBus): void {
    const u = this.unsubs;
    u.push(
      events.on('enemyKilled', (e) => {
        const color = e.enemyType >= 0 ? (ENEMIES[e.enemyType]?.color ?? 0xffffff) : 0x00f5d4;
        this.burst(e.x, e.z, color, Math.round(20 * e.scale), {
          speedMin: 4,
          speedMax: 10,
          sizeMin: 0.1,
          sizeMax: 0.18 * e.scale,
        });
      }),
      events.on('enemyHit', (e) => {
        if (e.enemyType < 0) return; // Boss-Hits funkeln ueber eigene Events genug
        const color = ENEMIES[e.enemyType]?.color ?? 0xffffff;
        this.burst(e.x, e.z, color, 3, {
          speedMin: 2,
          speedMax: 5,
          lifeMin: 0.2,
          lifeMax: 0.35,
          sizeMin: 0.06,
          sizeMax: 0.1,
        });
      }),
      events.on('explosion', (e) => {
        this.burst(e.x, e.z, e.color, 26, { speedMin: 5, speedMax: 12 });
        this.spawnRing(e.x, e.z, 0.5, e.radius + 0.8, 0.35, 0.8, e.color, 'expand');
      }),
      events.on('projectileWallHit', (e) => {
        this.burst(e.x, e.z, 0x00e5ff, 3, {
          speedMin: 1.5,
          speedMax: 4,
          lifeMin: 0.15,
          lifeMax: 0.3,
          sizeMin: 0.05,
          sizeMax: 0.09,
        });
      }),
      events.on('pickupCollected', (e) => {
        const color = e.kind === 'heart' ? 0x4dff88 : e.kind === 'magnet' || e.kind === 'capsule' ? 0xffc83d : 0x00e5ff;
        const count = e.kind === 'capsule' ? 18 : 5;
        this.burst(e.x, e.z, color, count, {
          speedMin: 1,
          speedMax: 3,
          lifeMin: 0.2,
          lifeMax: 0.4,
          sizeMin: 0.05,
          sizeMax: 0.1,
          gravity: 2,
        });
      }),
      events.on('portalOpened', (e) => {
        this.spawnRing(e.x, e.z, 0.3, 1.4, 1.0, 0.7, 0x00e5ff, 'hold');
        // Zweiter Ring laeuft rueckwaerts — "Portal saugt an"
        this.spawnRing(e.x, e.z, 2.4, 0.9, 1.0, 0.4, 0x00e5ff, 'expand');
      }),
      events.on('bossTelegraph', (e) => {
        if (e.kind === 'shockwave') {
          this.spawnRing(e.x, e.z, (e.radius ?? 6) * 0.97, e.radius ?? 6, e.duration, 0.6, 0xff3b30, 'hold');
        } else if (e.kind === 'charge') {
          this.spawnLine(e.x, e.z, e.dirX ?? 0, e.dirZ ?? 1, e.length ?? 30, e.duration);
        } else if (e.kind === 'salvo') {
          this.spawnRing(e.x, e.z, 0.8, 2.2, e.duration, 0.5, 0xff3df2, 'hold');
        } else if (e.kind === 'vortex') {
          // WIRBEL-Sog: einwaerts laufender BLAUER Ring (r0 > r1) —
          // blau, weil der Sog selbst keinen Schaden macht (Rot = ausweichen)
          this.spawnRing(e.x, e.z, (e.radius ?? 14) * 0.7, 1.2, e.duration, 0.5, 0x3355ff, 'expand');
        }
      }),
      // Kosmetische Sog-Wiederhol-Ringe (gleiche Optik, ohne Warnton)
      events.on('vortexRing', (e) => {
        this.spawnRing(e.x, e.z, e.radius * 0.7, 1.2, e.duration, 0.5, 0x3355ff, 'expand');
      }),
      events.on('bossStomp', (e) => {
        const dur = e.speed > 0 ? e.radius / e.speed : 0.35;
        this.spawnRing(e.x, e.z, 0.4, e.radius, dur, 0.85, 0xffffff, 'expand');
        this.burst(e.x, e.z, 0xffffff, 14, { speedMin: 3, speedMax: 8 });
      }),
      events.on('bossDied', (e) => {
        this.delayed.push(
          { delay: 0, x: e.x, z: e.z, color: e.color, count: 60, speed: 12 },
          { delay: 0.15, x: e.x, z: e.z, color: 0xffc83d, count: 60, speed: 10 },
          { delay: 0.3, x: e.x, z: e.z, color: e.color, count: 60, speed: 14 },
        );
        this.spawnRing(e.x, e.z, 0.5, 8, 0.5, 0.9, 0xffffff, 'expand');
        this.spawnRing(e.x, e.z, 0.5, 12, 0.8, 0.7, e.color, 'expand');
        this.spawnRing(e.x, e.z, 0.5, 16, 1.1, 0.5, 0xffc83d, 'expand');
      }),
      events.on('playerDied', (e) => {
        this.burst(e.x, e.z, 0x00e5ff, 60, { speedMin: 4, speedMax: 12, lifeMin: 0.6, lifeMax: 1.2 });
        this.spawnRing(e.x, e.z, 0.5, 6, 0.6, 0.8, 0x00e5ff, 'expand');
      }),
      events.on('playerRevived', () => {
        // Position kommt nicht mit — Ring in Arena-Mitte waere falsch, daher nur Delay-Burst am Spieler via dashTrail-Aufrufe
      }),
      events.on('playerDashed', (e) => {
        this.burst(e.x, e.z, 0x00e5ff, 6, {
          speedMin: 1,
          speedMax: 3,
          lifeMin: 0.2,
          lifeMax: 0.35,
          gravity: 0,
          sizeMin: 0.06,
          sizeMax: 0.12,
        });
      }),
      // ---------------- Neue Inhalte ----------------
      // Bomber-Zuendung: statischer Warn-Ring in Blast-Groesse (NEU: Farbe optional,
      // Default rot; Sturm-Blitze faerben ihn elektrisch-blau).
      events.on('enemyFuse', (e) => {
        this.spawnRing(e.x, e.z, e.radius * 0.97, e.radius, e.duration, 0.6, e.color ?? 0xff3b30, 'hold');
      }),
      // Elite-Schild zerbricht: weisser Klirr-Ring
      events.on('eliteShieldBroken', (e) => {
        this.spawnRing(e.x, e.z, 0.4, 1.8, 0.35, 0.9, 0xffffff, 'expand');
      }),
      // Elite-Spawn: dicker goldener Ring am Portal
      events.on('eliteSpawned', (e) => {
        this.spawnRing(e.x, e.z, 0.4, 2.6, 0.6, 0.8, 0xffc83d, 'expand');
      }),
      // Versorgungskapsel: goldener Halte-Ring am Landepunkt + Lande-Burst
      events.on('capsuleIncoming', (e) => {
        this.spawnRing(e.x, e.z, 1.1, 1.3, 1.5, 0.7, 0xffc83d, 'hold');
      }),
      events.on('capsuleLanded', (e) => {
        this.burst(e.x, e.z, 0xffc83d, 20, { speedMin: 2, speedMax: 6 });
        this.spawnRing(e.x, e.z, 0.4, 2.4, 0.5, 0.8, 0xffc83d, 'expand');
      }),
      // Phantom-Blink: Cyan-Bursts an Start- und Zielpunkt
      events.on('phantomBlink', (e) => {
        this.burst(e.fromX, e.fromZ, 0xb84dff, 8, { speedMin: 1, speedMax: 4, lifeMin: 0.2, lifeMax: 0.4, gravity: 0 });
        this.burst(e.toX, e.toZ, 0xb84dff, 8, { speedMin: 1, speedMax: 4, lifeMin: 0.2, lifeMax: 0.4, gravity: 0 });
      }),
      // Orbital-Laser: Einschlag-Burst + Ring (Saeule rendert der InstancedRenderer)
      events.on('orbitalStrike', (e) => {
        this.burst(e.x, e.z, 0xffc83d, 24, { speedMin: 3, speedMax: 9 });
        this.spawnRing(e.x, e.z, 0.4, 3.2, 0.4, 0.85, 0xffc83d, 'expand');
      }),
      // Schwarzes Loch: violetter Einwaerts-Ring (r0 > r1) + Kern-Puls +
      // Spiral-Partikel; der Kollaps-Crunch kommt ueber das explosion-Event
      events.on('blackHole', (e) => {
        this.spawnRing(e.x, e.z, e.radius * 1.15, 0.5, e.duration, 0.55, 0x9b5cff, 'expand');
        this.spawnRing(e.x, e.z, 1.0, 1.0, e.duration, 0.5, 0x6b2fd9, 'hold');
        this.vortexTimer = e.duration;
        this.vortexX = e.x;
        this.vortexZ = e.z;
      }),
      // Dieb frisst einen Kern: kleiner Cyan-Puff
      events.on('coreStolen', (e) => {
        this.burst(e.x, e.z, 0x00e5ff, 4, {
          speedMin: 1,
          speedMax: 2.5,
          lifeMin: 0.15,
          lifeMax: 0.3,
          gravity: 0,
          sizeMin: 0.05,
          sizeMax: 0.09,
        });
      }),
      // Boss-Intro: weisser Ring + Burst am Spawnpunkt
      events.on('bossSpawned', (e) => {
        this.spawnRing(e.x, e.z, 0.5, 10, 0.9, 0.7, 0xffffff, 'expand');
        this.burst(e.x, e.z, 0xffffff, 30, { speedMin: 3, speedMax: 9 });
      }),
    );
  }

  /** Dash-Trail: pro Sim-Step waehrend des Dashes aufrufen. */
  dashTrail(x: number, z: number): void {
    this.burst(x, z, 0x00e5ff, 2, {
      speedMin: 0.2,
      speedMax: 0.8,
      lifeMin: 0.15,
      lifeMax: 0.3,
      gravity: 0,
      sizeMin: 0.08,
      sizeMax: 0.14,
      upBias: 0.5,
    });
  }

  /** NEU (Belohnungsart "Spur-Effekte"): kosmetischer Wake hinter dem laufenden Helden.
   *  1 Partikel in der Trail-Farbe (rainbow zyklt den Hue). Rein FX, kein seeded RNG. */
  private trailHue = 0;
  heroTrail(x: number, z: number, def: TrailDef): void {
    let color: number;
    if (def.color === 'rainbow') {
      this.trailHue = (this.trailHue + 0.02) % 1;
      color = tmpColor.setHSL(this.trailHue, 0.9, 0.6).getHex();
    } else {
      color = def.color;
    }
    this.burst(x, z, color, 1, {
      speedMin: 0.1,
      speedMax: 0.6,
      upBias: 0.3,
      lifeMin: def.life * 0.7,
      lifeMax: def.life,
      gravity: def.gravity ?? 0,
      sizeMin: def.size * 0.7,
      sizeMax: def.size,
      whiteFrac: 0.05,
    });
  }

  burst(x: number, z: number, colorHex: number, count: number, opts: BurstOpts = {}): void {
    const speedMin = opts.speedMin ?? 4;
    const speedMax = opts.speedMax ?? 10;
    const upBias = opts.upBias ?? 4;
    const sizeMin = opts.sizeMin ?? 0.1;
    const sizeMax = opts.sizeMax ?? 0.18;
    const lifeMin = opts.lifeMin ?? 0.5;
    const lifeMax = opts.lifeMax ?? 0.9;
    const gravity = opts.gravity ?? -12;
    const whiteFrac = opts.whiteFrac ?? 0.3;
    tmpColor.set(colorHex).multiplyScalar(2);

    for (let i = 0; i < count; i++) {
      if (this.count >= MAX_PARTICLES) return;
      const p = this.particles[this.count++] as Particle;
      const a = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      p.x = x;
      p.y = 0.4 + Math.random() * 0.4;
      p.z = z;
      p.vx = Math.cos(a) * speed;
      p.vz = Math.sin(a) * speed;
      p.vy = 2 + Math.random() * upBias;
      p.maxLife = lifeMin + Math.random() * (lifeMax - lifeMin);
      p.life = p.maxLife;
      p.size = sizeMin + Math.random() * (sizeMax - sizeMin);
      p.gravity = gravity;
      p.rot = Math.random() * Math.PI;
      p.rotV = (Math.random() - 0.5) * 12;
      if (Math.random() < whiteFrac) {
        p.r = 2;
        p.g = 2;
        p.b = 2;
      } else {
        p.r = tmpColor.r;
        p.g = tmpColor.g;
        p.b = tmpColor.b;
      }
    }
  }

  spawnRing(
    x: number,
    z: number,
    r0: number,
    r1: number,
    dur: number,
    opacity: number,
    colorHex: number,
    mode: 'expand' | 'hold',
  ): void {
    let ring = this.rings.find((r) => !r.active);
    if (!ring) ring = this.rings[0] as Ring; // aeltester wird ueberschrieben
    ring.active = true;
    ring.mode = mode;
    ring.age = 0;
    ring.dur = Math.max(0.05, dur);
    ring.r0 = r0;
    ring.r1 = r1;
    ring.x = x;
    ring.z = z;
    ring.baseOpacity = opacity;
    ring.mat.color.set(colorHex).multiplyScalar(1.6);
    ring.mesh.position.set(x, 0.06, z);
    ring.mesh.visible = true;
  }

  spawnLine(x: number, z: number, dirX: number, dirZ: number, length: number, dur: number): void {
    let line = this.lines.find((l) => !l.active);
    if (!line) line = this.lines[0] as Line;
    line.active = true;
    line.age = 0;
    line.dur = Math.max(0.05, dur);
    const angle = Math.atan2(dirX, dirZ);
    line.mesh.rotation.set(0, angle, 0);
    line.mesh.scale.set(1.6, 1, length);
    line.mesh.position.set(x + (dirX * length) / 2, 0.08, z + (dirZ * length) / 2);
    line.mesh.visible = true;
  }

  /** Laeuft in Spielzeit — Pause/Zeitlupe wirken auch auf Effekte. */
  update(dt: number): void {
    // Verzoegerte Bursts (Boss-Tod-Salven)
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i] as DelayedBurst;
      d.delay -= dt;
      if (d.delay <= 0) {
        this.burst(d.x, d.z, d.color, d.count, { speedMin: d.speed * 0.4, speedMax: d.speed });
        this.delayed.splice(i, 1);
      }
    }

    // Schwarzes Loch: Spiral-Partikel (einwaerts + tangential = Strudel).
    // burst() kann nur auswaerts — hier direkt in den Pool schreiben.
    if (this.vortexTimer > 0) {
      this.vortexTimer -= dt;
      for (let k = 0; k < 3 && this.count < MAX_PARTICLES; k++) {
        const p = this.particles[this.count++] as Particle;
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 3;
        p.x = this.vortexX + Math.cos(a) * r;
        p.y = 0.3 + Math.random() * 0.6;
        p.z = this.vortexZ + Math.sin(a) * r;
        // 6 u/s einwaerts + 4 u/s tangential
        p.vx = -Math.cos(a) * 6 - Math.sin(a) * 4;
        p.vz = -Math.sin(a) * 6 + Math.cos(a) * 4;
        p.vy = 0;
        p.maxLife = 0.4 + Math.random() * 0.2;
        p.life = p.maxLife;
        p.size = 0.06 + Math.random() * 0.06;
        p.gravity = 0;
        p.rot = Math.random() * Math.PI;
        p.rotV = (Math.random() - 0.5) * 10;
        if (Math.random() < 0.3) {
          p.r = 2;
          p.g = 2;
          p.b = 2;
        } else {
          p.r = 1.2;
          p.g = 0.7;
          p.b = 2.0; // violett
        }
      }
    }

    // Partikel (swap-remove)
    for (let i = this.count - 1; i >= 0; i--) {
      const p = this.particles[i] as Particle;
      p.life -= dt;
      if (p.life <= 0) {
        const last = this.count - 1;
        this.particles[i] = this.particles[last] as Particle;
        this.particles[last] = p;
        this.count = last;
        continue;
      }
      p.vy += p.gravity * dt;
      const drag = Math.exp(-1.5 * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.rotV * dt;
      if (p.y < 0.07 && p.vy < 0) {
        p.y = 0.07;
        p.vy *= -0.4;
      }
    }

    // Ringe
    for (const ring of this.rings) {
      if (!ring.active) continue;
      ring.age += dt;
      const t = Math.min(1, ring.age / ring.dur);
      if (ring.mode === 'expand') {
        const ease = 1 - (1 - t) * (1 - t);
        const r = ring.r0 + (ring.r1 - ring.r0) * ease;
        ring.mesh.scale.set(r, r, 1);
        ring.mat.opacity = ring.baseOpacity * (1 - t);
      } else {
        // Telegraph-Kreis: pulsieren, aber nie fast unsichtbar werden
        ring.mesh.scale.set(ring.r1, ring.r1, 1);
        ring.mat.opacity = ring.baseOpacity * (0.75 + 0.25 * Math.sin(ring.age * 14));
      }
      if (t >= 1) {
        ring.active = false;
        ring.mesh.visible = false;
      }
    }

    // Linien
    for (const line of this.lines) {
      if (!line.active) continue;
      line.age += dt;
      const t = Math.min(1, line.age / line.dur);
      // Charge-Linie: deutlich sichtbar pulsieren (Kinder muessen sie lesen koennen)
      line.mat.opacity = (0.5 + 0.25 * Math.sin(line.age * 12)) * (1 - t * 0.2);
      if (t >= 1) {
        line.active = false;
        line.mesh.visible = false;
      }
    }
  }

  /** Matrizen/Farben in das InstancedMesh schreiben (1 Draw Call). */
  render(): void {
    const mesh = this.mesh;
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i] as Particle;
      const lifeFrac = p.life / p.maxLife;
      // zweite Lebenshaelfte: schrumpfen auf 0
      const scale = p.size * (lifeFrac < 0.5 ? lifeFrac * 2 : 1);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rot, p.rot * 1.3, p.rot * 0.7);
      dummy.scale.setScalar(Math.max(scale, 0.001));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Fade ueber instanceColor (additiv: dunkler = transparenter)
      tmpColor.setRGB(p.r * lifeFrac, p.g * lifeFrac, p.b * lifeFrac);
      mesh.setColorAt(i, tmpColor);
    }
    mesh.count = this.count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  reset(): void {
    this.count = 0;
    this.mesh.count = 0;
    this.delayed.length = 0;
    this.vortexTimer = 0;
    for (const ring of this.rings) {
      ring.active = false;
      ring.mesh.visible = false;
    }
    for (const line of this.lines) {
      line.active = false;
      line.mesh.visible = false;
    }
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    for (const ring of this.rings) ring.mat.dispose();
    for (const line of this.lines) line.mat.dispose();
    this.mesh.dispose();
  }
}
