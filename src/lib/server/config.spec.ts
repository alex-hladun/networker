import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	connectionFilePath,
	loadConfig,
	publicConnection,
	resolveUnifiUrl,
	writeStoredConnection
} from './config';

const tempDirs: string[] = [];

function tempDataDir(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'networker-config-'));
	tempDirs.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

describe('loadConfig', () => {
	it('honors fractional poll intervals down to half a second', () => {
		expect(loadConfig({ POLL_INTERVAL_SECONDS: '0.5' }).pollIntervalSeconds).toBe(0.5);
		expect(loadConfig({ POLL_INTERVAL_SECONDS: '1' }).pollIntervalSeconds).toBe(1);
		expect(loadConfig({ POLL_INTERVAL_SECONDS: '0.1' }).pollIntervalSeconds).toBe(0.5);
		expect(loadConfig({}).pollIntervalSeconds).toBe(30);
	});

	it('reads connection.json when env credentials are empty', () => {
		const dataDirectory = tempDataDir();
		writeStoredConnection(dataDirectory, {
			unifiUrl: 'https://192.168.1.1',
			apiKey: 'file-key',
			username: 'monitor',
			password: 'file-secret',
			site: 'Office',
			verifyTls: false
		});

		const config = loadConfig({ DATA_DIR: dataDirectory });
		expect(config.unifiUrl).toBe('https://192.168.1.1');
		expect(config.apiKey).toBe('file-key');
		expect(config.username).toBe('monitor');
		expect(config.password).toBe('file-secret');
		expect(config.site).toBe('Office');
		expect(config.verifyTls).toBe(false);
	});

	it('writes connection.json with owner-only permissions', () => {
		const dataDirectory = tempDataDir();
		writeStoredConnection(dataDirectory, {
			unifiUrl: 'https://192.168.1.1',
			apiKey: 'file-key',
			username: 'monitor',
			password: 'file-secret',
			site: 'default',
			verifyTls: false
		});
		expect(fs.statSync(connectionFilePath(dataDirectory)).mode & 0o777).toBe(0o600);
	});

	it('lets env values override connection.json', () => {
		const dataDirectory = tempDataDir();
		writeStoredConnection(dataDirectory, {
			unifiUrl: 'https://192.168.1.1',
			apiKey: 'file-key',
			username: 'monitor',
			password: 'file-secret',
			site: 'Office',
			verifyTls: false
		});

		const config = loadConfig({
			DATA_DIR: dataDirectory,
			UNIFI_API_KEY: 'env-key',
			UNIFI_VERIFY_TLS: 'true'
		});
		expect(config.apiKey).toBe('env-key');
		expect(config.username).toBe('monitor');
		expect(config.verifyTls).toBe(true);
	});
});

describe('publicConnection', () => {
	it('never includes the API key or password', () => {
		const view = publicConnection(
			loadConfig({
				UNIFI_URL: 'https://192.168.1.1',
				UNIFI_API_KEY: 'secret-key',
				UNIFI_USERNAME: 'monitor',
				UNIFI_PASSWORD: 'secret-pass'
			})
		);
		expect(view).toEqual({
			unifiUrl: 'https://192.168.1.1',
			username: 'monitor',
			site: 'default',
			verifyTls: true,
			configured: true,
			hasApiKey: true,
			hasUsername: true,
			hasPassword: true
		});
		expect(JSON.stringify(view)).not.toContain('secret-key');
		expect(JSON.stringify(view)).not.toContain('secret-pass');
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
