// Offline capture queue for door conditions.
//
// The PRD (section 0.3, assumption A2) flagged this as the one real gap: a
// canvasser in an apartment stairwell or rural dead zone loses the write, and
// the condition they just observed is gone. Without a native shell this can't
// survive an app reinstall, but it does survive the common case — brief signal
// loss during a walk, and a tab reload.
//
// Two properties matter more than the storage mechanism:
//
//   * Every queued item carries a CLIENT-generated id, so replaying after a
//     partial failure cannot double-write. The visit log feeds Best Time to
//     Knock; duplicate rows would silently corrupt it.
//   * Nothing is ever dropped on a failed send. An item stays queued and its
//     attempt count rises, so a permanently failing write is visible rather
//     than quietly discarded.
//
// Pure and injectable (no React, no Supabase) — see offlineQueue.test.ts.
import type { DoorTag, QueuedCapture } from './doorIntelligence.types';

const STORAGE_KEY = 'lynx.doorConditions.queue.v1';

export interface QueueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface EnqueueInput {
    voterId: string;
    projectId: string;
    observedAttributes: DoorTag[];
    contradictedAttributes: DoorTag[];
    /** Injectable so tests are deterministic. */
    id?: string;
    now?: () => Date;
}

/** A send that resolves means "durably stored server-side"; a throw means retry. */
export type Sender = (item: QueuedCapture) => Promise<void>;

function defaultStorage(): QueueStorage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        // Private-mode Safari and some embedded webviews throw on access.
        return null;
    }
}

export function readQueue(storage: QueueStorage | null = defaultStorage()): QueuedCapture[] {
    if (!storage) return [];
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as QueuedCapture[]) : [];
    } catch {
        // A corrupt blob must not brick capture — start clean rather than throw
        // in the middle of a canvasser's shift.
        return [];
    }
}

export function writeQueue(
    items: QueuedCapture[],
    storage: QueueStorage | null = defaultStorage()
): void {
    if (!storage) return;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
        // Quota exhausted. Losing the write is bad, but throwing here would
        // also lose the in-memory result and break the UI mid-shift.
    }
}

export function enqueue(
    input: EnqueueInput,
    storage: QueueStorage | null = defaultStorage()
): QueuedCapture {
    const now = input.now ?? (() => new Date());
    const item: QueuedCapture = {
        id: input.id ?? cryptoId(),
        voterId: input.voterId,
        projectId: input.projectId,
        observedAttributes: input.observedAttributes,
        contradictedAttributes: input.contradictedAttributes,
        queuedAt: now().toISOString(),
        attempts: 0
    };
    writeQueue([...readQueue(storage), item], storage);
    return item;
}

export interface DrainResult {
    sent: string[];
    failed: string[];
    remaining: number;
}

/**
 * Attempts every queued item in order. Items that send are removed; items that
 * throw stay with an incremented attempt count.
 *
 * Order is preserved deliberately: two captures at the same door must reach
 * the server in the order the canvasser made them, or a later contradiction
 * could be overwritten by an earlier observation.
 */
export async function drain(
    send: Sender,
    storage: QueueStorage | null = defaultStorage()
): Promise<DrainResult> {
    const queue = readQueue(storage);
    const sent: string[] = [];
    const failed: string[] = [];
    const remaining: QueuedCapture[] = [];

    for (const item of queue) {
        try {
            await send(item);
            sent.push(item.id);
        } catch {
            failed.push(item.id);
            remaining.push({ ...item, attempts: item.attempts + 1 });
        }
    }

    writeQueue(remaining, storage);
    return { sent, failed, remaining: remaining.length };
}

export function queueSize(storage: QueueStorage | null = defaultStorage()): number {
    return readQueue(storage).length;
}

export function clearQueue(storage: QueueStorage | null = defaultStorage()): void {
    writeQueue([], storage);
}

/** Items that have failed repeatedly — surfaced so a stuck write is visible. */
export function stuckItems(
    minAttempts = 3,
    storage: QueueStorage | null = defaultStorage()
): QueuedCapture[] {
    return readQueue(storage).filter((i) => i.attempts >= minAttempts);
}

function cryptoId(): string {
    try {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
    } catch {
        // fall through
    }
    return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** In-memory storage for tests and for environments with no localStorage. */
export function memoryStorage(): QueueStorage {
    const map = new Map<string, string>();
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        }
    };
}
