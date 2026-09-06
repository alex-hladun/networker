import { Agent, fetch, type Dispatcher, type RequestInit } from 'undici';

export class UniFiHttpError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly path: string
	) {
		super(message);
		this.name = 'UniFiHttpError';
	}
}

function causeMessage(error: unknown): string {
	const err = error as Error & { cause?: Error };
	return err.cause?.message || err.message || String(error);
}

export class UniFiHttpClient {
	private readonly dispatcher: Dispatcher;

	constructor(
		private readonly baseUrl: string,
		verifyTls: boolean
	) {
		this.dispatcher = new Agent({
			connect: { rejectUnauthorized: verifyTls }
		});
	}

	async request(path: string, init: RequestInit = {}): Promise<Response> {
		const target = new URL(path, `${this.baseUrl}/`);
		try {
			const response = await fetch(`${this.baseUrl}${path}`, {
				...init,
				dispatcher: this.dispatcher,
				headers: {
					accept: 'application/json',
					...init.headers
				},
				signal: init.signal ?? AbortSignal.timeout(15_000)
			});

			if (!response.ok) {
				const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 240);
				throw new UniFiHttpError(
					`UniFi returned ${response.status}${detail ? `: ${detail}` : ''}`,
					response.status,
					path
				);
			}

			return response as unknown as Response;
		} catch (error) {
			if (error instanceof UniFiHttpError) throw error;
			const port = target.port || (target.protocol === 'https:' ? '443' : '80');
			throw new Error(
				`UniFi request to ${target.hostname}:${port}${path} failed: ${causeMessage(error)}`
			);
		}
	}
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function extractCollection(value: unknown): Record<string, unknown>[] {
	if (Array.isArray(value)) return value.map(asRecord).filter((item) => item !== null);

	const record = asRecord(value);
	if (!record) return [];
	for (const key of ['data', 'items', 'results']) {
		if (Array.isArray(record[key])) {
			return record[key].map(asRecord).filter((item) => item !== null);
		}
	}
	return [];
}
