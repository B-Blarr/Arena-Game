/**
 * Sticker-Album ("Erfolge"): Sammel-Erfolge auf mehreren Seiten als
 * Langzeitmotivation (die 100%-Logik nutzt STICKERS.length, skaliert also mit).
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

/** Belohnung, die ein EINZELNER Erfolg bringt (im Album-Detail abgeholt). */
export type StickerReward =
  | { kind: 'cores'; amount: number }
  | { kind: 'colorway'; colorwayId: string }
  /** NEU (Belohnungsart): schaltet einen Spur-Effekt frei (src/config/trails.ts). */
  | { kind: 'trail'; trailId: string };

export interface StickerDef {
  id: string;
  icon: string;
  rarity: StickerRarity;
  page: string;
  /** Geheim: im Album nur "???" + Raetsel-Hint. */
  secret?: boolean;
  trigger: StickerTrigger;
  /** Optional: schwere Vorzeige-Erfolge bringen eine eigene Belohnung. */
  reward?: StickerReward;
}

export interface ColorwayDef {
  id: string;
  /** Rumpf-/Trail-/Muzzle-Farbe. */
  body: number;
  /** Triebwerks-Farbe (sonst Helden-Standard). */
  engine?: number;
  /** Animiert (Regenbogen): der Renderer faerbt den Rumpf pro Frame neu. */
  animated?: boolean;
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
  // Neue Farben (Belohnungen der Erfolgs-Erweiterung) — weiter kein Rot
  { id: 'eisblau', body: 0x00e5ff },
  { id: 'smaragd', body: 0x1fd65f },
  { id: 'kobalt', body: 0x5266ff },
  { id: 'platin', body: 0xd6e4ff, engine: 0xffffff },
  { id: 'prismatisch', body: 0xffffff, animated: true },
  // NEU (Reise-Ausbau): Belohnung der Reise-Album-Seite (kein Rot)
  { id: 'amethyst', body: 0xc07aff },
  // NEU (Reise-Ausbau 2): Belohnungen der neuen Reise-Seiten (kein Rot)
  { id: 'kosmos', body: 0x00ffb0 },
  { id: 'sternenstaub', body: 0xe8c8ff, engine: 0xffffff },
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
  { id: 'ausdauer', icon: '🔥', reward: { kind: 'colorway', colorwayId: 'eisblau' } },
  { id: 'herausforderung', icon: '🎯', reward: { kind: 'colorway', colorwayId: 'smaragd' } },
  { id: 'geheim2', icon: '🕵️', reward: { kind: 'colorway', colorwayId: 'kobalt' } },
  // NEU (Reise-Ausbau): Reise-Modus-Erfolge
  { id: 'reise', icon: '🧭', reward: { kind: 'colorway', colorwayId: 'amethyst' } },
  // NEU (Reise-Ausbau 2): Reise-Meisterschaft + geheime Reise-Herausforderungen
  { id: 'reise2', icon: '🌟', reward: { kind: 'colorway', colorwayId: 'kosmos' } },
  { id: 'reiseGeheim', icon: '🌌', reward: { kind: 'colorway', colorwayId: 'sternenstaub' } },
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

