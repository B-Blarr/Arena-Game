import { UPGRADE_VALUES as UV } from '../config/upgrades';
import { STICKERS, type StickerDef } from '../config/stickers';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import type { SaveData, SaveManager } from '../save/SaveManager';

/**
 * Sticker-Album-Engine: abonniert Events, fuehrt kumulative Zaehler
 * (in-memory auf save.data, persistiert an bestehenden save()-Punkten)
 * und Pro-Run-Flags fuer die Spezial-Sticker. Liest die Welt NUR —
 * kein RNG, keine world-Writes: der Daily-Determinismus bleibt unberuehrt.
 *
 * Virtuelle Zaehler: 'kills' und 'runs' lesen stats.totalKills/totalRuns —
 * Bestandsprofile behalten so ihren Schlaechter-/Stammgast-Fortschritt.
 */
export class StickerSystem {
  /** Im Run freigeschaltete Sticker (fuer den GameOver-Screen). */
  unlockedThisRun: string[] = [];
  /** Zaehler-Deltas dieses Runs (Koop: aufs Partner-Profil anwenden). */
  runDeltas: Record<string, number> = {};

  // Trigger-Indizes (einmal beim Bau berechnet)
  private readonly counterWatch = new Map<string, StickerDef[]>();
  private readonly waveWatch: StickerDef[] = [];
  private readonly scoreWatch: StickerDef[] = [];
  private readonly comboWatch: StickerDef[] = [];
  private readonly flagWatch = new Map<string, StickerDef>();

  // Pro-Run-Zustand
  private perfectWavesThisRun = 0;
  private bossActive = false;
  private bossTookHit = false;
  private bossDashed = false;
  private bossAnyDown = false;
  private coreStolenThisWave = false;
  private goldenWaveNr = -1;
  private bhX = 0;
  private bhZ = 0;
  private bhTime = -1;
  private bhKills = 0;
  /** Waehrend finishRun keine Toasts (die Zusammenfassung zeigt sie). */
  private inFinishRun = false;

  private readonly unsubs: Array<() => void> = [];

