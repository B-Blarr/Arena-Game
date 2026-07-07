/**
 * NEU (Belohnungsart "Spur-Effekte"): leuchtende Trails hinter dem Helden. Analog zu den
 * Farbvarianten (COLORWAYS) freischaltbar ueber (schwere/geheime) Reise-Erfolge und im
 * Menue waehlbar. Rein kosmetisch: der Trail wird als Partikel-Wake gespawnt (ParticleSystem
 * .heroTrail) und beeinflusst KEIN Gameplay/RNG. Palette bewusst OHNE Rot (Rot = "ausweichen").
 */
export interface TrailDef {
  id: string;
  /** Partikelfarbe (0xRRGGBB) oder 'rainbow' (Hue-Zyklus, animiert). */
  color: number | 'rainbow';
  /** Partikelgroesse. */
  size: number;
  /** Lebensdauer in Sekunden (Fade). */
  life: number;
  /** Leichte Schwerkraft (0 = schwebt, negativ = steigt, positiv = sinkt). */
  gravity?: number;
}

/** Sentinel: kein Trail (Default). */
export const TRAIL_NONE = 'none';

export const TRAILS: readonly TrailDef[] = [
  { id: 'komet', color: 0x00e5ff, size: 0.16, life: 0.5, gravity: 0 },
  { id: 'funken', color: 0xffc83d, size: 0.12, life: 0.45, gravity: -2 },
  { id: 'plasma', color: 0xd23dff, size: 0.16, life: 0.55, gravity: 0 },
  { id: 'frost', color: 0x9adfff, size: 0.14, life: 0.6, gravity: 1 },
  { id: 'regenbogen', color: 'rainbow', size: 0.17, life: 0.55, gravity: 0 },
];

/** Gibt den gewaehlten Trail zurueck, ODER null (aus / nicht freigeschaltet). */
export function getTrail(id: string, unlocked: readonly string[]): TrailDef | null {
  if (id === TRAIL_NONE) return null;
  if (!unlocked.includes(id)) return null;
  return TRAILS.find((t) => t.id === id) ?? null;
}
