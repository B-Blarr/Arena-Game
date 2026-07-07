import { Vector3, type PerspectiveCamera } from 'three';
import { STR } from '../config/strings.de';
import { STICKERS } from '../config/stickers';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';

const DMG_POOL_SIZE = 32;
const projVec = new Vector3();

interface ActivePopup {
  el: HTMLElement;
  wx: number;
  wz: number;
  age: number;
  dur: number;
  offsetX: number;
  active: boolean;
}

/**
 * Schadenszahlen (fester DOM-Pool, nur transform/opacity — kein Layout-
 * Thrashing), Combo-Popups und Banner. Weltposition -> Screen via project().
 */
export class Popups {
  /** Setting "Schadenszahlen" an/aus. */
  damageNumbersEnabled = true;
  /** Koop: Anzeigenamen fuer Down-Banner (setzt RunState beim Start). */
  coopNames: [string, string] | null = null;

  private readonly pool: ActivePopup[] = [];
  private poolIdx = 0;
  private readonly comboEl: HTMLElement;
  private readonly bannerEl: HTMLElement;
  /** Sticker-Toast: EIGENES Element (das Banner ueberschreiben Wellen-Banner). */
  private readonly stickerEl: HTMLElement;
  /** NEU: „Besonderer" Banner (Mythisch/Legendaer) — EIGENES Element, damit der
   *  Wellen-Banner ihn nicht ueberschreibt; steht laenger + an eigener Position. */
  private readonly specialBannerEl: HTMLElement;
  private readonly stickerQueue: string[] = [];
  private stickerBusy = false;
  private stickerTimeout = 0;
  private readonly unsubs: Array<() => void> = [];
  private bannerTimeout = 0;
  private specialBannerTimeout = 0;

  constructor(
    layer: HTMLElement,
    events: EventBus,
    private readonly world: World,
  ) {
    for (let i = 0; i < DMG_POOL_SIZE; i++) {
      const el = document.createElement('div');
      el.className = 'dmg-popup';
      layer.appendChild(el);
      this.pool.push({ el, wx: 0, wz: 0, age: 0, dur: 0.7, offsetX: 0, active: false });
    }
    this.comboEl = document.createElement('div');
    this.comboEl.className = 'combo-popup';
    layer.appendChild(this.comboEl);
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'banner';
    layer.appendChild(this.bannerEl);
    this.stickerEl = document.createElement('div');
    this.stickerEl.className = 'sticker-toast';
    layer.appendChild(this.stickerEl);
    this.specialBannerEl = document.createElement('div');
    this.specialBannerEl.className = 'special-banner';
    layer.appendChild(this.specialBannerEl);

    this.unsubs.push(
      events.on('enemyHit', (e) => {
        if (!this.damageNumbersEnabled) return;
        this.spawn(e.x, e.z, String(e.damage) + (e.crit ? '!' : ''), e.crit ? 'crit' : '');
      }),
      events.on('playerHealed', (e) => {
        const p = this.world.players[e.playerIndex] ?? this.world.player;
        this.spawn(p.x, p.z, `+${e.amount}`, 'heal-pop');
      }),
      events.on('comboChanged', (e) => {
        // Popup nur an den Stufen-Schwellen
        if (e.kills === 5 || e.kills === 10 || e.kills === 20) {
          const tier = e.kills >= 20 ? 't3' : e.kills >= 10 ? 't2' : 't1';
          this.combo(`Combo ×${e.multiplier}!`, tier);
        }
      }),
      events.on('waveCleared', (e) => {
        this.banner(e.perfect ? `${STR.waveCleared} ${STR.wavePerfect}` : STR.waveCleared, 'gold-banner');
      }),
      events.on('waveStarted', (e) => {
        if (e.isBossWave) return;
        // Goldene Welle: EIN kombinierter Banner (hat Vorrang vor dem Raum-Auftritt).
        // Marker-Klasse `golden-wave` + laengere Haltezeit -> gut lesbar (~3,5 s).
        if (this.world.goldenWave) {
          this.banner(`${STR.waveIncoming} ${e.wave} — ${STR.goldenWave}`, 'gold-banner golden-wave', 4500);
          return;
        }
        // NEU (Raum-Auftritt): echte Reise-Raeume bekommen Name + Flavor in der Akzentfarbe,
        // die Wellennummer bleibt prominent (Zeile 1). Klassik/Normal -> schlichtes "Welle X".
        const rm = this.world.roomMods;
        const info = STR.rooms[rm.id];
        if (rm.id !== 'normal' && info) {
          const accent = rm.theme?.grid ?? rm.theme?.ring ?? 0xffffff;
          this.bannerRoom(e.wave, info.name, info.flavor, accent);
        } else {
          this.banner(`${STR.waveIncoming} ${e.wave}`, '');
        }
      }),
      events.on('bossSpawned', (e) => {
        const name = STR.bosses[e.name] ?? e.name.toUpperCase();
        this.banner(`⚠ ${name} ⚠`, 'boss-banner');
      }),
      events.on('playerRevived', () => this.banner(STR.revived, 'gold-banner')),
      // Ueberraschungen & neue Gegner
      events.on('capsuleIncoming', () => this.banner(STR.capsuleIncoming, 'gold-banner')),
      events.on('capsuleReward', (e) => {
        this.spawn(e.x, e.z, STR.capsuleRewards[e.kind] ?? '', 'heal-pop');
      }),
      events.on('thiefEscaped', (e) => {
        this.spawn(e.x, e.z, `${STR.thiefEscaped} (−${e.cores} ⬡)`, 'crit');
      }),
      events.on('coreStolen', (e) => {
        if (this.damageNumbersEnabled) this.spawn(e.x, e.z, '−⬡', '');
      }),
      events.on('eliteSpawned', (e) => {
        this.spawn(e.x, e.z, `★ ${STR.eliteSpawned}`, 'crit');
      }),
      // Legendaer/Mythisch gewaehlt: eigenes Banner-Element, das der Wellen-Banner
      // NICHT ueberschreibt -> steht laenger + eigene Position ueber dem Wellen-Banner.
      events.on('upgradeChosen', (e) => {
        if (e.rarity === 'mythic') this.specialBanner(STR.mythicFound, 'mythic', 4200);
        else if (e.rarity === 'legendary') this.specialBanner(STR.legendaryFound, 'gold', 4200);
      }),
      // NEU (mythisch "Phoenixkern"): Auferstehung gross ankuendigen
      events.on('phoenixRevived', () => this.banner(STR.phoenixRevived, 'gold-banner', 2600)),
      // Pad eines Spielers weg -> RunState pausiert, wir erklaeren warum
      events.on('padDisconnected', (e) => {
        if (e.slot >= 0) this.banner(STR.padDisconnected, 'boss-banner');
      }),
      // Sticker freigeschaltet: Toast oben rechts, gequeued (kein Gameplay-Stop)
      events.on('stickerUnlocked', (e) => {
        this.stickerQueue.push(e.id);
        if (!this.stickerBusy) this.nextStickerToast();
      }),
      // Koop: Down/Rettung gross ankuendigen (Kinder sollen sofort reagieren)
      events.on('playerDowned', (e) => {
        const name = this.coopNames?.[e.playerIndex as 0 | 1] ?? `Spieler ${e.playerIndex + 1}`;
        this.banner(STR.downedBanner(name), 'boss-banner');
      }),
      events.on('playerCoopRevived', (e) => {
        if (e.byPartner) this.banner(STR.coopRevivedBanner, 'gold-banner');
      }),
    );
  }

