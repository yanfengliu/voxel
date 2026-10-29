# Performance

One of [voxel's local rules](../local-rules.md).

Voxel-only. No canon equivalent. Moved here from `docs/learning/canon-candidates.md` on 2026-09-02: it is a search heuristic for this repository's per-frame paths rather than a property a test can hold.

- The arithmetic is rarely the cost here; allocation and repetition are, and the shape to look for is a pure function of immutable data called from a per-frame path. Evidence: 2026-07-31. `riverfallSurfaceNeighborsV1(cells)` derived adjacency from a translation that never moves, once per frame — 103,041 distance computations and 321 intermediate arrays, larger than the fluid solver it existed to present. Two sibling costs were 92,448 throwaway arrays a frame and about 2,880 strings per neighbour-grid build. Removing the garbage, with the same operations in the same order, was the entire fix.
