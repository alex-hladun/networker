import { describe, expect, it } from 'vitest';
import {
	isAllSelected,
	isItemVisible,
	legendItemTitle,
	pruneExclusiveSelection,
	toggleExclusiveSelection
} from './chart-legend';

const macs = ['aa', 'bb', 'cc'];

describe('chart legend selection', () => {
	it('isolates a series from the all-visible state', () => {
		expect(toggleExclusiveSelection(null, 'aa', macs)).toEqual(['aa']);
		expect(toggleExclusiveSelection(['aa', 'bb', 'cc'], 'bb', macs)).toEqual(['bb']);
	});

	it('hides an isolated series and restores the others', () => {
		expect(toggleExclusiveSelection(['aa'], 'aa', macs)).toEqual(['bb', 'cc']);
	});

	it('turns a visible series off without isolating first', () => {
		expect(toggleExclusiveSelection(['aa', 'bb'], 'aa', macs)).toEqual(['bb']);
	});

	it('shows a hidden series and collapses back to all when complete', () => {
		expect(toggleExclusiveSelection(['bb', 'cc'], 'aa', macs)).toBeNull();
		expect(toggleExclusiveSelection(['bb'], 'aa', macs)).toEqual(['bb', 'aa']);
	});

	it('does not hide the only series in the chart', () => {
		expect(toggleExclusiveSelection(null, 'aa', ['aa'])).toEqual(['aa']);
		expect(isAllSelected(['aa'], ['aa'])).toBe(true);
	});

	it('treats null as every series visible', () => {
		expect(isAllSelected(null, macs)).toBe(true);
		expect(isItemVisible(null, 'aa')).toBe(true);
		expect(isItemVisible(['bb'], 'aa')).toBe(false);
		expect(isItemVisible(['bb'], 'bb')).toBe(true);
	});

	it('drops stale ids and restores all when the selection is gone', () => {
		expect(pruneExclusiveSelection(['aa', 'zz'], macs)).toEqual(['aa']);
		expect(pruneExclusiveSelection(['zz'], macs)).toBeNull();
		expect(pruneExclusiveSelection(['aa', 'bb', 'cc'], macs)).toBeNull();
		expect(pruneExclusiveSelection(null, macs)).toBeNull();
	});

	it('labels isolate versus hide versus show', () => {
		expect(legendItemTitle('Kitchen', true, true)).toBe('Show only Kitchen');
		expect(legendItemTitle('Kitchen', true, false)).toBe('Hide Kitchen');
		expect(legendItemTitle('Kitchen', false, false)).toBe('Show Kitchen');
	});
});
