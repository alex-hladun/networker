import type { AppConfig } from '../config';
import { asRecord, extractCollection, UniFiHttpClient, UniFiHttpError } from './http';
import { normalizeMac } from './normalize';
import type { DiscoveredClient } from '$lib/types';

type IntegrationSite = {
	id: string;
	name: string;
};

export class IntegrationClient {
	private readonly http: UniFiHttpClient;
	private prefix: '/proxy/network/integration/v1' | '/integration/v1' =
		'/proxy/network/integration/v1';

	constructor(private readonly config: AppConfig) {
		this.http = new UniFiHttpClient(config.unifiUrl, config.verifyTls);
	}

	private async get(path: string): Promise<unknown> {
		const request = (prefix: string) =>
			this.http.request(`${prefix}${path}`, {
				headers: { 'x-api-key': this.config.apiKey }
			});

		try {
			return await (await request(this.prefix)).json();
		} catch (error) {
			if (
				error instanceof UniFiHttpError &&
				error.status === 404 &&
				this.prefix === '/proxy/network/integration/v1'
			) {
				this.prefix = '/integration/v1';
				return await (await request(this.prefix)).json();
			}
			throw error;
		}
	}

	async getVersion(): Promise<string | null> {
		const payload = asRecord(await this.get('/info'));
		const version = payload?.applicationVersion ?? payload?.version;
		return typeof version === 'string' ? version : null;
	}

	async listSites(): Promise<IntegrationSite[]> {
		const sites = extractCollection(await this.get('/sites?offset=0&limit=200'));
		return sites.flatMap((site) => {
			const id = typeof site.id === 'string' ? site.id : null;
			const name =
				typeof site.name === 'string'
					? site.name
					: typeof site.description === 'string'
						? site.description
						: null;
			return id && name ? [{ id, name }] : [];
		});
	}

	async listClients(siteId: string): Promise<DiscoveredClient[]> {
		const clients: DiscoveredClient[] = [];
		let offset = 0;

		for (let page = 0; page < 50; page += 1) {
			const payload = await this.get(
				`/sites/${encodeURIComponent(siteId)}/clients?offset=${offset}&limit=200`
			);
			const records = extractCollection(payload);

			for (const client of records) {
				if (client.type !== 'WIRELESS') continue;
				const mac = normalizeMac(client.macAddress);
				if (!mac) continue;
				clients.push({
					mac,
					name: typeof client.name === 'string' && client.name.trim() ? client.name : mac,
					ipAddress: typeof client.ipAddress === 'string' ? client.ipAddress : null,
					uplinkDeviceId: typeof client.uplinkDeviceId === 'string' ? client.uplinkDeviceId : null,
					connected: true
				});
			}

			if (records.length < 200) break;
			offset += records.length;
		}

		return clients;
	}

	async discover(): Promise<{ version: string | null; clients: DiscoveredClient[] }> {
		const [version, sites] = await Promise.all([this.getVersion(), this.listSites()]);
		const normalizedTarget = this.config.site.toLowerCase();
		const site =
			sites.find(
				(candidate) =>
					candidate.id.toLowerCase() === normalizedTarget ||
					candidate.name.toLowerCase() === normalizedTarget
			) ?? (sites.length === 1 ? sites[0] : null);

		if (!site) {
			throw new Error(
				`UniFi site "${this.config.site}" was not found; available sites: ${
					sites.map((candidate) => candidate.name).join(', ') || 'none'
				}`
			);
		}

		return { version, clients: await this.listClients(site.id) };
	}
}
