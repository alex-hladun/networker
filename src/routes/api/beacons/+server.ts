import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { startRuntime } from '$lib/server/runtime';
import { normalizeMac } from '$lib/server/unifi/normalize';

const beaconInput = z.object({
	mac: z.string().min(1),
	name: z.string().trim().min(1).max(120)
});

const removeInput = z.object({
	mac: z.string().min(1)
});

export const GET = () => {
	const { repository } = startRuntime();
	return json(repository.listBeacons(), { headers: { 'cache-control': 'no-store' } });
};

export const POST = async ({ request }) => {
	const parsed = beaconInput.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ error: 'A valid MAC address and device name are required.' }, { status: 400 });
	}

	const mac = normalizeMac(parsed.data.mac);
	if (!mac) return json({ error: 'The MAC address is invalid.' }, { status: 400 });

	const { config, repository, collector } = startRuntime();
	repository.upsertBeacon(mac, parsed.data.name, config.site);
	await collector.runOnce();
	return json(repository.listBeacons(), { status: 201 });
};

export const DELETE = async ({ request }) => {
	const parsed = removeInput.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: 'A MAC address is required.' }, { status: 400 });

	const mac = normalizeMac(parsed.data.mac);
	if (!mac) return json({ error: 'The MAC address is invalid.' }, { status: 400 });

	const { repository } = startRuntime();
	if (!repository.disableBeacon(mac)) return json({ error: 'Beacon not found.' }, { status: 404 });
	return json({ ok: true });
};
