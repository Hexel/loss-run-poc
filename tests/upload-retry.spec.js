const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const output = {
    policies: [{ policy_number: 'RETRY-100', carrier: 'Retry Insurer', effective_date: '2025-01-01', expiration_date: '2026-01-01', lines_of_coverage: [] }],
    claims: [{ policy_number: 'RETRY-100', claim_number: 'CLAIM-100', loss_date: '2025-03-04', claim_status: 'Closed', paid_amount: 2500 }],
};
const file = { name: 'retry.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF retry') };
const fulfill = (route, body, status = 200) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify(body),
});

test.beforeEach(async ({ page }) => {
    await page.route('**/scripts/01-config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: fs.readFileSync(path.join(root, 'scripts', '01-config.js'), 'utf8')
            .replace(/pollAttempts:\s*\d+/, 'pollAttempts: 2')
            .replace(/pollIntervalMs:\s*\d+/, 'pollIntervalMs: 0'),
    }));
});

for (const retryWith of ['button', 'console']) {
    test(`retries a timed-out upload using the ${retryWith} without uploading again`, async ({ page }) => {
        let uploads = 0;
        let polls = 0;
        let status = 'PROCESSING';
        await page.route('**/document', route => {
            uploads += 1;
            return fulfill(route, { documentId: 'retry-test' }, 202);
        });
        await page.route('**/documents/retry-test', route => {
            polls += 1;
            return fulfill(route, { status, output: status === 'SUCCEEDED' ? output : undefined });
        });
        await page.goto(pathToFileURL(path.join(root, 'workbench.html')).href);
        await page.locator('input[type="file"]').setInputFiles(file);
        const button = page.locator('#upload-error').getByRole('button', { name: 'Check again' });
        await expect(button).toBeVisible();
        await expect(page.locator('#upload-error')).toContainText('did not finish');
        expect(polls).toBe(2);
        await expect(page.locator('#page-loading-overlay')).toBeHidden();
        // A second timeout must leave a working retry button and the same ID.
        await button.click();
        await expect(button).toBeVisible();
        await expect(button).toBeEnabled();
        expect(polls).toBe(4);
        status = 'SUCCEEDED';
        if (retryWith === 'console') {
            await page.evaluate(() => window.retryDocument('retry-test'));
        } else {
            await button.click();
        }
        await expect(page.locator('#upload-error')).toBeHidden();
        await expect(page.locator('#uploaded-files tbody tr')).toHaveCount(1);
        await expect(page.locator('#uploaded-files')).toContainText(file.name);
        await expect(page.locator('input[name$="[policyNumber]"]').first()).toHaveValue('RETRY-100');
        await expect(page.locator('#page-loading-overlay')).toBeHidden();
        expect(uploads).toBe(1);
        expect(polls).toBe(5);
        expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith(APP_CONFIG.cachePrefix)))).toBe(true);
    });
}

test('batch retry retains completed files and checks each timed-out ID again', async ({ page }) => {
    let uploads = 0;
    const polls = {};
    let finished = false;
    await page.route('**/document', route => {
        uploads += 1;
        return fulfill(route, { documentId: `batch-${uploads}` }, 202);
    });
    await page.route('**/documents/batch-*', route => {
        const id = route.request().url().split('/').pop();
        polls[id] = (polls[id] || 0) + 1;
        const status = id === 'batch-1' || finished ? 'SUCCEEDED' : 'PROCESSING';
        return fulfill(route, { status, output: status === 'SUCCEEDED' ? output : undefined });
    });
    await page.goto(pathToFileURL(path.join(root, 'workbench.html')).href);
    await page.locator('input[type="file"]').setInputFiles([
        file,
        { ...file, name: 'second.pdf', buffer: Buffer.from('%PDF second') },
        { ...file, name: 'third.pdf', buffer: Buffer.from('%PDF third') },
    ]);
    const button = page.locator('#upload-error').getByRole('button', { name: 'Check again' });
    await expect(button).toBeVisible();
    expect(uploads).toBe(3);
    expect(polls).toEqual({ 'batch-1': 1, 'batch-2': 2, 'batch-3': 2 });
    finished = true;
    await button.click();
    await expect(page.locator('#uploaded-files tbody tr')).toHaveCount(3);
    await expect(page.locator('#upload-error')).toBeHidden();
    expect(uploads).toBe(3);
    expect(polls).toEqual({ 'batch-1': 1, 'batch-2': 3, 'batch-3': 3 });
});

