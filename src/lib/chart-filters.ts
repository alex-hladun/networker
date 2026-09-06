import { classifyMetric, QUALITY_ZONES, type QualityZone } from '$lib/metric-zones';
import type { BeaconSeries, MetricSample } from '$lib/types';

export type AccessPointOption = {
	id: string;
	label: string;
};

export function accessPointId(point: Pick<MetricSample, 'apMac' | 'apName'>): string {
	return point.apMac ?? point.apName ?? 'unknown';
}

export function accessPointLabel(point: Pick<MetricSample, 'apMac' | 'apName'>): string {
	return point.apName ?? point.apMac ?? 'Unknown AP';
}

export function listAccessPoints(series: BeaconSeries[]): AccessPointOption[] {
	const names = new Map<string, string>();
	for (const beacon of series) {
		for (const point of beacon.points) {
			if (!point.apMac && !point.apName) continue;
			names.set(accessPointId(point), accessPointLabel(point));
		}
	}
	return [...names.entries()]
		.sort((left, right) => left[1].localeCompare(right[1]))
		.map(([id, label]) => ({ id, label }));
}

function hidePoint(point: MetricSample): MetricSample {
	return {
		...point,
		online: false,
		signalDbm: null,
		noiseDbm: null,
		snrDb: null,
		satisfaction: null,
		txRateKbps: null,
		rxRateKbps: null,
		retryPercent: null
	};
}

function matchesFilters(
	point: MetricSample,
	apId: string | null,
	bands: Set<QualityZone> | null
): boolean {
	if (apId && accessPointId(point) !== apId) return false;
	if (!bands) return true;
	if (point.signalDbm === null) return false;
	return bands.has(classifyMetric('signalDbm', point.signalDbm));
}

export function filterChartSeries(
	series: BeaconSeries[],
	options: { apId?: string | null; bands?: readonly QualityZone[] | null } = {}
): BeaconSeries[] {
	const apId = options.apId ?? null;
	const bands =
		options.bands && options.bands.length > 0 && options.bands.length < QUALITY_ZONES.length
			? new Set(options.bands)
			: null;

	if (!apId && !bands) return series;

	return series
		.map((beacon) => ({
			...beacon,
			points: beacon.points.map((point) =>
				matchesFilters(point, apId, bands) ? point : hidePoint(point)
			)
		}))
		.filter((beacon) => beacon.points.some((point) => point.online));
}
