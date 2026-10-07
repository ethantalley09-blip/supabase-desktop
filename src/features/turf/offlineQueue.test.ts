import { describe, expect, it, vi } from 'vitest';
import { clearQueue, drain, enqueue, memoryStorage, queueSize, readQueue, stuckItems, writeQueue } from './offlineQueue';
import type { QueuedCapture } from './doorIntelligence.types';

const input = (voterId: string, id: string) => ({
    voterId,
    projectId: 'p1',
    observedAttributes: ['gated_home' as const],
    contradictedAttributes: [],
    id,
    now: () => new Date('2026-08-15T12:00:00Z')
});

describe('enqueue / readQueue', () => {
    it('persists captures in the order they were made', () => {
        const storage = memoryStorage();
        enqueue(input('v1', 'a'), storage);
        enqueue(input('v2', 'b'), storage);
        expect(readQueue(storage).map((i) => i.id)).toEqual(['a', 'b']);
        expect(queueSize(storage)).toBe(2);
    });

    it('stamps a client-generated id so a replay cannot double-write', () => {
        const storage = memoryStorage();
        const item = enqueue({ ...input('v1', undefined as unknown as string), id: undefined }, storage);
        expect(item.id).toBeTruthy();
        expect(readQueue(storage)[0].id).toBe(item.id);
    });

    it('survives a corrupt storage blob instead of bricking capture mid-shift', () => {
        const storage = memoryStorage();
        storage.setItem('lynx.doorConditions.queue.v1', '{not json');
        expect(readQueue(storage)).toEqual([]);
        enqueue(input('v1', 'a'), storage);
        expect(queueSize(storage)).toBe(1);
    });

    it('degrades to a no-op when storage is unavailable rather than throwing', () => {
        expect(readQueue(null)).toEqual([]);
        expect(() => writeQueue([], null)).not.toThrow();
        expect(queueSize(null)).toBe(0);
    });
});

describe('drain', () => {
    it('removes everything that sends successfully', async () => {
        const storage = memoryStorage();
        enqueue(input('v1', 'a'), storage);
        enqueue(input('v2', 'b'), storage);
        const send = vi.fn().mockResolvedValue(undefined);

        const result = await drain(send, storage);
        expect(result.sent).toEqual(['a', 'b']);
        expect(result.remaining).toBe(0);
        expect(queueSize(storage)).toBe(0);
    });

    it('never drops a failed write — it stays queued with a higher attempt count', async () => {
        const storage = memoryStorage();
        enqueue(input('v1', 'a'), storage);
        const send = vi.fn().mockRejectedValue(new Error('offline'));

        const result = await drain(send, storage);
        expect(result.failed).toEqual(['a']);
        expect(result.remaining).toBe(1);
        expect(readQueue(storage)[0].attempts).toBe(1);

        await drain(send, storage);
        expect(readQueue(storage)[0].attempts).toBe(2);
    });

    it('keeps a partial failure queued while letting the rest through', async () => {
        const storage = memoryStorage();
        enqueue(input('v1', 'a'), storage);
        enqueue(input('v2', 'b'), storage);
        const send = vi.fn(async (item: QueuedCapture) => {
            if (item.id === 'a') throw new Error('offline');
        });

        const result = await drain(send, storage);
        expect(result.sent).toEqual(['b']);
        expect(readQueue(storage).map((i) => i.id)).toEqual(['a']);
    });

    it('sends in queue order, so a later contradiction cannot be overwritten by an earlier observation', async () => {
        const storage = memoryStorage();
        enqueue(input('v1', 'first'), storage);
        enqueue(input('v1', 'second'), storage);
        const order: string[] = [];
        await drain(async (item) => {
            order.push(item.id);
        }, storage);
        expect(order).toEqual(['first', 'second']);
    });
});

describe('stuckItems', () => {
    it('surfaces a write that keeps failing instead of hiding it', async () => {
        const storage = memoryStorage();
        enqueue(input('v1', 'a'), storage);
        const send = vi.fn().mockRejectedValue(new Error('offline'));
        await drain(send, storage);
        await drain(send, storage);
        expect(stuckItems(3, storage)).toHaveLength(0);
        await drain(send, storage);
        expect(stuckItems(3, storage).map((i) => i.id)).toEqual(['a']);
    });
});

describe('clearQueue', () => {
    it('empties the queue', () => {
        const storage = memoryStorage();
        enqueue(input('v1', 'a'), storage);
        clearQueue(storage);
        expect(queueSize(storage)).toBe(0);
    });
});
