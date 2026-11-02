# Restore drill

A backup that has never been restored is a hope. Run this once before any real data goes in
(Phase 1), and again after any change to `litestream.yml`, the volume, or the storage bucket.

**Pass:** a row written to production before the drill is read back from a database rebuilt from
object storage onto a volume that has never held it.

> Status: written by `/setup`, **not yet run**. It needs the Fly app, its volume and the storage
> bucket, which `/ship` creates. The Litestream commands below were checked against Litestream
> 0.5.17's own `--help`. The Fly steps are named, not spelled out: `flyctl` was not installed when
> this was written, and `/ship` fills in each command after checking `fly <command> --help`.

## Never run two replicators

Only the production machine may run `litestream replicate`. A second machine replicating to the
same bucket path would write a second history into the backup. The drill restores with
`litestream restore -o` and never starts `start.sh` on the drill machine.

## Steps

1. **Write a marker row on production.** Open a shell on the production machine and run, from
   `/app`:

   ```sh
   node -e "
     const Database = require('better-sqlite3');
     const db = new Database(process.env.DATABASE_URL);
     const label = 'restore drill ' + new Date().toISOString();
     db.prepare('insert into skeleton_figure (label, amount_minor) values (?, 1)').run(label);
     console.log(label);
   "
   ```

   Write down the label it prints.

2. **Wait for it to replicate.** `GET /health` should show `backup.ageSeconds` under a minute,
   taken after step 1.

3. **Create a fresh volume** in the same region, and a one-off machine from the current image with
   that volume mounted at `/data`, the app's storage secrets, and a shell as its command — not
   `start.sh`.

4. **Restore into it**, on the one-off machine:

   ```sh
   litestream restore -config /app/litestream.yml -o /data/restored.db /data/payday.db
   ```

   `-o` writes the restored copy to a new path; the last argument names which configured database
   to restore. `DATABASE_URL` must be `/data/payday.db` in that machine's environment, as in
   `fly.toml`.

5. **Read the marker back:**

   ```sh
   node -e "
     const Database = require('better-sqlite3');
     const db = new Database('/data/restored.db', { readonly: true });
     console.log(db.prepare('select label from skeleton_figure order by id desc limit 1').get());
   "
   ```

   It must print the label from step 1. Anything else is a failed drill: stop and fix the backup
   before Phase 1.

6. **Clean up**: destroy the one-off machine and its volume, and delete the marker row on
   production (`delete from skeleton_figure where label = '<label>'`).

7. **Record it**: the date, the label, the restore time, and pass or fail, in
   `.management/CHANGELOG.md`. `/ship` ticks the Phase 0 exit criterion from that record.
