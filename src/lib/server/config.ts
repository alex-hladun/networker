import fs from 'node:fs';
import path from 'node:path';

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

function asBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value === '') return fallback;
	return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function asBoundedInteger(
	value: string | undefined,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(maximum, Math.max(minimum, parsed));
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	const dataDirectory = env.DATA_DIR || path.resolve('data');

	return {
		unifiUrl: resolveUnifiUrl(env.UNIFI_URL || ''),
		apiKey: env.UNIFI_API_KEY || '',
		username: env.UNIFI_USERNAME || '',
		password: env.UNIFI_PASSWORD || '',
		site: env.UNIFI_SITE || 'default',
		verifyTls: asBoolean(env.UNIFI_VERIFY_TLS, true),
		fixtureMode: asBoolean(env.UNIFI_FIXTURE_MODE, false),
		pollIntervalSeconds: asBoundedInteger(env.POLL_INTERVAL_SECONDS, 30, 10, 3600),
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
