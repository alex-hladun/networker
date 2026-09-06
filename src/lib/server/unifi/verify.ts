import type { AppConfig } from '../config';
import { ClassicClient } from './classic-client';
import { IntegrationClient } from './integration-client';

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function verifyUnifiConnection(config: AppConfig): Promise<void> {
	try {
		await new IntegrationClient(config).getVersion();
	} catch (error) {
		throw new Error(`Integration API key failed: ${errorMessage(error)}`, { cause: error });
	}

	try {
		await new ClassicClient(config).verifyCredentials();
	} catch (error) {
		throw new Error(`Local username or password failed: ${errorMessage(error)}`, { cause: error });
	}
}
