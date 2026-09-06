import type { AppConfig } from '../config';
import { extractCollection, UniFiHttpClient, UniFiHttpError } from './http';
import type { RawStation } from './types';

export class ClassicClient {
	private readonly http: UniFiHttpClient;
	private cookie = '';
	private csrfToken = '';
	private siteName: string | null = null;

	constructor(private readonly config: AppConfig) {
		this.http = new UniFiHttpClient(config.unifiUrl, config.verifyTls);
	}

	private captureSession(response: Response): void {
		const headers = response.headers as Headers & { getSetCookie?: () => string[] };
		const setCookies = headers.getSetCookie?.() ?? [];
		if (setCookies.length) {
			this.cookie = setCookies.map((value) => value.split(';', 1)[0]).join('; ');
		}
		this.csrfToken = response.headers.get('x-csrf-token') ?? this.csrfToken;
	}

	private async login(): Promise<void> {
		const payloads = [
			{ username: this.config.username, password: this.config.password },
			{
				username: this.config.username,
				password: this.config.password,
				rememberMe: true
			}
		];

		let lastError: unknown;
		for (const payload of payloads) {
			try {
				const response = await this.postLogin(JSON.stringify(payload));
				this.captureSession(response);
				if (!this.cookie) {
					throw new Error('UniFi login succeeded but did not return a session cookie');
				}
				return;
			} catch (error) {
				lastError = error;
				if (!(error instanceof UniFiHttpError) || error.status !== 403) throw error;
			}
		}

		throw lastError;
	}

	private async postLogin(body: string): Promise<Response> {
		try {
			return await this.http.request('/api/auth/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body
			});
		} catch (error) {
			if (!(error instanceof UniFiHttpError) || error.status !== 404) throw error;
			return this.http.request('/api/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body
			});
		}
	}

	private async getWithApiKey(path: string): Promise<unknown> {
		const response = await this.http.request(path, {
			headers: { 'x-api-key': this.config.apiKey }
		});
		return response.json();
	}

	private async authenticatedGet(path: string, retry = true): Promise<unknown> {
		if (!this.cookie) await this.login();

		try {
			const response = await this.http.request(path, {
				headers: {
					cookie: this.cookie,
					...(this.csrfToken ? { 'x-csrf-token': this.csrfToken } : {})
				}
			});
			this.captureSession(response);
			return await response.json();
		} catch (error) {
			if (
				retry &&
				error instanceof UniFiHttpError &&
				(error.status === 401 || error.status === 403)
			) {
				this.cookie = '';
				this.csrfToken = '';
				await this.login();
				return this.authenticatedGet(path, false);
			}
			throw error;
		}
	}

	private async resolveSiteName(): Promise<string> {
		if (this.siteName) return this.siteName;

		try {
			const sites = extractCollection(await this.authenticatedGet('/proxy/network/api/self/sites'));
			const target = this.config.site.toLowerCase();
			const matched = sites.find(
				(site) =>
					(typeof site.name === 'string' && site.name.toLowerCase() === target) ||
					(typeof site.desc === 'string' && site.desc.toLowerCase() === target)
			);
			if (matched && typeof matched.name === 'string') {
				this.siteName = matched.name;
				return matched.name;
			}
		} catch {
			// Some controller versions deny site enumeration to view-only accounts.
		}

		this.siteName = this.config.site;
		return this.siteName;
	}

	async getStations(): Promise<RawStation[]> {
		const configuredSite = this.config.site;
		const staPath = `/proxy/network/api/s/${encodeURIComponent(configuredSite)}/stat/sta`;

		try {
			return extractCollection(await this.getWithApiKey(staPath));
		} catch {
			// Official keys do not always authorize classic telemetry; fall back to a local session.
		}

		const site = await this.resolveSiteName();
		const payload = await this.authenticatedGet(
			`/proxy/network/api/s/${encodeURIComponent(site)}/stat/sta`
		);
		return extractCollection(payload);
	}
}
