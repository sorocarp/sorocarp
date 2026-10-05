/**
 * Execution: how the body becomes a book.
 *
 * The organism produces weights. An execution layer turns the difference
 * between those weights and what the book currently holds into orders, hands
 * them to an executor, and records the fills on a ledger. The paper executor
 * fills instantly at the last price. A real executor would sign and send.
 */
export type Side = 'buy' | 'sell';

export interface Order {
  id: number;
  at: number;
  address: string;
  symbol: string;
  side: Side;
  /** Weight the organism wants, 0..1. */
  targetWeight: number;
  /** Weight the book holds right now, 0..1. */
  currentWeight: number;
  /** Size of the move in USD at the time the order was planned. */
  notionalUsd: number;
  /** Why the order exists: the organism grew, shrank, or abandoned the token. */
  reason: 'grow' | 'shrink' | 'pruned';
}

export interface Fill {
  orderId: number;
  at: number;
  address: string;
  symbol: string;
  side: Side;
  priceUsd: number;
  quantity: number;
  notionalUsd: number;
}

export interface Executor {
  readonly name: string;
  execute(orders: Order[], prices: Map<string, number>, at: number): Promise<Fill[]>;
}
