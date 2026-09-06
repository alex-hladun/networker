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
	await page.getByRole('button', { name: '1H' }).click();
	await page.getByRole('button', { name: 'SNR', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'SNR over time' })).toBeVisible();
});

test('rejects an invalid beacon payload', async ({ request }) => {
	const response = await request.post('/api/beacons', {
		data: { mac: 'not-a-mac', name: 'Broken beacon' }
	});

	expect(response.status()).toBe(400);
	expect(await response.json()).toEqual({ error: 'The MAC address is invalid.' });
});
