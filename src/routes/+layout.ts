import { env } from '$env/dynamic/public';

export const prerender = env.PUBLIC_DEMO === 'true';
export const ssr = env.PUBLIC_DEMO !== 'true';
