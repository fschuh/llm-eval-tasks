/*
 * A* over a weighted 8-connected grid.
 *
 * Cell costs are multipliers (>= 1) on distance; Infinity marks a blocked cell. Diagonal moves
 * may not cut blocked corners. Heap ties are broken by lower h and then by insertion order,
 * so the result is fully deterministic. Buffers are allocated once per grid and reused via a
 * search-id stamp, so repeated searches (the AI's runtime detours) don't allocate or clear.
 */
(function (Racer) {
  'use strict';

  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];
  const STEP = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

  /** Binary min-heap keyed by (f, h, insertion sequence). */
  class MinHeap {
    constructor() {
      this.node = [];
      this.f = [];
      this.h = [];
      this.seq = [];
      this.size = 0;
      this.counter = 0;
    }

    clear() {
      this.size = 0;
      this.counter = 0;
    }

    _less(i, j) {
      if (this.f[i] !== this.f[j]) return this.f[i] < this.f[j];
      if (this.h[i] !== this.h[j]) return this.h[i] < this.h[j];
      return this.seq[i] < this.seq[j];
    }

    _swap(i, j) {
      let t = this.node[i]; this.node[i] = this.node[j]; this.node[j] = t;
      t = this.f[i]; this.f[i] = this.f[j]; this.f[j] = t;
      t = this.h[i]; this.h[i] = this.h[j]; this.h[j] = t;
      t = this.seq[i]; this.seq[i] = this.seq[j]; this.seq[j] = t;
    }

    push(node, f, h) {
      let i = this.size++;
      this.node[i] = node; this.f[i] = f; this.h[i] = h; this.seq[i] = this.counter++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!this._less(i, p)) break;
        this._swap(i, p);
        i = p;
      }
    }

    pop() {
      const top = this.node[0];
      const last = --this.size;
      if (last > 0) {
        this._swap(0, last);
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < last && this._less(l, m)) m = l;
          if (r < last && this._less(r, m)) m = r;
          if (m === i) break;
          this._swap(i, m);
          i = m;
        }
      }
      return top;
    }
  }

  class GridAStar {
    /**
     * @param {number} w grid width in cells
     * @param {number} h grid height in cells
     * @param {Float64Array} cost per-cell cost multiplier (Infinity = blocked)
     * @param {number} cellSize world units per cell (path costs are in world units)
     */
    constructor(w, h, cost, cellSize) {
      this.w = w;
      this.h = h;
      this.cost = cost;
      this.cs = cellSize;
      const n = w * h;
      this.g = new Float64Array(n);
      this.parent = new Int32Array(n);
      this.seen = new Uint32Array(n);
      this.closed = new Uint32Array(n);
      this.searchId = 0;
      this.heap = new MinHeap();
      this.lastExpanded = 0;
    }

    /**
     * @param {number} start start cell
     * @param {(cell:number)=>boolean} isGoal goal test
     * @param {(cell:number)=>number} heuristic admissible estimate of remaining cost (world units)
     * @param {number} [maxExpand] give up after expanding this many cells
     * @returns {number[]|null} cells from start to goal
     */
    search(start, isGoal, heuristic, maxExpand = Infinity) {
      const id = ++this.searchId;
      const { w, h, cost, g, parent, seen, closed, heap, cs } = this;
      if (start < 0 || cost[start] === Infinity) return null;
      heap.clear();
      g[start] = 0;
      parent[start] = -1;
      seen[start] = id;
      heap.push(start, heuristic(start), 0);
      let expanded = 0;
      while (heap.size > 0) {
        const cur = heap.pop();
        if (closed[cur] === id) continue; // stale duplicate entry
        closed[cur] = id;
        if (isGoal(cur)) {
          this.lastExpanded = expanded;
          return this._reconstruct(cur);
        }
        if (++expanded > maxExpand) break;
        const cx = cur % w, cy = (cur - cx) / w, cc = cost[cur], gc = g[cur];
        for (let d = 0; d < 8; d++) {
          const nx = cx + DX[d], ny = cy + DY[d];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nb = ny * w + nx;
          const nc = cost[nb];
          if (nc === Infinity || closed[nb] === id) continue;
          if (d >= 4 && (cost[cy * w + nx] === Infinity || cost[ny * w + cx] === Infinity)) continue;
          const tentative = gc + STEP[d] * cs * 0.5 * (cc + nc);
          if (seen[nb] !== id || tentative < g[nb]) {
            seen[nb] = id;
            g[nb] = tentative;
            parent[nb] = cur;
            const hh = heuristic(nb);
            heap.push(nb, tentative + hh, hh);
          }
        }
      }
      this.lastExpanded = expanded;
      return null;
    }

    _reconstruct(cell) {
      const path = [];
      for (let c = cell; c !== -1; c = this.parent[c]) path.push(c);
      return path.reverse();
    }
  }

  Racer.GridAStar = GridAStar;
  Racer.MinHeap = MinHeap;
})(globalThis.Racer = globalThis.Racer || {});
