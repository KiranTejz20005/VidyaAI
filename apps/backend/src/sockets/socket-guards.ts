/** Limits applied to every Socket.IO connection. */
export const SOCKET_LIMITS = {
  /** Max raw frame size accepted by the server (also enforced by engine.io). */
  maxHttpBufferSize: 64 * 1024,
  /** Max simultaneous sockets per user (all tabs/devices on this node). */
  maxConnectionsPerUser: 10,
  /** General event budget: burst of 30, refilling 3 per second (30 events / 10 s). */
  eventBurst: 30,
  eventRefillPerSecond: 3,
  /** Typing indicators get their own budget so fast typists never starve chat sends. */
  typingBurst: 10,
  typingRefillPerSecond: 2,
  /** Disconnect a socket that keeps hammering after being throttled. */
  maxDroppedEventsBeforeDisconnect: 50,
  /** Max characters for chat messages and tutor questions. */
  maxMessageLength: 4000,
  /** Max concurrent tutor LLM streams per user (across all sockets). */
  maxConcurrentTutorStreamsPerUser: 2,
  /** Max rooms a single socket may be in. */
  maxRoomsPerSocket: 50,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_ID_RE = /^[A-Za-z0-9_.:-]{1,100}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_RE.test(value);
}

/** Non-empty string of at most `max` characters after trimming. */
export function isBoundedText(value: unknown, max: number = SOCKET_LIMITS.maxMessageLength): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

/** Classic token bucket; `now` is injectable for tests. */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  tryRemove(cost = 1): boolean {
    const current = this.now();
    const elapsedSeconds = Math.max(0, current - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = current;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}
