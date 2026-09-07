import { describe, expect, it } from 'vitest';
import {
	deriveRetryPercent,
	deviceNamesByMac,
	normalizeMac,
	normalizeStation,
	resolveApName,
	signalQuality
} from './normalize';

describe('UniFi station normalization', () => {
	it('maps the classic client fields and calculated SNR', () => {
		const station = normalizeStation({
			mac: 'AA-BB-CC-DD-EE-FF',
			hostname: 'Kitchen speaker',
			ip: '192.168.1.41',
			signal: -57,
			rssi: 39,
			noise: -96,
			satisfaction: 98,
			tx_rate: 351_000,
			rx_rate: 520_000,
			channel: 149,
			radio_name: 'wifi1',
			radio_proto: 'ax',
			ap_mac: '00:11:22:33:44:55',
			ap_name: 'Office AP',
			tx_retries: 420,
			wifi_tx_attempts: 12_000
		});

		expect(station).toMatchObject({
			mac: 'aa:bb:cc:dd:ee:ff',
			name: 'Kitchen speaker',
			signalDbm: -57,
			noiseDbm: -96,
			snrDb: 39,
			txRateKbps: 351_000,
			rxRateKbps: 520_000,
			radioProtocol: 'ax',
			apMac: '00:11:22:33:44:55',
			apName: 'Office AP'
		});
	});

	it('resolves an AP name from the UniFi device inventory', () => {
		const names = deviceNamesByMac([
			{ mac: '00:11:22:33:44:55', name: 'Office AP' },
			{ mac: 'AA:BB:CC:DD:EE:00', hostname: 'Garage AP' }
		]);

		expect(names.get('00:11:22:33:44:55')).toBe('Office AP');
		expect(resolveApName({ apMac: 'aa:bb:cc:dd:ee:00', apName: null }, names)).toBe('Garage AP');
		expect(resolveApName({ apMac: '00:11:22:33:44:55', apName: 'Kitchen AP' }, names)).toBe(
			'Kitchen AP'
		);
	});

	it('rejects wired and malformed clients', () => {
		expect(normalizeStation({ mac: 'aa:bb:cc:dd:ee:ff', is_wired: true })).toBeNull();
		expect(normalizeStation({ mac: 'not-a-mac' })).toBeNull();
		expect(normalizeMac('AABB.CCDD.EEFF')).toBe('aa:bb:cc:dd:ee:ff');
	});
});

describe('metric calculations', () => {
	it('classifies practical Wi-Fi signal thresholds', () => {
		expect(signalQuality(-49)).toBe('excellent');
		expect(signalQuality(-55)).toBe('ideal');
		expect(signalQuality(-60)).toBe('ideal');
		expect(signalQuality(-71)).toBe('bad');
		expect(signalQuality(-81)).toBe('terrible');
		expect(signalQuality(null)).toBe('unknown');
	});

	it('derives retries from consecutive cumulative counters', () => {
		expect(
			deriveRetryPercent({ txRetries: 100, txAttempts: 1000 }, { txRetries: 112, txAttempts: 1200 })
		).toBe(6);
		expect(
			deriveRetryPercent({ txRetries: 100, txAttempts: 1000 }, { txRetries: 5, txAttempts: 20 })
		).toBeNull();
	});
});