  // ---------------------------------------------- Seite 8: Ausdauer (Reward: eisblau)
  { id: 'welle25', icon: '📈', rarity: 'rare', page: 'ausdauer', trigger: { kind: 'wave', value: 25 } },
  { id: 'welle30', icon: '🗻', rarity: 'epic', page: 'ausdauer', trigger: { kind: 'wave', value: 30 } },
  { id: 'welle35', icon: '🏔️', rarity: 'epic', page: 'ausdauer', trigger: { kind: 'wave', value: 35 } },
  { id: 'welle40', icon: '🚩', rarity: 'legendary', page: 'ausdauer', trigger: { kind: 'wave', value: 40 }, reward: { kind: 'cores', amount: 300 } },
  { id: 'welle50', icon: '🌠', rarity: 'legendary', page: 'ausdauer', trigger: { kind: 'wave', value: 50 }, reward: { kind: 'colorway', colorwayId: 'platin' } },
  { id: 'kernMagnat', icon: '🏦', rarity: 'epic', page: 'ausdauer', trigger: { kind: 'counter', counter: 'cores', goal: 25000 } },
  { id: 'dauerlaeufer', icon: '🏃', rarity: 'epic', page: 'ausdauer', trigger: { kind: 'counter', counter: 'wavesCleared', goal: 300 } },
  { id: 'marathon', icon: '🎖️', rarity: 'legendary', page: 'ausdauer', trigger: { kind: 'counter', counter: 'wavesCleared', goal: 1000 }, reward: { kind: 'cores', amount: 300 } },
  { id: 'veteran', icon: '🎗️', rarity: 'rare', page: 'ausdauer', trigger: { kind: 'counter', counter: 'runs', goal: 50 } },
  { id: 'altgedienter', icon: '🏛️', rarity: 'epic', page: 'ausdauer', trigger: { kind: 'counter', counter: 'runs', goal: 200 } },
  { id: 'schlaechter4', icon: '⚰️', rarity: 'legendary', page: 'ausdauer', trigger: { kind: 'counter', counter: 'kills', goal: 50000 }, reward: { kind: 'cores', amount: 500 } },

  // ---------------------------------------------- Seite 9: Herausforderung (Reward: smaragd)
  { id: 'makelloserKrieger', icon: '⚜️', rarity: 'epic', page: 'herausforderung', trigger: { kind: 'flag', flag: 'bossFlawless' } },
  { id: 'eisenwille', icon: '🧗', rarity: 'epic', page: 'herausforderung', trigger: { kind: 'flag', flag: 'noDashRun15' } },
  { id: 'unantastbar', icon: '🔰', rarity: 'legendary', page: 'herausforderung', trigger: { kind: 'flag', flag: 'noHitRun10' }, reward: { kind: 'cores', amount: 500 } },
  { id: 'hochBoss', icon: '⛰️', rarity: 'epic', page: 'herausforderung', trigger: { kind: 'flag', flag: 'bossTier40' } },
  { id: 'fuenfPerfekt', icon: '🖐️', rarity: 'epic', page: 'herausforderung', trigger: { kind: 'flag', flag: 'perfect5' } },
  { id: 'comboKoenig', icon: '🎇', rarity: 'epic', page: 'herausforderung', trigger: { kind: 'combo', value: 4 } },
  { id: 'comboGott', icon: '⚡', rarity: 'epic', page: 'herausforderung', trigger: { kind: 'combo', value: 5 } },
  { id: 'punkteGott', icon: '🎆', rarity: 'epic', page: 'herausforderung', trigger: { kind: 'score', value: 100000 } },
  { id: 'hartGesotten', icon: '🥋', rarity: 'epic', page: 'herausforderung', trigger: { kind: 'flag', flag: 'hardWave20' } },
  { id: 'titan', icon: '🦣', rarity: 'epic', page: 'herausforderung', trigger: { kind: 'counter', counter: 'killsType:3', goal: 100 } },
  { id: 'bezwinger', icon: '🌈', rarity: 'legendary', page: 'herausforderung', trigger: { kind: 'counterSet', counters: ['flawless:prisma', 'flawless:goliath', 'flawless:minos', 'flawless:hydra', 'flawless:vortex'] }, reward: { kind: 'colorway', colorwayId: 'prismatisch' } },