for (const failure of ['FAILED', 'HTTP']) {
    test(`${failure} errors do not offer a timeout retry button`, async ({ page }) => {
        await page.route('**/document', route => fulfill(route, { documentId: 'failed-test' }, 202));
        await page.route('**/documents/failed-test', route => fulfill(route,
            failure === 'FAILED' ? { status: 'FAILED', statusMessage: 'Extraction failed' } : { message: 'Request failed' },
            failure === 'HTTP' ? 500 : 200,
        ));
        await page.goto(pathToFileURL(path.join(root, 'workbench.html')).href);
        await page.locator('input[type="file"]').setInputFiles(file);
        await expect(page.locator('#upload-error')).toBeVisible();
        await expect(page.locator('#upload-error button')).toHaveCount(0);
        await expect(page.locator('#page-loading-overlay')).toBeHidden();
    });
}

test('console retry polls an arbitrary document ID, populates the form, and returns its extraction', async ({ page }) => {
    let polls = 0;
    let finished = false;
    await page.route('**/documents/debug-test', route => {
        polls += 1;
        return fulfill(route, finished ? { status: 'SUCCEEDED', output } : { status: 'PROCESSING' });
    });
    await page.goto(pathToFileURL(path.join(root, 'workbench.html')).href);
    const message = await page.evaluate(() => window.retryDocument('debug-test').catch(error => error.message));
    expect(message).toContain('did not finish');
    await expect(page.locator('#upload-error button')).toHaveText('Check again');
    expect(polls).toBe(2);
    finished = true;
    const result = await page.evaluate(() => window.retryDocument('debug-test'));
    expect(result).toEqual({ status: 'SUCCEEDED', output });
    expect(polls).toBe(3);
    await page.evaluate(() => window.retryDocument('debug-test'));
    expect(polls).toBe(4);
    await expect(page.locator('.policy-entry')).toHaveCount(1);
    await expect(page.locator('input[name$="[policyNumber]"]').first()).toHaveValue('RETRY-100');
    await expect(page.locator('#insurer-0')).toHaveValue('Retry Insurer');
    await expect(page.locator('#effective-date-0')).toHaveValue('2025-01-01');
    await expect(page.locator('.claim-entry')).toHaveCount(1);
    await expect(page.locator('#claim-paid-0-0')).toHaveValue('$2,500');
    await expect(page.locator('#upload-error')).toBeHidden();
    await expect(page.locator('#page-loading-overlay')).toBeHidden();
});

test('console retry rejects a succeeded response without extraction output without clearing the form', async ({ page }) => {
    let extraction = output;
    await page.route('**/documents/debug-test', route => fulfill(route, { status: 'SUCCEEDED', output: extraction }));
    await page.goto(pathToFileURL(path.join(root, 'workbench.html')).href);
    await page.evaluate(() => window.retryDocument('debug-test'));
    extraction = undefined;
    const message = await page.evaluate(() => window.retryDocument('debug-test').catch(error => error.message));
    expect(message).toBe('The loss run could not be extracted.');
    await expect(page.locator('#upload-error')).toHaveText(message);
    await expect(page.locator('input[name$="[policyNumber]"]').first()).toHaveValue('RETRY-100');
    await expect(page.locator('.claim-entry')).toHaveCount(1);
    await expect(page.locator('#page-loading-overlay')).toBeHidden();
});
