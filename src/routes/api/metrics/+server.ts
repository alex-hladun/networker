import { json } from '@sveltejs/kit';
import { startRuntime } from '$lib/server/runtime';

export const GET = ({ url }) => {
	const { config, repository } = startRuntime();
	const now = Date.now();
	const to = parseTimestamp(url.searchParams.get('to'), now);
	const from = parseTimestamp(url.searchParams.get('from'), to - 24 * 60 * 60 * 1000);
	const maximumRange = config.retentionDays * 24 * 60 * 60 * 1000;

	if (from >= to) return json({ error: '"from" must be earlier than "to".' }, { status: 400 });
	if (to - from > maximumRange + 60_000) {
		return json(
			{ error: `The requested range exceeds the ${config.retentionDays}-day retention window.` },
			{ status: 400 }
		);
	}

	return json(repository.getMetrics(from, to), {
		headers: { 'cache-control': 'no-store' }
	});
};

function parseTimestamp(value: string | null, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}
