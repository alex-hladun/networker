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

export function getRuntime(): Runtime {
	if (!globalRuntime.__unifiBeaconRuntime) {
		const config = loadConfig();
		const database = createDatabase(config.databasePath);
		const repository = new Repository(database);
		const provider = config.fixtureMode ? new FixtureProvider() : new UniFiProvider(config);
		globalRuntime.__unifiBeaconRuntime = {
			config,
			database,
			repository,
			collector: new Collector(config, repository, provider),
			provider
		};
	}
	return globalRuntime.__unifiBeaconRuntime;
}

export function startRuntime(): Runtime {
	const runtime = getRuntime();
	runtime.collector.start();
	return runtime;
}
