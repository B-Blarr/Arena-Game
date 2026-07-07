import { ARENA_RADIUS, COOP, HARD_UNLOCK_WAVE, LIMITS, META, isBossWave } from '../../config/balance';
import { getHero } from '../../config/heroes';
import { ROOM_NORMAL, type RoomDef } from '../../config/rooms';
import { getColorway } from '../../config/stickers';
import { STR } from '../../config/strings.de';
import { UPGRADE_VALUES as UV } from '../../config/upgrades'; // NEU: Zeitbruch-Zeitskala
import { PICKUP_CORE } from '../../entities/Pickup';
import { updateEnemies } from '../../entities/behaviors';
import { updateBoss } from '../../entities/bossPatterns';
import type { Boss } from '../../entities/Boss';
import type { Player } from '../../entities/Player';
import type { InputState } from '../../input/InputManager';
import type { PlayerConfig } from '../World';
import type { GameState } from '../StateMachine';
import type { Game } from '../Game';

type RunPhase = 'wave' | 'waveEnd' | 'upgrade' | 'pathChoice' | 'dying';
type TutStage = 'move' | 'dash' | 'collect' | 'done';

/**
 * Der eigentliche Lauf. Interne Phasen: wave -> waveEnd -> upgrade -> wave...
 * Pause ist ein Flag (Simulation steht via timeScale 0, Rendern laeuft).
 * Restart recycelt Welt und Pools — es wird nichts neu gebaut.
 */
export class RunState implements GameState {
  paused = false;
  private isActive = false;
  private phase: RunPhase = 'wave';
  private phaseTimer = 0;
  private tookDamageThisWave = false;
  private pendingGuaranteeRare = false;
  /** Koop-Upgrade-Sequenz: wessen Wahl gerade laeuft (0 -> 1 -> weiter). */
  private chooserIdx: 0 | 1 = 0;
  /** NEU (Reise-Modus): 'journey' schaltet die Weg-Wahl frei (aus Game.runMode). */
  private runMode: 'classic' | 'journey' = 'classic';
  /** NEU (Reise-Modus): gewaehlter Raum-Typ fuer die naechste Welle (null = normal). */
  private nextRoom: RoomDef | null = null;
  private tutStage: TutStage = 'done';
  private collectPromptShown = false;
  private pauseKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  /** FIX: Handle des Hard-Unlock-Banner-Timeouts (in exit abgebrochen). */
  private unlockBannerTimer = 0;
  /** Wiederverwendetes Input-Array fuer combat.update (keine Allokationen). */
  private readonly inputs: InputState[] = [];
  private readonly unsubs: Array<() => void> = [];

  constructor(private readonly game: Game) {
    this.unsubs.push(
      game.events.on('playerHit', () => {
        this.tookDamageThisWave = true;
      }),
      game.events.on('playerDied', () => {
        if (this.isActive && this.phase !== 'dying') {
          this.phase = 'dying';
          this.phaseTimer = 1.9;
        }
      }),
      // Pad eines Spielers abgezogen -> Auto-Pause (Kind stolpert ueber Kabel).
      // Waehrend der Upgrade-Wahl stattdessen: ALLE Sperren loesen — sonst
      // haette der Screen ohne das tote Pad keine berechtigte Quelle mehr
      // (Softlock bei timeScale 0)
      game.events.on('padDisconnected', (e) => {
        if (e.slot < 0 || !this.isActive) return;
        if (this.phase === 'upgrade') {
          game.uiNav.setInputFilter(null);
          game.upgradeScreen.unlockInputs();
        } else if (this.phase === 'pathChoice') {
          // NEU (Reise-Modus): gleicher Softlock-Schutz wie bei der Upgrade-Wahl
          game.uiNav.setInputFilter(null);
          game.pathScreen.unlockInputs();
        } else {
          this.pauseIfActive();
        }
      }),
    );
  }

