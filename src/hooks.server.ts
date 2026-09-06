import type { Handle } from '@sveltejs/kit';
import { startRuntime } from '$lib/server/runtime';

export const handle: Handle = async ({ event, resolve }) => {
	startRuntime();
	return resolve(event);
};
