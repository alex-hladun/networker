import { env } from '$env/dynamic/public';
import type { Handle } from '@sveltejs/kit';
import { startRuntime } from '$lib/server/runtime';

export const handle: Handle = async ({ event, resolve }) => {
	if (env.PUBLIC_DEMO !== 'true') startRuntime();
	return resolve(event);
};
