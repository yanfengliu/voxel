import type {
  ApplyResultV1,
  OwnedRenderSnapshotV1,
} from './contracts.js';
import { copyRenderSnapshotV1 } from './snapshot-copy.js';
import { validateAndCopySnapshotV1 } from './snapshot-validation.js';

export type RenderWorldLifecycle = 'active' | 'disposed';

export class RenderWorld {
  private accepted: OwnedRenderSnapshotV1 | null = null;
  private pending: OwnedRenderSnapshotV1 | null = null;
  private presented: OwnedRenderSnapshotV1 | null = null;
  private state: RenderWorldLifecycle = 'active';

  get lifecycle(): RenderWorldLifecycle {
    return this.state;
  }

  get epoch(): string | null {
    return this.accepted?.descriptor.epoch ?? null;
  }

  get acceptedRevision(): number | null {
    return this.accepted?.revision ?? null;
  }

  get presentedEpoch(): string | null {
    return this.presented?.descriptor.epoch ?? null;
  }

  get presentedRevision(): number | null {
    return this.presented?.revision ?? null;
  }

  acceptSnapshot(value: unknown): ApplyResultV1 {
    if (this.state === 'disposed') {
      return {
        status: 'rejected',
        code: 'world.disposed',
        path: '$',
        message: 'A disposed render world cannot accept state.',
      };
    }
    const result = validateAndCopySnapshotV1(value);
    if (!result.ok) return { status: 'rejected', ...result.issue };

    const next = result.value;
    const current = this.accepted;
    const sameEpoch = current !== null
      && current.descriptor.worldId === next.descriptor.worldId
      && current.descriptor.epoch === next.descriptor.epoch;
    if (sameEpoch && next.revision <= current.revision) {
      return {
        status: 'rejected',
        code: 'snapshot.non-monotonic-revision',
        path: 'revision',
        message: `Revision ${String(next.revision)} does not follow accepted revision ${String(current.revision)}.`,
      };
    }

    this.accepted = next;
    this.pending = next;
    return {
      status: 'accepted',
      revision: next.revision,
      epoch: next.descriptor.epoch,
    };
  }

  acceptedSnapshot(): OwnedRenderSnapshotV1 | null {
    return this.accepted === null ? null : copyRenderSnapshotV1(this.accepted);
  }

  pendingSnapshot(): OwnedRenderSnapshotV1 | null {
    return this.pending === null ? null : copyRenderSnapshotV1(this.pending);
  }

  presentedSnapshot(): OwnedRenderSnapshotV1 | null {
    return this.presented === null ? null : copyRenderSnapshotV1(this.presented);
  }

  markPresented(
    revision: number,
    epoch: string,
    worldId: string,
  ): boolean {
    if (
      this.state === 'disposed'
      || this.pending === null
      || typeof epoch !== 'string'
      || epoch.length === 0
      || typeof worldId !== 'string'
      || worldId.length === 0
    ) return false;
    if (
      this.pending.revision !== revision
      || this.pending.descriptor.epoch !== epoch
      || this.pending.descriptor.worldId !== worldId
    ) return false;
    this.presented = this.pending;
    this.pending = null;
    return true;
  }

  dispose(): void {
    if (this.state === 'disposed') return;
    this.accepted = null;
    this.pending = null;
    this.presented = null;
    this.state = 'disposed';
  }
}
