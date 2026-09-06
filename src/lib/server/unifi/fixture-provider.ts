import { createFixtureSnapshot } from '$lib/demo/fixture';
import type { NetworkProvider, ProviderSnapshot } from './types';

export class FixtureProvider implements NetworkProvider {
	async getSnapshot(): Promise<ProviderSnapshot> {
		return createFixtureSnapshot();
	}

	async reconnectClient(): Promise<void> {}
}
