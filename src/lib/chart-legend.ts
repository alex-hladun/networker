export function isAllSelected<T>(selected: readonly T[] | null, allItems: readonly T[]): boolean {
	return (
		selected === null ||
		(selected.length === allItems.length && allItems.every((item) => selected.includes(item)))
	);
}

export function isItemVisible<T>(selected: readonly T[] | null, item: T): boolean {
	return selected === null || selected.includes(item);
}

export function pruneExclusiveSelection<T>(
	selected: readonly T[] | null,
	allItems: readonly T[]
): T[] | null {
	if (selected === null) return null;
	const present = new Set(allItems);
	const next = selected.filter((item) => present.has(item));
	if (next.length === 0 || next.length === allItems.length) return null;
	return next;
}

export function toggleExclusiveSelection<T>(
	selected: readonly T[] | null,
	item: T,
	allItems: readonly T[]
): T[] | null {
	if (isAllSelected(selected, allItems)) return [item];

	const current = selected ?? [...allItems];
	if (current.length === 1 && Object.is(current[0], item)) {
		const rest = allItems.filter((entry) => !Object.is(entry, item));
		return rest.length === 0 ? null : rest;
	}

	if (current.includes(item)) {
		const next = current.filter((entry) => !Object.is(entry, item));
		return next.length === 0 ? null : next;
	}

	const next = [...current, item];
	return isAllSelected(next, allItems) ? null : next;
}

export function legendItemTitle(name: string, visible: boolean, allVisible: boolean): string {
	if (!visible) return `Show ${name}`;
	if (allVisible) return `Show only ${name}`;
	return `Hide ${name}`;
}
