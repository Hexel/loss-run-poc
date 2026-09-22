const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const workspaceRoot = path.resolve(__dirname, '..');
const sampleDirectory = path.join(workspaceRoot, 'samples');
const sampleFiles = fs.readdirSync(sampleDirectory)
    .filter(fileName => fileName.toLowerCase().endsWith('.pdf'))
    .sort()
    .slice(0, 2)
    .map(fileName => path.join(sampleDirectory, fileName));

if (sampleFiles.length < 2) {
    throw new Error('The samples directory must contain at least two PDF files.');
}

const extractionResponses = [
    {
        valuation_date: '2024-12-31',
        policies: [
            {
                policy_number: 'POL-100',
                effective_date: '2023-01-01',
                expiration_date: '2024-01-01',
                carrier: { name: 'Older Carrier' },
                lines_of_coverage: ['General Liability'],
                premium: '1000'
            },
            {
                policy_number: 'POL-OLD',
                effective_date: '2022-01-01',
                expiration_date: '2023-01-01',
                carrier: { name: 'Older Only Carrier' },
                lines_of_coverage: ['Auto Liability'],
                premium: '800'
            }
        ],
        claims: [
            {
                claim_number: 'CL-1',
                policy_number: 'POL-100',
                loss_date: '2023-06-01',
                claim_status: 'open',
                incurred_amount: '10000',
                paid_amount: '100',
                reserved_amount: '1000',
                loss_description: 'Original claim details'
            },
            {
                claim_number: 'CL-OLD',
                policy_number: 'POL-OLD',
                loss_date: '2022-05-01',
                claim_status: 'closed',
                incurred_amount: '5000',
                paid_amount: '5000',
                reserved_amount: '0',
                loss_description: 'Older only claim'
            }
        ]
    },
    {
        valuation_date: '2025-12-31',
        policies: [
            {
                policy_number: 'POL-100',
                effective_date: null,
                expiration_date: null,
                carrier: { name: 'Newer Carrier' },
                lines_of_coverage: [],
                premium: '2000'
            },
            {
                policy_number: 'POL-NEW',
                effective_date: '2024-01-01',
                expiration_date: '2025-01-01',
                carrier: { name: 'Newer Only Carrier' },
                lines_of_coverage: ['Auto Physical Damage'],
                premium: '1200'
            }
        ],
        claims: [
            {
                claim_number: 'CL-1',
                policy_number: 'POL-100',
                loss_date: null,
                claim_status: 'closed',
                incurred_amount: '30000',
                paid_amount: null,
                reserved_amount: '5000',
                loss_description: 'Updated claim details'
            },
            {
                claim_number: 'CL-NEW',
                policy_number: 'POL-NEW',
                loss_date: '2024-07-01',
                claim_status: 'open',
                incurred_amount: '7000',
                paid_amount: '0',
                reserved_amount: '7000',
                loss_description: 'Newer only claim'
            }
        ]
    }
];

async function mockDocumentApi(page) {
    await page.route('**/document', async route => {
        const request = route.request();
        const body = request.postData() || '';
        const responseIndex = body.includes(path.basename(sampleFiles[1])) ? 1 : 0;
        await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({ documentId: `test-document-${responseIndex + 1}` })
        });
    });

    await page.route('**/documents/test-document-*', async route => {
        const documentId = route.request().url().split('/').pop();
        const responseIndex = documentId.endsWith('-2') ? 1 : 0;
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                status: 'SUCCEEDED',
                output: extractionResponses[responseIndex]
            })
        });
    });
}

async function openForm(page) {
    await page.goto(pathToFileURL(path.join(workspaceRoot, 'insurance-history-form.html')).href);
    await expect(page.locator('#loss-run-upload-form')).toBeVisible();
}

async function uploadSampleFiles(page) {
    await page.locator('input[type="file"]').setInputFiles(sampleFiles);
    await expect(page.locator('#uploaded-files')).toBeVisible();
    await expect(page.locator('#uploaded-files tbody tr')).toHaveCount(2);
}

