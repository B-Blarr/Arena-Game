/**
 * Generischer Objekt-Pool: dicht gepackt, [0..count) sind aktiv.
 * despawn() nutzt swap-remove — Reihenfolge ist nicht stabil, dafuer O(1)
 * und im Steady-State komplett allokationsfrei.
 */
export class Pool<T> {
  readonly items: T[] = [];
  count = 0;

  constructor(
    factory: () => T,
    readonly capacity: number,
  ) {
    for (let i = 0; i < capacity; i++) this.items.push(factory());
  }

  /** Naechstes freies Objekt oder null, wenn der Pool voll ist. */
  spawn(): T | null {
    if (this.count >= this.capacity) return null;
    return this.items[this.count++] as T;
  }

  /**
   * Entfernt das aktive Objekt an Index i (swap mit letztem aktiven).
   * Achtung in Schleifen: nach despawn(i) liegt an Index i ein anderes
   * Objekt — Index nicht erhoehen bzw. rueckwaerts iterieren.
   */
  despawn(i: number): void {
    const last = this.count - 1;
    if (i < 0 || i > last) return;
    const tmp = this.items[i] as T;
    this.items[i] = this.items[last] as T;
    this.items[last] = tmp;
    this.count = last;
  }

  get(i: number): T {
    return this.items[i] as T;
  }

  clear(): void {
    this.count = 0;
  }
}
