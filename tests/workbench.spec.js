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
    await page.getByRole('textbox', { name: 'Premium for policy year 2025', exact: true }).fill('4000');
    await expect(table.locator('tbody tr').first().locator('td').nth(11)).toHaveText('1000%');
    await expect(table.locator('tfoot tr').last().locator('td').nth(7)).toHaveText('$242,500.00');
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

test('generated summary inputs use inline-cell-input styling', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const summary = page.locator('#insurance-history-summary-body');
    for (const className of ['units-input', 'ldf-input']) {
        const inputs = summary.locator(`input.${className}`);
        await expect(inputs).toHaveCount(4);
        for (const input of await inputs.all()) await expect(input).toHaveClass(/\binline-cell-input\b/);
    }
    await page.getByRole('button', { name: 'Override claims for policy year 2025', exact: true }).click();
    const claimOverride = summary.locator('input.summary-override');
    await expect(claimOverride).toHaveClass(/\binline-cell-input\b/);
    await claimOverride.fill('2');
    await expect(claimOverride).toHaveValue('2');
    await page.getByRole('button', { name: 'Override premium for policy year 2025', exact: true }).click();
    const premiumOverride = summary.locator('input.premium-override');
    await expect(premiumOverride).toHaveClass(/\binline-cell-input\b/);
    await premiumOverride.fill('80000');
    await expect(premiumOverride).toHaveValue('$80,000');
});

