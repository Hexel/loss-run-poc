const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const supportedFiles = [
    { name: 'loss-run.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
    { name: 'loss-run.csv', mimeType: 'text/csv', buffer: Buffer.from('policy_number,paid_amount\nPOL-100,100') },
    { name: 'loss-run.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('test xls upload') },
    { name: 'loss-run.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('test xlsx upload') },
    { name: 'loss-run.CSV', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('policy_number\nPOL-100') },
    { name: 'loss-run.XLSX', mimeType: '', buffer: Buffer.from('test untyped xlsx upload') },
];

for (const filename of ['workbench.html', 'insurance-history-form.html']) {
    test.describe(`${filename} upload formats`, () => {
        let requests;

        test.beforeEach(async ({ page }) => {
            requests = [];
            await page.route('**/document', async route => {
                requests.push(route.request().postDataBuffer().toString());
                await route.fulfill({
                    status: 202,
                    contentType: 'application/json',
                    body: JSON.stringify({ documentId: 'format-test' }),
                });
            });
            await page.route('**/documents/format-test', route => route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'SUCCEEDED', output: { policies: [], claims: [] } }),
            }));
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', filename)).href);
        });

        for (const file of supportedFiles) {
            test(`uploads ${file.name} through the document processor`, async ({ page }) => {
                const input = page.locator('input[type="file"]');
                await expect(input).toHaveAttribute('accept', '.pdf,.csv,.xls,.xlsx');
                await input.setInputFiles(file);
                await expect(page.locator('#uploaded-files tbody tr')).toHaveCount(1);
                await expect(page.locator('#uploaded-files')).toContainText(file.name);
                await expect(page.locator('#upload-error')).toBeHidden();
                expect(requests).toHaveLength(1);
                expect(requests[0]).toContain(`filename="${file.name}"`);
                expect(requests[0]).toContain(file.buffer.toString());
            });
        }

        test('uploads a mixed batch of PDF, CSV, and Excel files', async ({ page }) => {
            await page.locator('input[type="file"]').setInputFiles(supportedFiles.slice(0, 4));
            await expect(page.locator('#uploaded-files tbody tr')).toHaveCount(4);
            expect(requests).toHaveLength(4);
            await expect(page.locator('#upload-error')).toBeHidden();
        });

        test('rejects unsupported files before sending any part of the batch', async ({ page }) => {
            await page.locator('input[type="file"]').setInputFiles([
                supportedFiles[0],
                { name: 'loss-run.txt', mimeType: 'text/plain', buffer: Buffer.from('unsupported') },
            ]);
            await expect(page.locator('#upload-error')).toHaveText('Please choose PDF, CSV, or Microsoft Excel (.xls, .xlsx) files.');
            expect(requests).toHaveLength(0);
            await expect(page.locator('#uploaded-files')).toBeHidden();
        });
    });
}