  enter(): void {
    const g = this.game;
    const s = g.save.data.settings;
    const hero = getHero(s.heroId);

    // Spieler-Aufstellung: P1 aus dem aktiven Profil; P2 (Koop) aus dem
    // gewaehlten Partner-Profil oder als Gast mit frischen Defaults
    const configs: PlayerConfig[] = [{
      hero,
      weaponId: s.weaponId,
      perma: g.save.data.permaUpgrades,
      autoAim: s.autoAim,
    }];
    const p2 = g.runCoopP2;
    if (p2) {
      if (p2.profileId) {
        const data = g.save.profileData(p2.profileId);
        configs.push({
          hero: getHero(data.settings.heroId),
          weaponId: data.settings.weaponId,
          perma: data.permaUpgrades,
          autoAim: data.settings.autoAim,
        });
        g.instRenderer.setHero(
          getHero(data.settings.heroId),
          getColorway(data.settings.colorwayId, data.unlockedColorways),
          1,
        );
      } else {
        configs.push({ hero: getHero('volt'), weaponId: 'default', perma: {}, autoAim: true });
        g.instRenderer.setHero(getHero('volt'), undefined, 1);
      }
    }

    g.world.reset(g.runSeed, g.runDifficulty, configs, g.runIsDaily);
    g.waves.reset();
    g.score.reset();
    g.pickupSystem.reset();
    g.surprise.reset();
    g.path.reset(); // NEU (Reise-Modus)
    g.runStats.reset();
    g.upgrades.reset();
    g.coopSystem.reset();
    g.particles.reset();
    g.instRenderer.reset();
    g.instRenderer.setHero(hero, getColorway(s.colorwayId, g.save.data.unlockedColorways));
    g.instRenderer.heroPreview = false;
    g.time.reset();
    g.cameraRig.reset();
    g.cameraRig.snapTo(0, 0);
    g.popups.reset();
    g.popups.coopNames = g.world.isCoop ? g.coopNames() : null;
    g.hud.resetForRun(g.world, g.coopNames());
    g.hud.show();
    g.ui.showScreen(null);

    if ((g.save.data.permaUpgrades.headstart ?? 0) > 0) g.upgrades.applyHeadstart(0);
    if (p2?.profileId && (g.save.profileData(p2.profileId).permaUpgrades.headstart ?? 0) > 0) {
      g.upgrades.applyHeadstart(1);
    }

    g.music.start();
    g.music.setWave(1);
    g.music.setBossMode(false);

    this.paused = false;
    this.isActive = true;
    this.phase = 'wave';
    this.pendingGuaranteeRare = false;
    this.chooserIdx = 0;
    this.runMode = g.runMode; // NEU (Reise-Modus)
    this.nextRoom = null;
    // Menue-Klick/A-Button darf nicht als erster Dash im Run feuern
    g.input.resetTransient();
    g.events.emit('runStarted', {});
    this.startWave(1);
    // FIX: Arena-Optik/Groesse SOFORT einnehmen (startWave(1) hat via waveStarted die
    // Ziele gesetzt) — sonst morpht Wand/Ring/Farbe ~2s vom letzten Raum des Vorlaufs
    // (z.B. Oase-Radius 17.6) in den neuen Lauf.
    g.arena.snapToTargets();
    // Onboarding nur solo — im Koop erklaeren sich die Spieler gegenseitig
    if (g.world.isCoop) this.tutStage = 'done';
    else this.initTutorial();

    this.pauseKeyHandler = (e: KeyboardEvent): void => {
      if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) this.togglePause();
    };
    window.addEventListener('keydown', this.pauseKeyHandler);
  }

  exit(): void {
    const g = this.game;
    this.isActive = false;
    if (this.pauseKeyHandler) {
      window.removeEventListener('keydown', this.pauseKeyHandler);
      this.pauseKeyHandler = null;
    }
    if (this.unlockBannerTimer) {
      window.clearTimeout(this.unlockBannerTimer);
      this.unlockBannerTimer = 0;
    }
    g.uiNav.setInputFilter(null);
    g.upgradeScreen.hide();
    g.pathScreen.hide(); // NEU (Reise-Modus)
    g.ui.hidePrompt();
    g.hud.hide();
    g.time.reset();
    // Tod WAEHREND eines Bosskampfs: Arena nicht im Boss-Look zuruecklassen
    g.arena.setBossMode(false);
    g.audioEngine.duckMusic(false);
    this.paused = false;
  }

  private startWave(w: number): void {
    const g = this.game;
    this.tookDamageThisWave = false;
    // NEU (Reise-Modus): Raum-Modifikator VOR surprise/waves setzen (compose +
    // scalingForWave lesen ihn). Boss-Wellen und Klassik bekommen ROOM_NORMAL,
    // weil nextRoom dort nie gesetzt wird bzw. die Weg-Wahl uebersprungen ist.
    g.world.roomMods = this.nextRoom ?? ROOM_NORMAL;
    this.nextRoom = null;
    // NEU (Reise-Ausbau): Arena-Groesse + Gegner-Limit aus dem Raum ableiten. IMMER
    // aus der Basis-Konstante rechnen (nie vom evtl. schon skalierten Wert). ROOM_NORMAL
    // -> arenaMult/maxEnemiesMult undefined -> Basiswerte -> bit-identisch zum Klassik.
    const rm = g.world.roomMods;
    const coop = g.world.players.length > 1;
    g.world.arenaRadius = ARENA_RADIUS * (rm.arenaMult ?? 1);
    g.world.maxEnemiesLimit = Math.round((coop ? COOP.maxEnemies : LIMITS.maxEnemies) * (rm.maxEnemiesMult ?? 1));
    // Player hat kein world-Handle: Clamp-Radius + Singularitaets-Sog pro Spieler setzen.
    for (let i = 0; i < g.world.players.length; i++) {
      const p = g.world.players[i] as Player;
      p.arenaRadius = g.world.arenaRadius;
      p.pullStrength = rm.pullStrength ?? 0;
    }
    // NEU (Reise-Ausbau): Gefahren-Zonen der Welle zuruecksetzen (liest roomMods.hazard).
    g.hazards.reset();
    // VOR waves.startWave: Spawns/Scaling muessen das Golden-Flag schon sehen
    g.surprise.rollForWave(w);
    g.waves.startWave(w);
    g.music.setWave(w);
    g.music.setBossMode(isBossWave(w));
  }

  togglePause(): void {
    if (!this.isActive || this.phase === 'upgrade' || this.phase === 'pathChoice' || this.phase === 'dying') return;
    this.paused = !this.paused;
    const g = this.game;
    g.time.baseScale = this.paused ? 0 : 1;
    if (this.paused) {
      g.pauseScreen.refresh();
      g.ui.showScreen('screen-pause');
      g.audioEngine.duckMusic(true);
    } else {
      g.ui.showScreen(null);
      g.audioEngine.duckMusic(false);
      g.input.resetTransient();
    }
  }

  /** Auto-Pause bei Tab-Wechsel. */
  pauseIfActive(): void {
    if (this.isActive && !this.paused && (this.phase === 'wave' || this.phase === 'waveEnd')) {
      this.togglePause();
    }
  }

  update(dt: number): void {
    const g = this.game;
    const world = g.world;
    world.elapsed += dt;

    // NEU (mythisch "Zeitbruch"): normale Gegner + deren Kugeln verlangsamen, solange
    // ein Spieler das Upgrade traegt. Der Boss-Pfad liest enemyTimeScale NICHT -> Boss
    // bleibt normal schnell (Boss-Duell fair). Pro Frame gesetzt, damit Koop/Revive stimmen.
    world.enemyTimeScale = world.players.some((p) => p.stackOf('timeBreak') > 0)
      ? UV.timeBreakScale
      : 1;

    if (this.phase === 'dying') {
      // Welt klingt in Zeitlupe aus, dann Abrechnung
      g.collision.fillSpatialHash();
      updateEnemies(world, dt, g.events);
      g.collision.update(dt);
      g.combat.sweepDead(); // fliegende Projektile toeten weiter — Tote aufraeumen
      g.particles.update(dt);
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) g.finishRun();
      return;
    }

    // Input + Bewegung pro Spieler (Solo: nur Slot 0)
    this.inputs.length = 0;
    for (let i = 0; i < world.players.length; i++) {
      const p = world.players[i] as Player;
      const input = g.input.sample(i as 0 | 1, g.cameraRig.camera, p.x, p.z);
      this.inputs.push(input);
      p.update(dt, input.moveX, input.moveZ, input.dashJustPressed);
      if (p.isDashing) g.particles.dashTrail(p.x, p.z);
    }

    g.collision.fillSpatialHash();
    updateEnemies(world, dt, g.events);

    const boss = world.boss;
    if (boss) {
      updateBoss(boss, dt, world, g.events);
      if (boss.hp <= 0) this.handleBossDeath(boss);
    }

    g.waves.update(dt);
    g.collision.update(dt);
    g.combat.update(dt, this.inputs);
    g.coopSystem.update(dt);
    g.pickupSystem.update(dt);
    g.surprise.update(dt);
    // NEU (Reise-Ausbau): Gefahren-Zonen nur waehrend der aktiven Welle ticken lassen.
    if (this.phase === 'wave') g.hazards.update(dt);
    g.score.update(dt);
    g.particles.update(dt);

    // Koop-Game-Over: erst wenn BEIDE gleichzeitig am Boden sind
    if (world.isCoop && world.allPlayersDown()) {
      const p0 = world.players[0] as Player;
      g.events.emit('playerDied', { x: p0.x, z: p0.z });
      return;
    }

    const input0 = this.inputs[0];
    if (input0) this.updateTutorial(input0.moveX, input0.moveZ);

    if (this.phase === 'wave' && g.waves.isWaveCleared()) {
      this.onWaveCleared();
    } else if (this.phase === 'waveEnd') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.openUpgradeChoice();
    }
  }

  private onWaveCleared(): void {
    const g = this.game;
    const w = g.world.wave;
    this.phase = 'waveEnd';
    this.phaseTimer = 1.6;
    // Koop: niemand sitzt die Upgrade-Phase am Boden ab (VOR dem Banner)
    g.coopSystem.reviveAll();
    g.pickupSystem.collectAllCores();
    // NEU (Reise-Modus): Raum-Belohnungen der GERAEUMTEN Welle (roomMods ist noch die
    // dieser Welle). ROOM_NORMAL = alle No-Ops, Klassik unberuehrt.
    const rm = g.world.roomMods;
    if (rm.healFrac > 0) {
      for (let i = 0; i < g.world.players.length; i++) {
        const p = g.world.players[i] as Player;
        if (p.targetable) p.heal(Math.round(p.stats.maxHp * rm.healFrac));
      }
    }
    if (rm.bonusCores > 0) {
      g.world.runCores += rm.bonusCores;
      g.events.emit('coresChanged', { runCores: g.world.runCores });
    }
    // guaranteeRare wirkt auf die Upgrade-Wahl NACH dieser Raum-Welle (openUpgradeChoice)
    if (rm.guaranteeRare) this.pendingGuaranteeRare = true;
    const perfect = !this.tookDamageThisWave;
    const bonus = g.score.waveBonus(w, perfect);
    g.events.emit('waveCleared', { wave: w, perfect, bonus });

    // NEU (Reise-Ausbau): Erfolgs-Zaehler fuer besuchte Raum-Typen. Nur im Reise-Modus
    // und nur fuer echte Raeume (Klassik/Boss/Normal feuern nichts -> kein Spam).
    if (this.runMode === 'journey' && rm.id !== 'normal') {
      g.events.emit('journeyRoomCleared', { room: rm.id, isRisk: rm.isRisk });
    }

    // "Schwer" freischalten: Welle 10 auf Normal geschafft (Boss B besiegt).
    // Bewusst AUCH im Reise-Modus erlaubt (kein runMode-Gate): Welle 10 zu erreichen ist
    // auch dort eine Leistung, und Freischalten motiviert die Kinder. Anders als die
    // Bestenliste (Game.finishRun) ist dieses Unlock kein Vergleichswert.
    if (w >= HARD_UNLOCK_WAVE && g.runDifficulty === 'normal' && !g.save.data.hardUnlocked) {
      g.save.data.hardUnlocked = true;
      g.save.save();
      // FIX: Handle merken + in exit() abbrechen — sonst feuert der Banner ueber
      // GameOver/Menue, falls der Spieler binnen 2s nach dem Clear stirbt.
      this.unlockBannerTimer = window.setTimeout(() => g.popups.banner(STR.hardUnlocked, 'gold-banner'), 2000);
    }
  }

  private openUpgradeChoice(): void {
    const g = this.game;
    this.phase = 'upgrade';
    this.chooserIdx = 0;
    // Auch wer im kurzen Wellenende-Fenster fiel, steht zur Wahl wieder auf
    g.coopSystem.reviveAll();
    g.time.baseScale = 0;
    g.audioEngine.duckMusic(true);
    this.showChoiceFor(0, this.pendingGuaranteeRare);
    g.ui.showScreen('screen-upgrade');
  }

  /** Angebot fuer einen Spieler wuerfeln und den Screen entsprechend gaten. */
  private showChoiceFor(idx: 0 | 1, guaranteeRare: boolean): void {
    const g = this.game;
    const offers = g.upgrades.rollOffers(guaranteeRare, idx);
    const player = (g.world.players[idx] ?? g.world.players[0]) as Player;
    if (g.world.isCoop) {
      const source = g.input.sourceOfSlot(idx);
      const names = g.coopNames();
      g.uiNav.setInputFilter(idx);
      g.upgradeScreen.show(offers, true, player, {
        slot: idx,
        label: STR.upgradeChooser(names[idx] ?? `Spieler ${idx + 1}`),
        allowKeys: source === 'wasd+mouse' || source === 'arrows',
        allowMouse: source === 'wasd+mouse',
      });
    } else {
      g.upgradeScreen.show(offers, true, player);
    }
  }

  /** Callback der Upgrade-Karten (Maus, Tasten 1/2/3 oder Pad). */
  chooseUpgrade(index: number): void {
    const g = this.game;
    if (this.phase !== 'upgrade') return;
    const def = g.upgrades.currentOffers[index];
    if (!def) return;
    g.upgrades.apply(def, this.chooserIdx);

    // Koop: nach Spieler 1 waehlt Spieler 2 (eigener Stream, eigener Reroll);
    // das garantierte Rare nach Bossen bekommen BEIDE
    if (g.world.isCoop && this.chooserIdx === 0) {
      this.chooserIdx = 1;
      this.showChoiceFor(1, this.pendingGuaranteeRare);
      return;
    }

    this.pendingGuaranteeRare = false;
    g.uiNav.setInputFilter(null);
    g.upgradeScreen.hide();

    // NEU (Reise-Modus): nach der Upgrade-Wahl die Weg-Wahl fuer die naechste Welle.
    // Uebersprungen im Klassik-Modus und wenn die naechste Welle ein Boss ist.
    const nextWave = g.world.wave + 1;
    if (this.runMode === 'journey' && !isBossWave(nextWave)) {
      this.openPathChoice(nextWave);
      return;
    }
    this.finishInterludeAndStart(nextWave);
  }

  /** NEU (Reise-Modus): heutiger chooseUpgrade-Abschluss = der Klassik-Pfad (unveraendert). */
  private finishInterludeAndStart(w: number): void {
    const g = this.game;
    g.ui.showScreen(null);
    g.time.baseScale = 1;
    g.audioEngine.duckMusic(false);
    g.input.resetTransient();
    this.phase = 'wave';
    this.startWave(w);
  }

  /** NEU (Reise-Modus): Weg-Wahl-Screen oeffnen. Zeit bleibt 0, Musik bleibt geduckt. */
  private openPathChoice(nextWave: number): void {
    const g = this.game;
    this.phase = 'pathChoice';
    const offers = g.path.rollOffers(nextWave);
    // Koop: geteilte Team-Entscheidung -> KEIN per-Slot-Filter (beide duerfen waehlen,
    // erster Klick gewinnt). Vermeidet Pad-Disconnect-Softlock und Tastatur-Aussperrung.
    if (g.world.isCoop) {
      g.uiNav.setInputFilter(null);
      g.pathScreen.show(offers, STR.chooseRoomCoop);
    } else {
      g.pathScreen.show(offers);
    }
    g.ui.showScreen('screen-path');
  }

  /** NEU (Reise-Modus): Callback der Weg-Karten. Merkt den Raum, startet dann die Welle. */
  choosePath(index: number): void {
    const g = this.game;
    if (this.phase !== 'pathChoice') return;
    const offer = g.path.currentOffers[index];
    if (!offer) return;
    this.nextRoom = offer.hidden ?? offer.def; // Mystery: aufgeloester Raum
    g.uiNav.setInputFilter(null);
    g.pathScreen.hide();
    this.finishInterludeAndStart(g.world.wave + 1);
  }

  rerollUpgrades(): void {
    const g = this.game;
    if (this.phase !== 'upgrade') return;
    const offers = g.upgrades.reroll(false, this.chooserIdx);
    if (!offers) return;
    const player = (g.world.players[this.chooserIdx] ?? g.world.players[0]) as Player;
    if (g.world.isCoop) {
      const source = g.input.sourceOfSlot(this.chooserIdx);
      const names = g.coopNames();
      g.upgradeScreen.show(offers, false, player, {
        slot: this.chooserIdx,
        label: STR.upgradeChooser(names[this.chooserIdx] ?? `Spieler ${this.chooserIdx + 1}`),
        allowKeys: source === 'wasd+mouse' || source === 'arrows',
        allowMouse: source === 'wasd+mouse',
      });
    } else {
      g.upgradeScreen.show(offers, false, player);
    }
  }

  private handleBossDeath(boss: Boss): void {
    const g = this.game;
    const bossNr = Math.max(1, Math.floor(g.world.wave / 5));
    g.events.emit('bossDied', { x: boss.x, z: boss.z, color: boss.def.color, id: boss.def.id });
    g.score.bossBonus(bossNr);
    // Belohnung: Kern-Fontaene + Heilung fuer ALLE Lebenden + Rare danach
    g.pickupSystem.spawnCoreFountain(boss.x, boss.z, META.bossCoresBase + META.bossCoresPerNr * bossNr);
    for (let i = 0; i < g.world.players.length; i++) {
      const p = g.world.players[i] as Player;
      if (p.targetable) p.heal(Math.round(p.stats.maxHp * META.bossHealFrac));
    }
    g.music.setBossMode(false);
    g.waves.bossDefeated();
    this.pendingGuaranteeRare = true;

    // Restliche Helfer zerplatzen mit (inkl. Punkte + Drops).
    // Schleife: sterbende Splitter spawnen Kinder — auch die muessen mit
    // (Kinder splitten nie erneut, terminiert also nach 2 Durchlaeufen).
    const pool = g.world.enemies;
    let guard = 0;
    while (pool.count > 0 && guard++ < 4) {
      for (let i = 0; i < pool.count; i++) {
        const e = pool.get(i);
        e.novaDepth = 99;
        e.hp = 0;
      }
      g.combat.sweepDead();
    }
  }

  // ------------------------------------------------ Onboarding

  private initTutorial(): void {
    const done = this.game.save.data.tutorialDone;
    this.collectPromptShown = false;
    if (!done.includes('move')) {
      this.tutStage = 'move';
      this.game.ui.showPrompt(
        `<span class="keycap">W</span><span class="keycap">A</span><span class="keycap">S</span><span class="keycap">D</span> ${STR.promptMove}`,
      );
    } else if (!done.includes('dash')) {
      this.tutStage = 'dash';
      this.game.ui.showPrompt(`<span class="keycap">Leertaste</span> ${STR.promptDash}`);
    } else if (!done.includes('collect')) {
      this.tutStage = 'collect';
    } else {
      this.tutStage = 'done';
    }
  }

  private updateTutorial(moveX: number, moveZ: number): void {
    const g = this.game;
    switch (this.tutStage) {
      case 'move':
        if (moveX !== 0 || moveZ !== 0) {
          this.completeTut('move');
          this.tutStage = 'dash';
          g.ui.showPrompt(`<span class="keycap">Leertaste</span> ${STR.promptDash}`);
        }
        break;
      case 'dash':
        if (g.world.player.dashId > 0) {
          this.completeTut('dash');
          this.tutStage = 'collect';
          g.ui.hidePrompt();
        }
        break;
      case 'collect': {
        if (!this.collectPromptShown) {
          const pool = g.world.pickups;
          for (let i = 0; i < pool.count; i++) {
            if (pool.get(i).kind === PICKUP_CORE) {
              this.collectPromptShown = true;
              g.ui.showPrompt(`⬡ ${STR.promptCollect}`);
              break;
            }
          }
        } else if (g.world.runCores > 0) {
          this.completeTut('collect');
          this.tutStage = 'done';
          g.ui.hidePrompt();
        }
        break;
      }
      case 'done':
        break;
    }
  }

  private completeTut(id: string): void {
    const done = this.game.save.data.tutorialDone;
    if (!done.includes(id)) {
      done.push(id);
      this.game.save.save();
    }
  }

  // ------------------------------------------------ Render

  render(alpha: number, rawDt: number): void {
    const g = this.game;
    const world = g.world;
    g.arena.update(rawDt);
    // Revive-Fortschritt fuer die Gold-Ringe der Figuren
    g.instRenderer.reviveProgress[0] = g.coopSystem.progressOf(0);
    g.instRenderer.reviveProgress[1] = g.coopSystem.progressOf(1);
    g.instRenderer.render(world, alpha, rawDt, g.time.scale > 0);
    g.particles.render();

    if (world.isCoop) {
      // Kamera: Mittelpunkt beider Spieler + Dolly-out, damit beide (plus
      // Rand) sichtbar bleiben; Lookahead aus (vel 0) — zwei Richtungen
      // ergaeben nur Gezerre
      const p0 = world.players[0] as Player;
      const p1 = world.players[1] as Player;
      const cx = (p0.x + p1.x) / 2;
      const cz = (p0.z + p1.z) / 2;
      const cc = COOP.camera;
      const kNeeded = Math.min(cc.zoomMax, Math.max(
        1,
        (Math.abs(p0.z - p1.z) / 2 + cc.margin) / cc.nearHalfZ,
        (Math.abs(p0.x - p1.x) / 2 + cc.margin) / cc.halfX,
      ));
      g.cameraRig.update(rawDt, cx, cz, 0, 0, kNeeded);
    } else {
      const p = world.player;
      g.cameraRig.update(rawDt, p.x, p.z, p.velX, p.velZ);
    }
    g.hud.update(rawDt, world, g.score, world.enemies.count, g.coopSystem);
    g.popups.update(rawDt, g.cameraRig.camera);

    // Pad-Start toggelt die Pause — laeuft ueber den UI-Edge-Puffer und
    // funktioniert damit auch, waehrend die Simulation steht
    if (this.isActive && g.input.uiStartPressed()) this.togglePause();
  }
}
