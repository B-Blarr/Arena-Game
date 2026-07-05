import { ARENA_RADIUS, DASH, PLAYER, type DifficultyMods } from '../config/balance';
import { UPGRADE_VALUES as UV } from '../config/upgrades';
import { getWeapon, type HeroDef, type WeaponDef } from '../config/heroes';
import { clamp } from '../utils/math';
import type { EventBus } from '../core/EventBus';

/** Abgeleitete Kampfwerte — nach jeder Upgrade-Wahl neu berechnet. */
export interface PlayerStats {
  maxHp: number;
  speed: number;
  fireRate: number;
  damage: number;
  projectileSpeed: number;
  range: number;
  projectileCount: number;
  spreadAngle: number;
  pierce: number;
  knockback: number;
  critChance: number;
  critMultiplier: number;
  pickupRadius: number;
  coreChanceMult: number;
  lifestealPerKill: number;
  orbCount: number;
  orbDamage: number;
  dashDamage: number;
  dashCharges: number;
  dashCooldown: number;
  frostSlow: number;
  frostDuration: number;
  novaChance: number;
  novaDamage: number;
  ricochet: number;
  boomerang: boolean;
  // Legendaere Upgrades
  /** Spiegelklon: Schadensanteil der Geister-Salve (0 = aus). */
  cloneDamageFrac: number;
  /** Orbital-Laser: Schaden pro Einschlag (0 = aus). */
  orbitalDamage: number;
  /** Schwarzes Loch: Sog-Geschwindigkeit der geworfenen Singularitaet (0 = aus). */
  blackHolePull: number;
  /** Ueberladung: Bonus-Schadensanteil unter 30 % HP (0 = aus). */
  overchargeBonus: number;
  /** Projektil-Radius (Mega-Kugeln vergroessern ihn). */
  projectileRadius: number;
}

export class Player {
  x = 0;
  z = 0;
  prevX = 0;
  prevZ = 0;
  /** Ist-Geschwindigkeit dieses Steps (fuer Kamera-Lookahead). */
  velX = 0;
  velZ = 0;
  hp = PLAYER.maxHp;
  alive = true;
  iFrames = 0;
  /** Blickrichtung (letzte Ziel-/Bewegungsrichtung). */
  faceX = 0;
  faceZ = 1;

  // Dash
  dashTimer = 0;
  dashDirX = 0;
  dashDirZ = 1;
  /** Restliche Abklingzeit je Ladung (Laenge = dashCharges). */
  dashCooldowns: number[] = [0];
  /** Inkrementiert pro Dash — Gegner werden pro Dash nur 1x getroffen. */
  dashId = 0;
  private dashReadyNotified = true;

  fireCooldown = 0;
  orbAngle = 0;
  stacks = new Map<string, number>();
  reviveAvailable = false;
  /** Orbital-Laser: Restzeit bis zum naechsten Einschlag. */
  orbitalTimer = 0;
  /** "Turbofeuer!"-Kapselbuff: Restzeit erhoehter Feuerrate. */
  rapidFireTimer = 0;
  /** Lebensraub-Bruchteile sammeln sich, geheilt wird nur ganzzahlig. */
  private healCarry = 0;
  /** Schwarzes Loch: Restlebenszeit + Position der aktiven Singularitaet. */
  blackHoleTimer = 0;
  blackHoleX = 0;
  blackHoleZ = 0;

  stats: PlayerStats = this.computeStats();

  private hero!: HeroDef;
  private weapon!: WeaponDef;
  private perma: Record<string, number> = {};
  private mods!: DifficultyMods;

  constructor(private readonly events: EventBus) {}

