import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from './config';
import { applyConfig, getRuntime, resetRuntime } from './runtime';

const baseConfig: AppConfig = {
	unifiUrl: 'https://unifi.test',
	apiKey: '',
	username: '',
	password: '',
	site: 'default',
	verifyTls: true,
	fixtureMode: true,
	pollIntervalSeconds: 30,
	retentionDays: 30,
	databasePath: ':memory:'
};

afterEach(() => {
	resetRuntime();
});

describe('applyConfig', () => {
	it('replaces the collector without opening a second database', () => {
		const first = applyConfig(baseConfig);
		const database = first.database;
		const second = applyConfig({
			...baseConfig,
			pollIntervalSeconds: 12
		});

		expect(second.database).toBe(database);
		expect(second.config.pollIntervalSeconds).toBe(12);
		expect(second.collector.getStatus().pollIntervalSeconds).toBe(12);
		expect(getRuntime()).toBe(second);
	});
});
