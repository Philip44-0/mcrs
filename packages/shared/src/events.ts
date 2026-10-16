/**
 * Typed payloads for events, guards and filters.
 *
 * Names that are listed here get their payload type checked. Any other name (for example the events
 * of a module written by someone else) is allowed too, with an unknown payload. The shapes below are
 * drafts; the module that owns a name defines its final shape.
 */

/** Event name -> payload. */
export interface EventPayloads {
  'stock.changed': { itemId: string; quantity: number | null };
}

/** Guard name -> payload that is passed to the guards. */
export interface GuardPayloads {
  'orders.order.sending': {
    orderId: string;
    tableId: string;
    lines: Array<{ itemId: string; qty: number }>;
  };
}

/** Filter name -> the value that is passed through the filters. */
export interface FilterValues {
  'catalog.items.list': Array<{
    id: string;
    name: string;
    available: boolean;
    unavailableReason?: string;
  }>;
}

export type PayloadOf<N extends string> = N extends keyof EventPayloads
  ? EventPayloads[N]
  : unknown;
export type EmitArgs<N extends string> = N extends keyof EventPayloads
  ? [payload: EventPayloads[N]]
  : [payload?: unknown];
export type GuardPayloadOf<N extends string> = N extends keyof GuardPayloads
  ? GuardPayloads[N]
  : unknown;
export type FilterValueOf<N extends string> = N extends keyof FilterValues
  ? FilterValues[N]
  : unknown;
