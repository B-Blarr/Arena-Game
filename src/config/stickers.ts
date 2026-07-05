/**
 * Sticker-Album: 54 Sticker auf 7 Seiten als Langzeitmotivation.
 * NUR Daten — die Auswerte-Maschine ist src/systems/StickerSystem.ts.
 * Sticker-IDs nach Release stabil halten (sanitize verwirft Unbekanntes).
 *
 * Zaehler-Namen (stickerCounters bzw. virtuell):
 *   kills/runs (virtuell = stats.totalKills/totalRuns), cores, hearts,
 *   magnets, dashes, upgrades, crits, revives, perfectWaves, bossSeen,
 *   killsType:<n>, killsElite, boss:<id>, capsule:<kind>, hero:<id>,
 *   weapon:<id>, leg:<upgradeId>, dailyRuns, coopRuns, coopRevives
 */

export type StickerRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type StickerTrigger =
  /** Kumulativer Zaehler erreicht ein Ziel (goal 1 = "einmal passiert"). */
  | { kind: 'counter'; counter: string; goal: number }
  /** Alle genannten Zaehler mindestens 1 (Sammel-Sets). */
  | { kind: 'counterSet'; counters: readonly string[] }
  /** waveStarted.wave erreicht einen Wert. */
  | { kind: 'wave'; value: number }
  /** Score in EINEM Lauf erreicht einen Wert. */
  | { kind: 'score'; value: number }
  /** Combo-Multiplikator erreicht einen Wert. */
  | { kind: 'combo'; value: number }
  /** Vom StickerSystem gesetztes Run-Flag (Speziallogik). */
  | { kind: 'flag'; flag: string };

export interface StickerDef {
  id: string;
  icon: string;
  rarity: StickerRarity;
  page: string;
  /** Geheim: im Album nur "???" + Raetsel-Hint. */
  secret?: boolean;
  trigger: StickerTrigger;
}

export interface ColorwayDef {
  id: string;
  /** Rumpf-/Trail-/Muzzle-Farbe. */
  body: number;
  /** Triebwerks-Farbe (sonst Helden-Standard). */
  engine?: number;
}

export interface AlbumPageDef {
  id: string;
  icon: string;
  reward: { kind: 'cores'; amount: number } | { kind: 'colorway'; colorwayId: string };
}

/** Keine roten Toene — Rot bleibt exklusiv "ausweichen!". */
export const COLORWAYS: readonly ColorwayDef[] = [
  { id: 'limette', body: 0xa8ff3d },
  { id: 'aurora', body: 0x4dffc3 },
  { id: 'bonbon', body: 0xff7ae0 },
  { id: 'ultraviolett', body: 0x8f5cff },
  { id: 'sonnenglut', body: 0xffb84d },
  { id: 'tiefsee', body: 0x3d8bff },
  { id: 'gold', body: 0xffc83d, engine: 0xfff2b0 },
];

export function getColorway(id: string, unlocked: readonly string[]): ColorwayDef | undefined {
  if (id === 'default' || !unlocked.includes(id)) return undefined;
  return COLORWAYS.find((c) => c.id === id);
}

export const ALBUM_PAGES: readonly AlbumPageDef[] = [
  { id: 'start', icon: '🐣', reward: { kind: 'cores', amount: 150 } },
  { id: 'kampf', icon: '⚔️', reward: { kind: 'colorway', colorwayId: 'limette' } },
  { id: 'bosse', icon: '👑', reward: { kind: 'colorway', colorwayId: 'aurora' } },
  { id: 'sammler', icon: '💰', reward: { kind: 'colorway', colorwayId: 'bonbon' } },
  { id: 'meister', icon: '🏆', reward: { kind: 'colorway', colorwayId: 'ultraviolett' } },
  { id: 'team', icon: '🤝', reward: { kind: 'colorway', colorwayId: 'sonnenglut' } },
  { id: 'geheim', icon: '❓', reward: { kind: 'colorway', colorwayId: 'tiefsee' } },
];

/** Belohnung fuer 100 %: Gold-Colorway (Sonderfall neben den Seiten). */
export const GOLD_REWARD_ID = 'gold';

