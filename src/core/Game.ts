import { Scene } from 'three';
import { DIFFICULTIES, META, type Difficulty } from '../config/balance';
import { HEROES, PERMA_BONI, UNLOCKABLE_WEAPONS } from '../config/heroes';
import { STR } from '../config/strings.de';
import { AudioEngine } from '../audio/AudioEngine';
import { Music } from '../audio/Music';
import { Sfx } from '../audio/Sfx';
import { InputManager } from '../input/InputManager';
import { Arena } from '../render/Arena';
import { AssetRegistry } from '../render/AssetRegistry';
import { CameraRig } from '../render/CameraRig';
import { InstancedRenderer } from '../render/InstancedRenderer';
import { Renderer } from '../render/Renderer';
import { SaveManager } from '../save/SaveManager';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { JuiceDirector } from '../systems/JuiceDirector';
import { ParticleSystem } from '../systems/ParticleSystem';
import { PickupSystem } from '../systems/PickupSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { WaveSystem } from '../systems/WaveSystem';
import { Hud } from '../ui/Hud';
import { Popups } from '../ui/Popups';
import { UiManager } from '../ui/UiManager';
import { GameOverScreen } from '../ui/screens/GameOverScreen';
import { MenuScreen } from '../ui/screens/MenuScreen';
import { PauseScreen } from '../ui/screens/PauseScreen';
import { ShopScreen } from '../ui/screens/ShopScreen';
import { UpgradeScreen } from '../ui/screens/UpgradeScreen';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { hashString } from './Rng';
import { StateMachine } from './StateMachine';
import { Time } from './Time';
import { World } from './World';
import { GameOverState } from './states/GameOverState';
import { MenuState } from './states/MenuState';
import { RunState } from './states/RunState';
import { ShopState } from './states/ShopState';

/**
 * Kompositions-Root: baut alle Systeme genau einmal, verdrahtet Callbacks
 * und besitzt FSM + GameLoop. Ein Run-Restart recycelt alles.
 */
export class Game {
  readonly events = new EventBus();
  readonly time = new Time();
  readonly save = new SaveManager();
  readonly world = new World(this.events);

  readonly scene = new Scene();
  readonly assets = new AssetRegistry();
  readonly cameraRig = new CameraRig();
  readonly renderer: Renderer;
  readonly arena: Arena;
  readonly instRenderer: InstancedRenderer;
  readonly particles: ParticleSystem;

  readonly input = new InputManager();
  readonly audioEngine = new AudioEngine();
  readonly sfx: Sfx;
  readonly music: Music;

  readonly pickupSystem: PickupSystem;
  readonly combat: CombatSystem;
  readonly collision: CollisionSystem;
  readonly waves: WaveSystem;
  readonly score: ScoreSystem;
  readonly upgrades: UpgradeSystem;
  readonly juice: JuiceDirector;

  readonly ui: UiManager;
  readonly hud: Hud;
  readonly popups: Popups;
  readonly menuScreen: MenuScreen;
  readonly upgradeScreen: UpgradeScreen;
  readonly pauseScreen: PauseScreen;
  readonly gameOverScreen: GameOverScreen;
  readonly shopScreen: ShopScreen;

  readonly fsm = new StateMachine();
  readonly loop: GameLoop;
  readonly menuState: MenuState;
  readonly runState: RunState;
  readonly gameOverState: GameOverState;
  readonly shopState: ShopState;

  runSeed = 1;
  runIsDaily = false;
  runDifficulty: Difficulty = 'normal';

  private readonly disposers: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    // Rendering
    this.renderer = new Renderer(canvas, this.scene, this.cameraRig.camera);
    this.arena = new Arena(this.scene);
    this.instRenderer = new InstancedRenderer(this.scene, this.assets, this.events, HEROES[0]?.color ?? 0x00e5ff);
    this.particles = new ParticleSystem(this.scene, this.assets, this.events);

    // Audio
    this.sfx = new Sfx(this.audioEngine, this.events);
    this.music = new Music(this.audioEngine, this.events);

