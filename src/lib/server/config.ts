import fs from 'node:fs';
import path from 'node:path';
import type { PublicConnection } from '$lib/types';

export type AppConfig = {
	unifiUrl: string;
	apiKey: string;
	username: string;
	password: string;
	site: string;
	verifyTls: boolean;
	fixtureMode: boolean;
	pollIntervalSeconds: number;
	retentionDays: number;
	databasePath: string;
};

export type StoredConnection = {
	unifiUrl: string;
	apiKey: string;
	username: string;
	password: string;
	site: string;
	verifyTls: boolean;
};

export type { PublicConnection };

function asBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value === '') return fallback;
	return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function asBoundedNumber(
	value: string | undefined,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	const parsed = Number.parseFloat(value ?? '');
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(maximum, Math.max(minimum, parsed));
}

function asBoundedInteger(
	value: string | undefined,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	return Math.round(asBoundedNumber(value, fallback, minimum, maximum));
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
	const value = env[key];
	return value === undefined || value === '' ? undefined : value;
}

export function runningInDocker(): boolean {
	return fs.existsSync('/.dockerenv');
}

export function resolveUnifiUrl(url: string, inDocker = runningInDocker()): string {
	const trimmed = url.replace(/\/+$/, '');
	if (!trimmed || !inDocker) return trimmed;

	try {
		const parsed = new URL(trimmed);
		if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
			parsed.hostname = 'host.docker.internal';
			return parsed.toString().replace(/\/+$/, '');
		}
	} catch {
		return trimmed;
	}

	return trimmed;
}

export function dataDirectoryFromEnv(env: NodeJS.ProcessEnv = process.env): string {
	return env.DATA_DIR || path.resolve('data');
}

export function connectionFilePath(dataDirectory: string): string {
	return path.join(dataDirectory, 'connection.json');
}

export function readStoredConnection(dataDirectory: string): StoredConnection | null {
	const file = connectionFilePath(dataDirectory);
	if (!fs.existsSync(file)) return null;

	try {
		const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<StoredConnection>;
		if (!parsed || typeof parsed !== 'object') return null;
		return {
			unifiUrl: typeof parsed.unifiUrl === 'string' ? parsed.unifiUrl : '',
			apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
			username: typeof parsed.username === 'string' ? parsed.username : '',
			password: typeof parsed.password === 'string' ? parsed.password : '',
			site: typeof parsed.site === 'string' && parsed.site.trim() ? parsed.site : 'default',
			verifyTls: typeof parsed.verifyTls === 'boolean' ? parsed.verifyTls : true
		};
	} catch {
		return null;
	}
}

export function writeStoredConnection(dataDirectory: string, connection: StoredConnection): void {
	fs.mkdirSync(dataDirectory, { recursive: true });
	const file = connectionFilePath(dataDirectory);
	fs.writeFileSync(file, `${JSON.stringify(connection, null, '\t')}\n`, { mode: 0o600 });
	fs.chmodSync(file, 0o600);
}

export function toStoredConnection(config: AppConfig): StoredConnection {
	return {
		unifiUrl: config.unifiUrl,
		apiKey: config.apiKey,
		username: config.username,
		password: config.password,
		site: config.site,
		verifyTls: config.verifyTls
	};
}

export function publicConnection(config: AppConfig): PublicConnection {
	return {
		unifiUrl: config.unifiUrl,
		username: config.username,
		site: config.site,
		verifyTls: config.verifyTls,
		configured: isConfigured(config),
		hasApiKey: Boolean(config.apiKey),
		hasUsername: Boolean(config.username),
		hasPassword: Boolean(config.password)
	};
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	const dataDirectory = dataDirectoryFromEnv(env);
	const stored = readStoredConnection(dataDirectory);

	return {
		unifiUrl: resolveUnifiUrl(envValue(env, 'UNIFI_URL') ?? stored?.unifiUrl ?? ''),
		apiKey: envValue(env, 'UNIFI_API_KEY') ?? stored?.apiKey ?? '',
		username: envValue(env, 'UNIFI_USERNAME') ?? stored?.username ?? '',
		password: envValue(env, 'UNIFI_PASSWORD') ?? stored?.password ?? '',
		site: envValue(env, 'UNIFI_SITE') ?? stored?.site ?? 'default',
		verifyTls:
			env.UNIFI_VERIFY_TLS !== undefined && env.UNIFI_VERIFY_TLS !== ''
				? asBoolean(env.UNIFI_VERIFY_TLS, true)
				: (stored?.verifyTls ?? true),
		fixtureMode: asBoolean(env.UNIFI_FIXTURE_MODE, false),
		pollIntervalSeconds: asBoundedNumber(env.POLL_INTERVAL_SECONDS, 0.5, 0.5, 3600),
		retentionDays: asBoundedInteger(env.RETENTION_DAYS, 30, 1, 3650),
		databasePath: env.DATABASE_PATH || path.join(dataDirectory, 'networker.sqlite')
	};
}

export function isConfigured(config: AppConfig): boolean {
	return (
		config.fixtureMode ||
		Boolean(config.unifiUrl && config.apiKey && config.username && config.password && config.site)
	);
}
