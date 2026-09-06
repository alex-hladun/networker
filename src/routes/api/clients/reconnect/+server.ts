import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { startRuntime } from '$lib/server/runtime';
import { normalizeMac } from '$lib/server/unifi/normalize';

const reconnectInput = z.object({
	mac: z.string().min(1)
});

export const POST = async ({ request }) => {
	const parsed = reconnectInput.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: 'A MAC address is required.' }, { status: 400 });

	const mac = normalizeMac(parsed.data.mac);
	if (!mac) return json({ error: 'The MAC address is invalid.' }, { status: 400 });

	try {
		const { provider } = startRuntime();
		await provider.reconnectClient(mac);
		return json({ ok: true, mac });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
	}
};
