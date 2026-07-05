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

  // Spieler
  playerHit: { damage: number; hp: number; maxHp: number };
  playerHealed: { amount: number; hp: number; maxHp: number };
  playerDied: { x: number; z: number };
  playerDashed: { x: number; z: number };
  dashReady: Record<string, never>;
  playerRevived: Record<string, never>;

  // Boss
  bossSpawned: { name: string; maxHp: number };
  bossHpChanged: { hp: number; maxHp: number };
  bossPhase: { phase: number };
  bossTelegraph: {
    kind: 'salvo' | 'charge' | 'shockwave' | 'summon';
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

  // Pickups
  pickupCollected: { kind: 'core' | 'heart' | 'magnet'; x: number; z: number; value: number };

  // Score / Meta
  scoreChanged: { score: number; delta: number };
  comboChanged: { kills: number; multiplier: number };
  comboBroken: Record<string, never>;
  coresChanged: { runCores: number };

  // Ablauf / UI
  runStarted: Record<string, never>;
  gameOver: { score: number; wave: number; coresEarned: number; isRecord: boolean };
  upgradeChosen: { id: string };
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