  constructor(
    private readonly events: EventBus,
    private readonly save: SaveManager,
    private readonly world: World,
  ) {
    for (const def of STICKERS) {
      const t = def.trigger;
      if (t.kind === 'counter') this.watchCounter(t.counter, def);
      else if (t.kind === 'counterSet') for (const c of t.counters) this.watchCounter(c, def);
      else if (t.kind === 'wave') this.waveWatch.push(def);
      else if (t.kind === 'score') this.scoreWatch.push(def);
      else if (t.kind === 'combo') this.comboWatch.push(def);
      else this.flagWatch.set(t.flag, def);
    }

    this.unsubs.push(
      events.on('runStarted', () => this.resetRun()),
      events.on('enemyKilled', (e) => {
        this.checkCounter('kills'); // stats.totalKills erhoeht Game separat
        if (e.enemyType >= 0) this.bump(`killsType:${e.enemyType}`);
        if (e.elite) this.bump('killsElite');
        // Geheim: Dieb erwischt, bevor er in dieser Welle geklaut hat
        if (e.enemyType === 7 && !this.coreStolenThisWave) this.setFlag('thiefPreSteal');
        // Geheim: 3 Kills im Kollaps-Fenster EINES Schwarzen Lochs
        if (this.bhTime >= 0 && this.world.elapsed - this.bhTime <= 0.25) {
          const dx = e.x - this.bhX;
          const dz = e.z - this.bhZ;
          const r = UV.blackHoleCrushRadius + 1.5;
          if (dx * dx + dz * dz <= r * r && ++this.bhKills >= 3) this.setFlag('blackHole3');
        }
      }),
      events.on('enemyHit', (e) => {
        if (e.crit) this.bump('crits');
      }),
      events.on('pickupCollected', (e) => {
        if (e.kind === 'core') this.bump('cores', e.value);
        else if (e.kind === 'heart') this.bump('hearts');
        else if (e.kind === 'magnet') this.bump('magnets');
      }),
      events.on('playerDashed', () => {
        this.bump('dashes');
        if (this.bossActive) this.bossDashed = true;
      }),
      events.on('playerHit', () => {
        if (this.bossActive) this.bossTookHit = true;
      }),
      events.on('playerDowned', () => {
        if (this.bossActive) this.bossAnyDown = true;
      }),
      events.on('playerCoopRevived', () => this.bump('coopRevives')),
      events.on('playerRevived', () => this.bump('revives')),
      events.on('upgradeChosen', (e) => {
        this.bump('upgrades');
        if (e.rarity === 'legendary') this.bump(`leg:${e.id}`);
      }),
      events.on('waveStarted', (e) => {
        this.coreStolenThisWave = false;
        for (const def of this.waveWatch) {
          if (def.trigger.kind === 'wave' && e.wave >= def.trigger.value) this.unlock(def.id);
        }
      }),
      events.on('coreStolen', () => {
        this.coreStolenThisWave = true;
      }),
      events.on('goldenWave', (e) => {
        this.goldenWaveNr = e.wave;
        this.bump('goldenWaves');
      }),
      events.on('waveCleared', (e) => {
        this.bump('wavesCleared');
        if (e.perfect) {
          this.bump('perfectWaves');
          if (++this.perfectWavesThisRun >= 3) this.setFlag('perfect3');
          if (this.goldenWaveNr === e.wave) this.setFlag('goldenPerfect');
        }
        // Geheim: Welle mit hoechstens 5 HP ueberlebt (Koop: knappster Spieler)
        if (this.world.player.alive && this.world.player.hp <= 5) this.setFlag('closeCall');
        if (this.world.isCoop && e.wave >= 10) this.setFlag('coopWave10');
      }),
      events.on('bossSpawned', () => {
        this.bossActive = true;
        this.bossTookHit = false;
        this.bossDashed = false;
        this.bossAnyDown = false;
        this.bump('bossSeen');
      }),
      events.on('bossDied', (e) => {
        this.bump(`boss:${e.id}`);
        // Nur ein ECHTER Kampf (bossSpawned gesehen) zaehlt fuer die Flags
        if (this.bossActive) {
          if (!this.bossTookHit) this.setFlag('bossNoHit');
          if (!this.bossDashed) this.setFlag('bossNoDash');
          if (this.world.isCoop && !this.bossAnyDown) this.setFlag('coopBossNoDown');
        }
        if (this.world.wave >= 30) this.setFlag('bossTierPlus');
        this.bossActive = false;
      }),
      events.on('capsuleReward', (e) => {
        this.bump('capsules');
        this.bump(`capsule:${e.kind}`);
      }),
      events.on('scoreChanged', (e) => {
        for (const def of this.scoreWatch) {
          if (def.trigger.kind === 'score' && e.score >= def.trigger.value) this.unlock(def.id);
        }
      }),
      events.on('comboChanged', (e) => {
        for (const def of this.comboWatch) {
          if (def.trigger.kind === 'combo' && e.multiplier >= def.trigger.value) this.unlock(def.id);
        }
      }),
      events.on('blackHoleCollapsed', (e) => {
        this.bhX = e.x;
        this.bhZ = e.z;
        this.bhTime = this.world.elapsed;
        this.bhKills = 0;
      }),
    );
  }

  /**
   * Run-Ende (aus Game.finishRun, NACH stats.totalRuns++ und VOR save.save()):
   * wertet die Kontext-Sticker aus und liefert alle Unlocks dieses Runs.
   */
  finishRun(ctx: { difficulty: string; isDaily: boolean; wave: number; heroId: string; weaponId: string; isCoop: boolean }): string[] {
    this.inFinishRun = true;
    this.bump(`hero:${ctx.heroId}`);
    this.bump(`weapon:${ctx.weaponId}`);
    if (ctx.isDaily) this.bump('dailyRuns');
    if (ctx.isCoop) this.bump('coopRuns');
    if (ctx.difficulty === 'hard' && ctx.wave >= 10) this.setFlag('hardWave10');
    this.checkCounter('runs');
    this.checkCounter('kills');
    this.inFinishRun = false;
    return this.unlockedThisRun;
  }

