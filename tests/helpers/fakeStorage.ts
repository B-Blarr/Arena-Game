/**
 * Map-basierter localStorage-Stub fuer die SaveManager-Tests (Node-Umgebung
 * ohne DOM). Deckt genau die von SaveManager genutzte Storage-Oberflaeche ab.
 */
export class FakeStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

/**
 * Installiert einen frischen FakeStorage als globales `localStorage` und gibt
 * ihn zurueck. Vor jedem Test aufrufen; `resetStorage()` entfernt ihn wieder.
 */
export function installFakeLocalStorage(): FakeStorage {
  const storage = new FakeStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}

export function resetStorage(): void {
  Reflect.deleteProperty(globalThis as object, 'localStorage');
}
