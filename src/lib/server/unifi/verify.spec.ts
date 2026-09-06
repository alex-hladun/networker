import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config';
import { verifyUnifiConnection } from './verify';

function configFor(port: number): AppConfig {
	return {
		unifiUrl: `http://127.0.0.1:${port}`,
		apiKey: 'key',
		username: 'reader',
		password: 'secret',
		site: 'default',
		verifyTls: true,
		fixtureMode: false,
		pollIntervalSeconds: 30,
		retentionDays: 30,
		databasePath: ':memory:'
	};
}

async function listen(
	handler: (
		request: import('node:http').IncomingMessage,
		response: import('node:http').ServerResponse
	) => void
): Promise<{ port: number; close: () => Promise<void> }> {
	const server = createServer(handler);
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const port = (server.address() as AddressInfo).port;
	return {
		port,
		close: () =>
			new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			)
	};
}

describe('verifyUnifiConnection', () => {
	it('rejects a bad Integration API key before trying the local account', async () => {
		const server = await listen((_request, response) => {
			response.statusCode = 401;
			response.end('{"message":"Invalid API key"}');
		});

		await expect(verifyUnifiConnection(configFor(server.port))).rejects.toThrow(
			/Integration API key failed/
		);
		await server.close();
	});

	it('rejects a bad local username or password after the API key works', async () => {
		const server = await listen((request, response) => {
			response.setHeader('content-type', 'application/json');
			if (request.url?.includes('/info') && request.headers['x-api-key'] === 'key') {
				response.end(JSON.stringify({ applicationVersion: '9.0.0' }));
				return;
			}
			if (request.url === '/api/auth/login') {
				response.statusCode = 403;
				response.end(JSON.stringify({ message: 'Invalid username or password' }));
				return;
			}
			response.statusCode = 404;
			response.end('{}');
		});

		await expect(verifyUnifiConnection(configFor(server.port))).rejects.toThrow(
			/Local username or password failed/
		);
		await server.close();
	});

	it('accepts both the API key and the local account', async () => {
		const server = await listen((request, response) => {
			response.setHeader('content-type', 'application/json');
			if (request.url?.includes('/info') && request.headers['x-api-key'] === 'key') {
				response.end(JSON.stringify({ applicationVersion: '9.0.0' }));
				return;
			}
			if (request.url === '/api/auth/login') {
				response.setHeader('set-cookie', 'TOKEN=ok; Path=/; HttpOnly');
				response.end('{}');
				return;
			}
			response.statusCode = 404;
			response.end('{}');
		});

		await expect(verifyUnifiConnection(configFor(server.port))).resolves.toBeUndefined();
		await server.close();
	});
});
