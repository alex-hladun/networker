import { json } from '@sveltejs/kit';
import { startRuntime } from '$lib/server/runtime';

export const GET = () => {
	const { collector } = startRuntime();
	return json(collector.getStatus(), {
		headers: { 'cache-control': 'no-store' }
	});
};