test('USD overrides group thousands, preserve decimals and numeric premium calculations', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const summary = page.locator('#insurance-history-summary-body');
    for (const column of ['paid amount', 'reserve amount', 'incurred amount']) {
        await page.getByRole('button', { name: `Override ${column} for policy year 2025`, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Override premium for policy year 2025', exact: true }).click();
    const usdInputs = summary.locator('input.usd-input');
    await expect(usdInputs).toHaveCount(4);
    for (const input of await usdInputs.all()) {
        await expect(input).toHaveClass(/\binline-cell-input\b/);
        await expect(input).toHaveAttribute('type', 'text');
        await expect(input).toHaveAttribute('inputmode', 'decimal');
        await input.fill('1234567.50');
        await expect(input).toHaveValue('$1,234,567.50');
        await input.fill('$987,654.32');
        await expect(input).toHaveValue('$987,654.32');
        await input.fill('1234.');
        await expect(input).toHaveValue('$1,234.');
        await input.pressSequentially('50');
        await expect(input).toHaveValue('$1,234.50');
        await input.fill('');
        await expect(input).toHaveValue('');
        await input.fill('0');
        await expect(input).toHaveValue('$0');
    }
    await page.getByRole('textbox', { name: 'Override incurred amount for policy year 2025', exact: true }).fill('40000');
    const premium = summary.locator('input.premium-override');
    await premium.fill('80000');
    await expect(premium).toHaveValue('$80,000');
    await expect(summary.locator('tr').first().locator('td').nth(11)).toHaveText('50%');
    await expect(page.locator('#insurance-history-summary-foot tr').last().locator('td').nth(7)).toHaveText('$318,500.00');
    await premium.fill('abc');
    expect(await premium.evaluate(input => input.validity.valid)).toBe(false);
    await premium.fill('-1000');
    expect(await premium.evaluate(input => input.validity.valid)).toBe(false);
    await premium.fill('1234');
    expect(await premium.evaluate(input => input.validity.valid)).toBe(true);
    await premium.press('Home');
    await premium.pressSequentially('9');
    await expect(premium).toHaveValue('$91,234');
    expect(await premium.evaluate(input => input.selectionStart)).toBe(2);
    for (const input of await summary.locator('.units-input, .ldf-input').all()) {
        await expect(input).toHaveAttribute('type', 'number');
        await expect(input).not.toHaveClass(/\busd-input\b/);
    }
    await page.getByRole('button', { name: 'Override claims for policy year 2024', exact: true }).click();
    const claimOverride = summary.locator('input.summary-override:not(.usd-input)');
    await expect(claimOverride).toHaveAttribute('type', 'number');
});

for (const width of [1440, 390]) {
    test(`summary overrides format percentages and revert calculated values at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(workbenchUrl);
        await page.evaluate(() => seedTestData());
        const row = page.locator('#insurance-history-summary-body tr').first();
        await expect(row.locator('.claim-count-cell')).toHaveCSS('white-space', 'nowrap');
        const fields = ['claims', 'open claims', 'average reporting lag', 'paid amount', 'reserve amount', 'incurred amount', 'premium', 'loss ratio', 'developed loss ratio'];
        for (const field of fields) {
            const label = `${field} for policy year 2025`;
            const edit = page.getByRole('button', { name: `Override ${label}`, exact: true });
            const cell = row.locator('td').nth(await edit.evaluate(button => button.closest('td').cellIndex));
            const calculated = (await cell.textContent()).trim();
            await edit.click();
            const input = cell.locator('input');
            await expect(input).toHaveClass(/\binline-cell-input\b/);
            await expect(cell.locator('.summary-edit')).toHaveCount(0);
            const isPct = field.includes('loss ratio');
            if (isPct) {
                await expect(input).toHaveClass(/\bpct-input\b/);
                await expect(input).toHaveAttribute('type', 'text');
                await input.fill('12.');
                await expect(input).toHaveValue('12.%');
                await input.pressSequentially('50');
                await expect(input).toHaveValue('12.50%');
                await input.fill('25.5%');
                await expect(input).toHaveValue('25.5%');
                await input.fill('0');
                await expect(input).toHaveValue('0%');
                await input.fill('');
                await expect(input).toHaveValue('');
            }
            await input.fill('1234');
            await expect(input).toHaveValue(isPct ? '1234%' : ['paid amount', 'reserve amount', 'incurred amount', 'premium'].includes(field) ? '$1,234' : '1234');
            const revert = page.getByRole('button', { name: `Revert ${label}`, exact: true });
            await expect(revert).toBeVisible();
            await revert.click();
            await expect(cell.locator('input')).toHaveCount(0);
            expect((await cell.textContent()).trim()).toBe(calculated);
            await expect(page.getByRole('button', { name: `Override ${label}`, exact: true })).toBeFocused();
        }
    });
}

test('average LDF and developed ratio recalculate for LDF, premium, overrides and reverts', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const footer = page.locator('#insurance-history-summary-foot');
    const ldfAverage = footer.locator('.average-ldf');
    const ratioAverage = footer.locator('.average-developed-loss-ratio');
    const yearRatios = [40000 * 2 / 82000, 18000 * 1.75 / 81000, 35000 * 1.5 / 79500, 41000 * 1.25 / 78000];
    const formatMean = values => `${(values.reduce((sum, value) => sum + value, 0) / values.length * 100).toFixed(1).replace(/\.0$/, '')}%`;
    await expect(ldfAverage).toHaveText('1.625');
    await expect(ratioAverage).toHaveText(formatMean(yearRatios));
    const ldf = page.getByRole('spinbutton', { name: 'LDF for policy year 2025', exact: true });
    await ldf.fill('3');
    await expect(ldfAverage).toHaveText('1.875');
    yearRatios[0] = 40000 * 3 / 82000;
    await expect(ratioAverage).toHaveText(formatMean(yearRatios));
    await page.getByRole('button', { name: 'Override developed loss ratio for policy year 2025', exact: true }).click();
    const override = page.getByRole('textbox', { name: 'Override developed loss ratio for policy year 2025', exact: true });
    await override.fill('10');
    await expect(ratioAverage).toHaveText(formatMean([0.1, ...yearRatios.slice(1)]));
    await ldf.fill('4');
    await expect(override).toHaveValue('10%');
    await page.getByRole('button', { name: 'Revert developed loss ratio for policy year 2025', exact: true }).click();
    yearRatios[0] = 40000 * 4 / 82000;
    await expect(ratioAverage).toHaveText(formatMean(yearRatios));
    await page.getByRole('button', { name: 'Override premium for policy year 2025', exact: true }).click();
    await page.getByRole('textbox', { name: 'Premium for policy year 2025', exact: true }).fill('80000');
    await expect(ratioAverage).toHaveText(formatMean([2, ...yearRatios.slice(1)]));
    await page.getByRole('button', { name: 'Revert premium for policy year 2025', exact: true }).click();
    await expect(ratioAverage).toHaveText(formatMean(yearRatios));
    await expect(footer.locator('tr').last().locator('td').nth(7)).toHaveText('$320,500.00');
    await ldf.fill('');
    await expect(ldfAverage).toHaveText('1.5');
    await expect(ratioAverage).toHaveText(formatMean(yearRatios.slice(1)));
});

test('loss cost chart has styled value labels for both series that update with units and LDF', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const chart = page.locator('#loss-cost-per-unit-chart');
    for (const series of ['undeveloped', 'developed']) {
        const group = chart.locator(`svg .loss-cost-${series}`);
        await expect(group.locator('text.summary-trend-axis-title')).toHaveCount(4);
        for (let index = 0; index < 4; index += 1) {
            const label = group.locator('text').nth(index);
            const point = group.locator('circle').nth(index);
            await expect(label).toHaveAttribute('x', await point.getAttribute('cx'));
            await expect(label).toHaveCSS('font-weight', '600');
            expect(await label.textContent()).toMatch(/^\$/);
        }
    }
    await page.getByRole('spinbutton', { name: 'Units for policy year 2025', exact: true }).fill('1');
    await expect(chart.locator('svg .loss-cost-undeveloped text').last()).toHaveText('$40K');
    await expect(chart.locator('svg .loss-cost-developed text').last()).toHaveText('$80K');
    await page.getByRole('spinbutton', { name: 'LDF for policy year 2025', exact: true }).fill('1');
    await expect(chart.locator('svg .loss-cost-developed text').last()).toHaveText('$40K');
    const undevelopedLabel = chart.locator('svg .loss-cost-undeveloped text').last();
    const developedLabel = chart.locator('svg .loss-cost-developed text').last();
    expect(await undevelopedLabel.getAttribute('y')).not.toBe(await developedLabel.getAttribute('y'));
});

for (const width of [1440, 390]) {
    test(`reporting lag chart and averages update live on overrides and revert at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(workbenchUrl);
        await page.evaluate(() => seedTestData());
        const chart = page.locator('#average-reporting-lag-chart');
        const average = page.locator('#insurance-history-summary-foot tr:first-child .reporting-lag-cell');
        const originalLine = await chart.locator('.summary-trend-line').getAttribute('d');
        await page.getByRole('button', { name: 'Override average reporting lag for policy year 2025', exact: true }).click();
        const latest = page.getByRole('spinbutton', { name: 'Override average reporting lag for policy year 2025', exact: true });
        await latest.fill('20.5');
        await expect(latest).toBeFocused();
        await expect(chart.locator('circle title').last()).toHaveText('2025: 20.5 days');
        await expect(chart).toHaveAttribute('aria-label', /2025: 20\.5 days/);
        await expect(average).toHaveText('9 days');
        expect(await chart.locator('.summary-trend-line').getAttribute('d')).not.toBe(originalLine);
        await latest.fill('');
        await expect(chart.locator('circle')).toHaveCount(3);
        await expect(chart).not.toHaveAttribute('aria-label', /2025:/);
        await expect(average).toHaveText('5.2 days');
        await latest.fill('0');
        await expect(chart.locator('circle title').last()).toHaveText('2025: 0 days');
        await expect(average).toHaveText('3.9 days');
        await latest.fill('20.5');
        await page.getByRole('button', { name: 'Override average reporting lag for policy year 2024', exact: true }).click();
        await page.getByRole('spinbutton', { name: 'Override average reporting lag for policy year 2024', exact: true }).fill('14');
        await expect(chart.locator('circle title').nth(2)).toHaveText('2024: 14 days');
        await expect(average).toHaveText('11 days');
        await page.getByRole('button', { name: 'Revert average reporting lag for policy year 2025', exact: true }).click();
        await expect(chart.locator('circle title').last()).toHaveText('2025: 10 days');
        await expect(average).toHaveText('8.4 days');
        await page.getByRole('button', { name: 'Revert average reporting lag for policy year 2024', exact: true }).click();
        await expect(average).toHaveText('6.4 days');
        await expect(chart.locator('.summary-trend-line')).toHaveAttribute('d', originalLine);
        for (const year of [2025, 2024, 2023, 2022]) {
            await page.getByRole('button', { name: `Override average reporting lag for policy year ${year}`, exact: true }).click();
            await page.getByRole('spinbutton', { name: `Override average reporting lag for policy year ${year}`, exact: true }).fill('');
        }
        await expect(chart).toHaveText('No data');
        await expect(average).toHaveText('—');
        await page.getByRole('button', { name: 'Revert average reporting lag for policy year 2025', exact: true }).click();
        await expect(chart.locator('circle')).toHaveCount(1);
        await expect(average).toHaveText('10 days');
    });
}
