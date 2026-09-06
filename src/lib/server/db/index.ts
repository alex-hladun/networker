import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type AppDatabase = {
	raw: Database.Database;
	orm: BetterSQLite3Database<typeof schema>;
};

const MIGRATION_SQL = `
	CREATE TABLE IF NOT EXISTS beacons (
		mac TEXT PRIMARY KEY NOT NULL,
		name TEXT NOT NULL,
		site TEXT NOT NULL,
		enabled INTEGER NOT NULL DEFAULT 1,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS metric_samples (
		id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
		beacon_mac TEXT NOT NULL REFERENCES beacons(mac),
		sampled_at INTEGER NOT NULL,
		online INTEGER NOT NULL,
		signal_dbm REAL,
		noise_dbm REAL,
		snr_db REAL,
		satisfaction REAL,
		tx_rate_kbps REAL,
		rx_rate_kbps REAL,
		retry_percent REAL,
		channel REAL,
		radio TEXT,
		radio_protocol TEXT,
		ap_mac TEXT,
		ap_name TEXT,
		tx_retries REAL,
		tx_attempts REAL
	);

	CREATE INDEX IF NOT EXISTS metric_samples_beacon_time_idx
		ON metric_samples(beacon_mac, sampled_at);

	CREATE TABLE IF NOT EXISTS collector_status (
		id INTEGER PRIMARY KEY NOT NULL,
		mode TEXT NOT NULL,
		configured INTEGER NOT NULL,
		running INTEGER NOT NULL,
		last_poll_started_at INTEGER,
		last_poll_succeeded_at INTEGER,
		next_poll_at INTEGER,
		last_error TEXT,
		warning TEXT,
		controller_version TEXT,
		discovered_client_count INTEGER NOT NULL DEFAULT 0,
		selected_beacon_count INTEGER NOT NULL DEFAULT 0,
		poll_interval_seconds REAL NOT NULL,
		retention_days INTEGER NOT NULL
	);
`;

function ensureColumn(
	database: Database.Database,
	table: string,
	column: string,
	definition: string
): void {
	const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	if (columns.some((entry) => entry.name === column)) return;
	database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function createDatabase(databasePath: string): AppDatabase {
	if (databasePath !== ':memory:') {
		fs.mkdirSync(path.dirname(databasePath), { recursive: true });
	}

	const raw = new Database(databasePath);
	raw.pragma('foreign_keys = ON');
	raw.pragma('busy_timeout = 5000');
	if (databasePath !== ':memory:') raw.pragma('journal_mode = WAL');
	raw.exec(MIGRATION_SQL);
	ensureColumn(raw, 'metric_samples', 'ap_name', 'TEXT');

	return {
		raw,
		orm: drizzle(raw, { schema })
	};
}
