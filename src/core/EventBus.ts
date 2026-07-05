/**
 * Typisierter Event-Bus: Gameplay feuert Events, Juice/Audio/UI/Score
 * abonnieren nur. Gameplay-Code kennt weder Partikel noch Sounds —
 * die wichtigste Entkopplungs-Entscheidung des Projekts.
 */
export interface GameEvents {
  // Kampf
  shotFired: { x: number; z: number; dirX: number; dirZ: number };
  enemyHit: { x: number; z: number; damage: number; crit: boolean; enemyType: number };
  enemyKilled: { x: number; z: number; enemyType: number; points: number; scale: number };
  explosion: { x: number; z: number; radius: number; color: number };
  projectileWallHit: { x: number; z: number };
  /** Bomber-Zuendung: roter Warn-Ring am Boden. */
  enemyFuse: { x: number; z: number; radius: number; duration: number };
  /** Kern-Dieb frisst einen liegenden Kern. */
  coreStolen: { x: number; z: number; carried: number };
  /** Kern-Dieb entkommt mitsamt Beute. */
  thiefEscaped: { x: number; z: number; cores: number };
  /** Phantom teleportiert zur Flanke. */
  phantomBlink: { fromX: number; fromZ: number; toX: number; toZ: number };
  /** Elite-Gegner betritt die Arena. */
  eliteSpawned: { x: number; z: number; enemyType: number; affix: number };
  /** Elite-Schild zerbricht am ersten Treffer. */
  eliteShieldBroken: { x: number; z: number };
  /** Orbital-Laser (legendaeres Upgrade) schlaegt ein. */
  orbitalStrike: { x: number; z: number };
  /** Schwarzes Loch (legendaer): Singularitaet erscheint am Dash-Ende. */
  blackHole: { x: number; z: number; radius: number; duration: number };
  /** WIRBEL: rein kosmetischer Wiederhol-Ring waehrend des Sogs (KEIN Warnton). */
  vortexRing: { x: number; z: number; radius: number; duration: number };

  // Spieler
  playerHit: { damage: number; hp: number; maxHp: number };
  playerHealed: { amount: number; hp: number; maxHp: number };
  playerDied: { x: number; z: number };
  playerDashed: { x: number; z: number };
  dashReady: Record<string, never>;
  playerRevived: Record<string, never>;

  // Boss
  bossSpawned: { name: string; maxHp: number; x: number; z: number };
  bossHpChanged: { hp: number; maxHp: number };
  bossPhase: { phase: number };
  bossTelegraph: {
    kind: 'salvo' | 'charge' | 'shockwave' | 'summon' | 'vortex';
    x: number;
    z: number;
    dirX?: number;
    dirZ?: number;
    radius?: number;
    length?: number;
    duration: number;
  };
  bossStomp: { x: number; z: number; radius: number; speed: number };
  bossDied: { x: number; z: number; color: number };
  enemyShot: { x: number; z: number };

  // Wellen
  waveStarted: { wave: number; isBossWave: boolean };
  waveCleared: { wave: number; perfect: boolean; bonus: number };
  portalOpened: { x: number; z: number };

  // Ueberraschungen
  goldenWave: { wave: number };
  capsuleIncoming: { x: number; z: number };
  capsuleLanded: { x: number; z: number };
  capsuleReward: { x: number; z: number; kind: 'cores' | 'hearts' | 'magnet' | 'rapidFire' };

  // Pickups
  pickupCollected: { kind: 'core' | 'heart' | 'magnet' | 'capsule'; x: number; z: number; value: number };

  // Score / Meta
  scoreChanged: { score: number; delta: number };
  comboChanged: { kills: number; multiplier: number };
  comboBroken: Record<string, never>;
  coresChanged: { runCores: number };

  // Eingabe
  padConnected: { index: number };
  /** slot -1 = Pad war keinem Spieler zugeordnet. */
  padDisconnected: { index: number; slot: number };

  // Ablauf / UI
  runStarted: Record<string, never>;
  gameOver: { score: number; wave: number; coresEarned: number; isRecord: boolean };
  upgradeChosen: { id: string; rarity: string };
  /** Ein legendaeres Upgrade liegt im Angebot (Zeremonie/Fanfare). */
  legendaryRevealed: { id: string };
  uiHover: Record<string, never>;
  uiClick: Record<string, never>;
  musicBeat: { step: number };
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(key: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(key);
    if (!set) return;
    for (const fn of set) (fn as Handler<K>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
