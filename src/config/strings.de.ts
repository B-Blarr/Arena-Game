/** Saemtliche UI-Texte zentral auf Deutsch. */

export const STR = {
  title: 'Neon Arena',
  subtitle: 'Überlebe die Wellen',

  // Menue
  play: 'Spielen',
  shop: 'Werkstatt',
  bestScore: 'Bestwert',
  difficulty: 'Schwierigkeit',
  autoAim: 'Auto-Zielen',
  weaponSelect: 'Waffe',
  on: 'An',
  off: 'Aus',
  locked: 'Gesperrt',
  hardLockedHint: 'Erreiche Welle 10 auf Normal',
  menuHint: 'Bewegen: WASD / Pfeile · Dash: Leertaste · Pause: P / Esc',
  saveWarning: 'Achtung: Fortschritt kann nicht gespeichert werden (Speicher blockiert).',
  dailySeed: 'Tages-Arena',
  dailySeedHint: 'Jeden Tag dieselben Wellen für alle',

  difficulties: {
    easy: 'Einfach',
    normal: 'Normal',
    hard: 'Schwer',
  } as Record<string, string>,

  // HUD
  wave: 'Welle',
  waveShort: 'W',
  enemiesLeft: 'Gegner übrig',
  combo: 'Combo',

  // Wellen-Banner
  waveCleared: 'Welle geschafft!',
  wavePerfect: 'Perfekt!',
  waveIncoming: 'Welle',
  bossIncoming: 'Boss!',
  hardUnlocked: 'Neuer Modus freigeschaltet: Schwer!',

  // Ueberraschungen
  goldenWave: '★ Goldene Welle! Doppelte Kerne! ★',
  capsuleIncoming: 'Versorgung im Anflug!',
  capsuleRewards: {
    cores: 'Kern-Regen!',
    hearts: 'Extra-Herzen!',
    magnet: 'Magnet!',
    rapidFire: 'Turbofeuer!',
  } as Record<string, string>,
  thiefEscaped: 'Dieb entkommen!',
  eliteSpawned: 'Elite!',

  // Upgrade-Screen
  chooseUpgrade: 'Wähle ein Upgrade!',
  reroll: 'Neu würfeln',
  rerollUsed: 'Verbraucht',
  stacksLabel: 'Stufe',
  rarities: {
    common: 'Gewöhnlich',
    rare: 'Selten',
    epic: 'Episch',
    legendary: 'Legendär',
  } as Record<string, string>,
  legendaryFound: 'LEGENDÄR!',

  // Pause
  pause: 'Pause',
  resume: 'Weiter',
  restart: 'Neustart',
  options: 'Optionen',
  mainMenu: 'Hauptmenü',
  volumeMaster: 'Lautstärke',
  volumeSfx: 'Effekte',
  volumeMusic: 'Musik',
  reduceFx: 'Effekte reduzieren',
  damageNumbers: 'Schadenszahlen',

  // Game Over
  gameOverTitle: 'Runde vorbei!',
  newRecord: 'Neuer Bestwert!',
  reachedWave: 'Erreichte Welle',
  coresEarned: 'Kerne verdient',
  again: 'Nochmal!',
  toMenu: 'Menü',
  nextUnlockTeaser: (name: string, missing: number) => `Nur noch ${missing} Kerne bis: ${name}`,
  shopAffordable: 'Du kannst etwas Neues in der Werkstatt freischalten! 🛠',
  restartHint: 'Taste R für sofortigen Neustart',
  runSummary: {
    build: 'Dein Build',
    dps: 'Schaden/s',
    strongestHit: 'Stärkster Treffer',
    bestCombo: 'Beste Combo',
  },

  // Shop
  shopTitle: 'Werkstatt',
  heroesSection: 'Helden',
  boniSection: 'Dauerhafte Boni',
  weaponsSection: 'Startwaffen',
  buy: 'Kaufen',
  bought: 'Gekauft',
  selected: 'Ausgewählt',
  select: 'Auswählen',
  maxed: 'Maximum',
  back: 'Zurück',
  cores: 'Kerne',

  // Helden
  heroes: {
    volt: { name: 'VOLT', trait: 'Der Allrounder – ausgewogen und zuverlässig' },
    blitz: { name: 'BLITZ', trait: 'Schnell und wendig, aber zerbrechlich' },
    brocken: { name: 'BROCKEN', trait: 'Zäher Koloss mit Streuschuss' },
  } as Record<string, { name: string; trait: string }>,

  // Waffen
  weapons: {
    blaster: { name: 'Neon-Blaster', desc: 'Der treue Standard' },
    pulse: { name: 'Impulskanone', desc: 'Schnellfeuer, wenig Wumms' },
    spread: { name: 'Streuschuss', desc: '3 Kugeln im Fächer' },
    laser: { name: 'Laser-Lanze', desc: 'Durchbohrt ALLES in einer Linie' },
    star: { name: 'Sternenwerfer', desc: 'Bumerang-Stern, trifft doppelt' },
  } as Record<string, { name: string; desc: string }>,

  // Bosse
  bosses: {
    prisma: 'PRISMA',
    goliath: 'GOLIATH',
    hydra: 'HYDRA-KERN',
  } as Record<string, string>,
  bossTierSuffix: '+',

  // Upgrades
  upgrades: {
    fireRate: { name: 'Feuerrate', desc: '+12 % schneller schießen' },
    damage: { name: 'Schaden', desc: '+15 % Schaden' },
    speed: { name: 'Tempo', desc: '+8 % Lauftempo' },
    maxHp: { name: 'Panzerglas', desc: '+20 Leben, sofort geheilt' },
    magnet: { name: 'Magnet', desc: 'Sammelt Kerne von viel weiter weg' },
    range: { name: 'Fernblick', desc: '+20 % Reichweite und Schussgeschwindigkeit' },
    coreGreed: { name: 'Kern-Gier', desc: '+25 % Chance auf Kern-Drops' },
    multishot: { name: 'Mehrfachschuss', desc: '+1 Projektil (etwas weniger Schaden je Kugel)' },
    pierce: { name: 'Durchschlag', desc: 'Kugeln durchbohren +1 Gegner' },
    crit: { name: 'Volltreffer', desc: '+10 % Chance auf doppelten Schaden' },
    lifesteal: { name: 'Lebensraub', desc: '+1 Leben pro Abschuss' },
    orb: { name: 'Schutz-Orb', desc: 'Kreisender Orb schadet Gegnern' },
    dashBlade: { name: 'Dash-Klinge', desc: 'Dash verletzt durchquerte Gegner' },
    frost: { name: 'Frost-Schuss', desc: 'Treffer verlangsamen Gegner' },
    nova: { name: 'Nova-Kill', desc: '20 % Chance: Explosion bei Abschuss' },
    doubleDash: { name: 'Doppel-Dash', desc: 'Eine zweite Dash-Ladung' },
    ricochet: { name: 'Abpraller', desc: 'Kugeln springen zum nächsten Gegner' },
    mirrorClone: { name: 'Spiegelklon', desc: 'Ein Geisterklon feuert jeden Schuss mit!' },
    chainReaction: { name: 'Kettenreaktion', desc: 'JEDER besiegte Gegner explodiert!' },
    orbitalLaser: { name: 'Orbital-Laser', desc: 'Alle 5 Sekunden: Laser auf den stärksten Gegner' },
    blackHoleDash: { name: 'Schwarzes Loch', desc: 'Dein Dash saugt Gegner zusammen' },
    overcharge: { name: 'Überladung', desc: 'Unter 30 % Leben: +50 % Schaden' },
    megaShots: { name: 'Mega-Kugeln', desc: 'Riesige Kugeln: mehr Schaden, durchbohren Gegner' },
    corePack: { name: 'Kern-Paket', desc: 'Sofort +15 Kerne' },
    repair: { name: 'Reparatur', desc: 'Heilt sofort 30 % Leben' },
    scoreBoost: { name: 'Punkte-Schub', desc: 'Sofort Bonuspunkte (500 × Welle)' },
  } as Record<string, { name: string; desc: string }>,

  // Dauerhafte Boni
  permaBoni: {
    armor: { name: 'Panzerung', desc: '+10 % Start-Leben je Stufe' },
    calibration: { name: 'Kalibrierung', desc: '+6 % Schaden je Stufe' },
    turbo: { name: 'Turbo', desc: '+5 % Tempo je Stufe' },
    luck: { name: 'Glückskern', desc: '+10 % Kern-Chance je Stufe' },
    headstart: { name: 'Kopfstart', desc: 'Starte jede Runde mit 1 Gratis-Upgrade' },
    secondChance: { name: 'Zweite Chance', desc: '1× pro Runde: Wiederbelebung mit 50 % Leben' },
  } as Record<string, { name: string; desc: string }>,

  // Onboarding
  promptMove: 'Laufen!',
  promptShoot: 'Schießen!',
  promptDash: 'Dash!',
  promptCollect: 'Kerne einsammeln!',

  // Sonstiges
  clickToStart: 'Klicke, um zu starten',
  revived: 'Zweite Chance!',
} as const;
