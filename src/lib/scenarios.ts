import {
	AVERAGE_METRICS,
	type AverageMetric,
	type BeaconAverages,
	type BeaconSeries,
	type MetricSample,
	type Scenario,
	type ScenarioBeacon,
	type TimeRange
} from '$lib/types';

export const SCENARIO_METRIC_COLUMNS: {
	key: AverageMetric;
	label: string;
	unit: string;
	digits: number;
}[] = [
	{ key: 'signalDbm', label: 'Signal', unit: 'dBm', digits: 1 },
	{ key: 'snrDb', label: 'SNR', unit: 'dB', digits: 1 },
	{ key: 'noiseDbm', label: 'Noise', unit: 'dBm', digits: 1 },
	{ key: 'satisfaction', label: 'Satisfaction', unit: '%', digits: 0 },
	{ key: 'txRateKbps', label: 'TX', unit: 'Mbps', digits: 0 },
	{ key: 'rxRateKbps', label: 'RX', unit: 'Mbps', digits: 0 },
	{ key: 'retryPercent', label: 'Retries', unit: '%', digits: 1 }
];

const emptyAverages = (): BeaconAverages => ({
	signalDbm: null,
	noiseDbm: null,
	snrDb: null,
	satisfaction: null,
	txRateKbps: null,
	rxRateKbps: null,
	retryPercent: null,
	sampleCount: 0,
	onlineCount: 0
});

export function normalizeTimeRange(start: number, end: number): TimeRange {
	return {
		from: Math.min(start, end),
		to: Math.max(start, end)
	};
}

export function finalizeChartSelection(
	start: number,
	end: number,
	options: { minDurationMs?: number } = {}
): TimeRange | null {
	const range = normalizeTimeRange(start, end);
	if (range.to - range.from < (options.minDurationMs ?? 500)) return null;
	return range;
}

export function pointsInRange(points: MetricSample[], from: number, to: number): MetricSample[] {
	return points.filter((point) => point.sampledAt >= from && point.sampledAt <= to);
}

export function averageMetrics(points: MetricSample[]): BeaconAverages {
	const online = points.filter((point) => point.online);
	const avg = (key: AverageMetric): number | null => {
		const values = online
			.map((point) => point[key])
			.filter((value): value is number => value !== null);
		if (!values.length) return null;
		return values.reduce((sum, value) => sum + value, 0) / values.length;
	};

	return {
		signalDbm: avg('signalDbm'),
		noiseDbm: avg('noiseDbm'),
		snrDb: avg('snrDb'),
		satisfaction: avg('satisfaction'),
		txRateKbps: avg('txRateKbps'),
		rxRateKbps: avg('rxRateKbps'),
		retryPercent: avg('retryPercent'),
		sampleCount: points.length,
		onlineCount: online.length
	};
}

export function buildScenario(input: {
	series: BeaconSeries[];
	from: number;
	to: number;
	name: string;
	id?: string;
	createdAt?: number;
}): Scenario {
	const { from, to } = normalizeTimeRange(input.from, input.to);
	return {
		id: input.id ?? crypto.randomUUID(),
		name: input.name.trim(),
		from,
		to,
		createdAt: input.createdAt ?? Date.now(),
		beacons: input.series
			.map((beacon): ScenarioBeacon => ({
				mac: beacon.mac,
				name: beacon.name,
				averages: averageMetrics(pointsInRange(beacon.points, from, to))
			}))
			.sort((left, right) => left.name.localeCompare(right.name))
	};
}

export function scenarioHasSamples(scenario: Scenario): boolean {
	return scenario.beacons.some((beacon) => beacon.averages.onlineCount > 0);
}

export function defaultScenarioName(from: number, to: number): string {
	const sameDay = new Date(from).toDateString() === new Date(to).toDateString();
	const longRange = to - from >= 12 * 60 * 60 * 1000;
	const format = new Intl.DateTimeFormat(undefined, {
		...(!sameDay || longRange ? { month: 'short', day: 'numeric' } : {}),
		hour: 'numeric',
		minute: '2-digit'
	});
	return `${format.format(from)} – ${format.format(to)}`;
}

export function formatScenarioRange(from: number, to: number): string {
	return defaultScenarioName(from, to);
}

export function formatAverage(key: AverageMetric, value: number | null): string {
	if (value === null) return '—';
	if (key === 'txRateKbps' || key === 'rxRateKbps') {
		return `${(value / 1000).toFixed(0)} Mbps`;
	}
	const column = SCENARIO_METRIC_COLUMNS.find((item) => item.key === key);
	const digits = column?.digits ?? 1;
	const unit = column?.unit ?? '';
	return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function nullableNumber(value: unknown): number | null | undefined {
	if (value === null) return null;
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	return undefined;
}

function parseAverages(value: unknown): BeaconAverages | null {
	if (!isRecord(value)) return null;
	const sampleCount = nullableNumber(value.sampleCount);
	const onlineCount = nullableNumber(value.onlineCount);
	if (sampleCount === null || sampleCount === undefined || sampleCount < 0) return null;
	if (onlineCount === null || onlineCount === undefined || onlineCount < 0) return null;

	const averages = emptyAverages();
	averages.sampleCount = Math.round(sampleCount);
	averages.onlineCount = Math.round(onlineCount);
	for (const key of AVERAGE_METRICS) {
		const parsed = nullableNumber(value[key]);
		if (parsed === undefined) return null;
		averages[key] = parsed;
	}
	return averages;
}

export function parseScenario(value: unknown): Scenario | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== 'string' || value.id.length === 0) return null;
	if (typeof value.name !== 'string' || value.name.trim().length === 0) return null;
	if (typeof value.from !== 'number' || !Number.isFinite(value.from)) return null;
	if (typeof value.to !== 'number' || !Number.isFinite(value.to)) return null;
	if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return null;
	if (!Array.isArray(value.beacons)) return null;

	const beacons: ScenarioBeacon[] = [];
	for (const entry of value.beacons) {
		if (!isRecord(entry)) return null;
		if (typeof entry.mac !== 'string' || entry.mac.length === 0) return null;
		if (typeof entry.name !== 'string' || entry.name.length === 0) return null;
		const averages = parseAverages(entry.averages);
		if (!averages) return null;
		beacons.push({ mac: entry.mac, name: entry.name, averages });
	}

	const { from, to } = normalizeTimeRange(value.from, value.to);
	return {
		id: value.id,
		name: value.name.trim(),
		from,
		to,
		createdAt: value.createdAt,
		beacons
	};
}

export function parseScenarios(value: unknown): Scenario[] {
	if (!Array.isArray(value)) return [];
	return value.map(parseScenario).filter((scenario): scenario is Scenario => scenario !== null);
}
