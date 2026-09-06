import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseScenario } from '$lib/scenarios';
import { startRuntime } from '$lib/server/runtime';

const nullableNumber = z.number().finite().nullable();

const scenarioInput = z.object({
	id: z.string().min(1).max(80).optional(),
	name: z.string().trim().min(1).max(80),
	from: z.number().finite(),
	to: z.number().finite(),
	createdAt: z.number().finite().optional(),
	beacons: z.array(
		z.object({
			mac: z.string().min(1),
			name: z.string().min(1).max(120),
			averages: z.object({
				signalDbm: nullableNumber,
				noiseDbm: nullableNumber,
				snrDb: nullableNumber,
				satisfaction: nullableNumber,
				txRateKbps: nullableNumber,
				rxRateKbps: nullableNumber,
				retryPercent: nullableNumber,
				sampleCount: z.number().int().nonnegative(),
				onlineCount: z.number().int().nonnegative()
			})
		})
	)
});

const removeInput = z.object({
	id: z.string().min(1)
});

export const GET = () => {
	const { repository } = startRuntime();
	return json(repository.listScenarios(), { headers: { 'cache-control': 'no-store' } });
};

export const POST = async ({ request }) => {
	const parsed = scenarioInput.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json(
			{ error: 'A named time range and per-beacon averages are required.' },
			{ status: 400 }
		);
	}
	if (parsed.data.from === parsed.data.to) {
		return json({ error: '"from" must be earlier than "to".' }, { status: 400 });
	}

	const now = Date.now();
	const scenario = parseScenario({
		id: parsed.data.id ?? crypto.randomUUID(),
		name: parsed.data.name,
		from: parsed.data.from,
		to: parsed.data.to,
		createdAt: parsed.data.createdAt ?? now,
		beacons: parsed.data.beacons
	});
	if (!scenario) {
		return json({ error: 'The scenario snapshot is invalid.' }, { status: 400 });
	}

	const { repository } = startRuntime();
	return json(repository.saveScenario(scenario), { status: 201 });
};

export const DELETE = async ({ request }) => {
	const parsed = removeInput.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: 'A scenario id is required.' }, { status: 400 });

	const { repository } = startRuntime();
	if (!repository.deleteScenario(parsed.data.id)) {
		return json({ error: 'Scenario not found.' }, { status: 404 });
	}
	return json({ ok: true });
};
