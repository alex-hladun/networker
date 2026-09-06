import { describe, expect, it } from 'vitest';
import { loadConfig, resolveUnifiUrl } from './config';

describe('loadConfig', () => {
	it('honors fractional poll intervals down to half a second', () => {
		expect(loadConfig({ POLL_INTERVAL_SECONDS: '0.5' }).pollIntervalSeconds).toBe(0.5);
		expect(loadConfig({ POLL_INTERVAL_SECONDS: '1' }).pollIntervalSeconds).toBe(1);
		expect(loadConfig({ POLL_INTERVAL_SECONDS: '0.1' }).pollIntervalSeconds).toBe(0.5);
		expect(loadConfig({}).pollIntervalSeconds).toBe(30);
	});
});

describe('resolveUnifiUrl', () => {
	it('rewrites loopback hosts only when running in Docker', () => {
		expect(resolveUnifiUrl('https://127.0.0.1:11443', true)).toBe(
			'https://host.docker.internal:11443'
		);
		expect(resolveUnifiUrl('https://localhost:11443/', true)).toBe(
			'https://host.docker.internal:11443'
		);
		expect(resolveUnifiUrl('https://127.0.0.1:11443', false)).toBe('https://127.0.0.1:11443');
		expect(resolveUnifiUrl('https://192.168.1.1', true)).toBe('https://192.168.1.1');
	});
});
