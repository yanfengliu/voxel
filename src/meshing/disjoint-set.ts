/** Bounded by its caller's key budget; union-by-rank keeps lookup iterative. */
export class DisjointSetInternal {
  readonly #parent = new Map<string, string>();
  readonly #rank = new Map<string, number>();

  add(key: string): void {
    if (this.#parent.has(key)) return;
    this.#parent.set(key, key);
    this.#rank.set(key, 0);
  }

  find(key: string): string {
    if (!this.#parent.has(key)) throw new RangeError(`Unknown disjoint-set key ${key}.`);
    let root = key;
    while (this.#parent.get(root) !== root) root = this.#parent.get(root)!;
    let current = key;
    while (current !== root) {
      const next = this.#parent.get(current)!;
      this.#parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const leftRank = this.#rank.get(leftRoot)!;
    const rightRank = this.#rank.get(rightRoot)!;
    if (leftRank < rightRank) {
      this.#parent.set(leftRoot, rightRoot);
      return;
    }
    this.#parent.set(rightRoot, leftRoot);
    if (leftRank === rightRank) this.#rank.set(leftRoot, leftRank + 1);
  }
}
