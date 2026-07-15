import {
  createPreparedFrameTicketInternal,
  ThreeRuntimeProtocolError,
  type ThreePreparedFrameTicket,
} from './hostFrameProtocol.js';
import type { ThreeRuntimeLifecycleV1 } from './runtimeTypes.js';

type HostTicketStateInternal = 'outstanding' | 'used' | 'stale-device' | 'late';

export interface HostFrameTicketRecordInternal<Payload> {
  readonly ticket: ThreePreparedFrameTicket;
  readonly deviceGeneration: number;
  readonly payload: Payload;
}

/**
 * Owns the opaque-token identity and single-use protocol independently from
 * scene preparation. It deliberately consumes a token before callbacks run so
 * synchronous waiter callbacks cannot complete the same frame twice.
 */
export class HostFrameTicketLedgerInternal<Payload> {
  private outstanding: HostFrameTicketRecordInternal<Payload> | null = null;
  private readonly states = new WeakMap<object, HostTicketStateInternal>();
  private preparationInProgress = false;

  assertCanPrepare(): void {
    if (this.outstanding || this.preparationInProgress) {
      throw new ThreeRuntimeProtocolError(
        'three.frame-ticket.outstanding',
        'A prepared host frame must be completed before another frame is prepared.',
      );
    }
  }

  beginPreparation(): void {
    this.assertCanPrepare();
    this.preparationInProgress = true;
  }

  finishPreparation(): void {
    this.preparationInProgress = false;
  }

  issue(payload: Payload, deviceGeneration: number): HostFrameTicketRecordInternal<Payload> {
    if (!this.preparationInProgress || this.outstanding) {
      throw new Error('Host frame ticket issuance requires one active preparation.');
    }
    this.preparationInProgress = false;
    const ticket = createPreparedFrameTicketInternal();
    const record = { ticket, deviceGeneration, payload };
    this.outstanding = record;
    this.states.set(ticket, 'outstanding');
    return record;
  }

  /**
   * `allowRestoring` admits a ticket issued by restoration itself. An embedded
   * host draws the rebuilt scene while the runtime is still restoring, so that
   * ticket must complete in that state; the device-generation check below
   * still rejects any ticket prepared before the loss.
   */
  consume(
    ticketValue: unknown,
    lifecycle: ThreeRuntimeLifecycleV1,
    deviceGeneration: number,
    options: { readonly allowRestoring?: boolean } = {},
  ): HostFrameTicketRecordInternal<Payload> {
    if (typeof ticketValue !== 'object' || ticketValue === null) {
      throw this.error('three.frame-ticket.foreign', 'The frame ticket belongs to no runtime.');
    }
    const state = this.states.get(ticketValue);
    if (state === undefined) {
      throw this.error('three.frame-ticket.foreign', 'The frame ticket belongs to another runtime.');
    }
    if (state === 'used') {
      throw this.error('three.frame-ticket.used', 'The frame ticket was already completed.');
    }
    if (lifecycle === 'disposed' || lifecycle === 'failed') {
      this.states.set(ticketValue, 'late');
      throw this.error('three.frame-ticket.late', 'The frame ticket outlived its runtime.');
    }
    if (state === 'stale-device') {
      throw this.error(
        'three.frame-ticket.stale-device',
        'The frame ticket belongs to an obsolete device generation.',
      );
    }
    if (state === 'late') {
      throw this.error('three.frame-ticket.late', 'The frame ticket is no longer completable.');
    }
    const record = this.outstanding;
    if (record?.ticket !== ticketValue) {
      this.states.set(ticketValue, 'late');
      throw this.error('three.frame-ticket.late', 'The frame ticket is no longer outstanding.');
    }
    const restoring = lifecycle === 'restoring' && options.allowRestoring === true;
    if (
      lifecycle === 'lost'
      || (lifecycle === 'restoring' && !restoring)
      || record.deviceGeneration !== deviceGeneration
    ) {
      this.outstanding = null;
      this.states.set(ticketValue, 'stale-device');
      throw this.error(
        'three.frame-ticket.stale-device',
        'The frame ticket belongs to an obsolete device generation.',
      );
    }
    if (lifecycle !== 'running' && !restoring) {
      this.states.set(ticketValue, 'late');
      throw this.error('three.frame-ticket.late', 'The frame ticket is not completable now.');
    }
    this.outstanding = null;
    this.states.set(ticketValue, 'used');
    return record;
  }

  invalidateForDeviceTransition(): HostFrameTicketRecordInternal<Payload> | null {
    this.preparationInProgress = false;
    const record = this.outstanding;
    if (!record) return null;
    this.outstanding = null;
    this.states.set(record.ticket, 'stale-device');
    return record;
  }

  dispose(): HostFrameTicketRecordInternal<Payload> | null {
    this.preparationInProgress = false;
    const record = this.outstanding;
    if (!record) return null;
    this.outstanding = null;
    this.states.set(record.ticket, 'late');
    return record;
  }

  private error(
    code: ConstructorParameters<typeof ThreeRuntimeProtocolError>[0],
    message: string,
  ): ThreeRuntimeProtocolError {
    return new ThreeRuntimeProtocolError(code, message);
  }
}
