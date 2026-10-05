const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const workbenchUrl = pathToFileURL(path.resolve(__dirname, '..', 'workbench.html')).href;

for (const width of [1440, 390]) {
    test(`loss cost per unit chart updates and fits at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(workbenchUrl);
        const chart = page.locator('#loss-cost-per-unit-chart');
        await expect(chart).toContainText('Enter units');
        await page.evaluate(() => seedTestData());
        await expect(chart.locator('.loss-cost-undeveloped circle')).toHaveCount(4);
        await expect(chart.locator('.loss-cost-developed circle')).toHaveCount(4);
        await expect(chart.locator('.loss-cost-legend span')).toHaveText([
            'Undeveloped Loss Cost Per Unit', 'Developed Loss Cost Per Unit',
        ]);
        await expect(chart.locator('.loss-cost-developed .loss-cost-line')).toHaveCSS('stroke-dasharray', '6px, 5px');
        await expect(chart.locator('text').filter({ hasText: /^202\d$/ })).toHaveText(['2022', '2023', '2024', '2025']);
        await expect(chart.locator('.loss-cost-axis-title')).toHaveText(['Policy year', 'Loss cost per unit ($)']);
        await expect(chart).toHaveAttribute('aria-label', /2022: \$10,250\.00 per unit/);
        await expect(chart).toHaveAttribute('aria-label', /2025: \$40,000\.00 per unit/);
        await expect(chart.locator('polyline')).toHaveCount(0);
        const lagChart = page.locator('#average-reporting-lag-chart');
        await expect(lagChart.locator('circle')).toHaveCount(4);
        await expect(lagChart.locator('.summary-trend-axis-title').filter({ hasText: 'Reporting lag (days)' })).toHaveCount(1);
        await expect(lagChart.locator('text').filter({ hasText: /^202\d$/ })).toHaveText(['2022', '2023', '2024', '2025']);
        const lagBounds = await lagChart.locator('svg').boundingBox();
        expect(lagBounds.x + lagBounds.width).toBeLessThanOrEqual(width);
        await expect(page.locator('#average-reporting-lag')).toHaveText('6.4 days');
        for (const [year, value] of Object.entries({ 2025: '2.0', 2024: '1.75', 2023: '1.5', 2022: '1.25' })) {
            await expect(page.getByRole('spinbutton', { name: `LDF for policy year ${year}`, exact: true })).toHaveValue(value);
        }
        await expect(chart.locator('.loss-cost-developed circle title').last()).toHaveText('Developed Loss Cost Per Unit, 2025: $80,000.00 per unit');
        const svgBounds = await chart.locator('svg').boundingBox();
        expect(svgBounds.width).toBeGreaterThan(250);
        expect(svgBounds.width / svgBounds.height).toBeCloseTo(440 / 280, 2);
        expect(svgBounds.x + svgBounds.width).toBeLessThanOrEqual(width);
        await page.getByRole('spinbutton', { name: 'Units for policy year 2025', exact: true }).fill('2');
        await expect(chart).toHaveAttribute('aria-label', /2025: \$20,000\.00 per unit/);
        const ldf = page.getByRole('spinbutton', { name: 'LDF for policy year 2025', exact: true });
        const developedTitles = chart.locator('.loss-cost-developed circle title');
        const undevelopedTitles = chart.locator('.loss-cost-undeveloped circle title');
        await ldf.fill('1.5');
        const undevelopedY = Number(await chart.locator('.loss-cost-undeveloped circle').last().getAttribute('cy'));
        const developedY = Number(await chart.locator('.loss-cost-developed circle').last().getAttribute('cy'));
        expect(210 - developedY).toBeCloseTo((210 - undevelopedY) * 1.5, 5);
        expect(developedY).toBeGreaterThanOrEqual(40);
        await expect(developedTitles.last()).toHaveText('Developed Loss Cost Per Unit, 2025: $30,000.00 per unit');
        await expect(undevelopedTitles.last()).toHaveText('Undeveloped Loss Cost Per Unit, 2025: $20,000.00 per unit');
        await page.getByRole('spinbutton', { name: 'Units for policy year 2025', exact: true }).fill('4');
        await expect(developedTitles.last()).toHaveText('Developed Loss Cost Per Unit, 2025: $15,000.00 per unit');
        await expect(undevelopedTitles.last()).toHaveText('Undeveloped Loss Cost Per Unit, 2025: $10,000.00 per unit');
        await ldf.fill('0');
        await expect(developedTitles.last()).toHaveText('Developed Loss Cost Per Unit, 2025: $0.00 per unit');
        await ldf.fill('');
        await expect(chart.locator('.loss-cost-developed circle')).toHaveCount(3);
        await expect(chart.locator('.loss-cost-undeveloped circle')).toHaveCount(4);
        await ldf.fill('3');
        await expect(developedTitles.last()).toHaveText('Developed Loss Cost Per Unit, 2025: $30,000.00 per unit');
        await page.getByRole('spinbutton', { name: 'Units for policy year 2023', exact: true }).fill('0');
        await expect(chart.locator('circle')).toHaveCount(6);
        await expect(chart.locator('.loss-cost-line')).toHaveCount(4);
        await expect(chart).not.toHaveAttribute('aria-label', /2023:/);
        for (const input of await page.locator('.units-input').all()) await input.fill('');
        await expect(chart).toContainText('Enter units');
        await expect(chart.locator('svg')).toHaveCount(0);
    });
}

test('loss cost chart supports zero, a single year, year gaps, and clearing policies', async ({ page }) => {
    await page.goto(workbenchUrl);
    const chart = page.locator('#loss-cost-per-unit-chart');
    await page.evaluate(() => {
        renderSummaryLineChart('loss-cost-per-unit-chart', [{ policyYear: 2024 }], () => 0, '');
    });
    for (const point of await chart.locator('circle').all()) {
        await expect(point).toHaveAttribute('cx', '245');
        await expect(point).toHaveAttribute('cy', '210');
    }
    await expect(chart).toHaveAttribute('aria-label', /2024: \$0\.00 per unit/);
    await page.evaluate(() => {
        renderSummaryLineChart('loss-cost-per-unit-chart', [
            { policyYear: 2025, cost: 300 }, { policyYear: 2022, cost: 100 }, { policyYear: 2023, cost: 200 },
        ], row => row.cost, '');
    });
    const positions = await chart.locator('.loss-cost-undeveloped circle').evaluateAll(points => points.map(point => Number(point.getAttribute('cx'))));
    expect(positions).toEqual([95, 195, 395]);
    await page.evaluate(() => { clearPolicyList(); refreshDerivedViews(); });
    await expect(chart.locator('svg')).toHaveCount(0);
    await expect(chart).toContainText('Enter units');
});

test('yearly reporting lags exclude missing dates and update table, average, and chart', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const table = page.locator('#insurance-history-summary-table');
    const headers = await table.locator('thead th').allTextContents();
    expect(headers.slice(5, 8)).toEqual(['# Open Claims', 'Avg Reporting Lag', 'Total Paid']);
    await expect(table.locator('tbody .reporting-lag-cell')).toHaveText(['10 days', '6 days', '6.5 days', '3 days']);
    await expect(table.locator('tfoot .reporting-lag-cell')).toHaveText(['6.4 days', '—']);
    for (const row of await table.locator('tr').all()) {
        expect(await row.evaluate(element => Array.from(element.cells).reduce((sum, cell) => sum + cell.colSpan, 0))).toBe(14);
    }
    const policy2023 = page.locator('.policy-entry').filter({ has: page.locator('input[name$="[effectiveDate]"][value="2023-01-01"]') });
    await policy2023.getByLabel('Reported Date', { exact: true }).first().fill('');
    await expect(table.locator('tbody .reporting-lag-cell')).toHaveText(['10 days', '6 days', '8 days', '3 days']);
    await expect(page.locator('#average-reporting-lag')).toHaveText('6.8 days');
    await policy2023.getByLabel('Incident Date', { exact: true }).last().fill('');
    await expect(table.locator('tbody .reporting-lag-cell')).toHaveText(['10 days', '6 days', '—', '3 days']);
    await expect(page.locator('#average-reporting-lag')).toHaveText('6.3 days');
    const chart = page.locator('#average-reporting-lag-chart');
    await expect(chart.locator('circle')).toHaveCount(3);
    await expect(chart.locator('.summary-trend-line')).toHaveCount(2);
    const policy2024 = page.locator('.policy-entry').filter({ has: page.locator('input[name$="[effectiveDate]"][value="2024-01-01"]') });
    await policy2024.getByLabel('Incident Date', { exact: true }).fill('2024-02-28');
    await policy2024.getByLabel('Reported Date', { exact: true }).fill('2024-03-01');
    await expect(table.locator('tbody .reporting-lag-cell').nth(1)).toHaveText('2 days');
    await policy2024.getByLabel('Reported Date', { exact: true }).fill('2024-02-28');
    await expect(table.locator('tbody .reporting-lag-cell').nth(1)).toHaveText('0 days');
    await expect(chart).toHaveAttribute('aria-label', /2024: 0 days/);
    await page.getByRole('button', { name: 'Override premium for policy year 2025', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Premium for policy year 2025', exact: true }).fill('4000');
    await expect(table.locator('tbody tr').first().locator('td').nth(11)).toHaveText('1000%');
    await expect(table.locator('tfoot tr').last().locator('td').nth(7)).toHaveText('$8,200.00');
    await expect(table.locator('tbody .reporting-lag-cell').first()).toHaveText('10 days');
    for (const date of await page.getByLabel('Reported Date', { exact: true }).all()) await date.fill('');
    await expect(page.locator('#average-reporting-lag')).toHaveText('—');
    await expect(chart).toHaveText('No data');
    await page.evaluate(() => { clearPolicyList(); refreshDerivedViews(); });
    await expect(chart.locator('svg')).toHaveCount(0);
});

test('four-year average weights years equally and excludes older years; sample LDF includes 2021', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => {
        seedPolicies.push({ effectiveDate: '2021-01-01', expirationDate: '2022-01-01', insurer: 'Sample', coverageLines: [], claims: [
            { incidentDate: '2021-01-01', reportedDate: '2021-07-20', incurred: '100' },
        ] });
        seedTestData();
    });
    await expect(page.locator('#average-reporting-lag')).toHaveText('6.4 days');
    await expect(page.locator('#insurance-history-summary-foot .reporting-lag-cell').first()).toHaveText('45.1 days');
    await expect(page.getByRole('spinbutton', { name: 'LDF for policy year 2021', exact: true })).toHaveValue('1.0');
    await expect(page.locator('#average-reporting-lag-chart circle')).toHaveCount(5);
});

test('uploaded claim report dates populate reporting lag', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => {
        createPoliciesFromLossRun({ policies: [{ policy_number: 'TEST', effective_date: '2025-01-01' }], claims: [
            { policy_number: 'TEST', loss_date: '2025-01-01', reported_date: '2025-01-05' },
            { policy_number: 'TEST', loss_date: '2025-01-01', report_date: '2025-01-09' },
        ] });
        refreshDerivedViews();
    });
    await expect(page.getByLabel('Reported Date', { exact: true }).first()).toHaveValue('2025-01-05');
    await expect(page.locator('#insurance-history-summary-body .reporting-lag-cell')).toHaveText('6 days');
    await expect(page.locator('#average-reporting-lag')).toHaveText('6 days');
});
