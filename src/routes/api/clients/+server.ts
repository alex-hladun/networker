import { json } from '@sveltejs/kit';
import { startRuntime } from '$lib/server/runtime';

export const GET = async () => {
	const { collector, repository } = startRuntime();
	if (collector.getStatus().configured && collector.getClients().length === 0) {
		await collector.runOnce();
	}

	const selected = new Set(repository.getEnabledBeacons().map((beacon) => beacon.mac));
	return json(
		collector.getClients().map((client) => ({
			...client,
			selected: selected.has(client.mac)
		})),
		{ headers: { 'cache-control': 'no-store' } }
	);
};
