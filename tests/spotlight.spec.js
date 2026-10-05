const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const pageUrl = (fileName) => pathToFileURL(path.resolve(__dirname, '..', fileName)).href;

test('Experience references resolve and tabs switch', async ({ page }) => {
    await page.goto(pageUrl('spotlight.html'));
    const panel = page.getByRole('region', { name: 'Experience', exact: true });
    await expect(panel).toHaveAttribute('aria-labelledby', 'experience-title');
    const missingReferences = await page.locator('[aria-labelledby], [aria-controls], [popovertarget], a[href^="#"]').evaluateAll(elements => {
        return elements.flatMap(element => {
            const references = ['aria-labelledby', 'aria-controls', 'popovertarget'].flatMap(attribute =>
                (element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)
            );
            const anchor = element.getAttribute('href');
            if (anchor && anchor.length > 1) references.push(anchor.slice(1));
            return references.filter(reference => !element.ownerDocument.getElementById(reference));
        });
    });
    expect(missingReferences).toEqual([]);
    for (const tab of await panel.getByRole('tab').all()) {
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator(`#${await tab.getAttribute('aria-controls')}`)).toBeVisible();
        await expect(panel.getByRole('tabpanel')).toHaveCount(1);
    }
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`loss charts show policy years and dollar costs at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(pageUrl('spotlight.html'));
        const charts = page.locator('.experience-charts svg');
        await expect(charts).toHaveCount(2);
        await expect(page.locator('.loss-bars')).toHaveCount(0);
        for (const chart of await charts.all()) {
            await expect(chart).toBeVisible();
            await expect(chart).toHaveAttribute('role', 'img');
            await expect(chart.locator('text', { hasText: 'Policy year' })).toHaveCount(1);
            await expect(chart.locator('text', { hasText: 'Loss cost ($)' })).toHaveCount(1);
            const years = await chart.locator('text').filter({ hasText: /^202[345]$/ }).allTextContents();
            expect(years).toEqual(['2023', '2024', '2025']);
            const bounds = await chart.boundingBox();
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
            for (const point of await chart.locator('circle').all()) {
                const label = await point.locator('title').textContent();
                const amount = Number(label.match(/\$([\d,]+)/)[1].replaceAll(',', ''));
                expect(Number(await point.getAttribute('cy'))).toBeCloseTo(210 - amount / 30000 * 170, 2);
            }
        }
        await expect(charts.first().locator('circle')).toHaveCount(3);
        await expect(charts.last().locator('circle')).toHaveCount(6);
        await expect(charts.last().locator('.chart-line.chart-reserve')).toHaveCSS('stroke-dasharray', '6px, 5px');
        await expect(page.locator('.chart-legend')).toHaveText('PaidReserve');
    });

    test(`workbench column divider resizes and resets at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(pageUrl('spotlight.html'));
        await page.locator('#open-workbench').click();
        const divider = page.getByRole('separator', { name: 'Resize Workbench columns' });
        const leftColumn = page.locator('#workbench-context-column');
        expect((await leftColumn.boundingBox()).width).toBeCloseTo(viewport.width * 0.6, 0);
        const bounds = await divider.boundingBox();
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(viewport.width * 0.7, bounds.y + bounds.height / 2);
        await page.mouse.up();
        await expect(divider).toHaveAttribute('aria-valuenow', '70');
        expect((await leftColumn.boundingBox()).width).toBeCloseTo(viewport.width * 0.7, 0);
        await expect(page.locator('.workbench-body')).not.toHaveClass(/is-resizing/);
        await page.getByRole('button', { name: 'Close Workbench' }).click();
        await page.locator('#open-workbench').click();
        await expect(divider).toHaveAttribute('aria-valuenow', '70');
        await divider.focus();
        await page.keyboard.press('Shift+ArrowLeft');
        await expect(divider).toHaveAttribute('aria-valuenow', '60');
        await page.keyboard.press('Home');
        await expect(divider).toHaveAttribute('aria-valuenow', '25');
        await page.keyboard.press('ArrowLeft');
        await expect(divider).toHaveAttribute('aria-valuenow', '25');
        await page.keyboard.press('End');
        await expect(divider).toHaveAttribute('aria-valuenow', '75');
        await divider.dblclick();
        await expect(divider).toHaveAttribute('aria-valuenow', '60');
        expect((await leftColumn.boundingBox()).width).toBeCloseTo(viewport.width * 0.6, 0);
    });

    test(`policy coverage spans the grid and dates align at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(pageUrl('spotlight.html'));
        await page.locator('#open-workbench').click();
        for (const policy of await page.locator('#workbench-insurance-form .policy-entry').all()) {
            const row = await policy.locator('.form-row').boundingBox();
            const coverage = await policy.getByLabel('Lines of Coverage', { exact: true }).boundingBox();
            const effective = await policy.getByLabel('Effective Date', { exact: true }).boundingBox();
            const expiration = await policy.getByLabel('Expiration Date', { exact: true }).boundingBox();
            expect(coverage.width).toBeCloseTo(row.width, 0);
            expect(effective.y).toBeGreaterThan(coverage.y);
            if (viewport.width > 760) {
                expect(expiration.y).toEqual(effective.y);
                expect(expiration.x).toBeGreaterThan(effective.x);
            } else {
                expect(expiration.y).toBeGreaterThan(effective.y);
                expect(expiration.width).toBeCloseTo(120, 0);
            }
        }
    });

    test(`premium charges accordion toggles and preserves edits at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(pageUrl('spotlight.html'));
        const panel = page.getByRole('region', { name: 'Premium Breakdown', exact: true });
        const charges = panel.locator('details.premium-charge');
        await expect(charges).toHaveCount(4);
        await expect(charges.locator('summary')).toHaveCount(4);
        await expect(panel.locator('details[open]')).toHaveCount(1);
        const staticValue = await charges.first().locator('.premium-detail').first().locator('span').last().boundingBox();
        const editableValue = await panel.getByRole('textbox', { name: 'Loss ratio', exact: true }).boundingBox();
        expect(editableValue.height).toEqual(staticValue.height);
        expect(editableValue.x + editableValue.width).toBeCloseTo(staticValue.x + staticValue.width, 0);
        await expect(charges.first().locator('.premium-detail').first()).toHaveCSS('border-bottom-style', 'solid');
        await panel.getByRole('textbox', { name: 'Loss ratio', exact: true }).fill('12%');
        for (let index = 1; index < 4; index += 1) {
            const charge = charges.nth(index);
            await charge.locator('summary').click();
            await expect(charge).toHaveAttribute('open', '');
            await expect(charge.locator('.premium-details')).toBeVisible();
            await expect(panel.locator('details[open]')).toHaveCount(1);
            await expect(charges.first().locator('.premium-details')).not.toBeVisible();
            const bounds = await charge.locator('summary').boundingBox();
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
        }
        await charges.first().locator('summary').focus();
        await page.keyboard.press('Enter');
        await expect(panel.getByRole('textbox', { name: 'Loss ratio', exact: true })).toHaveValue('12%');
        await page.keyboard.press('Space');
        await expect(panel.locator('details[open]')).toHaveCount(0);
    });
}

