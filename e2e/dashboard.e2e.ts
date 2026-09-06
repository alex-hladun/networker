import { expect, test } from '@playwright/test';

test('selects a fixture beacon and changes the history view', async ({ page }) => {
	await page.goto('/');
	await expect(
		page.getByRole('heading', { name: 'See the signal your devices actually receive.' })
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Wi-Fi clients' })).toBeVisible();

	const officeRow = page.locator('.client-row').filter({ hasText: 'Office beacon' });
	await officeRow.getByRole('button', { name: 'Add Office beacon as a beacon' }).click();

	const officeCard = page.locator('.beacon-card').filter({ hasText: 'Office beacon' });
	await expect(officeCard).toBeVisible();
	await expect(officeCard.getByText('Office AP')).toBeVisible();
	const reconnect = officeCard.getByRole('button', { name: 'Reconnect Office beacon' });
	await expect(reconnect).toBeEnabled();
	await reconnect.click();
	await expect(reconnect).toBeEnabled();
	await expect(page.locator('.toast')).toHaveCount(0);
	await expect(page.getByRole('button', { name: '5m', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: '1m', exact: true }).click();
	await expect(page.getByRole('button', { name: '1m', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: '1H' }).click();
	await page.getByRole('button', { name: 'SNR', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'SNR over time' })).toBeVisible();
	await expect(page.getByLabel('Quality zones')).toBeVisible();
});

test('rejects an invalid beacon payload', async ({ request }) => {
	const response = await request.post('/api/beacons', {
		data: { mac: 'not-a-mac', name: 'Broken beacon' }
	});

	expect(response.status()).toBe(400);
	expect(await response.json()).toEqual({ error: 'The MAC address is invalid.' });
});

test('reconnects a fixture client', async ({ request }) => {
	const response = await request.post('/api/clients/reconnect', {
		data: { mac: '02:00:00:00:00:11' }
	});

	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ ok: true, mac: '02:00:00:00:00:11' });
});

test('rejects an invalid reconnect payload', async ({ request }) => {
	const response = await request.post('/api/clients/reconnect', {
		data: { mac: 'not-a-mac' }
	});

	expect(response.status()).toBe(400);
	expect(await response.json()).toEqual({ error: 'The MAC address is invalid.' });
});