test.describe('insurance history form', () => {
    test.beforeEach(async ({ page }) => {
        await mockDocumentApi(page);
        await openForm(page);
    });

    test('merges multiple files by policy and claim keys with valuation precedence', async ({ page }) => {
        await uploadSampleFiles(page);

        await expect(page.locator('.policy-entry')).toHaveCount(3);
        await expect(page.locator('.claim-entry')).toHaveCount(3);

        const duplicatePolicy = page.locator('[name="policies[0][policyNumber]"]');
        await expect(duplicatePolicy).toHaveValue('POL-100');
        await expect(page.locator('[name="policies[0][insurer]"]')).toHaveValue('Newer Carrier');
        await expect(page.locator('[name="policies[0][effectiveDate]"]')).toHaveValue('2023-01-01');
        await expect(page.locator('[name="policies[0][premium]"]')).toHaveValue('2000');

        const duplicateClaim = page.locator('.policy-entry').first().locator('.claim-entry').first();
        await expect(duplicateClaim.locator('input[name$="[incurred]"]')).toHaveValue('30000');
        await expect(duplicateClaim.locator('input[name$="[paid]"]')).toHaveValue('100');
        await expect(duplicateClaim.locator('input[name$="[reserved]"]')).toHaveValue('5000');
        await expect(duplicateClaim.locator('input[name$="[details]"]')).toHaveValue('Updated claim details');

        await expect(page.locator('#insurance-history-summary-table')).toBeVisible();
        await expect(page.locator('#large-losses-list')).toContainText('$30,000.00');
    });

    test('sorts uploaded files and changes the PDF preview source by row', async ({ page }) => {
        await uploadSampleFiles(page);

        const rows = page.locator('#uploaded-files tbody tr');
        await expect(rows.nth(0).locator('td').nth(0)).toHaveText(path.basename(sampleFiles[0]));
        await expect(rows.nth(1).locator('td').nth(0)).toHaveText(path.basename(sampleFiles[1]));

        await page.locator('button[data-sort="valuationDate"]').click();
        await expect(rows.nth(0).locator('td').nth(1)).toHaveText('2024-12-31');
        await expect(rows.nth(1).locator('td').nth(1)).toHaveText('2025-12-31');

        await page.locator('button[data-sort="valuationDate"]').click();
        await expect(rows.nth(0).locator('td').nth(1)).toHaveText('2025-12-31');

        await rows.nth(0).click();
        await expect(page.locator('#file-preview')).toHaveAttribute('src', /^blob:/);
    });

    test('opens and closes the full-size file preview modal', async ({ page }) => {
        await expect(page.locator('#maximize-preview')).toBeHidden();
        await uploadSampleFiles(page);

        await page.locator('#uploaded-files tbody tr').first().click();
        await expect(page.locator('#maximize-preview')).toBeVisible();
        await page.locator('#maximize-preview').click();

        await expect(page.locator('#file-preview-modal')).toBeVisible();
        await expect(page.locator('#file-preview-modal-frame')).toHaveAttribute('src', /^blob:/);

        await page.locator('#close-preview').click();
        await expect(page.locator('#file-preview-modal')).not.toBeVisible();
    });

    test('supports manual policy and claim entry with derived views', async ({ page }) => {
        await page.locator('#add-policy').click();
        const policy = page.locator('.policy-entry').first();
        await policy.locator('input[name$="[effectiveDate]"]').fill('2020-01-01');
        await expect(policy.locator('input[name$="[expirationDate]"]')).toHaveValue('2021-01-01');
        await policy.locator('input[name$="[insurer]"]').fill('Manual Carrier');
        await policy.locator('input[name$="[policyNumber]"]').fill('MANUAL-01');
        await policy.locator('.add-claims-button').click();

        const claim = policy.locator('.claim-entry').first();
        await claim.locator('input[name$="[incidentDate]"]').fill('2020-06-01');
        await claim.locator('input[name$="[incurred]"]').fill('30000');
        await claim.locator('input[name$="[paid]"]').fill('10000');
        await claim.locator('input[name$="[reserved]"]').fill('20000');
        await claim.locator('input[name$="[details]"]').fill('Manual large loss');

        await expect(page.locator('#insurance-history-summary-table')).toBeVisible();
        await expect(page.locator('#insurance-history-summary-body')).toContainText('2020');
        await expect(page.locator('#large-losses-list')).toContainText('$30,000.00');
        await expect(claim.locator('input[name$="[details]"]')).toHaveValue('Manual large loss');
        await expect(policy.locator('.add-prior-policy')).toBeVisible();
        await expect(policy.locator('.add-renewal-policy')).toBeVisible();

        await policy.locator('.add-prior-policy').click();
        await expect(page.locator('.policy-entry')).toHaveCount(2);
        await page.locator('.policy-entry').last().locator('.remove-policy').click();
        await expect(page.locator('.policy-entry')).toHaveCount(1);
    });
});