  // ---------------------------------------------- Seite 10: Geheimnisse II (Reward: kobalt)
  { id: 'paketMeister', icon: '🎀', rarity: 'epic', page: 'geheim2', secret: true, trigger: { kind: 'flag', flag: 'allCapsules1Run' } },
  { id: 'langfingerJagd', icon: '🕵️', rarity: 'epic', page: 'geheim2', secret: true, trigger: { kind: 'counter', counter: 'thiefCaught', goal: 10 } },
  { id: 'schattentaenzer', icon: '🥷', rarity: 'epic', page: 'geheim2', secret: true, trigger: { kind: 'flag', flag: 'bossNoDash30' } },
  { id: 'phoenix', icon: '♻️', rarity: 'rare', page: 'geheim2', secret: true, trigger: { kind: 'flag', flag: 'coopRevive3' } },
  { id: 'nadeloehr', icon: '🪡', rarity: 'rare', page: 'geheim2', secret: true, trigger: { kind: 'flag', flag: 'closeCall3' } },
  { id: 'lochfuerst', icon: '🌀', rarity: 'legendary', page: 'geheim2', secret: true, trigger: { kind: 'flag', flag: 'blackHole5' } },
  { id: 'eiserneReserve', icon: '🩹', rarity: 'epic', page: 'geheim2', secret: true, trigger: { kind: 'flag', flag: 'noHeal10' } },
  { id: 'genuegsam', icon: '🍃', rarity: 'epic', page: 'geheim2', secret: true, trigger: { kind: 'flag', flag: 'noCores10' } },

  // ---------------------------------------------- Seite 11: Reise (Reward: amethyst)
  { id: 'ersteReise', icon: '🧭', rarity: 'common', page: 'reise', trigger: { kind: 'counter', counter: 'journeyRuns', goal: 1 } },
  { id: 'schatzjaeger', icon: '💎', rarity: 'rare', page: 'reise', trigger: { kind: 'counter', counter: 'room:treasure', goal: 5 } },
  { id: 'sturmreiter', icon: '⚡', rarity: 'rare', page: 'reise', trigger: { kind: 'counter', counter: 'room:storm', goal: 5 } },
  { id: 'finsterWanderer', icon: '🌑', rarity: 'rare', page: 'reise', trigger: { kind: 'counter', counter: 'room:finsternis', goal: 3 } },
  { id: 'eliteKammerHeld', icon: '💀', rarity: 'epic', page: 'reise', trigger: { kind: 'counter', counter: 'room:elite', goal: 5 } },
  { id: 'reiseWelle15', icon: '🌠', rarity: 'epic', page: 'reise', trigger: { kind: 'flag', flag: 'journeyWave15' } },
  { id: 'mutprobe', icon: '🎲', rarity: 'epic', page: 'reise', trigger: { kind: 'counter', counter: 'journeyRiskCleared', goal: 25 } },
  { id: 'reiseProfi', icon: '🎒', rarity: 'rare', page: 'reise', trigger: { kind: 'counter', counter: 'journeyRuns', goal: 15 } },
  { id: 'weltenbummler', icon: '🗺️', rarity: 'epic', page: 'reise', trigger: { kind: 'counterSet', counters: ['room:treasure', 'room:elite', 'room:storm', 'room:oasis', 'room:horde', 'room:finsternis', 'room:singular'] } },
  { id: 'reiseWelle25', icon: '🏆', rarity: 'legendary', page: 'reise', trigger: { kind: 'flag', flag: 'journeyWave25' }, reward: { kind: 'cores', amount: 400 } },