  /** Neuen Lauf initialisieren (Pools/Szene werden recycelt, nie neu gebaut). */
  reset(hero: HeroDef, weaponId: string, mods: DifficultyMods, perma: Record<string, number>): void {
    this.hero = hero;
    this.weapon = getWeapon(weaponId, hero);
    this.mods = mods;
    this.perma = perma;
    this.stacks.clear();
    this.x = 0;
    this.z = 0;
    this.prevX = 0;
    this.prevZ = 0;
    this.velX = 0;
    this.velZ = 0;
    this.alive = true;
    this.iFrames = 0;
    this.faceX = 0;
    this.faceZ = 1;
    this.dashTimer = 0;
    this.dashId = 0;
    this.fireCooldown = 0;
    this.orbAngle = 0;
    this.orbitalTimer = 0;
    this.rapidFireTimer = 0;
    this.healCarry = 0;
    this.blackHoleTimer = 0;
    this.reviveAvailable = (perma.secondChance ?? 0) > 0;
    this.recomputeStats();
    this.dashCooldowns = new Array<number>(this.stats.dashCharges).fill(0);
    this.dashReadyNotified = true;
    this.hp = this.stats.maxHp;
  }

  stackOf(id: string): number {
    return this.stacks.get(id) ?? 0;
  }

  addStack(id: string): void {
    this.stacks.set(id, this.stackOf(id) + 1);
    const oldMax = this.stats.maxHp;
    this.recomputeStats();
    // Max-HP-Upgrade heilt sofort um den HALBEN Zuwachs (voller Zuwachs
    // machte die Karte zur Gratis-Vollheilung — Heil-Oekonomie-Nerf)
    if (this.stats.maxHp > oldMax) this.hp += Math.round((this.stats.maxHp - oldMax) / 2);
    // Doppel-Dash: neue Ladung sofort einsatzbereit
    while (this.dashCooldowns.length < this.stats.dashCharges) this.dashCooldowns.push(0);
  }

  private computeStats(): PlayerStats {
    // Defaults fuer den Konstruktor (vor dem ersten reset())
    return {
      maxHp: PLAYER.maxHp, speed: PLAYER.speed, fireRate: 2.5, damage: 10,
      projectileSpeed: 18, range: 14, projectileCount: 1, spreadAngle: 0,
      pierce: 0, knockback: 0, critChance: PLAYER.critChance, critMultiplier: PLAYER.critMultiplier,
      pickupRadius: PLAYER.pickupRadius, coreChanceMult: 1, lifestealPerKill: 0,
      orbCount: 0, orbDamage: UV.orbDamage, dashDamage: 0, dashCharges: 1,
      dashCooldown: DASH.cooldown, frostSlow: 0, frostDuration: 0,
      novaChance: 0, novaDamage: UV.novaDamage, ricochet: 0, boomerang: false,
      cloneDamageFrac: 0, orbitalDamage: 0, blackHolePull: 0, overchargeBonus: 0,
      projectileRadius: UV.projectileRadiusBase,
    };
  }

