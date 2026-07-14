import { canonicalStringCompareInternal } from './bounded-sort.js';

interface NodeInternal {
  readonly key: string;
  readonly value: number;
  readonly left: NodeInternal | null;
  readonly right: NodeInternal | null;
  readonly height: number;
  readonly size: number;
}

function height(node: NodeInternal | null): number {
  return node?.height ?? 0;
}

function size(node: NodeInternal | null): number {
  return node?.size ?? 0;
}

function node(
  key: string,
  value: number,
  left: NodeInternal | null,
  right: NodeInternal | null,
): NodeInternal {
  return {
    key,
    value,
    left,
    right,
    height: Math.max(height(left), height(right)) + 1,
    size: size(left) + size(right) + 1,
  };
}

function rotateLeft(root: NodeInternal): NodeInternal {
  const pivot = root.right!;
  return node(
    pivot.key,
    pivot.value,
    node(root.key, root.value, root.left, pivot.left),
    pivot.right,
  );
}

function rotateRight(root: NodeInternal): NodeInternal {
  const pivot = root.left!;
  return node(
    pivot.key,
    pivot.value,
    pivot.left,
    node(root.key, root.value, pivot.right, root.right),
  );
}

function balance(root: NodeInternal): NodeInternal {
  const delta = height(root.left) - height(root.right);
  if (delta > 1) {
    const left = root.left!;
    const adjusted = height(left.left) < height(left.right)
      ? node(root.key, root.value, rotateLeft(left), root.right)
      : root;
    return rotateRight(adjusted);
  }
  if (delta < -1) {
    const right = root.right!;
    const adjusted = height(right.right) < height(right.left)
      ? node(root.key, root.value, root.left, rotateRight(right))
      : root;
    return rotateLeft(adjusted);
  }
  return root;
}

function setMaximum(
  root: NodeInternal | null,
  key: string,
  value: number,
): NodeInternal {
  if (root === null) return node(key, value, null, null);
  const order = canonicalStringCompareInternal(key, root.key);
  if (order === 0) {
    return value <= root.value ? root : node(key, value, root.left, root.right);
  }
  if (order < 0) {
    const left = setMaximum(root.left, key, value);
    return left === root.left
      ? root
      : balance(node(root.key, root.value, left, root.right));
  }
  const right = setMaximum(root.right, key, value);
  return right === root.right
    ? root
    : balance(node(root.key, root.value, root.left, right));
}

/** Immutable AVL map used so sparse commits never clone the full tombstone history. */
export class PersistentStringNumberMapInternal {
  private static readonly emptyInstance = new PersistentStringNumberMapInternal(null);

  private constructor(private readonly root: NodeInternal | null) {}

  static empty(): PersistentStringNumberMapInternal {
    return PersistentStringNumberMapInternal.emptyInstance;
  }

  get size(): number {
    return size(this.root);
  }

  get(key: string): number | undefined {
    let current = this.root;
    while (current !== null) {
      const order = canonicalStringCompareInternal(key, current.key);
      if (order === 0) return current.value;
      current = order < 0 ? current.left : current.right;
    }
    return undefined;
  }

  setMaximum(key: string, value: number): PersistentStringNumberMapInternal {
    const next = setMaximum(this.root, key, value);
    return next === this.root ? this : new PersistentStringNumberMapInternal(next);
  }
}

/** Conservative AVL path, comparison, node-allocation, and rebalance work bound. */
export function persistentMapSetWorkUpperBoundInternal(
  keyLength: number,
  finalSize: number,
): number {
  const depth = Math.ceil(1.45 * Math.log2(Math.max(2, finalSize + 2)));
  return depth * (Math.max(1, keyLength) + 8) + 16;
}

/** Conservative AVL lookup and UTF-16 comparison work bound. */
export function persistentMapLookupWorkUpperBoundInternal(
  keyLength: number,
  size: number,
): number {
  const depth = Math.ceil(1.45 * Math.log2(Math.max(2, size + 2)));
  return depth * (Math.max(1, keyLength) + 1) + 4;
}
