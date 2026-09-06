import { json } from '@sveltejs/kit';
import { startRuntime } from '$lib/server/runtime';

export const GET = () => {
	const status = startRuntime().collector.getStatus();
	const healthy = status.configured
		? status.lastError === null || status.lastPollSucceededAt !== null
		: true;

	return json(
		{
			ok: healthy,
			configured: status.configured,
			mode: status.mode,
			lastPollSucceededAt: status.lastPollSucceededAt
		},
		{ status: healthy ? 200 : 503, headers: { 'cache-control': 'no-store' } }
	);
};