  spawn(wx: number, wz: number, text: string, extraClass: string): void {
    const p = this.pool[this.poolIdx] as ActivePopup;
    this.poolIdx = (this.poolIdx + 1) % DMG_POOL_SIZE;
    p.el.textContent = text;
    p.el.className = `dmg-popup ${extraClass}`;
    p.wx = wx;
    p.wz = wz;
    p.age = 0;
    p.dur = 0.7;
    p.offsetX = (Math.random() - 0.5) * 28;
    p.active = true;
    p.el.style.visibility = 'visible';
  }

  combo(text: string, tier: string): void {
    this.comboEl.textContent = text;
    this.comboEl.className = `combo-popup ${tier}`;
    // Reflow erzwingen, damit die Animation neu startet
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('show');
  }

  /** Ist gerade ein Vollbild-Screen (Upgrade/Pause/...) offen? */
  private isScreenBlocking(): boolean {
    const screens = document.getElementById('screens');
    return !!screens?.querySelector('.screen:not(.hidden)');
  }

  /**
   * Naechste Erfolgs-Karte aus der Queue zeigen (4.5 s + kurze Pause).
   * GEAENDERT: zentral-oben als heroische Karte (Label / grosses Icon / Name)
   * statt kleiner Toast oben rechts — bleibt dank pointer-events:none und
   * Auto-Dismiss gameplay-durchlaessig. Solange ein Vollbild-Screen offen ist
   * (Upgrade-/Pause-Screen), wird die Karte aufgeschoben, damit sie nicht die
   * Upgrade-Auswahl ueberlagert — sie erscheint dann heroisch im Spiel.
   */
  private nextStickerToast(): void {
    if (this.stickerQueue.length === 0) {
      this.stickerBusy = false;
      return;
    }
    this.stickerBusy = true;
    if (this.isScreenBlocking()) {
      window.clearTimeout(this.stickerTimeout);
      this.stickerTimeout = window.setTimeout(() => this.nextStickerToast(), 300);
      return;
    }
    const id = this.stickerQueue.shift() as string;
    const def = STICKERS.find((s) => s.id === id);
    const info = STR.stickers[id];
    this.stickerEl.innerHTML = `
      <span class="sticker-toast-label">${STR.newSticker}</span>
      <span class="sticker-toast-icon">${def?.icon ?? '❔'}</span>
      <span class="sticker-toast-name">${info?.name ?? id}</span>
    `;
    this.stickerEl.style.setProperty('--rarity', `var(--rarity-${def?.rarity ?? 'common'})`);
    this.stickerEl.classList.remove('show');
    void this.stickerEl.offsetWidth;
    this.stickerEl.classList.add('show');
    window.clearTimeout(this.stickerTimeout);
    this.stickerTimeout = window.setTimeout(() => {
      this.stickerEl.classList.remove('show');
      this.stickerTimeout = window.setTimeout(() => this.nextStickerToast(), 400);
    }, 4500);
  }

