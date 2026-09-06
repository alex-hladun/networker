import { describe, expect, it } from 'vitest';
import { resolveUnifiUrl } from './config';

describe('resolveUnifiUrl', () => {
	it('rewrites loopback hosts only when running in Docker', () => {
		expect(resolveUnifiUrl('https://127.0.0.1:11443', true)).toBe(
			'https://host.docker.internal:11443'
		);
		expect(resolveUnifiUrl('https://localhost:11443/', true)).toBe(
			'https://host.docker.internal:11443'
		);
		expect(resolveUnifiUrl('https://127.0.0.1:11443', false)).toBe('https://127.0.0.1:11443');
		expect(resolveUnifiUrl('https://192.168.1.1', true)).toBe('https://192.168.1.1');
	});
});
