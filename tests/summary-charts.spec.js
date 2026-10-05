const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');
const workbenchUrl = pathToFileURL(path.resolve(__dirname, '..', 'workbench.html')).href;

test.use({ reducedMotion: 'reduce' });

for (const width of [1440, 390]) {
    test(`all four yearly charts fit and respond to claim and incurred edits at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(workbenchUrl);
        const charts = page.locator('.summary-charts .summary-chart');
        await expect(charts).toHaveCount(4);
        for (const chart of await charts.all()) {
            const svg = chart.locator('svg');
            await expect(svg).toBeVisible();
            const bounds = await svg.boundingBox();
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
            await expect(svg.locator('text').filter({ hasText: /^202\d$/ })).toHaveText(['2022', '2023', '2024', '2025']);
        }
        const count = page.locator('#claim-count-chart');
        await expect(count.locator('circle title')).toHaveText(['2022: 2 claims', '2023: 2 claims', '2024: 1 claim', '2025: 1 claim']);
        await expect(count.locator('svg')).toHaveClass(/trend-positive/);
        await expect(count.locator('.summary-trend-line')).toHaveCSS('stroke', 'rgb(21, 128, 61)');
        await page.getByRole('button', { name: 'Override claims for policy year 2025', exact: true }).click();
        const claims = page.getByRole('spinbutton', { name: 'Override claims for policy year 2025', exact: true });
        await claims.fill('3');
        await expect(count.locator('circle title').last()).toHaveText('2025: 3 claims');
        await expect(count.locator('svg')).toHaveClass(/trend-negative/);
        await expect(count.locator('.summary-trend-line')).toHaveCSS('stroke', 'rgb(220, 38, 38)');
        await claims.fill('2');
        await expect(count.locator('svg')).toHaveClass(/trend-stable/);
        await expect(count.locator('.summary-trend-line')).toHaveCSS('stroke', 'rgb(168, 117, 22)');
        await expect(page.locator('#insurance-history-summary-foot tr').last().locator('.claim-count-cell')).toHaveText('7 total');
        await page.getByRole('button', { name: 'Revert claims for policy year 2025', exact: true }).click();
        await expect(count.locator('circle title').last()).toHaveText('2025: 1 claim');
        await expect(page.locator('#insurance-history-summary-foot tr').last().locator('.claim-count-cell')).toHaveText('6 total');
        const incurred = page.locator('#incurred-loss-chart');
        const undeveloped = incurred.locator('svg .loss-cost-undeveloped');
        const developed = incurred.locator('svg .loss-cost-developed');
        await expect(undeveloped.locator('circle')).toHaveCount(4);
        await expect(developed.locator('circle')).toHaveCount(4);
        await expect(undeveloped).toHaveClass(/trend-stable/);
        await expect(developed).toHaveClass(/trend-negative/);
        await expect(incurred.locator('.loss-cost-legend span')).toHaveText(['Undeveloped Incurred Loss', 'Developed Incurred Loss']);
        await expect(undeveloped.locator('circle title').last()).toHaveText('Undeveloped Incurred Loss, 2025: $40,000.00');
        await expect(developed.locator('circle title').last()).toHaveText('Developed Incurred Loss, 2025: $80,000.00');
        await page.getByRole('button', { name: 'Override incurred amount for policy year 2025', exact: true }).click();
        const amount = page.getByRole('textbox', { name: 'Override incurred amount for policy year 2025', exact: true });
        await amount.fill('60000');
        await expect(amount).toBeFocused();
        await expect(undeveloped.locator('circle title').last()).toHaveText('Undeveloped Incurred Loss, 2025: $60,000.00');
        await expect(developed.locator('circle title').last()).toHaveText('Developed Incurred Loss, 2025: $120,000.00');
        await expect(undeveloped).toHaveClass(/trend-negative/);
        await expect(page.locator('#insurance-history-summary-foot tr').last().locator('td').nth(6)).toHaveText('$154,000.00');
        await page.getByRole('spinbutton', { name: 'LDF for policy year 2025', exact: true }).fill('0.5');
        await expect(developed.locator('circle title').last()).toHaveText('Developed Incurred Loss, 2025: $30,000.00');
        await expect(developed).toHaveClass(/trend-positive/);
        await expect(developed.locator('.loss-cost-line')).toHaveCSS('stroke', 'rgb(21, 128, 61)');
        await expect(page.locator('#loss-cost-per-unit-chart svg .loss-cost-undeveloped circle title').last()).toHaveText('Undeveloped Loss Cost Per Unit, 2025: $4,615.38 per unit');
        await page.getByRole('button', { name: 'Revert incurred amount for policy year 2025', exact: true }).click();
        await expect(undeveloped.locator('circle title').last()).toHaveText('Undeveloped Incurred Loss, 2025: $40,000.00');
        await expect(developed.locator('circle title').last()).toHaveText('Developed Incurred Loss, 2025: $20,000.00');
        await expect(page.locator('#insurance-history-summary-foot tr').last().locator('td').nth(6)).toHaveText('$134,000.00');
        await page.evaluate(() => { clearPolicyList(); refreshDerivedViews(); });
        await expect(page.locator('.summary-charts svg')).toHaveCount(0);
        await expect(count).toHaveText('No data');
        await expect(incurred).toHaveText('No data');
    });
}

test('trend classification uses inclusive five-percent boundaries and handles zero or sparse data', async ({ page }) => {
    await page.goto(workbenchUrl);
    const directions = await page.evaluate(() => [
        [100, 105], [100, 95], [100, 105.01], [100, 94.99], [0, 0], [0, 1], [0, -1], [100], [NaN, 100, NaN, 106],
    ].map(values => calculateChartTrend(values.map(value => ({ value }))).direction));
    expect(directions).toEqual(['stable', 'stable', 'negative', 'positive', 'stable', 'negative', 'positive', 'stable', 'negative']);
});

test('chart points and lines interpolate during edits and reduced motion disables transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(workbenchUrl);
    await page.evaluate(() => Promise.all(Array.from(document.getAnimations()).map(animation => animation.finished)));
    await page.getByRole('button', { name: 'Override average reporting lag for policy year 2025', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Override average reporting lag for policy year 2025', exact: true }).fill('1');
    const transition = await page.locator('#average-reporting-lag-chart').evaluate(chart => {
        const point = chart.querySelector('[data-chart-key="point-2025"]');
        const line = chart.querySelector('.summary-trend-line');
        const pointAnimation = point.getAnimations()[0];
        const lineAnimation = line.getAnimations()[0];
        if (!pointAnimation || !lineAnimation) return null;
        const pointFrames = pointAnimation.effect.getKeyframes();
        const lineFrames = lineAnimation.effect.getKeyframes();
        pointAnimation.pause(); lineAnimation.pause();
        pointAnimation.currentTime = 200; lineAnimation.currentTime = 200;
        return {
            pointFrames, lineFrames,
            displayedY: getComputedStyle(point).cy,
            displayedPath: getComputedStyle(line).d,
        };
    });
    expect(transition).not.toBeNull();
    expect(transition.pointFrames[0].cy).not.toBe(transition.pointFrames[1].cy);
    expect(transition.pointFrames[0].stroke).not.toBe(transition.pointFrames[1].stroke);
    expect(transition.displayedY).not.toBe(transition.pointFrames[0].cy);
    expect(transition.displayedY).not.toBe(transition.pointFrames[1].cy);
    expect(transition.displayedPath).not.toBe(transition.lineFrames[0].d);
    expect(transition.displayedPath).not.toBe(transition.lineFrames[1].d);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Override incurred amount for policy year 2025', exact: true }).click();
    await page.getByRole('textbox', { name: 'Override incurred amount for policy year 2025', exact: true }).fill('50000');
    expect(await page.locator('#incurred-loss-chart').evaluate(chart => chart.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(page.locator('#incurred-loss-chart svg .loss-cost-undeveloped circle title').last()).toHaveText('Undeveloped Incurred Loss, 2025: $50,000.00');
});
