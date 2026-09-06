import { classifyMetric } from '$lib/metric-zones';
import type { SignalQuality } from '$lib/types';
import type { NormalizedStation, RawStation } from './types';

export function asNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeMac(value: unknown): string | null {
	const compact = asString(value)
		?.toLowerCase()
		.replace(/[^a-f0-9]/g, '');
	if (!compact || compact.length !== 12) return null;
	return compact.match(/.{2}/g)?.join(':') ?? null;
}

export function signalQuality(signalDbm: number | null): SignalQuality {
	if (signalDbm === null) return 'unknown';
	return classifyMetric('signalDbm', signalDbm);
}

export function deriveRetryPercent(
	previous: { txRetries: number | null; txAttempts: number | null } | null,
	current: { txRetries: number | null; txAttempts: number | null }
): number | null {
	if (
		!previous ||
		previous.txRetries === null ||
		previous.txAttempts === null ||
		current.txRetries === null ||
		current.txAttempts === null
	) {
		return null;
	}

	const retryDelta = current.txRetries - previous.txRetries;
	const attemptDelta = current.txAttempts - previous.txAttempts;
	if (attemptDelta <= 0 || retryDelta < 0) return null;
	return Math.min(100, Math.max(0, (retryDelta / attemptDelta) * 100));
}

export function normalizeStation(raw: RawStation): NormalizedStation | null {
	if (raw.is_wired === true) return null;

	const mac = normalizeMac(raw.mac);
	if (!mac) return null;

	const signalCandidate = asNumber(raw.signal);
	const rssiCandidate = asNumber(raw.rssi);
	const signalDbm =
		signalCandidate ?? (rssiCandidate !== null && rssiCandidate < 0 ? rssiCandidate : null);
	const noiseDbm = asNumber(raw.noise);

	return {
		mac,
		name: asString(raw.name) ?? asString(raw.hostname) ?? mac,
		ipAddress: asString(raw.ip) ?? asString(raw.ipv4) ?? null,
		uplinkDeviceId: normalizeMac(raw.ap_mac) ?? asString(raw.uplink_device_id),
		connected: true,
		signalDbm,
		noiseDbm,
		snrDb: signalDbm !== null && noiseDbm !== null ? signalDbm - noiseDbm : null,
		satisfaction: asNumber(raw.satisfaction),
		txRateKbps: asNumber(raw.tx_rate),
		rxRateKbps: asNumber(raw.rx_rate),
		channel: asNumber(raw.channel),
		radio: asString(raw.radio_name) ?? asString(raw.radio),
		radioProtocol: asString(raw.radio_proto),
		apMac: normalizeMac(raw.ap_mac),
		apName: asString(raw.ap_name) ?? asString(raw.ap_display_name),
		txRetries: asNumber(raw.tx_retries),
		txAttempts: asNumber(raw.wifi_tx_attempts)
	};
}

export function deviceNamesByMac(devices: RawStation[]): Map<string, string> {
	const names = new Map<string, string>();
	for (const device of devices) {
		const mac = normalizeMac(device.mac);
		const name = asString(device.name) ?? asString(device.hostname);
		if (mac && name) names.set(mac, name);
	}
	return names;
}

export function resolveApName(
	station: { apMac: string | null; apName: string | null },
	deviceNames: Map<string, string>
): string | null {
	if (station.apName) return station.apName;
	if (!station.apMac) return null;
	return deviceNames.get(station.apMac) ?? null;
}