test('all page panels use header toolbars', async ({ page }) => {
    for (const fileName of ['spotlight.html', 'insurance-history-form.html']) {
        await page.goto(pageUrl(fileName));
        const titles = page.locator('.panel > .panel-title, .panel > .column > .panel-title, #insurance-history-form > .panel-title');
        await expect(titles).toHaveCount(0);
        await expect(page.locator('.panel-header').first()).toBeVisible();
    }
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const panelName of ['Experience', 'Listed Drivers', 'Listed Vehicles']) {
    test(`${panelName} workbench fills viewport and closes at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(pageUrl('spotlight.html'));
        const panel = page.getByRole('region', { name: panelName, exact: true });
        const opener = panel.getByRole('button', { name: 'Workbench', exact: true });
        await panel.getByRole('button', { name: 'Revise application' }).click();
        await expect(page.getByRole('dialog')).not.toBeVisible();
        await opener.click();
        const dialog = page.getByRole('dialog', { name: 'Underwriting Workbench', exact: true });
        await expect(dialog).toBeVisible();
        await expect(page.getByRole('button', { name: 'Close Workbench' })).toBeFocused();
        expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
        const panelSelect = dialog.getByRole('combobox', { name: 'Workbench view', exact: true });
        await expect(panelSelect).toHaveValue(panelName);
        await expect(panelSelect.locator('option')).toHaveText(['Experience', 'Listed Drivers', 'Listed Vehicles']);
        await expect(dialog.getByRole('heading', { name: 'Premium Outcome', exact: true })).toBeVisible();
        const contextColumn = dialog.getByRole('region', { name: 'Workbench panel', exact: true });
        await expect(contextColumn).toHaveCSS('background-color', 'rgb(38, 40, 43)');
        const leftColumn = await contextColumn.boundingBox();
        const rightColumn = await dialog.getByRole('region', { name: 'Premium Outcome', exact: true }).boundingBox();
        expect(leftColumn.width).toBeCloseTo(viewport.width * 0.6, 0);
        expect(rightColumn.width).toBeCloseTo(viewport.width * 0.4, 0);
        expect(rightColumn.y).toEqual(leftColumn.y);
        expect(rightColumn.x).toBeCloseTo(leftColumn.x + leftColumn.width, 0);
        await expect(dialog.locator('iframe')).toHaveCount(0);
        if (panelName !== 'Experience') {
            const activeView = dialog.locator(`[data-workbench-view="${panelName}"]`);
            await expect(activeView).toBeVisible();
            await expect(activeView.locator('tbody tr')).toHaveCount(5);
            await expect(dialog.locator('#workbench-insurance-form')).not.toBeVisible();
        }
        await panelSelect.selectOption('Experience');
        const insuranceForm = dialog.getByRole('form', { name: 'Insurance History', exact: true });
        await expect(insuranceForm).toBeVisible();
        const columnFooter = contextColumn.locator('.workbench-context-footer');
        await expect(columnFooter.getByRole('button', { name: 'Add prior policy information', exact: true })).toBeVisible();
        expect(await insuranceForm.getByRole('button', { name: 'Add prior policy information', exact: true }).count()).toBe(0);
        const columnFooterBounds = await columnFooter.boundingBox();
        expect(columnFooterBounds.y + columnFooterBounds.height).toBeCloseTo(leftColumn.y + leftColumn.height, 0);
        const insurerInput = insuranceForm.getByLabel('Insurer', { exact: true }).first();
        await insurerInput.fill('Edited Summit Casualty');
        for (const viewName of ['Listed Drivers', 'Listed Vehicles']) {
            await panelSelect.selectOption(viewName);
            await expect(insuranceForm).not.toBeVisible();
            await expect(columnFooter).not.toBeVisible();
            const activeView = dialog.locator(`[data-workbench-view="${viewName}"]`);
            await expect(activeView).toBeVisible();
            await expect(activeView.locator('tbody tr')).toHaveCount(5);
        }
        await panelSelect.selectOption('Experience');
        await expect(insurerInput).toHaveValue('Edited Summit Casualty');
        await insurerInput.fill('Summit Casualty');
        await expect(insuranceForm.locator('.policy-entry')).toHaveCount(2);
        await expect(insuranceForm.locator('.policy-entry').first()).toHaveCSS('background-color', 'rgb(251, 251, 251)');
        await expect(insuranceForm.locator('.policy-entry').first()).toHaveCSS('color', 'rgb(61, 61, 61)');
        await expect(insurerInput).toHaveCSS('background-color', 'rgb(245, 245, 220)');
        await expect(insurerInput).toHaveCSS('color', 'rgb(61, 61, 61)');
        await expect(insuranceForm.getByLabel('Insurer', { exact: true }).first()).toHaveValue('Summit Casualty');
        await expect(insuranceForm.getByLabel('Policy Number', { exact: true }).first()).toHaveValue('SUMMIT-2025-01');
        await expect(insuranceForm.getByLabel('Incurred', { exact: true }).first()).toHaveValue('$18,750.00');
        const claimsTables = insuranceForm.locator('.claims-form');
        await expect(claimsTables).toHaveCount(2);
        for (const claimsTable of await claimsTables.all()) {
            const scrollArea = claimsTable.locator('.claim-list');
            await expect(scrollArea).toHaveCSS('overflow-x', 'auto');
            await expect(claimsTable.locator('.claim-table-header > div')).toHaveCount(9);
            await expect(claimsTable.locator('.claim-entry')).toHaveCSS('display', 'grid');
            await claimsTable.scrollIntoViewIfNeeded();
            await expect(claimsTable.locator('.claims-form-header')).toHaveCount(0);
            await expect(claimsTable).toHaveAttribute('aria-label', 'Claims on policy');
            const scroll = await scrollArea.evaluate(element => {
                element.scrollLeft = element.scrollWidth;
                return { width: element.clientWidth, contentWidth: element.scrollWidth, left: element.scrollLeft };
            });
            expect(scroll.contentWidth).toBeGreaterThan(scroll.width);
            expect(scroll.left).toBeGreaterThan(0);
            await expect(claimsTable.getByLabel('Details', { exact: true })).toBeInViewport();
            await scrollArea.evaluate(element => { element.scrollLeft = 0; });
        }
        const firstPolicy = insuranceForm.locator('.policy-entry').first();
        const policyMenu = firstPolicy.locator('.policy-actions');
        await expect(policyMenu).not.toBeVisible();
        await firstPolicy.getByRole('button', { name: 'Policy actions', exact: true }).click();
        await expect(policyMenu).toBeVisible();
        await expect(policyMenu.locator('button')).toHaveCount(4);
        await expect(policyMenu.getByRole('button', { name: 'Add claim', exact: true })).toBeDisabled();
        const menuBounds = await policyMenu.boundingBox();
        expect(menuBounds.x).toBeGreaterThanOrEqual(0);
        expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(viewport.width);
        await page.keyboard.press('Escape');
        await expect(policyMenu).not.toBeVisible();
        await expect(dialog).toBeVisible();
        expect(await insuranceForm.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        const premiumOutcome = dialog.getByRole('region', { name: 'Premium Outcome', exact: true });
        const assistantSummary = premiumOutcome.locator('#workbench-assistant');
        await expect(assistantSummary.locator('p')).toHaveCount(1);
        await expect(assistantSummary).toBeVisible();
        await expect(assistantSummary).toContainText('$7,500 in outstanding reserves');
        expect(await assistantSummary.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        const copiedCharges = premiumOutcome.locator('details.premium-charge');
        await expect(copiedCharges).toHaveCount(4);
        await expect(premiumOutcome.locator('details[open]')).toHaveCount(0);
        const originalPremium = page.getByRole('region', { name: 'Premium Breakdown', exact: true });
        expect(await copiedCharges.locator('summary').allTextContents()).toEqual(
            await originalPremium.locator('details summary').allTextContents()
        );
        await copiedCharges.first().locator('summary').click();
        const copiedLossRatio = premiumOutcome.getByRole('textbox', { name: 'Loss ratio', exact: true });
        const copiedStaticValue = await copiedCharges.first().locator('.premium-detail').first().locator('span').last().boundingBox();
        const copiedEditableValue = await copiedLossRatio.boundingBox();
        expect(copiedEditableValue.height).toEqual(copiedStaticValue.height);
        expect(copiedEditableValue.x + copiedEditableValue.width).toBeCloseTo(copiedStaticValue.x + copiedStaticValue.width, 0);
        await copiedLossRatio.fill('15%');
        await expect(originalPremium.getByRole('textbox', { name: 'Loss ratio', exact: true })).toHaveValue('0%');
        await copiedCharges.nth(1).locator('summary').click();
        await expect(premiumOutcome.locator('details[open]')).toHaveCount(1);
        await expect(originalPremium.locator('details').first()).toHaveAttribute('open', '');
        await copiedCharges.first().locator('summary').click();
        await expect(copiedLossRatio).toHaveValue('15%');
        expect(await premiumOutcome.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        const saveButton = dialog.getByRole('button', { name: 'Save underwriter modifications', exact: true });
        const discardButton = dialog.getByRole('button', { name: 'Clear modifications', exact: true });
        await expect(saveButton).toBeVisible();
        await expect(discardButton).toBeVisible();
        await expect(dialog.locator('.workbench-footer')).toHaveCount(0);
        await expect(dialog.locator('.panel-header .workbench-heading-actions button')).toHaveCount(3);
        const header = await dialog.locator(':scope > .panel-header').boundingBox();
        const body = await dialog.locator('.workbench-body').boundingBox();
        expect(body.y).toBeCloseTo(header.y + header.height, 0);
        expect(body.y + body.height).toBeCloseTo(viewport.height, 0);
        for (const button of [saveButton, discardButton]) {
            const bounds = await button.boundingBox();
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(header.y + header.height);
        }
        await page.getByRole('button', { name: 'Close Workbench' }).focus();
        await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
        await page.keyboard.press('Tab');
        await expect(opener).not.toBeFocused();
        await expect(panelSelect).toBeFocused();
        await discardButton.focus();
        await expect(discardButton).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(saveButton).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(discardButton).toBeFocused();
        await page.getByRole('button', { name: 'Close Workbench' }).focus();
        await expect(page.getByRole('button', { name: 'Close Workbench' })).toBeFocused();
        await page.getByRole('button', { name: 'Close Workbench' }).click();
        await expect(dialog).not.toBeVisible();
        await expect(opener).toBeFocused();
        await opener.click();
        await expect(copiedLossRatio).toHaveValue('15%');
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(opener).toBeFocused();
    });
    }
}