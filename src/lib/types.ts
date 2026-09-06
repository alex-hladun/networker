export type SignalQuality = 'excellent' | 'ideal' | 'ok' | 'bad' | 'terrible' | 'unknown';

export type DiscoveredClient = {
	mac: string;
	name: string;
	ipAddress: string | null;
	uplinkDeviceId: string | null;
	connected: boolean;
};

export type MetricSample = {
	sampledAt: number;
	online: boolean;
	signalDbm: number | null;
	noiseDbm: number | null;
	snrDb: number | null;
	satisfaction: number | null;
	txRateKbps: number | null;
	rxRateKbps: number | null;
	retryPercent: number | null;
	channel: number | null;
	radio: string | null;
	radioProtocol: string | null;
	apMac: string | null;
	apName: string | null;
	txRetries: number | null;
	txAttempts: number | null;
};

export type Beacon = {
	mac: string;
	name: string;
	site: string;
	enabled: boolean;
	createdAt: number;
	latest: MetricSample | null;
	quality: SignalQuality;
};

export type CollectorStatus = {
	mode: 'unifi' | 'fixture';
	configured: boolean;
	running: boolean;
	lastPollStartedAt: number | null;
	lastPollSucceededAt: number | null;
	nextPollAt: number | null;
	lastError: string | null;
	warning: string | null;
	controllerVersion: string | null;
	discoveredClientCount: number;
	selectedBeaconCount: number;
	pollIntervalSeconds: number;
	retentionDays: number;
};

export type HistoryPoint = MetricSample;

export type BeaconSeries = {
	mac: string;
	name: string;
	points: HistoryPoint[];
};

export type MetricsResponse = {
	from: number;
	to: number;
	bucketSeconds: number;
	series: BeaconSeries[];
};

export type PublicConnection = {
	unifiUrl: string;
	username: string;
	site: string;
	verifyTls: boolean;
	configured: boolean;
	hasApiKey: boolean;
	hasUsername: boolean;
	hasPassword: boolean;
};
