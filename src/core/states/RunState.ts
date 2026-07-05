import { HARD_UNLOCK_WAVE, META, isBossWave } from '../../config/balance';
import { getHero } from '../../config/heroes';
import { STR } from '../../config/strings.de';
import { PICKUP_CORE } from '../../entities/Pickup';
import { updateEnemies } from '../../entities/behaviors';
import { updateBoss } from '../../entities/bossPatterns';
import type { Boss } from '../../entities/Boss';
import type { GameState } from '../StateMachine';
import type { Game } from '../Game';

type RunPhase = 'wave' | 'waveEnd' | 'upgrade' | 'dying';
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
  private tutStage: TutStage = 'done';
  private collectPromptShown = false;
  private pauseKeyHandler: ((e: KeyboardEvent) => void) | null = null;
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
    );
  }

  enter(): void {
    const g = this.game;
    const s = g.save.data.settings;
    const hero = getHero(s.heroId);

    g.world.reset(g.runSeed, g.runDifficulty, hero, s.weaponId, g.save.data.permaUpgrades, g.runIsDaily);
    g.waves.reset();
    g.score.reset();
    g.pickupSystem.reset();
    g.surprise.reset();
    g.runStats.reset();
    g.upgrades.reset();
    g.particles.reset();
    g.instRenderer.reset();
    g.instRenderer.setHero(hero);
    g.instRenderer.heroPreview = false;
    g.time.reset();
    g.cameraRig.reset();
    g.cameraRig.snapTo(0, 0);
    g.combat.autoAimEnabled = s.autoAim;
    g.popups.reset();
    g.hud.resetForRun(g.world);
    g.hud.show();
    g.ui.showScreen(null);

    if ((g.save.data.permaUpgrades.headstart ?? 0) > 0) g.upgrades.applyHeadstart();

    g.music.start();
    g.music.setWave(1);
    g.music.setBossMode(false);

    this.paused = false;
    this.isActive = true;
    this.phase = 'wave';
    this.pendingGuaranteeRare = false;
    g.events.emit('runStarted', {});
    this.startWave(1);
    this.initTutorial();

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
    g.upgradeScreen.hide();
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
    // VOR waves.startWave: Spawns/Scaling muessen das Golden-Flag schon sehen
    g.surprise.rollForWave(w);
    g.waves.startWave(w);
    g.music.setWave(w);
    g.music.setBossMode(isBossWave(w));
  }

  togglePause(): void {
    if (!this.isActive || this.phase === 'upgrade' || this.phase === 'dying') return;
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
      g.input.keyboard.reset();
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
    const player = world.player;
    world.elapsed += dt;

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

    const input = g.input.sample(g.cameraRig.camera, player.x, player.z);
    if (g.input.gamepad.pauseJustPressed) {
      this.togglePause();
      return;
    }

    player.update(dt, input.moveX, input.moveZ, input.dashJustPressed);
    if (player.isDashing) g.particles.dashTrail(player.x, player.z);

    g.collision.fillSpatialHash();
    updateEnemies(world, dt, g.events);

    const boss = world.boss;
    if (boss) {
      updateBoss(boss, dt, world, g.events);
      if (boss.hp <= 0) this.handleBossDeath(boss);
    }

    g.waves.update(dt);
    g.collision.update(dt);
    g.combat.update(dt, input);
    g.pickupSystem.update(dt);
    g.surprise.update(dt);
    g.score.update(dt);
    g.particles.update(dt);

    this.updateTutorial(input.moveX, input.moveZ);

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
    g.pickupSystem.collectAllCores();
    const perfect = !this.tookDamageThisWave;
    const bonus = g.score.waveBonus(w, perfect);
    g.events.emit('waveCleared', { wave: w, perfect, bonus });

    // "Schwer" freischalten: Welle 10 auf Normal geschafft (Boss B besiegt)
    if (w >= HARD_UNLOCK_WAVE && g.runDifficulty === 'normal' && !g.save.data.hardUnlocked) {
      g.save.data.hardUnlocked = true;
      g.save.save();
      window.setTimeout(() => g.popups.banner(STR.hardUnlocked, 'gold-banner'), 2000);
    }
  }

  private openUpgradeChoice(): void {
    const g = this.game;
    this.phase = 'upgrade';
    const offers = g.upgrades.rollOffers(this.pendingGuaranteeRare);
    this.pendingGuaranteeRare = false;
    g.time.baseScale = 0;
    g.audioEngine.duckMusic(true);
    g.upgradeScreen.show(offers, true, g.world.player);
    g.ui.showScreen('screen-upgrade');
  }

  /** Callback der Upgrade-Karten (Maus oder Tasten 1/2/3). */
  chooseUpgrade(index: number): void {
    const g = this.game;
    if (this.phase !== 'upgrade') return;
    const def = g.upgrades.currentOffers[index];
    if (!def) return;
    g.upgrades.apply(def);
    g.upgradeScreen.hide();
    g.ui.showScreen(null);
    g.time.baseScale = 1;
    g.audioEngine.duckMusic(false);
    g.input.keyboard.reset();
    this.phase = 'wave';
    this.startWave(g.world.wave + 1);
  }

  rerollUpgrades(): void {
    const g = this.game;
    if (this.phase !== 'upgrade') return;
    const offers = g.upgrades.reroll(false);
    if (offers) g.upgradeScreen.show(offers, false, g.world.player);
  }

  private handleBossDeath(boss: Boss): void {
    const g = this.game;
    const bossNr = Math.max(1, Math.floor(g.world.wave / 5));
    g.events.emit('bossDied', { x: boss.x, z: boss.z, color: boss.def.color });
    g.score.bossBonus(bossNr);
    // Belohnung: Kern-Fontaene + Heilung + garantiert Rare-Upgrade danach
    g.pickupSystem.spawnCoreFountain(boss.x, boss.z, META.bossCoresBase + META.bossCoresPerNr * bossNr);
    g.world.player.heal(Math.round(g.world.player.stats.maxHp * META.bossHealFrac));
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
    const p = g.world.player;
    g.arena.update(rawDt);
    g.instRenderer.render(g.world, alpha, rawDt, g.time.scale > 0);
    g.particles.render();
    g.cameraRig.update(rawDt, p.x, p.z, p.velX, p.velZ);
    g.hud.update(rawDt, g.world, g.score, g.world.enemies.count);
    g.popups.update(rawDt, g.cameraRig.camera);

    // Gamepad kann auch im Pausen-Screen fortsetzen
    if (this.paused) {
      g.input.gamepad.poll();
      if (g.input.gamepad.pauseJustPressed) this.togglePause();
    }
  }
}
