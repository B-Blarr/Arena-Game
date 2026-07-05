import { Vector3, type PerspectiveCamera } from 'three';
import { STR } from '../config/strings.de';
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

  private readonly pool: ActivePopup[] = [];
  private poolIdx = 0;
  private readonly comboEl: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private readonly unsubs: Array<() => void> = [];
  private bannerTimeout = 0;

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

    this.unsubs.push(
      events.on('enemyHit', (e) => {
        if (!this.damageNumbersEnabled) return;
        this.spawn(e.x, e.z, String(e.damage) + (e.crit ? '!' : ''), e.crit ? 'crit' : '');
      }),
      events.on('playerHealed', (e) => {
        this.spawn(this.world.player.x, this.world.player.z, `+${e.amount}`, 'heal-pop');
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
        if (!e.isBossWave) this.banner(`${STR.waveIncoming} ${e.wave}`, '');
      }),
      events.on('bossSpawned', (e) => {
        const name = STR.bosses[e.name] ?? e.name.toUpperCase();
        this.banner(`⚠ ${name} ⚠`, 'boss-banner');
      }),
      events.on('playerRevived', () => this.banner(STR.revived, 'gold-banner')),
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

  banner(text: string, extraClass: string): void {
    window.clearTimeout(this.bannerTimeout);
    this.bannerEl.textContent = text;
    this.bannerEl.className = `banner ${extraClass}`;
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    this.bannerTimeout = window.setTimeout(() => {
      this.bannerEl.classList.remove('show');
    }, 1900);
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
    this.comboEl.classList.remove('show');
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    window.clearTimeout(this.bannerTimeout);
  }
}
