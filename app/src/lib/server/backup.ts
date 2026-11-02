/**
 * How long ago Litestream last synced the database without an error.
 *
 * Litestream 0.5 exports counters, not timestamps, and only for its own sync loop: there is no
 * metric for the upload to object storage. So this polls `litestream_sync_count` and
 * `litestream_sync_error_count` and records when the count rose while the errors did not. A stalled
 * or failing Litestream shows up as a growing age; a failing upload alone may not, which is what the
 * restore drill is for.
 */

export type Counters = { syncs: number; errors: number };

export type SyncStatus = {
	configured: true;
	lastGoodSyncAt: string | null;
	ageSeconds: number | null;
};

export type BackupStatus = { configured: false } | SyncStatus;

/** Sums each counter across every database in a Prometheus text exposition. */
export function parseCounters(metrics: string): Counters | null {
	let syncs: number | null = null;
	let errors = 0;

	for (const line of metrics.split('\n')) {
		const match = /^(litestream_sync_count|litestream_sync_error_count)(?:\{[^}]*\})?\s+(\S+)/.exec(
			line
		);
		if (!match) continue;
		const value = Number(match[2]);
		if (!Number.isFinite(value)) continue;
		if (match[1] === 'litestream_sync_count') syncs = (syncs ?? 0) + value;
		else errors += value;
	}

	return syncs === null ? null : { syncs, errors };
}

export class SyncTracker {
	private last: Counters | null = null;
	private lastGoodAt: number | null = null;

	/** Feeds one reading; a rise in syncs with no new errors is a good sync. */
	observe(counters: Counters, now: number): void {
		const previous = this.last;
		this.last = counters;
		if (!previous) return;
		if (counters.syncs > previous.syncs && counters.errors === previous.errors) {
			this.lastGoodAt = now;
		}
	}

	status(now: number): SyncStatus {
		if (this.lastGoodAt === null) {
			return { configured: true, lastGoodSyncAt: null, ageSeconds: null };
		}
		return {
			configured: true,
			lastGoodSyncAt: new Date(this.lastGoodAt).toISOString(),
			ageSeconds: Math.round((now - this.lastGoodAt) / 1000)
		};
	}
}

let report: () => BackupStatus = () => ({ configured: false });

/** The backup status for `/health`. Not configured until `watchBackups` is given an endpoint. */
export function backupStatus(): BackupStatus {
	return report();
}

/**
 * Starts polling Litestream's metrics endpoint, once, at server start. With no endpoint — local
 * development — backups stay reported as not configured.
 */
export function watchBackups(metricsUrl: string | undefined, intervalMs = 10_000): void {
	if (!metricsUrl) return;

	const tracker = new SyncTracker();
	const poll = async () => {
		try {
			const response = await fetch(metricsUrl);
			const counters = parseCounters(await response.text());
			if (counters) tracker.observe(counters, Date.now());
		} catch {
			// Litestream unreachable: no reading, so the age keeps growing, which is the signal.
		}
	};

	void poll();
	setInterval(poll, intervalMs).unref();
	report = () => tracker.status(Date.now());
}
