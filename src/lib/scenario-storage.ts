import { parseScenarios } from '$lib/scenarios';
import type { Scenario } from '$lib/types';

export const SCENARIO_STORAGE_KEY = 'networker.scenarios';

export function readStoredScenarios(
	storage: Pick<Storage, 'getItem'> | null = defaultStorage()
): Scenario[] {
	if (!storage) return [];
	try {
		return parseScenarios(JSON.parse(storage.getItem(SCENARIO_STORAGE_KEY) ?? '[]'));
	} catch {
		return [];
	}
}

export function writeStoredScenarios(
	scenarios: Scenario[],
	storage: Pick<Storage, 'setItem'> | null = defaultStorage()
): void {
	if (!storage) return;
	storage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenarios));
}

function defaultStorage(): Storage | null {
	return typeof localStorage === 'undefined' ? null : localStorage;
}