  banner(text: string, extraClass: string, holdMs = 1900): void {
    window.clearTimeout(this.bannerTimeout);
    this.bannerEl.textContent = text;
    this.bannerEl.className = `banner ${extraClass}`;
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    // holdMs muss >= Animationsdauer sein, sonst wird .show mittendrin entfernt
    this.bannerTimeout = window.setTimeout(() => {
      this.bannerEl.classList.remove('show');
    }, holdMs);
  }

  /** NEU (Raum-Auftritt): zweizeiliger Reise-Banner — Wellennummer (grosse Banner-Schrift,
   *  bleibt prominent) + Raumname und Flavor in der Akzentfarbe. Nutzt DAS Wellen-Banner-
   *  Element (kein Extra-Layout); Akzent via inline `--accent` (wie die Sticker-Toast). */
  bannerRoom(wave: number, name: string, flavor: string, accent: number): void {
    window.clearTimeout(this.bannerTimeout);
    const hex = `#${(accent & 0xffffff).toString(16).padStart(6, '0')}`;
    this.bannerEl.innerHTML =
      `<span class="banner-room-wave">${STR.waveIncoming} ${wave}</span>` +
      `<span class="banner-room-sub">${name} · ${flavor}</span>`;
    this.bannerEl.className = 'banner room-banner';
    this.bannerEl.style.setProperty('--accent', hex);
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    this.bannerTimeout = window.setTimeout(() => {
      this.bannerEl.classList.remove('show');
    }, 2600);
  }

  /** NEU: „Besonderer" Banner (Mythisch/Legendaer) auf EIGENEM Element — laeuft
   *  unabhaengig vom Wellen-Banner, wird also nicht ueberschrieben. `colorClass`
   *  ist 'mythic' (Regenbogen) oder 'gold' (Legendaer). */
  specialBanner(text: string, colorClass: string, holdMs = 4200): void {
    window.clearTimeout(this.specialBannerTimeout);
    this.specialBannerEl.textContent = text;
    this.specialBannerEl.className = `special-banner ${colorClass}`;
    void this.specialBannerEl.offsetWidth;
    this.specialBannerEl.classList.add('show');
    this.specialBannerTimeout = window.setTimeout(() => {
      this.specialBannerEl.classList.remove('show');
    }, holdMs);
  }

  /** Laeuft auf Echtzeit — Popups bleiben auch im Hitstop fluessig. */
  update(rawDt: number, camera: PerspectiveCamera): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += rawDt;
      if (p.age >= p.dur) {
        p.active = false;
        p.el.style.visibility = 'hidden';
        continue;
      }
      const t = p.age / p.dur;
      projVec.set(p.wx, 1.0, p.wz).project(camera);
      const sx = (projVec.x * 0.5 + 0.5) * window.innerWidth + p.offsetX;
      const sy = (-projVec.y * 0.5 + 0.5) * window.innerHeight - t * 40;
      const opacity = t > 0.66 ? 1 - (t - 0.66) / 0.34 : 1;
      p.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      p.el.style.opacity = opacity.toFixed(2);
    }
  }

  reset(): void {
    for (const p of this.pool) {
      p.active = false;
      p.el.style.visibility = 'hidden';
    }
    this.bannerEl.classList.remove('show');
    this.specialBannerEl.classList.remove('show'); // NEU
    this.comboEl.classList.remove('show');
    this.stickerQueue.length = 0;
    this.stickerBusy = false;
    this.stickerEl.classList.remove('show');
    window.clearTimeout(this.stickerTimeout);
    window.clearTimeout(this.specialBannerTimeout); // NEU
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    window.clearTimeout(this.bannerTimeout);
    window.clearTimeout(this.stickerTimeout);
    window.clearTimeout(this.specialBannerTimeout); // NEU
  }
}
