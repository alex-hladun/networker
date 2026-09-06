import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	dataDirectoryFromEnv,
	isConfigured,
	loadConfig,
	publicConnection,
	toStoredConnection,
	writeStoredConnection,
	type AppConfig
} from '$lib/server/config';
import { applyConfig, startRuntime } from '$lib/server/runtime';
import { verifyUnifiConnection } from '$lib/server/unifi/verify';

const connectionInput = z.object({
	unifiUrl: z
		.string()
		.trim()
		.min(1)
		.refine((value) => {
			try {
				const parsed = new URL(value);
				return parsed.protocol === 'http:' || parsed.protocol === 'https:';
			} catch {
				return false;
			}
		}, 'Enter the console URL, such as https://192.168.1.1'),
	apiKey: z.string().optional().default(''),
	username: z.string().trim().min(1),
	password: z.string().optional().default(''),
	site: z.string().trim().min(1).default('default'),
	verifyTls: z.boolean().default(false)
});

export const GET = () => {
	const { config } = startRuntime();
	return json(publicConnection(config), { headers: { 'cache-control': 'no-store' } });
};

export const POST = async ({ request }) => {
	const parsed = connectionInput.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json(
			{ error: parsed.error.issues[0]?.message || 'Enter the console URL and both credentials.' },
			{ status: 400 }
		);
	}

	const current = startRuntime().config;
	const apiKey = parsed.data.apiKey.trim() || current.apiKey;
	const password = parsed.data.password || current.password;
	if (!apiKey || !password) {
		return json(
			{ error: 'An Integration API key and local UniFi password are required.' },
			{ status: 400 }
		);
	}

	const next: AppConfig = {
		...loadConfig(),
		unifiUrl: parsed.data.unifiUrl.replace(/\/+$/, ''),
		apiKey,
		username: parsed.data.username,
		password,
		site: parsed.data.site,
		verifyTls: parsed.data.verifyTls,
		fixtureMode: false
	};

	try {
		await verifyUnifiConnection(next);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
	}

	writeStoredConnection(dataDirectoryFromEnv(), toStoredConnection(next));
	const runtime = applyConfig(loadConfig());
	if (!isConfigured(runtime.config)) {
		return json({ error: 'The connection was saved but is still incomplete.' }, { status: 500 });
	}

	return json(publicConnection(runtime.config));
};
