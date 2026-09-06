import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'pnpm build && pnpm preview --host 127.0.0.1',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: false,
		env: {
			...process.env,
			UNIFI_FIXTURE_MODE: 'true',
			DATABASE_PATH: `/tmp/networker-e2e-${process.pid}.sqlite`,
			POLL_INTERVAL_SECONDS: '10'
		}
	},
	testMatch: '**/*.e2e.{ts,js}',
	use: {
		baseURL: 'http://127.0.0.1:4173',
		trace: 'retain-on-failure'
	}
});
