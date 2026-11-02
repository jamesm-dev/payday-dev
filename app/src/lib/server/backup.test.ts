import { describe, expect, it } from 'vitest';
import { parseCounters, SyncTracker } from './backup';

// Captured from Litestream 0.5.17's /metrics while replicating a test database.
const METRICS = `# HELP litestream_sync_count Number of sync operations performed
# TYPE litestream_sync_count counter
litestream_compaction_verify_error_count{db="/data/payday.db"} 0
litestream_db_size{db="/data/payday.db"} 12288
litestream_sync_count{db="/data/payday.db"} 10
litestream_sync_error_count{db="/data/payday.db"} 2
litestream_sync_seconds{db="/data/payday.db"} 0.046959400000000005
litestream_txid{db="/data/payday.db"} 3
`;

describe('TSK-B61AAA the health endpoint reports the age of the last good sync', () => {
	it("reads the sync and error counters from Litestream's metrics", () => {
		expect(parseCounters(METRICS)).toEqual({ syncs: 10, errors: 2 });
	});

	it('returns nothing when Litestream exports no sync counter', () => {
		expect(parseCounters('go_goroutines 12\n')).toBeNull();
	});

	it('has no age until it has seen a sync succeed', () => {
		const tracker = new SyncTracker();
		tracker.observe({ syncs: 10, errors: 2 }, 0);
		expect(tracker.status(5_000)).toEqual({
			configured: true,
			lastGoodSyncAt: null,
			ageSeconds: null
		});
	});

	it('records a sync that rose with no new errors, and the age then grows', () => {
		const tracker = new SyncTracker();
		tracker.observe({ syncs: 10, errors: 2 }, 0);
		tracker.observe({ syncs: 11, errors: 2 }, 10_000);

		expect(tracker.status(10_000).ageSeconds).toBe(0);
		expect(tracker.status(70_000)).toEqual({
			configured: true,
			lastGoodSyncAt: new Date(10_000).toISOString(),
			ageSeconds: 60
		});
	});

	it('does not count a sync that came with a new error', () => {
		const tracker = new SyncTracker();
		tracker.observe({ syncs: 10, errors: 2 }, 0);
		tracker.observe({ syncs: 11, errors: 2 }, 10_000);
		tracker.observe({ syncs: 12, errors: 3 }, 20_000);

		expect(tracker.status(30_000).ageSeconds).toBe(20);
	});
});