  recomputeStats(): void {
    const s = this.stats;
    const st = (id: string): number => this.stackOf(id);
    const perma = this.perma;
    const w = this.weapon;

    const armorLv = perma.armor ?? 0;
    const calibLv = perma.calibration ?? 0;
    const turboLv = perma.turbo ?? 0;
    const luckLv = perma.luck ?? 0;

    s.maxHp = Math.round(
      this.hero.maxHp * (1 + armorLv * 0.1) * this.mods.playerHp + st('maxHp') * UV.maxHpPerStack,
    );
    s.speed = this.hero.speed * (1 + turboLv * 0.05) * (1 + st('speed') * UV.speedPerStack);
    s.fireRate = w.fireRate * (1 + st('fireRate') * UV.fireRatePerStack);

    const multishot = st('multishot');
    const hasMega = st('megaShots') > 0;
    // megaShots-Bonus steckt im damageMult — Orbs/Nova/Orbital skalieren mit
    const damageMult =
      (1 + calibLv * 0.06) *
      (1 + st('damage') * UV.damagePerStack) *
      (hasMega ? 1 + UV.megaShotsDamageBonus : 1) *
      Math.pow(UV.multishotDamageMult, multishot);
    s.damage = w.damage * damageMult;
    s.projectileCount = w.projectileCount + multishot;
    s.spreadAngle = s.projectileCount > 1 ? Math.max(w.spreadAngle, UV.multishotSpreadAngle) : 0;
    const rangeMult = 1 + st('range') * UV.rangePerStack;
    s.projectileSpeed = w.projectileSpeed * rangeMult;
    s.range = w.range * rangeMult;
    s.pierce = w.pierce + st('pierce') + (hasMega ? UV.megaShotsPierce : 0);
    s.knockback = w.knockback;
    s.critChance = Math.min(PLAYER.critChance + st('crit') * UV.critPerStack, UV.critCap);
    s.critMultiplier = PLAYER.critMultiplier;
    s.pickupRadius = PLAYER.pickupRadius * (1 + st('magnet') * UV.magnetPerStack);
    s.coreChanceMult = (1 + luckLv * 0.1) * (1 + st('coreGreed') * UV.coreGreedPerStack);
    s.lifestealPerKill = st('lifesteal') * UV.lifestealPerKill;
    s.orbCount = st('orb');
    // Orb skaliert mit 50 % der Schadens-Boni
    s.orbDamage = UV.orbDamage * (1 + (damageMult - 1) * UV.orbDamageScaling);
    s.dashDamage = st('dashBlade') * UV.dashBladeDamagePerStack;
    s.dashCharges = 1 + st('doubleDash');
    s.dashCooldown = this.hero.dashCooldown;
    const frost = st('frost');
    const frostDef = frost > 0 ? UV.frost[Math.min(frost, UV.frost.length) - 1] : undefined;
    s.frostSlow = frostDef?.slow ?? 0;
    s.frostDuration = frostDef?.duration ?? 0;
    // Kettenreaktion (legendaer): JEDER Kill explodiert
    s.novaChance = st('chainReaction') > 0 ? 1 : Math.min(st('nova') * UV.novaChancePerStack, 0.6);
    s.novaDamage = UV.novaDamage * damageMult;
    s.ricochet = st('ricochet');
    s.boomerang = w.boomerang;
    // Legendaere Upgrades
    s.cloneDamageFrac = st('mirrorClone') > 0 ? UV.mirrorCloneDamageFrac : 0;
    s.orbitalDamage = st('orbitalLaser') > 0 ? UV.orbitalLaserDamage * damageMult : 0;
    s.blackHolePull = st('blackHoleDash') > 0 ? UV.blackHolePull : 0;
    s.overchargeBonus = st('overcharge') > 0 ? UV.overchargeDamageBonus : 0;
    s.projectileRadius = UV.projectileRadiusBase * (hasMega ? UV.megaShotsRadiusMult : 1);
  }

  /** Ueberladung: unter 30 % HP schlaegt alles haerter zu. */
  get damageBoost(): number {
    return 1 + (this.hp < this.stats.maxHp * UV.overchargeHpFrac ? this.stats.overchargeBonus : 0);
  }

  get isDashing(): boolean {
    return this.dashTimer > 0;
  }

  get hasIFrames(): boolean {
    return this.iFrames > 0 || this.dashTimer > 0;
  }

  /** Anteil [0..1] der am weitesten geladenen Dash-Ladung (fuers HUD). */
  get dashChargeFrac(): number {
    let best = 0;
    for (const cd of this.dashCooldowns) {
      const frac = 1 - clamp(cd / this.stats.dashCooldown, 0, 1);
      if (frac > best) best = frac;
    }
    return best;
  }

  tryDash(dirX: number, dirZ: number): boolean {
    if (this.dashTimer > 0) return false;
    for (let i = 0; i < this.dashCooldowns.length; i++) {
      if ((this.dashCooldowns[i] as number) <= 0) {
        this.dashCooldowns[i] = this.stats.dashCooldown;
        this.dashTimer = DASH.duration;
        this.dashId++;
        const len = Math.hypot(dirX, dirZ);
        if (len > 0.01) {
          this.dashDirX = dirX / len;
          this.dashDirZ = dirZ / len;
        } else {
          this.dashDirX = this.faceX;
          this.dashDirZ = this.faceZ;
        }
        this.iFrames = Math.max(this.iFrames, DASH.iFrames);
        this.dashReadyNotified = false;
        this.events.emit('playerDashed', { x: this.x, z: this.z });
        return true;
      }
    }
    return false;
  }

