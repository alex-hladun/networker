import type { SignalQuality } from '$lib/types';

export type QualityZone = Exclude<SignalQuality, 'unknown'>;

export type ZonedMetric = 'signalDbm' | 'snrDb' | 'noiseDbm' | 'satisfaction' | 'retryPercent';

export type ChartMetric = ZonedMetric | 'txRateKbps' | 'rxRateKbps';

type ZoneScale = {
	higherIsBetter: boolean;
	excellent: number;
	ideal: number;
	ok: number;
	bad: number;
};

export const QUALITY_ZONES: QualityZone[] = ['excellent', 'ideal', 'ok', 'bad', 'terrible'];

export const ZONE_LABELS: Record<QualityZone, string> = {
	excellent: 'Excellent',
	ideal: 'Ideal',
	ok: 'OK',
	bad: 'Bad',
	terrible: 'Terrible'
};

export const ZONE_COLORS: Record<QualityZone, string> = {
	excellent: 'rgba(45, 212, 191, 0.22)',
	ideal: 'rgba(36, 214, 167, 0.12)',
	ok: 'rgba(246, 185, 80, 0.13)',
	bad: 'rgba(249, 140, 90, 0.15)',
	terrible: 'rgba(240, 123, 145, 0.18)'
};

export const METRIC_ZONE_SCALES: Record<ZonedMetric, ZoneScale> = {
	signalDbm: { higherIsBetter: true, excellent: -55, ideal: -65, ok: -72, bad: -80 },
	snrDb: { higherIsBetter: true, excellent: 35, ideal: 30, ok: 25, bad: 20 },
	satisfaction: { higherIsBetter: true, excellent: 90, ideal: 80, ok: 70, bad: 60 },
	noiseDbm: { higherIsBetter: false, excellent: -90, ideal: -85, ok: -80, bad: -75 },
	retryPercent: { higherIsBetter: false, excellent: 5, ideal: 10, ok: 15, bad: 25 }
};

export type ZoneBand = {
	zone: QualityZone;
	from: number;
	to: number;
	color: string;
};

export function isZonedMetric(metric: ChartMetric): metric is ZonedMetric {
	return metric in METRIC_ZONE_SCALES;
}

export function classifyMetric(metric: ZonedMetric, value: number): QualityZone {
	const scale = METRIC_ZONE_SCALES[metric];
	if (scale.higherIsBetter) {
		if (value >= scale.excellent) return 'excellent';
		if (value >= scale.ideal) return 'ideal';
		if (value >= scale.ok) return 'ok';
		if (value >= scale.bad) return 'bad';
		return 'terrible';
	}

	if (value <= scale.excellent) return 'excellent';
	if (value <= scale.ideal) return 'ideal';
	if (value <= scale.ok) return 'ok';
	if (value <= scale.bad) return 'bad';
	return 'terrible';
}

export function qualityLabel(quality: SignalQuality): string {
	if (quality === 'unknown') return 'No signal';
	return ZONE_LABELS[quality];
}

export function zoneBands(metric: ChartMetric): ZoneBand[] {
	if (!isZonedMetric(metric)) return [];
	const scale = METRIC_ZONE_SCALES[metric];
	const inf = Number.POSITIVE_INFINITY;

	const ranges: Array<[QualityZone, number, number]> = scale.higherIsBetter
		? [
				['terrible', Number.NEGATIVE_INFINITY, scale.bad],
				['bad', scale.bad, scale.ok],
				['ok', scale.ok, scale.ideal],
				['ideal', scale.ideal, scale.excellent],
				['excellent', scale.excellent, inf]
			]
		: [
				['excellent', Number.NEGATIVE_INFINITY, scale.excellent],
				['ideal', scale.excellent, scale.ideal],
				['ok', scale.ideal, scale.ok],
				['bad', scale.ok, scale.bad],
				['terrible', scale.bad, inf]
			];

	return ranges.map(([zone, from, to]) => ({
		zone,
		from,
		to,
		color: ZONE_COLORS[zone]
	}));
}

export function zoneAxisRange(
	metric: ChartMetric,
	values: number[]
): { min?: number; max?: number } {
	if (!isZonedMetric(metric)) return {};

	const scale = METRIC_ZONE_SCALES[metric];
	const step = Math.abs(scale.ideal - scale.ok);
	const bounded = metric === 'satisfaction' || metric === 'retryPercent';

	let viewMin = scale.higherIsBetter ? scale.bad - step : scale.excellent - step;
	let viewMax = scale.higherIsBetter ? scale.excellent + step : scale.bad + step;

	if (values.length > 0) {
		const pad = step / 2;
		viewMin = Math.min(viewMin, Math.min(...values) - pad);
		viewMax = Math.max(viewMax, Math.max(...values) + pad);
	}

	if (bounded) {
		viewMin = Math.max(0, viewMin);
		viewMax = Math.min(100, viewMax);
	}

	return { min: viewMin, max: viewMax };
}
