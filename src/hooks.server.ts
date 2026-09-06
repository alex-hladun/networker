import { env } from '$env/dynamic/public';
import { redirect, type Handle } from '@sveltejs/kit';
import { isConfigured } from '$lib/server/config';
import { startRuntime } from '$lib/server/runtime';

export const handle: Handle = async ({ event, resolve }) => {
	if (env.PUBLIC_DEMO === 'true') return resolve(event);

	const runtime = startRuntime();
	if (!isConfigured(runtime.config) && event.url.pathname === '/') {
		redirect(303, '/login');
	}

	return resolve(event);
};
