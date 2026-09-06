import { describe, expect, it } from 'vitest';
import {
	readStoredScenarios,
	SCENARIO_STORAGE_KEY,
	writeStoredScenarios
} from './scenario-storage';
import { buildScenario } from './scenarios';
import type { MetricSample } from './types';

const point: MetricSample = {
	sampledAt: 1_000,
	online: true,
	signalDbm: -54,
	noiseDbm: -96,
	snrDb: 42,
	satisfaction: 90,
	txRateKbps: 300_000,
	rxRateKbps: 400_000,
	retryPercent: 1,
	channel: 36,
	radio: 'wifi1',
	radioProtocol: 'ax',
	apMac: '02:aa:00:00:00:01',
	apName: 'Office AP',
	txRetries: 1,
	txAttempts: 100
};

describe('demo scenario storage', () => {
	it('round-trips valid snapshots and ignores corrupt JSON', () => {
		const memory = new Map<string, string>();
		const storage = {
			getItem: (key: string) => memory.get(key) ?? null,
			setItem: (key: string, value: string) => {
				memory.set(key, value);
			}
		};
		const scenario = buildScenario({
			id: 'local-1',
			name: 'Patio check',
			createdAt: 2,
			from: 1,
			to: 2,
			series: [{ mac: '02:00:00:00:00:44', name: 'Patio', points: [point] }]
		});

		writeStoredScenarios([scenario], storage);
		expect(readStoredScenarios(storage)).toEqual([scenario]);

		memory.set(SCENARIO_STORAGE_KEY, '{not json');
		expect(readStoredScenarios(storage)).toEqual([]);
	});
});
