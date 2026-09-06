import { Collector } from './collector';
import { loadConfig, type AppConfig } from './config';
import { createDatabase, type AppDatabase } from './db';
import { Repository } from './db/repository';
import { FixtureProvider } from './unifi/fixture-provider';
import type { NetworkProvider } from './unifi/types';
import { UniFiProvider } from './unifi/provider';

export type Runtime = {
	config: AppConfig;
	database: AppDatabase;
	repository: Repository;
	collector: Collector;
	provider: NetworkProvider;
};

const globalRuntime = globalThis as typeof globalThis & {
	__unifiBeaconRuntime?: Runtime;
};

function createProvider(config: AppConfig): NetworkProvider {
	return config.fixtureMode ? new FixtureProvider() : new UniFiProvider(config);
}

function createRuntime(
	config: AppConfig,
	database?: AppDatabase,
	repository?: Repository
): Runtime {
	const nextDatabase = database ?? createDatabase(config.databasePath);
	const nextRepository = repository ?? new Repository(nextDatabase);
	const provider = createProvider(config);
	return {
		config,
		database: nextDatabase,
		repository: nextRepository,
		collector: new Collector(config, nextRepository, provider),
		provider
	};
}

export function getRuntime(): Runtime {
	if (!globalRuntime.__unifiBeaconRuntime) {
		globalRuntime.__unifiBeaconRuntime = createRuntime(loadConfig());
	}
	return globalRuntime.__unifiBeaconRuntime;
}

export function startRuntime(): Runtime {
	const runtime = getRuntime();
	runtime.collector.start();
	return runtime;
}

export function applyConfig(next: AppConfig): Runtime {
	const existing = globalRuntime.__unifiBeaconRuntime;
	if (!existing) {
		globalRuntime.__unifiBeaconRuntime = createRuntime(next);
		return startRuntime();
	}

	existing.collector.stop();
	const sameDatabase = existing.config.databasePath === next.databasePath;
	if (!sameDatabase) existing.database.raw.close();
	globalRuntime.__unifiBeaconRuntime = createRuntime(
		next,
		sameDatabase ? existing.database : undefined,
		sameDatabase ? existing.repository : undefined
	);
	return startRuntime();
}

export function resetRuntime(): void {
	const existing = globalRuntime.__unifiBeaconRuntime;
	if (!existing) return;
	existing.collector.stop();
	existing.database.raw.close();
	globalRuntime.__unifiBeaconRuntime = undefined;
}