  /**
   * Koop: die Zaehler-Deltas dieses Runs auf ein Partner-Profil anwenden und
   * dessen Sticker pruefen. Gibt die NEU freigeschalteten IDs zurueck.
   */
  applyDeltasTo(data: SaveData): string[] {
    const fresh: string[] = [];
    for (const [counter, delta] of Object.entries(this.runDeltas)) {
      if (counter === 'kills') data.stats.totalKills += delta;
      else if (counter === 'runs') data.stats.totalRuns += delta;
      else data.stickerCounters[counter] = (data.stickerCounters[counter] ?? 0) + delta;
    }
    // Alle Sticker gegen den Partner-Stand pruefen (Run-Flags gelten teamweit:
    // was das Team geschafft hat, kriegen beide)
    for (const def of STICKERS) {
      if (data.stickers[def.id]) continue;
      if (this.isMetFor(def, data) || this.unlockedThisRun.includes(def.id)) {
        data.stickers[def.id] = new Date().toISOString();
        fresh.push(def.id);
      }
    }
    return fresh;
  }

  // ------------------------------------------------ Zaehler & Flags

  private watchCounter(name: string, def: StickerDef): void {
    let list = this.counterWatch.get(name);
    if (!list) {
      list = [];
      this.counterWatch.set(name, list);
    }
    list.push(def);
  }

  private counterValue(name: string, data: SaveData): number {
    if (name === 'kills') return data.stats.totalKills;
    if (name === 'runs') return data.stats.totalRuns;
    return data.stickerCounters[name] ?? 0;
  }

  /** Zaehler erhoehen (nur beobachtete werden gespeichert) + Sticker pruefen. */
  private bump(name: string, n = 1): void {
    if (!this.counterWatch.has(name)) return;
    const data = this.save.data;
    if (name !== 'kills' && name !== 'runs') {
      data.stickerCounters[name] = (data.stickerCounters[name] ?? 0) + n;
    }
    this.runDeltas[name] = (this.runDeltas[name] ?? 0) + n;
    this.checkCounter(name);
  }

  private checkCounter(name: string): void {
    const defs = this.counterWatch.get(name);
    if (!defs) return;
    for (const def of defs) {
      if (this.save.data.stickers[def.id]) continue;
      if (this.isMetFor(def, this.save.data)) this.unlock(def.id);
    }
  }

  private isMetFor(def: StickerDef, data: SaveData): boolean {
    const t = def.trigger;
    if (t.kind === 'counter') return this.counterValue(t.counter, data) >= t.goal;
    if (t.kind === 'counterSet') return t.counters.every((c) => this.counterValue(c, data) >= 1);
    return false; // wave/score/combo/flag sind ereignisgetrieben
  }

  private setFlag(flag: string): void {
    const def = this.flagWatch.get(flag);
    if (def) this.unlock(def.id);
  }

  private unlock(id: string): void {
    const data = this.save.data;
    if (data.stickers[id]) return;
    data.stickers[id] = new Date().toISOString();
    this.unlockedThisRun.push(id);
    if (!this.inFinishRun) this.events.emit('stickerUnlocked', { id });
  }

  private resetRun(): void {
    this.unlockedThisRun = [];
    this.runDeltas = {};
    this.perfectWavesThisRun = 0;
    this.bossActive = false;
    this.bossTookHit = false;
    this.bossDashed = false;
    this.bossAnyDown = false;
    this.coreStolenThisWave = false;
    this.goldenWaveNr = -1;
    this.bhTime = -1;
    this.bhKills = 0;
  }

  dispose(): void {
    for (const u of this.unsubs) u();
  }
}
