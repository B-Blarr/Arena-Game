import { ARENA_RADIUS, DASH, PLAYER, type DifficultyMods } from '../config/balance';
import { UPGRADE_VALUES as UV } from '../config/upgrades';
import { getWeapon, type AbilityDef, type HeroDef, type WeaponDef } from '../config/heroes';
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
  // Mythische Upgrades
  /** Prisma-Salve: Schaden pro Kugel (0 = aus). Ersetzt das normale Feuern. */
  prismShotDamage: number;
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
  /** Koop: am Boden — unverwundbar, handlungsunfaehig, wartet auf Revive. */
  downed = false;
  /** Koop: mit Partner geht ein toedlicher Treffer in den Down-State. */
  hasTeammate = false;
  /** Auto-Aim-Setting DIESES Spielers (Koop: pro Profil). */
  autoAim = true;
  iFrames = 0;
  /** Blickrichtung (letzte Ziel-/Bewegungsrichtung). */
  faceX = 0;
  faceZ = 1;
  /** NEU (Reise-Ausbau): Arena-Radius der laufenden Welle (Player hat kein world-
   *  Handle; RunState.startWave setzt den Wert). Klassik/Normal: ARENA_RADIUS. */
  arenaRadius = ARENA_RADIUS;
  /** NEU (Reise-Ausbau): Singularitaets-Sog zur Mitte (Units/s, 0 = aus). */
  pullStrength = 0;
  /** NEU (Reise-Ausbau, Windkanal): konstanter gerichteter Drift — Einheitsvektor (X/Z)
   *  + Staerke (Units/s, 0 = aus). RunState.startWave setzt die Werte pro Welle. */
  driftX = 0;
  driftZ = 0;
  driftStrength = 0;

  // Dash
  dashTimer = 0;
  dashDirX = 0;
  dashDirZ = 1;
  /** Ueberschreibt die Dash-Distanz fuer diesen Dash (0 = normale DASH.distance).
   *  Der Phasenblitz (Held-Faehigkeit) nutzt denselben Integrator mit groesserer Distanz. */
  dashDistanceOverride = 0;
  /** Restliche Abklingzeit je Ladung (Laenge = dashCharges). */
  dashCooldowns: number[] = [0];
  /** Inkrementiert pro Dash — Gegner werden pro Dash nur 1x getroffen. */
  dashId = 0;
  private dashReadyNotified = true;

  // Held-Spezialfaehigkeit (aktiv, cooldown-gebunden — spiegelt den Dash)
  ability: AbilityDef | null = null;
  abilityCooldown = 0;
  abilityCooldownMax = 0;
  /** Poll-Flag — CombatSystem loest gegner-treffende Faehigkeiten aus. */
  abilityPending = false;
  private abilityReadyNotified = true;
  /** Fuers Tutorial: wie oft die Faehigkeit genutzt wurde. */
  abilityUses = 0;
  /** Faehigkeits-Variante des Schwarzen-Loch-Sogs (0 = aus), analog stats.blackHolePull. */
  abilityBlackHolePull = 0;

  fireCooldown = 0;
  orbAngle = 0;
  stacks = new Map<string, number>();
  reviveAvailable = false;
  /** NEU (mythisch "Phoenixkern"): einmalige Auto-Wiederbelebung noch geladen? */
  phoenixCharge = false;
  /** NEU: Poll-Flag — CombatSystem loest die Aufersteh-Schockwelle aus. */
  phoenixBlastPending = false;
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

  constructor(
    private readonly events: EventBus,
    readonly index = 0,
  ) {}

  /** Kann Schaden nehmen / ist Gegner-Ziel — das EINZIGE Gate fuer beides. */
  get targetable(): boolean {
    return this.alive && !this.downed;
  }

  /** Neuen Lauf initialisieren (Pools/Szene werden recycelt, nie neu gebaut). */
  reset(hero: HeroDef, weaponId: string, mods: DifficultyMods, perma: Record<string, number>, startX = 0): void {
    this.hero = hero;
    this.weapon = getWeapon(weaponId, hero);
    this.mods = mods;
    this.perma = perma;
    this.stacks.clear();
    this.x = startX;
    this.z = 0;
    this.prevX = startX;
    this.prevZ = 0;
    this.velX = 0;
    this.velZ = 0;
    this.alive = true;
    this.downed = false;
    this.iFrames = 0;
    this.faceX = 0;
    this.faceZ = 1;
    this.dashTimer = 0;
    this.dashId = 0;
    this.dashDistanceOverride = 0;
    this.fireCooldown = 0;
    this.orbAngle = 0;
    this.orbitalTimer = 0;
    this.rapidFireTimer = 0;
    this.healCarry = 0;
    this.blackHoleTimer = 0;
    // NEU (Reise-Ausbau): Arena/Sog/Drift neutral starten (startWave setzt sie pro Welle).
    this.arenaRadius = ARENA_RADIUS;
    this.pullStrength = 0;
    this.driftX = 0;
    this.driftZ = 0;
    this.driftStrength = 0;
    this.reviveAvailable = (perma.secondChance ?? 0) > 0;
    this.phoenixCharge = false; // NEU: Phoenixkern erst per Upgrade-Wahl laden
    this.phoenixBlastPending = false;
    // Held-Spezialfaehigkeit: bereit starten (kein Cooldown beim Runstart)
    this.ability = hero.ability ?? null;
    this.abilityCooldownMax = hero.ability?.cooldown ?? 0;
    this.abilityCooldown = 0;
    this.abilityPending = false;
    this.abilityReadyNotified = true;
    this.abilityUses = 0;
    this.abilityBlackHolePull = 0;
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
    // NEU (mythisch "Phoenixkern"): einmalige Auferstehung laden (maxStacks 1)
    if (id === 'phoenixCore') this.phoenixCharge = true;
  }

  private computeStats(): PlayerStats {
    // Defaults fuer den Konstruktor (vor dem ersten reset())
    return {
      maxHp: PLAYER.maxHp,
      speed: PLAYER.speed,
      fireRate: 2.5,
      damage: 10,
      projectileSpeed: 18,
      range: 14,
      projectileCount: 1,
      spreadAngle: 0,
      pierce: 0,
      knockback: 0,
      critChance: PLAYER.critChance,
      critMultiplier: PLAYER.critMultiplier,
      pickupRadius: PLAYER.pickupRadius,
      coreChanceMult: 1,
      lifestealPerKill: 0,
      orbCount: 0,
      orbDamage: UV.orbDamage,
      dashDamage: 0,
      dashCharges: 1,
      dashCooldown: DASH.cooldown,
      frostSlow: 0,
      frostDuration: 0,
      novaChance: 0,
      novaDamage: UV.novaDamage,
      ricochet: 0,
      boomerang: false,
      cloneDamageFrac: 0,
      orbitalDamage: 0,
      blackHolePull: 0,
      overchargeBonus: 0,
      projectileRadius: UV.projectileRadiusBase,
      prismShotDamage: 0, // NEU (mythisch)
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

    s.maxHp = Math.round(this.hero.maxHp * (1 + armorLv * 0.1) * this.mods.playerHp + st('maxHp') * UV.maxHpPerStack);
    s.speed = this.hero.speed * (1 + turboLv * 0.05) * (1 + st('speed') * UV.speedPerStack);
    // NEU (mythisch): Singularitaet verdoppelt Feuerrate UND Schaden (fliesst via
    // damageMult auch in Orb/Nova/Orbital/Prisma). Faktor 1, solange nicht gewaehlt.
    const singularity = st('singularity') > 0 ? UV.singularityMult : 1;
    s.fireRate = w.fireRate * (1 + st('fireRate') * UV.fireRatePerStack) * singularity;

    const multishot = st('multishot');
    const hasMega = st('megaShots') > 0;
    // Mehrfachschuss-Malus (jede Kugel x0.9 pro Stack) separat halten: die
    // Prisma-Salve feuert immer nur EINE Kugel und soll den Malus daher NICHT
    // erben (sonst reiner Nachteil) — s. prismShotDamage unten.
    const multishotPenalty = Math.pow(UV.multishotDamageMult, multishot);
    // megaShots-Bonus steckt im damageMult — Orbs/Nova/Orbital skalieren mit
    const damageMult =
      (1 + calibLv * 0.06) *
      (1 + st('damage') * UV.damagePerStack) *
      (hasMega ? 1 + UV.megaShotsDamageBonus : 1) *
      multishotPenalty *
      singularity; // NEU: mythisch
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
    // NEU (mythisch): Prisma-Salve-Schaden pro Kugel skaliert mit allen Boni AUSSER
    // dem Mehrfachschuss-Malus. damageMult / multishotPenalty klammert genau ihn aus
    // (multishotPenalty > 0, also keine Division-durch-0-Gefahr).
    s.prismShotDamage = st('prismBeam') > 0 ? UV.prismShotDamage * (damageMult / multishotPenalty) : 0;
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

  /** Ladeanteil [0..1] der Spezialfaehigkeit (fuers HUD). Ohne Faehigkeit voll. */
  get abilityChargeFrac(): number {
    if (this.abilityCooldownMax <= 0) return 1;
    return 1 - clamp(this.abilityCooldown / this.abilityCooldownMax, 0, 1);
  }

  /** HUD-Glyph der Faehigkeit (leer = Held hat keine). */
  get abilityIcon(): string {
    return this.ability?.icon ?? '';
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
        this.events.emit('playerDashed', { x: this.x, z: this.z, playerIndex: this.index });
        return true;
      }
    }
    return false;
  }

  /**
   * Held-Spezialfaehigkeit ausloesen. Self-Kinds (Phasenblitz) wirken sofort
   * lokal; alle anderen setzen abilityPending — das CombatSystem loest sie
   * denselben Frame auf (p.update laeuft VOR combat.update, wie Schwarzes
   * Loch/Phoenix). i-Frames (Bollwerk/Schockstoss) wirken ebenfalls sofort.
   * dirX/dirZ = aktuelle Laufrichtung (fuer den Blink-Zielvektor).
   */
  tryAbility(dirX: number, dirZ: number): boolean {
    const def = this.ability;
    if (!def || this.abilityCooldown > 0) return false;
    this.abilityCooldown = this.abilityCooldownMax;
    this.abilityReadyNotified = false;
    this.abilityUses++;
    if (def.kind === 'blink') {
      this.startBlink(def, dirX, dirZ);
    } else {
      if (def.iFrames) this.iFrames = Math.max(this.iFrames, def.iFrames);
      this.abilityPending = true;
    }
    this.events.emit('abilityUsed', { playerIndex: this.index, x: this.x, z: this.z });
    return true;
  }

  /** Phasenblitz: Teleport-Dash ueber den Dash-Integrator (groessere Distanz). */
  private startBlink(def: AbilityDef, dirX: number, dirZ: number): void {
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
    this.dashDistanceOverride = def.distance ?? DASH.distance;
    this.iFrames = Math.max(this.iFrames, def.iFrames ?? DASH.iFrames);
  }

  update(dt: number, moveX: number, moveZ: number, dashPressed: boolean, abilityPressed: boolean): void {
    this.prevX = this.x;
    this.prevZ = this.z;

    // Am Boden: keine Bewegung/Aktionen — nur die Cooldowns ticken weiter,
    // damit der Wiederbelebte nicht mit leeren Ladungen aufsteht
    if (this.downed) {
      this.velX = 0;
      this.velZ = 0;
      for (let i = 0; i < this.dashCooldowns.length; i++) {
        const cd = this.dashCooldowns[i] as number;
        if (cd > 0) this.dashCooldowns[i] = cd - dt;
      }
      if (this.abilityCooldown > 0) this.abilityCooldown -= dt;
      if (this.fireCooldown > 0) this.fireCooldown -= dt;
      return;
    }

    if (this.iFrames > 0) this.iFrames -= dt;
    for (let i = 0; i < this.dashCooldowns.length; i++) {
      const cd = this.dashCooldowns[i] as number;
      if (cd > 0) this.dashCooldowns[i] = cd - dt;
    }
    if (!this.dashReadyNotified && this.dashChargeFrac >= 1) {
      this.dashReadyNotified = true;
      this.events.emit('dashReady', { playerIndex: this.index });
    }
    if (this.abilityCooldown > 0) this.abilityCooldown -= dt;
    if (!this.abilityReadyNotified && this.abilityChargeFrac >= 1) {
      this.abilityReadyNotified = true;
      this.events.emit('abilityReady', { playerIndex: this.index });
    }
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.rapidFireTimer > 0) this.rapidFireTimer -= dt;
    this.orbAngle += dt * UV.orbRotationsPerSec * Math.PI * 2;

    if (dashPressed) this.tryDash(moveX, moveZ);
    if (abilityPressed) this.tryAbility(moveX, moveZ);

    const wasDashing = this.dashTimer > 0;
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      const dist = this.dashDistanceOverride > 0 ? this.dashDistanceOverride : DASH.distance;
      const dashSpeed = dist / DASH.duration;
      this.x += this.dashDirX * dashSpeed * dt;
      this.z += this.dashDirZ * dashSpeed * dt;
      if (this.dashTimer <= 0) this.dashDistanceOverride = 0;
    } else {
      this.x += moveX * this.stats.speed * dt;
      this.z += moveZ * this.stats.speed * dt;
      if (moveX !== 0 || moveZ !== 0) {
        this.faceX = moveX;
        this.faceZ = moveZ;
      }
      // NEU (Reise-Ausbau, Singularitaet): sanfter Sog zur Mitte. Nur ausserhalb
      // des Dash (der bleibt knackig). Schritt auf die Distanz gedeckelt, damit
      // die Mitte nie ueberschossen wird (kein Jitter). pullStrength=0 -> No-Op.
      if (this.pullStrength > 0) {
        const pd = Math.hypot(this.x, this.z);
        if (pd > 0.001) {
          const step = Math.min(this.pullStrength * dt, pd);
          this.x -= (this.x / pd) * step;
          this.z -= (this.z / pd) * step;
        }
      }
      // NEU (Reise-Ausbau, Windkanal): konstanter gerichteter Drift. Nur ausserhalb des
      // Dash (der bleibt knackig). KEIN Distanz-Cap — die Brise darf gegen die Wand
      // druecken, der Arena-Clamp unten faengt es ab. driftStrength=0 -> No-Op.
      if (this.driftStrength > 0) {
        this.x += this.driftX * this.driftStrength * dt;
        this.z += this.driftZ * this.driftStrength * dt;
      }
    }

    // Kreis-Arena-Clamp (NEU: Raum-Radius statt fester Konstante)
    const maxR = this.arenaRadius - PLAYER.radius;
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
      const hMax = this.arenaRadius - 1.5;
      if (hd > hMax) {
        hx = (hx / hd) * hMax;
        hz = (hz / hd) * hMax;
      }
      this.blackHoleX = hx;
      this.blackHoleZ = hz;
      this.blackHoleTimer = UV.blackHoleDuration;
      this.events.emit('blackHole', {
        x: hx,
        z: hz,
        radius: UV.blackHoleRadius,
        duration: UV.blackHoleDuration,
      });
    }

    this.velX = (this.x - this.prevX) / dt;
    this.velZ = (this.z - this.prevZ) / dt;
  }

  /** true, wenn der Treffer durchging (keine i-Frames aktiv). */
  takeDamage(amount: number): boolean {
    // targetable-Gate ist zusaetzlich das Sicherheitsnetz gegen vergessene
    // downed-Checks an einzelnen Schadensquellen
    if (!this.targetable || this.hasIFrames) return false;
    this.hp -= amount;
    this.iFrames = PLAYER.iFramesAfterHit;
    this.events.emit('playerHit', {
      damage: amount,
      hp: Math.max(0, this.hp),
      maxHp: this.stats.maxHp,
      playerIndex: this.index,
    });
    if (this.hp <= 0) {
      if (this.phoenixCharge) {
        // NEU (mythisch "Phoenixkern"): einmalige Auto-Wiederbelebung mit VOLLER
        // Energie (secondChance gibt nur 50 %) + Schockwelle. CombatSystem pollt
        // phoenixBlastPending und loest ueber explode() den Wumms aus.
        this.phoenixCharge = false;
        this.hp = this.stats.maxHp;
        this.iFrames = 2;
        this.phoenixBlastPending = true;
        this.events.emit('phoenixRevived', { playerIndex: this.index, x: this.x, z: this.z });
        // HUD/HP-Balken ueber die bestehende Heil-Pipeline aktualisieren (wie revive())
        this.events.emit('playerHealed', {
          amount: this.hp,
          hp: this.hp,
          maxHp: this.stats.maxHp,
          playerIndex: this.index,
        });
      } else if (this.reviveAvailable) {
        this.reviveAvailable = false;
        this.hp = Math.round(this.stats.maxHp * 0.5);
        this.iFrames = 2;
        this.events.emit('playerRevived', { playerIndex: this.index });
      } else if (this.hasTeammate) {
        // Koop: zu Boden statt tot — Partner kann wiederbeleben
        this.downed = true;
        this.hp = 0;
        this.events.emit('playerDowned', { playerIndex: this.index, x: this.x, z: this.z });
      } else {
        this.alive = false;
        this.events.emit('playerDied', { x: this.x, z: this.z });
      }
    }
    return true;
  }

  /** Koop-Wiederbelebung durch den Partner (oder Auto-Aufstehen am Wellenende). */
  revive(hpFrac: number, iFramesSec: number, byPartner = true): void {
    if (!this.downed) return;
    this.downed = false;
    this.hp = Math.max(1, Math.round(this.stats.maxHp * hpFrac));
    this.iFrames = iFramesSec;
    this.events.emit('playerCoopRevived', { playerIndex: this.index, x: this.x, z: this.z, byPartner });
    // Als Heilung melden: HUD-Balken/-Text und "+40"-Popup laufen ueber
    // die bestehende Pipeline (sonst bliebe "AM BODEN" stehen)
    this.events.emit('playerHealed', {
      amount: this.hp,
      hp: this.hp,
      maxHp: this.stats.maxHp,
      playerIndex: this.index,
    });
  }

  heal(amount: number): void {
    if (!this.alive || this.downed) return;
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    const gained = this.hp - before;
    if (gained > 0) {
      this.events.emit('playerHealed', {
        amount: gained,
        hp: this.hp,
        maxHp: this.stats.maxHp,
        playerIndex: this.index,
      });
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