export const STICKERS: readonly StickerDef[] = [
  // ---------------------------------------------- Seite 1: Erste Schritte
  { id: 'ersterFunke', icon: '💥', rarity: 'common', page: 'start', trigger: { kind: 'counter', counter: 'kills', goal: 1 } },
  { id: 'wellenreiter', icon: '🌊', rarity: 'common', page: 'start', trigger: { kind: 'counter', counter: 'wavesCleared', goal: 1 } },
  { id: 'wusch', icon: '💨', rarity: 'common', page: 'start', trigger: { kind: 'counter', counter: 'dashes', goal: 1 } },
  { id: 'herzenssache', icon: '❤️', rarity: 'common', page: 'start', trigger: { kind: 'counter', counter: 'hearts', goal: 1 } },
  { id: 'magnetisch', icon: '🧲', rarity: 'common', page: 'start', trigger: { kind: 'counter', counter: 'magnets', goal: 1 } },
  { id: 'aufgeruestet', icon: '🔧', rarity: 'common', page: 'start', trigger: { kind: 'counter', counter: 'upgrades', goal: 1 } },
  { id: 'kernSammler', icon: '💠', rarity: 'common', page: 'start', trigger: { kind: 'counter', counter: 'cores', goal: 100 } },
  { id: 'bossInSicht', icon: '👀', rarity: 'common', page: 'start', trigger: { kind: 'counter', counter: 'bossSeen', goal: 1 } },
  { id: 'blitzblank', icon: '✨', rarity: 'rare', page: 'start', trigger: { kind: 'counter', counter: 'perfectWaves', goal: 1 } },
  { id: 'stammgast', icon: '🎮', rarity: 'common', page: 'start', trigger: { kind: 'counter', counter: 'runs', goal: 10 } },

  // ---------------------------------------------- Seite 2: Kampfkunst
  { id: 'comboKueken', icon: '🐣', rarity: 'common', page: 'kampf', trigger: { kind: 'combo', value: 1.5 } },
  { id: 'comboProfi', icon: '🔥', rarity: 'rare', page: 'kampf', trigger: { kind: 'combo', value: 2 } },
  { id: 'comboMeister', icon: '🌋', rarity: 'epic', page: 'kampf', trigger: { kind: 'combo', value: 3 } },
  { id: 'scharfschuetze', icon: '🎯', rarity: 'rare', page: 'kampf', trigger: { kind: 'counter', counter: 'crits', goal: 100 } },
  { id: 'panzerknacker', icon: '🔨', rarity: 'rare', page: 'kampf', trigger: { kind: 'counter', counter: 'killsType:3', goal: 10 } },
  { id: 'geisterjaeger', icon: '👻', rarity: 'rare', page: 'kampf', trigger: { kind: 'counter', counter: 'killsType:8', goal: 15 } },
  { id: 'eliteSchreck', icon: '⭐', rarity: 'epic', page: 'kampf', trigger: { kind: 'counter', counter: 'killsElite', goal: 10 } },
  { id: 'unberuehrbar', icon: '🛡️', rarity: 'epic', page: 'kampf', trigger: { kind: 'flag', flag: 'perfect3' } },

  // ---------------------------------------------- Seite 3: Boss-Jaeger
  { id: 'prismaZerlegt', icon: '🔮', rarity: 'rare', page: 'bosse', trigger: { kind: 'counter', counter: 'boss:prisma', goal: 1 } },
  { id: 'goliathGestuerzt', icon: '🗿', rarity: 'rare', page: 'bosse', trigger: { kind: 'counter', counter: 'boss:goliath', goal: 1 } },
  { id: 'minosEntschaerft', icon: '💣', rarity: 'rare', page: 'bosse', trigger: { kind: 'counter', counter: 'boss:minos', goal: 1 } },
  { id: 'hydraGestutzt', icon: '🐙', rarity: 'rare', page: 'bosse', trigger: { kind: 'counter', counter: 'boss:hydra', goal: 1 } },
  { id: 'wirbelGestoppt', icon: '🌪️', rarity: 'rare', page: 'bosse', trigger: { kind: 'counter', counter: 'boss:vortex', goal: 1 } },
  { id: 'bossSammlung', icon: '👑', rarity: 'epic', page: 'bosse', trigger: { kind: 'counterSet', counters: ['boss:prisma', 'boss:goliath', 'boss:minos', 'boss:hydra', 'boss:vortex'] } },
  { id: 'makelloserBoss', icon: '💎', rarity: 'epic', page: 'bosse', trigger: { kind: 'flag', flag: 'bossNoHit' } },
  { id: 'ueberBoss', icon: '🦾', rarity: 'legendary', page: 'bosse', trigger: { kind: 'flag', flag: 'bossTierPlus' } },

  // ---------------------------------------------- Seite 4: Sammler
  { id: 'kernschatz', icon: '💰', rarity: 'common', page: 'sammler', trigger: { kind: 'counter', counter: 'cores', goal: 500 } },
  { id: 'kernDrache', icon: '🐉', rarity: 'epic', page: 'sammler', trigger: { kind: 'counter', counter: 'cores', goal: 5000 } },
  { id: 'goldrausch', icon: '🌟', rarity: 'common', page: 'sammler', trigger: { kind: 'counter', counter: 'goldenWaves', goal: 1 } },
  { id: 'paeckchen', icon: '📦', rarity: 'common', page: 'sammler', trigger: { kind: 'counter', counter: 'capsules', goal: 1 } },
  { id: 'paketProfi', icon: '🎁', rarity: 'rare', page: 'sammler', trigger: { kind: 'counterSet', counters: ['capsule:cores', 'capsule:hearts', 'capsule:magnet', 'capsule:rapidFire'] } },
  { id: 'tagesheld', icon: '📅', rarity: 'common', page: 'sammler', trigger: { kind: 'counter', counter: 'dailyRuns', goal: 1 } },
  { id: 'heldenTrio', icon: '🦸', rarity: 'rare', page: 'sammler', trigger: { kind: 'counterSet', counters: ['hero:volt', 'hero:blitz', 'hero:brocken'] } },
  { id: 'waffenkammer', icon: '🗡️', rarity: 'epic', page: 'sammler', trigger: { kind: 'counterSet', counters: ['weapon:blaster', 'weapon:pulse', 'weapon:spread', 'weapon:laser', 'weapon:star'] } },
  { id: 'legendenAlbum', icon: '📖', rarity: 'legendary', page: 'sammler', trigger: { kind: 'counterSet', counters: ['leg:mirrorClone', 'leg:chainReaction', 'leg:orbitalLaser', 'leg:blackHoleDash', 'leg:overcharge', 'leg:megaShots'] } },

  // ---------------------------------------------- Seite 5: Meisterschaft
  { id: 'welle10', icon: '🔟', rarity: 'common', page: 'meister', trigger: { kind: 'wave', value: 10 } },
  { id: 'welle15', icon: '🚀', rarity: 'rare', page: 'meister', trigger: { kind: 'wave', value: 15 } },
  { id: 'welle20', icon: '🌌', rarity: 'epic', page: 'meister', trigger: { kind: 'wave', value: 20 } },
  { id: 'harteSchale', icon: '🏋️', rarity: 'epic', page: 'meister', trigger: { kind: 'flag', flag: 'hardWave10' } },
  { id: 'punkteSturm', icon: '🌩️', rarity: 'rare', page: 'meister', trigger: { kind: 'score', value: 25000 } },
  { id: 'schlaechter1', icon: '⚔️', rarity: 'common', page: 'meister', trigger: { kind: 'counter', counter: 'kills', goal: 1000 } },
  { id: 'schlaechter2', icon: '🪓', rarity: 'epic', page: 'meister', trigger: { kind: 'counter', counter: 'kills', goal: 5000 } },
  { id: 'schlaechter3', icon: '☠️', rarity: 'legendary', page: 'meister', trigger: { kind: 'counter', counter: 'kills', goal: 20000 } },
  { id: 'perfektionist', icon: '💯', rarity: 'legendary', page: 'meister', trigger: { kind: 'counter', counter: 'perfectWaves', goal: 100 } },

  // ---------------------------------------------- Seite 6: Team-Werk (Koop)
  { id: 'doppeltHaelt', icon: '🤝', rarity: 'common', page: 'team', trigger: { kind: 'counter', counter: 'coopRuns', goal: 1 } },
  { id: 'retterInDerNot', icon: '🚑', rarity: 'rare', page: 'team', trigger: { kind: 'counter', counter: 'coopRevives', goal: 1 } },
  { id: 'teamWelle10', icon: '👯', rarity: 'rare', page: 'team', trigger: { kind: 'flag', flag: 'coopWave10' } },
  { id: 'niemandFaellt', icon: '💪', rarity: 'epic', page: 'team', trigger: { kind: 'flag', flag: 'coopBossNoDown' } },

  // ---------------------------------------------- Seite 7: Geheimnisse
  { id: 'aufFrischerTat', icon: '🚨', rarity: 'epic', page: 'geheim', secret: true, trigger: { kind: 'flag', flag: 'thiefPreSteal' } },
  { id: 'spaghettiMonster', icon: '🕳️', rarity: 'legendary', page: 'geheim', secret: true, trigger: { kind: 'flag', flag: 'blackHole3' } },
  { id: 'standhaft', icon: '🧘', rarity: 'epic', page: 'geheim', secret: true, trigger: { kind: 'flag', flag: 'bossNoDash' } },
  { id: 'umHaaresbreite', icon: '😅', rarity: 'rare', page: 'geheim', secret: true, trigger: { kind: 'flag', flag: 'closeCall' } },
  { id: 'wiederDa', icon: '💫', rarity: 'rare', page: 'geheim', secret: true, trigger: { kind: 'counter', counter: 'revives', goal: 1 } },
  { id: 'goldenePerfektion', icon: '🏅', rarity: 'epic', page: 'geheim', secret: true, trigger: { kind: 'flag', flag: 'goldenPerfect' } },
];

export function stickersOfPage(pageId: string): StickerDef[] {
  return STICKERS.filter((s) => s.page === pageId);
}