  // ---------------------------------------------- Seite 12: Reise-Meisterschaft (Reward: kosmos)
  // Neue Raum-Counter werden erst durch diese Referenzen "scharf" (ab dann gezaehlt).
  { id: 'minenmeister', icon: '💥', rarity: 'rare', page: 'reise2', trigger: { kind: 'counter', counter: 'room:minefield', goal: 5 } },
  { id: 'panzerbrecher', icon: '🛡️', rarity: 'rare', page: 'reise2', trigger: { kind: 'counter', counter: 'room:tanks', goal: 5 } },
  { id: 'kugelhagel', icon: '🎯', rarity: 'rare', page: 'reise2', trigger: { kind: 'counter', counter: 'room:shooters', goal: 5 } },
  { id: 'geisterbanner', icon: '👻', rarity: 'rare', page: 'reise2', trigger: { kind: 'counter', counter: 'room:phantoms', goal: 5 } },
  { id: 'windlaeufer', icon: '🌬️', rarity: 'rare', page: 'reise2', trigger: { kind: 'counter', counter: 'room:windkanal', goal: 5 } },
  { id: 'glasbrecher', icon: '💠', rarity: 'rare', page: 'reise2', trigger: { kind: 'counter', counter: 'room:glasscannon', goal: 5 } },
  { id: 'wandbrecher', icon: '⭕', rarity: 'rare', page: 'reise2', trigger: { kind: 'counter', counter: 'room:collapse', goal: 5 } },
  { id: 'wagemut', icon: '🎲', rarity: 'epic', page: 'reise2', trigger: { kind: 'counter', counter: 'journeyRiskCleared', goal: 60 }, reward: { kind: 'trail', trailId: 'komet' } },
  { id: 'reiseVeteran', icon: '🎒', rarity: 'epic', page: 'reise2', trigger: { kind: 'counter', counter: 'journeyRuns', goal: 30 }, reward: { kind: 'trail', trailId: 'plasma' } },
  { id: 'reiseWelle30', icon: '🚩', rarity: 'epic', page: 'reise2', trigger: { kind: 'flag', flag: 'journeyWave30' }, reward: { kind: 'trail', trailId: 'funken' } },
  { id: 'neulandErkunder', icon: '🗺️', rarity: 'legendary', page: 'reise2', trigger: { kind: 'counterSet', counters: ['room:minefield', 'room:tanks', 'room:shooters', 'room:phantoms', 'room:windkanal', 'room:glasscannon', 'room:collapse'] }, reward: { kind: 'trail', trailId: 'frost' } },
  { id: 'reiseKenner', icon: '🏅', rarity: 'legendary', page: 'reise2', trigger: { kind: 'counter', counter: 'journeyRiskCleared', goal: 150 }, reward: { kind: 'cores', amount: 500 } },

  // ---------------------------------------------- Seite 13: Geheime Reise (Reward: sternenstaub)
  { id: 'reiseUnberuehrt', icon: '🕊️', rarity: 'legendary', page: 'reiseGeheim', secret: true, trigger: { kind: 'flag', flag: 'journeyNoHit25' }, reward: { kind: 'trail', trailId: 'regenbogen' } },
  { id: 'reiseDaemon', icon: '👹', rarity: 'legendary', page: 'reiseGeheim', secret: true, trigger: { kind: 'flag', flag: 'journeyNoHit30' }, reward: { kind: 'cores', amount: 1000 } },
  { id: 'reiseGrenzenlos', icon: '🌠', rarity: 'legendary', page: 'reiseGeheim', secret: true, trigger: { kind: 'flag', flag: 'journeyWave40' }, reward: { kind: 'cores', amount: 700 } },
  { id: 'reiseEisern', icon: '🧗', rarity: 'epic', page: 'reiseGeheim', secret: true, trigger: { kind: 'flag', flag: 'journeyNoDash20' }, reward: { kind: 'cores', amount: 400 } },
  { id: 'reiseAskese', icon: '🩹', rarity: 'epic', page: 'reiseGeheim', secret: true, trigger: { kind: 'flag', flag: 'journeyNoHeal20' }, reward: { kind: 'cores', amount: 400 } },
  { id: 'reiseGenuegsam', icon: '🍃', rarity: 'epic', page: 'reiseGeheim', secret: true, trigger: { kind: 'flag', flag: 'journeyNoCores15' }, reward: { kind: 'cores', amount: 300 } },
  { id: 'reiseVielfalt', icon: '🌈', rarity: 'epic', page: 'reiseGeheim', secret: true, trigger: { kind: 'flag', flag: 'journeyVariety' }, reward: { kind: 'cores', amount: 500 } },
];

export function stickersOfPage(pageId: string): StickerDef[] {
  return STICKERS.filter((s) => s.page === pageId);
}