    // Gameplay-Systeme
    this.pickupSystem = new PickupSystem(this.world, this.events);
    this.combat = new CombatSystem(this.world, this.events, this.pickupSystem);
    this.collision = new CollisionSystem(this.world, this.events, this.combat);
    this.waves = new WaveSystem(this.world, this.events);
    this.score = new ScoreSystem(this.events);
    this.upgrades = new UpgradeSystem(this.world, this.events, this.score);
    this.juice = new JuiceDirector(this.events, this.time, this.cameraRig, this.world);

    // UI
    this.ui = new UiManager(this.events);
    this.hud = new Hud(this.events, this.sfx);
    this.popups = new Popups(document.getElementById('popup-layer') as HTMLElement, this.events, this.world);

    this.menuScreen = new MenuScreen(this.save, {
      onPlay: (daily) => {
        this.audioEngine.unlock();
        this.startRun(daily);
      },
      onShop: () => this.fsm.change(this.shopState),
      onSettingChanged: () => {
        this.applySettings();
        this.save.save();
      },
    });
    this.upgradeScreen = new UpgradeScreen({
      onChoose: (i) => this.runState.chooseUpgrade(i),
      onReroll: () => this.runState.rerollUpgrades(),
    });
    this.pauseScreen = new PauseScreen(this.save, {
      onResume: () => this.runState.togglePause(),
      onRestart: () => this.startRun(this.runIsDaily),
      onMenu: () => this.fsm.change(this.menuState),
      onSettingsChanged: () => {
        this.applySettings();
        this.save.save();
      },
    });
    this.gameOverScreen = new GameOverScreen(
      {
        onAgain: () => this.startRun(this.runIsDaily),
        onMenu: () => this.fsm.change(this.menuState),
      },
      this.sfx,
    );
    this.shopScreen = new ShopScreen(this.save, {
      onBack: () => this.fsm.change(this.menuState),
      onChanged: () => {
        this.save.save();
      },
    });

    this.hud.onMuteToggle = () => {
      this.save.data.settings.muted = !this.save.data.settings.muted;
      this.applySettings();
      this.save.save();
    };

    // States + Loop
    this.menuState = new MenuState(this);
    this.runState = new RunState(this);
    this.gameOverState = new GameOverState(this);
    this.shopState = new ShopState(this);
    this.loop = new GameLoop(
      this.time,
      (dt) => {
        this.fsm.update(dt);
        this.input.endStep();
      },
      (alpha, rawDt) => {
        this.fsm.render(alpha, rawDt);
        this.renderer.render(rawDt);
      },
    );

