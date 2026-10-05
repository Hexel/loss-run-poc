const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

async function pressFive(page, key) {
    for (let i = 0; i < 5; i += 1) await page.keyboard.press(key);
}

async function policyHistory(page) {
    return page.locator('.policy-entry').evaluateAll(policies => policies.map(policy => {
        const field = name => policy.querySelector(`input[name$="[${name}]"]`).value;
        const claims = Array.from(policy.querySelectorAll('.claim-entry')).map(claim => {
            const value = name => claim.querySelector(`[name$="[${name}]"]`).value;
            return {
                incidentDate: value('incidentDate'), reportedDate: value('reportedDate'),
                incurred: readMoney(value('incurred')), paid: readMoney(value('paid')),
                reserved: readMoney(value('reserved')), details: value('details'),
            };
        });
        return {
            effectiveDate: field('effectiveDate'), expirationDate: field('expirationDate'),
            premium: readMoney(field('premium')), claims,
            total: claims.reduce((sum, claim) => sum + claim.incurred, 0),
        };
    }));
}

const scenarios = [
    { key: 'a', totals: [315000, 200000, 110000, 45000, 12000], counts: [6, 5, 4, 3, 2], lags: [3, 6, 10, 16, 24] },
    { key: 'b', totals: [100000, 102000, 99000, 101000, 103000], counts: [4, 4, 4, 4, 4], lags: [24, 16, 10, 6, 3] },
    { key: 'c', totals: [12000, 45000, 110000, 200000, 315000], counts: [2, 3, 4, 5, 6], lags: [8, 8, 8, 8, 8] },
];

for (const file of ['workbench.html', 'insurance-history-form.html']) {
    for (const scenario of scenarios) {
        test(`${file}: five ${scenario.key} presses load realistic five-year history`, async ({ page }) => {
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', file)).href);
            const before = await policyHistory(page);
            for (let i = 0; i < 4; i += 1) await page.keyboard.press(scenario.key);
            expect(await policyHistory(page)).toEqual(before);
            await page.keyboard.press(scenario.key);
            const history = await policyHistory(page);
            expect(history.map(policy => policy.total)).toEqual(scenario.totals);
            expect(history.map(policy => policy.claims.length)).toEqual(scenario.counts);
            for (const [index, policy] of history.entries()) {
                expect(policy.effectiveDate).toBe(`${2021 + index}-01-01`);
                expect(policy.expirationDate).toBe(`${2022 + index}-01-01`);
                expect(policy.premium / 20).toBeGreaterThanOrEqual(12000);
                expect(policy.premium / 20).toBeLessThanOrEqual(15000);
                for (const claim of policy.claims) {
                    expect(claim.incidentDate >= policy.effectiveDate).toBeTruthy();
                    expect(claim.incidentDate < policy.expirationDate).toBeTruthy();
                    expect(claim.reportedDate >= claim.incidentDate).toBeTruthy();
                    expect(claim.paid + claim.reserved).toBe(claim.incurred);
                    expect(claim.details).not.toBe('');
                }
                const lags = policy.claims.map(claim => (Date.parse(claim.reportedDate) - Date.parse(claim.incidentDate)) / 86400000);
                expect(lags.reduce((sum, lag) => sum + lag, 0) / lags.length).toBe(scenario.lags[index]);
                expect(new Set(lags).size).toBeGreaterThan(1);
                expect(new Set(policy.claims.map(claim => claim.incidentDate.slice(8))).size).toBeGreaterThan(1);
                await expect(page.getByRole('spinbutton', { name: `Units for policy year ${2021 + index}`, exact: true })).toHaveValue('20');
                const expectedLdf = await page.evaluate(year => seedLdfByYear[year], 2021 + index);
                await expect(page.getByRole('spinbutton', { name: `LDF for policy year ${2021 + index}`, exact: true })).toHaveValue(expectedLdf);
            }
            await expect(page.locator('#insurance-history-summary-body .reporting-lag-cell')).toHaveText(
                [...scenario.lags].reverse().map(lag => `${lag} days`),
            );
            if (scenario.key === 'b') {
                for (const policy of history) {
                    expect(Math.abs(policy.total / history[0].total - 1)).toBeLessThan(0.05);
                    expect(Math.abs((policy.total / policy.premium) / (history[0].total / history[0].premium) - 1)).toBeLessThan(0.05);
                }
            }
            if (file === 'workbench.html') {
                await expect(page.locator('#average-reporting-lag-chart circle title')).toHaveText(
                    scenario.lags.map((lag, index) => `${2021 + index}: ${lag} days`),
                );
                const chart = page.locator('#loss-cost-per-unit-chart');
                await expect(chart.locator('.loss-cost-undeveloped circle')).toHaveCount(5);
                await expect(chart.locator('.loss-cost-developed circle')).toHaveCount(5);
                const cost = (scenario.totals[4] / 20).toLocaleString('en-US', { minimumFractionDigits: 2 });
                expect(await chart.getAttribute('aria-label')).toContain(`2025: $${cost} per unit`);
            }
        });
    }
}

test('shortcuts reset on different keys, modifiers, and editing; repeats do not count', async ({ page }) => {
    await page.goto(pathToFileURL(path.resolve(__dirname, '..', 'workbench.html')).href);
    await page.evaluate(() => { clearPolicyList(); refreshDerivedViews(); });
    for (const key of ['a', 'a', 'a', 'a', 'b', 'a', 'a', 'a', 'a']) await page.keyboard.press(key);
    await expect(page.locator('.policy-entry')).toHaveCount(0);
    await page.keyboard.press('a');
    await expect(page.locator('.policy-entry')).toHaveCount(5);

    for (let i = 0; i < 4; i += 1) await page.keyboard.press('c');
    await page.keyboard.press('x');
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('c');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('c');
    expect((await policyHistory(page))[0].total).toBe(315000);

    const premium = page.locator('input[name$="[premium]"]').first();
    await premium.focus();
    await pressFive(page, 'b');
    await page.evaluate(() => document.activeElement.blur());
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('b');
    expect((await policyHistory(page))[0].total).toBe(315000);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', repeat: true, bubbles: true })));
    expect((await policyHistory(page))[0].total).toBe(315000);
    await page.keyboard.press('b');
    expect((await policyHistory(page))[0].total).toBe(100000);

    await pressFive(page, 'c');
    expect((await policyHistory(page))[0].total).toBe(12000);
    await pressFive(page, 'Space');
    expect((await policyHistory(page)).map(policy => policy.total)).toEqual([41000, 35000, 18000, 40000]);
    await page.evaluate(() => seedTestData());
    await expect(page.locator('.policy-entry')).toHaveCount(4);
});
