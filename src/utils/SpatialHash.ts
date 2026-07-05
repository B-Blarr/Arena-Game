/**
 * Uniform Grid ueber die quadratische Bounding-Box der Arena.
 * Wird pro Sim-Step neu befuellt (nur Gegner). Allokationsfrei im
 * Steady-State: Zellen-Arrays wachsen einmalig und werden per
 * Count-Reset wiederverwendet.
 */
export class SpatialHash {
  private readonly cols: number;
  private readonly cells: number[][];
  private readonly counts: Int32Array;
  private readonly half: number;

  constructor(halfExtent: number, private readonly cellSize: number) {
    this.half = halfExtent;
    this.cols = Math.ceil((halfExtent * 2) / cellSize);
    this.cells = [];
    this.counts = new Int32Array(this.cols * this.cols);
    for (let i = 0; i < this.cols * this.cols; i++) this.cells.push([]);
  }

  clear(): void {
    this.counts.fill(0);
  }

  private cellIndex(x: number, z: number): number {
    let cx = Math.floor((x + this.half) / this.cellSize);
    let cz = Math.floor((z + this.half) / this.cellSize);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cz < 0) cz = 0;
    else if (cz >= this.cols) cz = this.cols - 1;
    return cz * this.cols + cx;
  }

  insert(index: number, x: number, z: number): void {
    const c = this.cellIndex(x, z);
    const cell = this.cells[c] as number[];
    const n = this.counts[c] as number;
    if (n < cell.length) cell[n] = index;
    else cell.push(index);
    this.counts[c] = n + 1;
  }

  /**
   * Schreibt alle Indizes aus Zellen, die den Kreis (x,z,r) ueberlappen,
   * nach out. Rueckgabe: Anzahl. Kandidaten muessen vom Aufrufer noch
   * exakt per Distanz geprueft werden.
   */
  queryCircle(x: number, z: number, r: number, out: number[]): number {
    let found = 0;
    const minCx = Math.max(0, Math.floor((x - r + this.half) / this.cellSize));
    const maxCx = Math.min(this.cols - 1, Math.floor((x + r + this.half) / this.cellSize));
    const minCz = Math.max(0, Math.floor((z - r + this.half) / this.cellSize));
    const maxCz = Math.min(this.cols - 1, Math.floor((z + r + this.half) / this.cellSize));
    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const c = cz * this.cols + cx;
        const cell = this.cells[c] as number[];
        const n = this.counts[c] as number;
        for (let i = 0; i < n; i++) {
          if (found < out.length) out[found] = cell[i] as number;
          else out.push(cell[i] as number);
          found++;
        }
      }
    }
    return found;
  }
}