    this.wireGlobalEvents();
  }

  private wireGlobalEvents(): void {
    // AudioContext-Unlock bei erster Geste (Autoplay-Policy)
    const unlock = (): void => this.audioEngine.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.disposers.push(
      () => window.removeEventListener('pointerdown', unlock),
      () => window.removeEventListener('keydown', unlock),
    );

    // Tab-Wechsel -> Auto-Pause
    const onVisibility = (): void => {
      if (document.hidden) this.runState.pauseIfActive();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));

    // Musik-Takt pulst das Boden-Grid
    this.disposers.push(
      this.events.on('musicBeat', () => this.arena.pulse()),
      this.events.on('enemyKilled', () => {
        this.save.data.stats.totalKills++;
      }),
    );
  }

  start(): void {
    this.applySettings();
    this.fsm.change(this.menuState);
    this.loop.start();
  }

  applySettings(): void {
    const s = this.save.data.settings;
    this.audioEngine.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume, s.muted);
    this.popups.damageNumbersEnabled = s.damageNumbers;
    this.cameraRig.fxIntensity = s.reduceFx ? 0.4 : 1;
    this.combat.autoAimEnabled = s.autoAim;
    this.hud.setMuted(s.muted);
  }

  startRun(daily: boolean): void {
    const s = this.save.data.settings;
    this.runIsDaily = daily;
    // Daily: feste Schwierigkeit Normal, Seed aus dem Datum -> gleiche Wellen fuer alle
    this.runDifficulty = daily ? 'normal' : s.difficulty;
    const dateStr = new Date().toISOString().slice(0, 10);
    this.runSeed = daily ? hashString(dateStr) : hashString(`${Date.now()}-${Math.random()}`);
    this.fsm.change(this.runState);
  }

  /** Abrechnung nach dem Tod: Kerne gutschreiben, Bestwerte, Game-Over-Screen. */
  finishRun(): void {
    const save = this.save.data;
    const diff = this.runDifficulty;
    const finalScore = this.score.score;
    const wave = this.world.wave;

    const endBonus = Math.floor(finalScore / META.scorePerCore) + META.coresPerWave * wave;
    const coresEarned = Math.round((this.world.runCores + endBonus) * DIFFICULTIES[diff].coreMult);
    save.cores += coresEarned;
    save.stats.totalRuns++;

    const prevBest = save.bestScores[diff];
    const isRecord = finalScore > prevBest;
    if (isRecord) save.bestScores[diff] = finalScore;
    if (wave > save.bestWaves[diff]) save.bestWaves[diff] = wave;

    if (this.runIsDaily) {
      const dateStr = new Date().toISOString().slice(0, 10);
      if (!save.dailyBest || save.dailyBest.date !== dateStr || finalScore > save.dailyBest.score) {
        save.dailyBest = {
          date: dateStr,
          score: save.dailyBest?.date === dateStr ? Math.max(save.dailyBest.score, finalScore) : finalScore,
        };
      }
    }
    this.save.save();

    this.gameOverState.result = {
      score: finalScore,
      wave,
      isRecord,
      best: save.bestScores[diff],
      coresEarned,
      totalCores: save.cores,
      teaser: this.buildTeaser(),
    };
    this.events.emit('gameOver', { score: finalScore, wave, coresEarned, isRecord });
    this.fsm.change(this.gameOverState);
  }

  /** "Nur noch X Kerne bis ..." — macht jeden Lauf zu Fortschritt. */
  private buildTeaser(): string | null {
    const save = this.save.data;
    const candidates: Array<{ name: string; price: number }> = [];
    for (const hero of HEROES) {
      if (!save.unlockedHeroes.includes(hero.id)) {
        candidates.push({ name: STR.heroes[hero.id]?.name ?? hero.id, price: hero.price });
      }
    }
    for (const { weapon, price } of UNLOCKABLE_WEAPONS) {
      if (!save.unlockedWeapons.includes(weapon.id)) {
        candidates.push({ name: STR.weapons[weapon.id]?.name ?? weapon.id, price });
      }
    }
    for (const bonus of PERMA_BONI) {
      const level = save.permaUpgrades[bonus.id] ?? 0;
      if (level < bonus.prices.length) {
        candidates.push({
          name: STR.permaBoni[bonus.id]?.name ?? bonus.id,
          price: bonus.prices[level] as number,
        });
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.price - b.price);
    const cheapest = candidates[0] as { name: string; price: number };
    if (save.cores >= cheapest.price) return STR.shopAffordable;
    return STR.nextUnlockTeaser(cheapest.name, cheapest.price - save.cores);
  }

  /** Hintergrund-Rendering fuer Menue/Shop/GameOver. */
  renderBackdrop(alpha: number, rawDt: number): void {
    this.arena.update(rawDt);
    this.instRenderer.render(this.world, alpha, rawDt);
    this.particles.render();
    const p = this.world.player;
    this.cameraRig.update(rawDt, p.x, p.z, 0, 0);
    this.popups.update(rawDt, this.cameraRig.camera);
  }

  dispose(): void {
    this.loop.stop();
    for (const d of this.disposers) d();
    this.input.dispose();
    this.music.dispose();
    this.sfx.dispose();
    this.audioEngine.dispose();
    this.juice.dispose();
    this.score.dispose();
    this.particles.dispose();
    this.instRenderer.dispose();
    this.arena.dispose();
    this.assets.dispose();
    this.hud.dispose();
    this.popups.dispose();
    this.ui.dispose();
    this.renderer.dispose();
    this.events.clear();
  }
}
