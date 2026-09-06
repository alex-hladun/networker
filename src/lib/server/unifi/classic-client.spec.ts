import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config';
import { ClassicClient } from './classic-client';

describe('ClassicClient session handling', () => {
	it('logs in again after an expired client-statistics session', async () => {
		let loginCount = 0;
		let stationCount = 0;
		const server = createServer((request, response) => {
			response.setHeader('content-type', 'application/json');
			if (request.url === '/api/auth/login') {
				loginCount += 1;
				response.setHeader('set-cookie', `TOKEN=session-${loginCount}; Path=/; HttpOnly`);
				response.end('{}');
				return;
			}
			if (request.url === '/proxy/network/api/self/sites') {
				response.end(JSON.stringify({ data: [{ name: 'default', desc: 'Default' }] }));
				return;
			}
			if (request.url === '/proxy/network/api/s/default/stat/sta') {
				stationCount += 1;
				if (stationCount === 1) {
					response.statusCode = 401;
					response.end(JSON.stringify({ meta: { msg: 'api.err.LoginRequired' } }));
					return;
				}
				response.end(JSON.stringify({ data: [{ mac: 'aa:bb:cc:dd:ee:ff', signal: -60 }] }));
				return;
			}
			response.statusCode = 404;
			response.end('{}');
		});

		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const port = (server.address() as AddressInfo).port;
		const config: AppConfig = {
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

		const stations = await new ClassicClient(config).getStations();

		expect(stations).toHaveLength(1);
		expect(loginCount).toBe(2);
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
	});
});
