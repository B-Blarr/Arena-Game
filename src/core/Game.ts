import { Scene } from 'three';
import { DIFFICULTIES, HARD_UNLOCK_WAVE, META, type Difficulty } from '../config/balance';
import { RUMBLE } from '../config/input';
import { getHero, getWeapon, HEROES, PERMA_BONI, UNLOCKABLE_WEAPONS } from '../config/heroes';
import { getColorway } from '../config/stickers';
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
import { CoopSystem } from '../systems/CoopSystem';
import { JuiceDirector } from '../systems/JuiceDirector';
import { ParticleSystem } from '../systems/ParticleSystem';
import { PathSystem } from '../systems/PathSystem';
import { HazardSystem } from '../systems/HazardSystem';
import { PickupSystem } from '../systems/PickupSystem';
import { RumbleSystem } from '../systems/RumbleSystem';
import { RunStats } from '../systems/RunStats';
import { ScoreSystem } from '../systems/ScoreSystem';
import { StickerSystem } from '../systems/StickerSystem';
import { SurpriseDirector } from '../systems/SurpriseDirector';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { WaveSystem } from '../systems/WaveSystem';
import { Hud } from '../ui/Hud';
import { Popups } from '../ui/Popups';
import { UiManager } from '../ui/UiManager';
import { UiNav } from '../ui/UiNav';
import { AlbumScreen } from '../ui/screens/AlbumScreen';
import { CoopSetupScreen } from '../ui/screens/CoopSetupScreen';
import { GameOverScreen } from '../ui/screens/GameOverScreen';
import { LeaderboardScreen } from '../ui/screens/LeaderboardScreen';
import { MenuScreen } from '../ui/screens/MenuScreen';
import { PathScreen } from '../ui/screens/PathScreen';
import { PauseScreen } from '../ui/screens/PauseScreen';
import { ProfilesScreen } from '../ui/screens/ProfilesScreen';
import { ShopScreen } from '../ui/screens/ShopScreen';
import { UpgradeScreen } from '../ui/screens/UpgradeScreen';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { hashString } from './Rng';
import { StateMachine } from './StateMachine';
import { Time } from './Time';
import { World } from './World';
import { AlbumState } from './states/AlbumState';
import { CoopSetupState } from './states/CoopSetupState';
import { GameOverState } from './states/GameOverState';
import { LeaderboardState } from './states/LeaderboardState';
import { MenuState } from './states/MenuState';
import { ProfilesState } from './states/ProfilesState';
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

  readonly input = new InputManager(this.events);
  readonly audioEngine = new AudioEngine();
  readonly sfx: Sfx;
  readonly music: Music;

  readonly pickupSystem: PickupSystem;
  readonly combat: CombatSystem;
  readonly collision: CollisionSystem;
  readonly coopSystem: CoopSystem;
  readonly waves: WaveSystem;
  readonly score: ScoreSystem;
  readonly upgrades: UpgradeSystem;
  readonly surprise: SurpriseDirector;
  readonly path: PathSystem; // NEU (Reise-Modus)
  readonly hazards: HazardSystem; // NEU (Reise-Ausbau, Minenfeld)
  readonly runStats: RunStats;
  readonly stickers: StickerSystem;
  readonly juice: JuiceDirector;

  readonly ui: UiManager;
  readonly uiNav: UiNav;
  readonly rumble: RumbleSystem;
  readonly hud: Hud;
  readonly popups: Popups;
  readonly menuScreen: MenuScreen;
  readonly upgradeScreen: UpgradeScreen;
  readonly pathScreen: PathScreen; // NEU (Reise-Modus)
  readonly pauseScreen: PauseScreen;
  readonly gameOverScreen: GameOverScreen;
  readonly shopScreen: ShopScreen;
  readonly profilesScreen: ProfilesScreen;
  readonly leaderboardScreen: LeaderboardScreen;
  readonly albumScreen: AlbumScreen;
  readonly coopSetupScreen: CoopSetupScreen;

  readonly fsm = new StateMachine();
  readonly loop: GameLoop;
  readonly menuState: MenuState;
  readonly runState: RunState;
  readonly gameOverState: GameOverState;
  readonly shopState: ShopState;
  readonly profilesState: ProfilesState;
  readonly leaderboardState: LeaderboardState;
  readonly albumState: AlbumState;
  readonly coopSetupState: CoopSetupState;

  runSeed = 1;
  runIsDaily = false;
  runDifficulty: Difficulty = 'normal';
  /** NEU (Reise-Modus): 'journey' = Weg-Wahl aktiv, 'classic' = linearer Modus. */
  runMode: 'classic' | 'journey' = 'classic';
  /** Koop-Modus: Partner-Profil (null-ID = Gast). null = Solo. */
  runCoopP2: { profileId: string | null; name: string } | null = null;

  private readonly disposers: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    // Rendering
    this.renderer = new Renderer(canvas, this.scene, this.cameraRig.camera);
    this.arena = new Arena(this.scene);
    this.instRenderer = new InstancedRenderer(this.scene, this.assets, this.events);
    this.particles = new ParticleSystem(this.scene, this.assets, this.events);

    // Audio
    this.sfx = new Sfx(this.audioEngine, this.events);
    this.music = new Music(this.audioEngine, this.events);

    // Gameplay-Systeme
    this.pickupSystem = new PickupSystem(this.world, this.events);
    this.combat = new CombatSystem(this.world, this.events, this.pickupSystem);
    this.collision = new CollisionSystem(this.world, this.events, this.combat);
    this.coopSystem = new CoopSystem(this.world);
    this.waves = new WaveSystem(this.world, this.events);
    this.score = new ScoreSystem(this.events);
    this.upgrades = new UpgradeSystem(this.world, this.events, this.score);
    this.surprise = new SurpriseDirector(this.world, this.events, this.pickupSystem);
    this.path = new PathSystem(this.world); // NEU (Reise-Modus)
    this.hazards = new HazardSystem(this.world, this.events); // NEU (Reise-Ausbau)
    this.runStats = new RunStats(this.events);
    // Kill-Zaehler MUSS vor dem StickerSystem abonnieren: dessen
    // kills-Check liest stats.totalKills und soll den frischen Kill sehen
    this.disposers.push(
      this.events.on('enemyKilled', () => {
        this.save.data.stats.totalKills++;
      }),
    );
    this.stickers = new StickerSystem(this.events, this.save, this.world);
    this.juice = new JuiceDirector(this.events, this.time, this.cameraRig, this.world, this.renderer);

    // UI
    this.ui = new UiManager(this.events);
    this.uiNav = new UiNav(this.events, this.input);
    this.ui.onScreenShown = (el) => this.uiNav.setScreen(el);
    this.rumble = new RumbleSystem(this.events, this.input);
    this.hud = new Hud(this.events, this.sfx);
    this.popups = new Popups(document.getElementById('popup-layer') as HTMLElement, this.events, this.world);

    this.menuScreen = new MenuScreen(this.save, {
      onPlay: (daily, journey) => {
        this.audioEngine.unlock();
        // Menue-Play ist immer Solo — Koop laeuft ueber sein Setup
        this.runCoopP2 = null;
        this.input.setSolo();
        // NEU (Reise-Modus): Daily erzwingt Klassik (faire, vergleichbare Bestenliste)
        this.runMode = journey && !daily ? 'journey' : 'classic';
        this.startRun(daily);
      },
      onCoop: () => this.fsm.change(this.coopSetupState),
      onShop: () => this.fsm.change(this.shopState),
      onProfiles: () => this.fsm.change(this.profilesState),
      onLeaderboard: () => this.fsm.change(this.leaderboardState),
      onAlbum: () => this.fsm.change(this.albumState),
      onSettingChanged: () => {
        this.applySettings();
        this.save.save();
      },
    });
    this.coopSetupScreen = new CoopSetupScreen(this.save, this.input, {
      onBack: () => this.fsm.change(this.menuState),
      onStart: (p2ProfileId, p2Name, difficulty) => {
        this.audioEngine.unlock();
        this.runCoopP2 = { profileId: p2ProfileId, name: p2Name };
        this.runDifficulty = difficulty;
        this.runMode = 'classic'; // NEU: Reise-Modus vorerst solo (Koop-Reise = spaetere Erweiterung)
        this.startRun(false);
      },
    });
    this.profilesScreen = new ProfilesScreen(this.save, {
      onBack: () => this.fsm.change(this.menuState),
      onSwitched: () => {
        // Neues Profil: Audio/FX/AutoAim/Held aus dessen Settings uebernehmen
        this.applySettings();
        this.fsm.change(this.menuState);
      },
    });
    this.leaderboardScreen = new LeaderboardScreen(this.save, {
      onBack: () => this.fsm.change(this.menuState),
    });
    this.albumScreen = new AlbumScreen(this.save, this.sfx, {
      onBack: () => this.fsm.change(this.menuState),
      onClaimed: () => this.applySettings(),
    });
    this.upgradeScreen = new UpgradeScreen({
      onChoose: (i) => this.runState.chooseUpgrade(i),
      onReroll: () => this.runState.rerollUpgrades(),
    });
    this.pathScreen = new PathScreen({ // NEU (Reise-Modus)
      onChoose: (i) => this.runState.choosePath(i),
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
    this.profilesState = new ProfilesState(this);
    this.leaderboardState = new LeaderboardState(this);
    this.albumState = new AlbumState(this);
    this.coopSetupState = new CoopSetupState(this);
    this.loop = new GameLoop(
      this.time,
      (dt) => {
        this.fsm.update(dt);
        this.input.endStep();
      },
      (alpha, rawDt) => {
        // Pads genau 1x pro Frame pollen; UI-Navigation VOR den Screens
        this.input.pollPads();
        this.uiNav.update(rawDt);
        this.fsm.render(alpha, rawDt);
        this.renderer.render(rawDt);
        this.input.endFrame();
      },
    );

    this.wireGlobalEvents();
  }

  private wireGlobalEvents(): void {
    // AudioContext-Unlock bei erster Geste (Autoplay-Policy). Ein Gamepad-
    // Button zaehlt NICHT als Geste — solange kein Unlock da ist, zeigt das
    // Menue Pad-Nutzern einen Hinweis (body.audio-locked).
    document.body.classList.add('audio-locked');
    const unlock = (): void => {
      this.audioEngine.unlock();
      document.body.classList.remove('audio-locked');
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.disposers.push(
      () => window.removeEventListener('pointerdown', unlock),
      () => window.removeEventListener('keydown', unlock),
    );

    // Pad-Anzeige (Menue-Hints) ueber Body-Klasse, ohne Re-Render
    this.disposers.push(
      this.events.on('padConnected', () => {
        document.body.classList.add('pad-connected');
      }),
      this.events.on('padDisconnected', () => {
        if (!this.input.anyPadConnected()) document.body.classList.remove('pad-connected');
      }),
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
      // Arena-Biome: alle 5 Wellen neue Farbstimmung, Boss-Wellen dunkler
      this.events.on('waveStarted', (e) => {
        this.arena.setBiome(Math.floor((e.wave - 1) / 5), e.isBossWave);
        // NEU (Reise-Ausbau): Arena-Groesse + Raum-Optik der laufenden Welle
        // (roomMods/arenaRadius sind von RunState.startWave bereits gesetzt).
        // Klassik/Boss/Normal -> Radius 22 + theme null -> unveraenderte Optik.
        this.arena.setRadius(this.world.arenaRadius);
        this.arena.setRoomTheme(this.world.roomMods.theme ?? null);
      }),
      this.events.on('bossDied', () => this.arena.setBossMode(false)),
      // Boss-Stampfer laesst das Boden-Grid aufleuchten
      this.events.on('bossStomp', () => this.arena.pulse(1.5)),
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
    this.renderer.fxIntensity = s.reduceFx ? 0.4 : 1;
    this.instRenderer.fxIntensity = s.reduceFx ? 0.4 : 1;
    // CSS-Effekte (Shimmer/Pulse) daempfen sich ueber diese Klasse selbst
    document.body.classList.toggle('reduce-fx', s.reduceFx);
    // Auto-Aim ist ein Per-Spieler-Setting (Koop: P2 bringt seins mit)
    const p0 = this.world.players[0];
    if (p0) p0.autoAim = s.autoAim;
    this.rumble.enabled = s.vibration;
    this.rumble.intensityMult = s.reduceFx ? RUMBLE.reduceFxMult : 1;
    this.hud.setMuted(s.muted);
    // Helden-Silhouette + Farbvariante live: die Backdrop-Figur im Menue
    // wechselt beim Klick auf Karte oder Farb-Chip sofort
    this.instRenderer.setHero(getHero(s.heroId), getColorway(s.colorwayId, this.save.data.unlockedColorways));
  }

  /** Anzeigenamen der aktiven Spieler (HUD, Upgrade-Header, Game Over). */
  coopNames(): [string, string] {
    return [this.save.activeName, this.runCoopP2?.name ?? STR.guest];
  }

  startRun(daily: boolean): void {
    const s = this.save.data.settings;
    // DEV-Einstieg: ?coop=1 startet direkt mit Gast-P2 (WASD vs. Pfeile)
    if (import.meta.env.DEV && location.search.includes('coop=1') && !this.runCoopP2) {
      this.runCoopP2 = { profileId: null, name: STR.guest };
      this.input.assignSlot(0, 'wasd+mouse');
      this.input.assignSlot(1, 'arrows');
    }
    this.runIsDaily = daily;
    // Daily: feste Schwierigkeit Normal; Koop behaelt die im Setup gewaehlte
    // Schwierigkeit (runDifficulty wurde dort gesetzt)
    if (daily) this.runDifficulty = 'normal';
    else if (!this.runCoopP2) this.runDifficulty = s.difficulty;
    if (daily) this.runMode = 'classic'; // NEU (Reise-Modus): Daily bleibt klassisch
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
    const isCoop = this.world.isCoop;

    const endBonus = Math.floor(finalScore / META.scorePerCore) + META.coresPerWave * wave;
    const coresEarned = Math.round((this.world.runCores + endBonus) * DIFFICULTIES[diff].coreMult);
    save.cores += coresEarned;
    save.stats.totalRuns++;

    // Koop schreibt in die EIGENEN Koop-Bestwerte (fairer Vergleich).
    // NEU (Reise-Modus): Reise-Laeufe sind leichter (Rast/Schatz) -> KEIN Update der
    // klassischen Bestenliste, sonst verfaelscht es die Wertung. Kerne/Sticker zaehlen weiter.
    let isRecord = false;
    if (this.runMode === 'journey') {
      // NEU (Reise-Ausbau): eigene Reise-Bestenliste (solo). isRecord treibt das
      // "Neuer Rekord!" im GameOver auch im Reise-Modus.
      isRecord = finalScore > save.bestJourneyScores[diff];
      if (isRecord) save.bestJourneyScores[diff] = finalScore;
      if (wave > save.bestJourneyWaves[diff]) save.bestJourneyWaves[diff] = wave;
    } else if (isCoop) {
      isRecord = finalScore > save.bestScoresCoop[diff];
      if (isRecord) save.bestScoresCoop[diff] = finalScore;
      if (wave > save.bestWavesCoop[diff]) save.bestWavesCoop[diff] = wave;
    } else {
      isRecord = finalScore > save.bestScores[diff];
      if (isRecord) save.bestScores[diff] = finalScore;
      if (wave > save.bestWaves[diff]) save.bestWaves[diff] = wave;
    }

    // dailyBest bleibt solo-only (Koop bietet kein Daily an)
    if (this.runIsDaily && !isCoop) {
      const dateStr = new Date().toISOString().slice(0, 10);
      if (!save.dailyBest || save.dailyBest.date !== dateStr || finalScore > save.dailyBest.score) {
        save.dailyBest = {
          date: dateStr,
          score: save.dailyBest?.date === dateStr ? Math.max(save.dailyBest.score, finalScore) : finalScore,
        };
      }
    }

    // Sticker: Kontext-Auswertung (Held/Waffe/Schwer/Daily) VOR dem Persist
    const hero = getHero(save.settings.heroId);
    const newStickers = this.stickers.finishRun({
      difficulty: diff,
      isDaily: this.runIsDaily,
      wave,
      heroId: hero.id,
      weaponId: getWeapon(save.settings.weaponId, hero).id,
      isCoop,
      isJourney: this.runMode === 'journey', // NEU (Reise-Ausbau): Reise-Erfolge
    });
    this.save.save();

    // Koop: das Partner-Profil bekommt Kerne, Bestwerte und Sticker VOLL
    // mit (Gast: nichts zu speichern)
    const p2Id = this.runCoopP2?.profileId;
    if (isCoop && p2Id) {
      const p2Data = this.save.profileData(p2Id);
      p2Data.cores += coresEarned;
      p2Data.stats.totalRuns++;
      if (this.runMode !== 'journey') { // NEU (Reise-Modus): Reise nicht in die Bestenliste
        if (finalScore > p2Data.bestScoresCoop[diff]) p2Data.bestScoresCoop[diff] = finalScore;
        if (wave > p2Data.bestWavesCoop[diff]) p2Data.bestWavesCoop[diff] = wave;
      }
      // "Schwer"-Freischaltung gilt fuer beide, die dabei waren
      if (diff === 'normal' && wave >= HARD_UNLOCK_WAVE) p2Data.hardUnlocked = true;
      // Held/Waffe des Partners zaehlen fuer SEINE Sammel-Sticker —
      // VOR applyDeltasTo, damit heldenTrio & Co. sofort pruefen
      const p2Hero = getHero(p2Data.settings.heroId);
      p2Data.stickerCounters[`hero:${p2Hero.id}`] = (p2Data.stickerCounters[`hero:${p2Hero.id}`] ?? 0) + 1;
      const p2Weapon = getWeapon(p2Data.settings.weaponId, p2Hero).id;
      p2Data.stickerCounters[`weapon:${p2Weapon}`] = (p2Data.stickerCounters[`weapon:${p2Weapon}`] ?? 0) + 1;
      this.stickers.applyDeltasTo(p2Data);
      this.save.writeProfile(p2Id, p2Data);
    }

    const names = this.coopNames();
    this.gameOverState.result = {
      score: finalScore,
      wave,
      isRecord,
      best: this.runMode === 'journey'
        ? save.bestJourneyScores[diff]
        : (isCoop ? save.bestScoresCoop[diff] : save.bestScores[diff]),
      coresEarned,
      totalCores: save.cores,
      teaser: this.buildTeaser(),
      dps: this.runStats.dps(this.world.elapsed),
      strongestHit: this.runStats.strongestHit,
      maxCombo: this.runStats.maxComboMultiplier,
      build: this.runStats.build(this.world.players[0] ?? this.world.player),
      build2: isCoop ? this.runStats.build(this.world.players[1] ?? this.world.player) : null,
      buildLabels: isCoop ? names : null,
      newStickers,
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
    this.instRenderer.render(this.world, alpha, rawDt, false);
    this.particles.render();
    const p = this.world.player;
    this.cameraRig.update(rawDt, p.x, p.z, 0, 0);
    this.popups.update(rawDt, this.cameraRig.camera);
  }

  dispose(): void {
    this.loop.stop();
    // FIX: aktiven FSM-State verlassen, BEVOR seine Abhaengigkeiten entsorgt werden —
    // entfernt den window-keydown-Handler von RunState/CoopSetup/GameOver (sonst
    // Listener-Leak + Geister-Pause auf totem State bei jedem Vite-HMR).
    this.fsm.dispose();
    for (const d of this.disposers) d();
    this.input.dispose();
    this.music.dispose();
    this.sfx.dispose();
    this.audioEngine.dispose();
    this.juice.dispose();
    this.rumble.dispose();
    this.uiNav.dispose();
    this.stickers.dispose();
    this.runStats.dispose();
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