  update(dt: number, moveX: number, moveZ: number, dashPressed: boolean): void {
    this.prevX = this.x;
    this.prevZ = this.z;

    if (this.iFrames > 0) this.iFrames -= dt;
    for (let i = 0; i < this.dashCooldowns.length; i++) {
      const cd = this.dashCooldowns[i] as number;
      if (cd > 0) this.dashCooldowns[i] = cd - dt;
    }
    if (!this.dashReadyNotified && this.dashChargeFrac >= 1) {
      this.dashReadyNotified = true;
      this.events.emit('dashReady', {});
    }
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.rapidFireTimer > 0) this.rapidFireTimer -= dt;
    this.orbAngle += dt * UV.orbRotationsPerSec * Math.PI * 2;

    if (dashPressed) this.tryDash(moveX, moveZ);

    const wasDashing = this.dashTimer > 0;
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      const dashSpeed = DASH.distance / DASH.duration;
      this.x += this.dashDirX * dashSpeed * dt;
      this.z += this.dashDirZ * dashSpeed * dt;
    } else {
      this.x += moveX * this.stats.speed * dt;
      this.z += moveZ * this.stats.speed * dt;
      if (moveX !== 0 || moveZ !== 0) {
        this.faceX = moveX;
        this.faceZ = moveZ;
      }
    }

    // Kreis-Arena-Clamp
    const maxR = ARENA_RADIUS - PLAYER.radius;
    const d = Math.hypot(this.x, this.z);
    if (d > maxR) {
      this.x = (this.x / d) * maxR;
      this.z = (this.z / d) * maxR;
    }

    // Schwarzes Loch (legendaer): am Dash-ENDE Singularitaet vorausschleudern
    // (nicht auf die eigene Position — Gegner-Knaeuel + Kontaktschaden waere
    // eine Falle; 2.5u voraus feuert der Auto-Aim automatisch hinein).
    // Solange eines aktiv ist, wirft ein Doppel-Dash KEIN neues — sonst
    // entfiele der zugesagte Kollaps-Crunch des ersten Lochs stumm.
    if (wasDashing && this.dashTimer <= 0 && this.stats.blackHolePull > 0 && this.blackHoleTimer <= 0) {
      let hx = this.x + this.dashDirX * UV.blackHoleThrowDist;
      let hz = this.z + this.dashDirZ * UV.blackHoleThrowDist;
      const hd = Math.hypot(hx, hz);
      const hMax = ARENA_RADIUS - 1.5;
      if (hd > hMax) {
        hx = (hx / hd) * hMax;
        hz = (hz / hd) * hMax;
      }
      this.blackHoleX = hx;
      this.blackHoleZ = hz;
      this.blackHoleTimer = UV.blackHoleDuration;
      this.events.emit('blackHole', {
        x: hx, z: hz, radius: UV.blackHoleRadius, duration: UV.blackHoleDuration,
      });
    }

    this.velX = (this.x - this.prevX) / dt;
    this.velZ = (this.z - this.prevZ) / dt;
  }

  /** true, wenn der Treffer durchging (keine i-Frames aktiv). */
  takeDamage(amount: number): boolean {
    if (!this.alive || this.hasIFrames) return false;
    this.hp -= amount;
    this.iFrames = PLAYER.iFramesAfterHit;
    this.events.emit('playerHit', { damage: amount, hp: Math.max(0, this.hp), maxHp: this.stats.maxHp });
    if (this.hp <= 0) {
      if (this.reviveAvailable) {
        this.reviveAvailable = false;
        this.hp = Math.round(this.stats.maxHp * 0.5);
        this.iFrames = 2;
        this.events.emit('playerRevived', {});
      } else {
        this.alive = false;
        this.events.emit('playerDied', { x: this.x, z: this.z });
      }
    }
    return true;
  }

  heal(amount: number): void {
    if (!this.alive) return;
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    const gained = this.hp - before;
    if (gained > 0) {
      this.events.emit('playerHealed', { amount: gained, hp: this.hp, maxHp: this.stats.maxHp });
    }
  }

  /** Bruchteil-Heilung (Lebensraub 0.5/Kill): heilt erst bei vollen HP-Punkten. */
  healFractional(amount: number): void {
    this.healCarry += amount;
    const whole = Math.floor(this.healCarry);
    if (whole >= 1) {
      this.healCarry -= whole;
      this.heal(whole);
    }
  }
}
