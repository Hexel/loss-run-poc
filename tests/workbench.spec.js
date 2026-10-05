const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

const workbenchUrl = pathToFileURL(path.resolve(__dirname, '..', 'workbench.html')).href;

test('upload instructions appear as a file input tooltip instead of a paragraph', async ({ page }) => {
    await page.goto(workbenchUrl);
    const input = page.locator('#loss-run-upload-form input[type="file"]');
    await expect(input).toHaveAttribute('title', 'Have a loss run file? Use the upload button in the navbar to automatically populate your insurance history. Supported formats: PDF, CSV, and Microsoft Excel (.xls, .xlsx).');
    await expect(page.locator('#upload-loss-run p').filter({ hasText: 'Have a loss run file?' })).toHaveCount(0);
    await expect(input).toHaveAttribute('accept', '.pdf,.csv,.xls,.xlsx');
    await expect(input).toHaveAttribute('multiple', '');
    await expect(page.locator('#upload-error')).toHaveCount(1);
});

for (const width of [1440, 390]) {
    test(`workbench navbar spans the viewport and stays sticky at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 700 });
        await page.goto(workbenchUrl);
        const navbar = page.getByRole('navigation', { name: 'Workbench' });
        await expect(navbar.getByRole('heading', { level: 1 })).toHaveText('Loss History Workbench');
        const upload = navbar.locator('input[type="file"]');
        await expect(upload).toHaveCount(1);
        await expect(upload).toHaveAttribute('accept', '.pdf,.csv,.xls,.xlsx');
        await expect(upload).toHaveAttribute('multiple', '');
        await expect(page.locator('#loss-run-upload-form')).toHaveCount(1);
        await expect(page.locator('#upload-loss-run input[type="file"]')).toHaveCount(0);
        const navbarBox = await navbar.boundingBox();
        const uploadBox = await navbar.locator('.file-picker').boundingBox();
        expect(navbarBox.x).toBe(0);
        expect(navbarBox.width).toBe(width);
        expect(uploadBox.x + uploadBox.width).toBeCloseTo(width - 24, 0);
        await page.evaluate(() => window.scrollTo(0, 500));
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        expect((await navbar.boundingBox()).y).toBe(0);
        await expect(upload).toBeInViewport();
        await page.locator('#loss-run-upload-form').evaluate(form => {
            form.dataset.submitCount = '0';
            form.requestSubmit = () => {
                form.dataset.submitCount = String(Number(form.dataset.submitCount) + 1);
            };
        });
        await upload.setInputFiles({ name: 'loss-run.csv', mimeType: 'text/csv', buffer: Buffer.from('policy_number\nTEST') });
        await expect(page.locator('#loss-run-upload-form')).toHaveAttribute('data-submit-count', '1');
    });
}

for (const fileName of ['workbench.html', 'insurance-history-form.html']) {
    test(`${fileName} shows dates without leading zeros outside native editing`, async ({ page }) => {
        await page.goto(pathToFileURL(path.resolve(__dirname, '..', fileName)).href);
        await page.evaluate(() => seedTestData());
        const input = page.locator('#expiration-date-0');
        const display = input.locator('..').locator('.formatted-date-value');
        for (const [value, text] of [['2023-01-01', '1/1/2023'], ['2024-02-29', '2/29/2024'], ['2026-10-05', '10/5/2026']]) {
            await input.fill(value);
            await expect(input).toHaveAttribute('type', 'date');
            await expect(display).toBeHidden();
            await input.blur();
            await expect(display).toBeVisible();
            await expect(display).toHaveText(text);
            await expect(input).toHaveValue(value);
            await expect(input).toHaveCSS('color', 'rgba(0, 0, 0, 0)');
            expect(await input.evaluate(element => new FormData(element.form).get(element.name))).toBe(value);
        }
        await input.fill('');
        await input.blur();
        await expect(display).toHaveText('');
        await expect(input).toHaveClass(/is-empty/);
        await page.locator('#insurance-history-form').evaluate(form => form.reset());
        await expect(display).toHaveText('1/1/2023');
        await expect(input).toHaveValue('2023-01-01');
        await page.locator('#add-policy').click();
        const policy = page.locator('.policy-entry').last();
        await policy.locator('input[name$="[effectiveDate]"]').fill('2025-01-02');
        const expiration = policy.locator('input[name$="[expirationDate]"]');
        await expect(expiration).toHaveValue('2026-01-02');
        await expect(expiration.locator('..').locator('.formatted-date-value')).toHaveText('1/2/2026');
        const claimDate = page.locator('#claim-incident-date-0-0');
        await claimDate.fill('2025-03-04');
        await claimDate.blur();
        await expect(claimDate.locator('..').locator('.formatted-date-value')).toHaveText('3/4/2025');
    });

    test(`${fileName} add policy uses an outline button`, async ({ page }) => {
        await page.goto(pathToFileURL(path.resolve(__dirname, '..', fileName)).href);
        const button = page.locator('#add-policy');
        await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(button).toHaveCSS('color', 'rgb(44, 107, 47)');
        await expect(button).toHaveCSS('border-top', '1px solid rgb(44, 107, 47)');
        await button.focus();
        await expect(button).toHaveCSS('outline-style', 'solid');
        await button.hover();
        await expect(button).toHaveCSS('background-color', 'rgb(242, 242, 242)');
        const policies = page.locator('.policy-entry');
        const count = await policies.count();
        await button.click();
        await expect(policies).toHaveCount(count + 1);
        await expect(button).toHaveText('Add another prior policy');
    });

    test(`${fileName} initializes without the removed continuation footer`, async ({ page }) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(pathToFileURL(path.resolve(__dirname, '..', fileName)).href);
        await expect(page.locator('#finale')).toHaveCount(0);
        await expect(page.locator('#continue-button')).toHaveCount(0);
        const policies = page.locator('.policy-entry');
        const count = await policies.count();
        await page.locator('#add-policy').click();
        await expect(policies).toHaveCount(count + 1);
        expect(errors).toEqual([]);
    });
}

test('date controls stay fixed width while other policy and claim fields grow', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const policy = page.locator('.policy-entry').first();
    const insurerWidths = [];
    const incurredWidths = [];
    for (const width of [1000, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const date of await policy.locator('input[type="date"]').all()) {
            await expect(date).toHaveCSS('width', '120px');
        }
        await expect(policy.locator('.policy-period-field')).toHaveCSS('width', '258px');
        insurerWidths.push((await policy.locator('#insurer-0').boundingBox()).width);
        incurredWidths.push((await policy.locator('#claim-incurred-0-0').boundingBox()).width);
        const bounds = await policy.locator('.policy-row').boundingBox();
        const last = await policy.locator('#policy-number-0').boundingBox();
        expect(last.x + last.width).toBeCloseTo(bounds.x + bounds.width, 1);
    }
    expect(insurerWidths[1]).toBeGreaterThan(insurerWidths[0]);
    expect(incurredWidths[1]).toBeGreaterThan(incurredWidths[0]);
    await page.setViewportSize({ width: 390, height: 900 });
    for (const date of await policy.locator('input[type="date"]').all()) {
        await expect(date).toHaveCSS('width', '120px');
    }
    const insurerBox = await policy.locator('#insurer-0').boundingBox();
    const rowBox = await policy.locator('.policy-row').boundingBox();
    expect(insurerBox.width).toBeCloseTo(rowBox.width, 1);
});

test('policy periods group dates and valuation dates follow the period at all widths', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const policy = page.locator('.policy-entry').first();
    const period = policy.getByRole('group', { name: 'Policy Period', exact: true });
    await expect(period.getByLabel('Effective Date', { exact: true })).toHaveValue('2022-01-01');
    await expect(period.getByLabel('Expiration Date', { exact: true })).toHaveValue('2023-01-01');
    await expect(policy.locator('.policy-row > .form-field').nth(2).getByLabel('Valuation Date')).toHaveValue('');
    await expect(policy.locator('.policy-row > .form-field').nth(3).getByLabel('Insurer')).toHaveValue('Alpha Insurer');
    const valuation = policy.getByLabel('Valuation Date');
    await valuation.fill('2026-05-01');
    await valuation.blur();
    const largeLoss = page.locator('.large-loss-entry').first();
    await expect(largeLoss.locator('footer .large-loss-field').nth(2).locator('dt')).toHaveText('Incident Date');
    await expect(largeLoss.locator('footer .large-loss-field').nth(3).locator('dt')).toHaveText('Valuation Date');
    await expect(largeLoss.locator('footer .large-loss-field').nth(3).locator('dd')).toHaveText('2026-05-01');
    expect(await policy.evaluate(element => new FormData(element.closest('form')).get('policies[0][valuationDate]'))).toBe('2026-05-01');
    for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const periodBox = await period.boundingBox();
        const effectiveBox = await period.getByLabel('Effective Date', { exact: true }).boundingBox();
        const expirationBox = await period.getByLabel('Expiration Date', { exact: true }).boundingBox();
        expect(periodBox.x + periodBox.width).toBeLessThanOrEqual(width);
        expect(expirationBox.x + expirationBox.width).toBeLessThanOrEqual(periodBox.x + periodBox.width);
        if (width > 500) {
            expect(expirationBox.y).toBe(effectiveBox.y);
            expect(expirationBox.x).toBeGreaterThan(effectiveBox.x);
        } else {
            expect(expirationBox.y).toBeGreaterThan(effectiveBox.y);
        }
        const fields = await largeLoss.locator('footer .large-loss-field').all();
        const incidentBox = await fields[2].boundingBox();
        const valuationBox = await fields[3].boundingBox();
        expect(valuationBox.y).toBe(incidentBox.y);
        expect(valuationBox.x).toBeGreaterThan(incidentBox.x);
    }
    const copiedIndexes = await page.evaluate(() => {
        const source = getPolicies()[0];
        addPriorPolicy(source);
        const priorIndex = source.nextElementSibling.dataset.policyIndex;
        addRenewalPolicy(source);
        return [priorIndex, source.previousElementSibling.dataset.policyIndex];
    });
    for (const index of copiedIndexes) {
        await expect(page.locator(`#valuation-date-${index}`)).toHaveValue('2026-05-01');
    }
});

test('uploaded policy valuation dates retain the newest applicable file date', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => {
        uploadedFiles.length = 0;
        const olderDate = '2025-12-31';
        const newerDate = '2026-06-30';
        uploadedFiles.push(
            { uploadOrder: 0, valuationDate: newerDate, valuationTimestamp: Date.parse(newerDate), output: { policies: [{ policy_number: 'NEW', effective_date: '2025-01-01' }, { policy_number: 'SPECIFIC', valuation_date: '2026-05-31' }], claims: [] } },
            { uploadOrder: 1, valuationDate: olderDate, valuationTimestamp: Date.parse(olderDate), output: { policies: [{ policy_number: 'NEW', effective_date: '2025-01-01' }, { policy_number: 'OLD', effective_date: '2024-01-01' }], claims: [] } },
        );
        createPoliciesFromLossRun();
    });
    await expect(page.locator('#valuation-date-0')).toHaveValue('2026-06-30');
    await expect(page.locator('#valuation-date-1')).toHaveValue('2026-05-31');
    await expect(page.locator('#valuation-date-2')).toHaveValue('2025-12-31');
    await page.evaluate(() => createPoliciesFromLossRun({ valuation_date: '2026-07-31', policies: [{ policy_number: 'DIRECT' }], claims: [] }));
    await expect(page.locator('#valuation-date-0')).toHaveValue('2026-07-31');
});

test('policy monetary fields format dollars and grouping while preserving edits and values', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    await expect(page.locator('#premium-0')).toHaveValue('$78,000');
    await expect(page.locator('#claim-incurred-0-0')).toHaveValue('$15,000');
    const ids = ['premium-0', 'claim-incurred-0-0', 'claim-alae-0-0', 'claim-paid-0-0', 'claim-reserved-0-0', 'claim-recovered-0-0'];
    for (const id of ids) {
        const input = page.locator(`#${id}`);
        await expect(input).toHaveAttribute('inputmode', 'decimal');
        await input.fill('1234567.50');
        await expect(input).toHaveValue('$1,234,567.50');
        expect(await input.evaluate(element => readMoney(element.value))).toBe(1234567.5);
        await input.fill('$987,654.32');
        await expect(input).toHaveValue('$987,654.32');
        await input.fill('1234.');
        await input.pressSequentially('50');
        await expect(input).toHaveValue('$1,234.50');
        await input.fill('');
        await expect(input).toHaveValue('');
        await input.fill('0');
        await expect(input).toHaveValue('$0');
        await input.fill('1234');
        await input.press('Home');
        await input.pressSequentially('9');
        await expect(input).toHaveValue('$91,234');
        expect(await input.evaluate(element => element.selectionStart)).toBe(2);
    }
    await page.evaluate(() => {
        const policy = createPolicyEntry(99, { premium: 0 });
        policyList.appendChild(policy);
        appendClaim(policy, { incurred: 0, alae: 0, paid: 0, reserved: 0, recovered: 0 });
        refreshDerivedViews();
    });
    for (const input of await page.locator('.policy-entry[data-policy-index="99"] .usd-input').all()) {
        await expect(input).toHaveValue('$0');
    }
    await page.locator('#insurance-history-form').evaluate(form => form.reset());
    await expect(page.locator('#premium-0')).toHaveValue('$78,000');
    await expect(page.locator('#claim-incurred-0-0')).toHaveValue('$15,000');
});

test('large loss panels show formatted titles, status pills, paragraph details, and footer metadata', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => {
        seedTestData();
        document.querySelector('#claim-incident-date-0-1').value = '2026-05-01';
        document.querySelector('#claim-incurred-0-1').value = '26000.75';
        refreshDerivedViews();
    });
    const entry = page.locator('.large-loss-entry').first();
    await expect(entry.locator('.large-loss-title-text')).toHaveText('$26,000 on May 1st, 2026');
    await expect(entry.locator('.large-loss-title sup')).toHaveCount(0);
    const badge = entry.locator('.large-loss-status');
    await expect(badge).toHaveText('CLOSED');
    await expect(badge).toHaveCSS('background-color', 'rgb(229, 229, 229)');
    await page.locator('#claim-status-0-1').selectOption('open');
    await expect(badge).toHaveText('OPEN');
    await expect(badge).toHaveCSS('background-color', 'rgb(255, 235, 153)');
    const details = entry.getByRole('textbox', { name: 'Details', exact: true });
    await expect(details).toHaveCSS('font-size', '15px');
    await expect(entry.locator('.large-loss-details label')).toHaveCount(0);
    await expect(entry.locator('.large-loss-entry-footer dt')).toHaveText(['Policy Year', 'Insurer', 'Incident Date', 'Valuation Date', 'Status', 'Incurred']);
    await expect(entry.locator('.large-loss-entry-footer sup')).toHaveText('.75');
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const cardBox = await entry.boundingBox();
        const titleBox = await entry.locator('.large-loss-title').boundingBox();
        const headerBox = await entry.locator('header').boundingBox();
        const detailsBox = await details.boundingBox();
        const footerBox = await entry.locator('footer').boundingBox();
        expect(titleBox.y - cardBox.y).toBeCloseTo(titleBox.x - cardBox.x, 1);
        expect(headerBox.height).toBeCloseTo(titleBox.height, 1);
        expect(detailsBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
        expect(footerBox.y).toBeGreaterThanOrEqual(detailsBox.y + detailsBox.height);
        expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(width);
        const lastValueBox = await entry.locator('footer dd').last().boundingBox();
        expect(cardBox.y + cardBox.height - lastValueBox.y - lastValueBox.height).toBeCloseTo(13, 1);
    }
    const dates = await page.evaluate(() => [1, 2, 3, 11, 12, 13, 21, 22, 23, 31].map(day => formatLargeLossDate(`2026-05-${String(day).padStart(2, '0')}`)));
    expect(dates).toEqual(['May 1st, 2026', 'May 2nd, 2026', 'May 3rd, 2026', 'May 11th, 2026', 'May 12th, 2026', 'May 13th, 2026', 'May 21st, 2026', 'May 22nd, 2026', 'May 23rd, 2026', 'May 31st, 2026']);
    expect(await page.evaluate(() => formatLargeLossDate('—'))).toBe('—');
});

test('large loss headers navigate to claims and clear their highlight correctly', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    await page.clock.install();
    const entries = page.locator('.large-loss-entry');
    await expect(entries.first().locator('.large-loss-title-text')).toHaveText('$26,000 on October 11th, 2022');
    await expect(entries.first().getByRole('heading').locator('sup')).toHaveCount(0);
    const buttons = page.getByRole('button', { name: 'Show corresponding claim in Insurance History', exact: true });
    const targetFor = async button => {
        const policyIndex = await button.getAttribute('data-policy-index');
        const claimIndex = await button.getAttribute('data-claim-index');
        return page.locator(`.policy-entry[data-policy-index="${policyIndex}"] .claim-entry[data-claim-index="${claimIndex}"]`);
    };
    const first = await targetFor(buttons.first());
    const second = await targetFor(buttons.nth(1));
    await buttons.first().locator('i').click();
    await expect(first).toHaveClass(/claim-highlighted/);
    await expect(first).toBeInViewport();
    await expect(first).toHaveCSS('animation-name', 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(first).toHaveCSS('animation-name', 'claim-glow');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.fastForward(10000);
    await buttons.nth(1).click();
    await expect(first).not.toHaveClass(/claim-highlighted/);
    await expect(second).toHaveClass(/claim-highlighted/);
    await expect(page.locator('.claim-highlighted')).toHaveCount(1);
    await page.clock.fastForward(20001);
    await expect(second).toHaveClass(/claim-highlighted/);
    await page.clock.fastForward(10000);
    await expect(page.locator('.claim-highlighted')).toHaveCount(0);
    await buttons.first().click();
    await page.locator('.units-input').first().fill('2');
    await expect(page.locator('.claim-highlighted')).toHaveCount(0);
    await buttons.first().click();
    await page.locator('#claim-status-0-0').selectOption('closed');
    await expect(page.locator('.claim-highlighted')).toHaveCount(0);
    await buttons.first().click();
    await page.locator('.large-loss-detail-textarea').first().fill('Updated details');
    await expect(page.locator('.claim-highlighted')).toHaveCount(0);
});

test('large loss details grow and shrink to content without a bottom border', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const details = page.locator('.large-loss-detail-textarea').first();
    await expect(details).toHaveCSS('field-sizing', 'content');
    await expect(details).toHaveCSS('border-bottom-width', '0px');
    await expect(details).toHaveCSS('overflow', 'hidden');
    await expect(details).toHaveCSS('scrollbar-width', 'none');
    await expect(details).toHaveCSS('resize', 'none');
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await details.fill('Short details');
        const shortHeight = (await details.boundingBox()).height;
        await details.fill('Detailed description of this large loss and the circumstances surrounding the claim. '.repeat(30));
        const longHeight = (await details.boundingBox()).height;
        expect(longHeight).toBeGreaterThan(shortHeight);
        const dimensions = await details.evaluate(element => ({ client: element.clientHeight, scroll: element.scrollHeight }));
        expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
        await details.fill('Short details');
        expect((await details.boundingBox()).height).toBeCloseTo(shortHeight, 1);
        await details.fill('');
        expect((await details.boundingBox()).height).toBeGreaterThan(0);
    }
});

test('large loss currency renders cents as superscript, not literal markup', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const amount = page.locator('.large-loss-entry').first().locator('.large-loss-field').filter({ has: page.locator('dt', { hasText: /^Incurred$/ }) }).locator('dd');
    await expect(amount).toHaveText('$26,000.00');
    await expect(amount.locator('sup')).toHaveText('.00');
    await expect(amount.locator('sup')).toHaveCSS('position', 'relative');
    await expect(page.locator('#large-losses-list')).not.toContainText('<sup>');
    await page.locator('#claim-incurred-0-1').fill('26000.75');
    await page.locator('#claim-incurred-0-1').blur();
    await expect(amount).toHaveText('$26,000.75');
    await expect(amount.locator('sup')).toHaveText('.75');
});

test('summary table matches chart corners without doubling cell borders', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const table = page.locator('#insurance-history-summary-table');
    const chart = page.locator('.summary-chart').first();
    const radius = await chart.evaluate(element => getComputedStyle(element).borderRadius);
    await expect(table).toHaveCSS('border-radius', radius);
    await expect(table).toHaveCSS('border-collapse', 'separate');
    await expect(table).toHaveCSS('border-spacing', '0px');
    await expect(table).toHaveCSS('overflow', 'hidden');
    await expect(table).toHaveCSS('border-width', '1px');
    await expect(table.locator('thead th').first()).toHaveCSS('border-width', '0px 1px 1px 0px');
    await expect(table.locator('thead th').last()).toHaveCSS('border-right-width', '0px');
    await expect(table.locator('tfoot tr').last().locator('td').last()).toHaveCSS('border-bottom-width', '0px');
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const scroller = table.locator('..');
        const bounds = await scroller.boundingBox();
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        await expect(table).toBeVisible();
    }
});

test('empty fields are beige, dimmed, and have no placeholders', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const fields = [page.locator('#claim-reserved-0-1'), page.locator('#claim-incident-date-0-0'), page.locator('#insurer-0')];
    for (const field of fields) {
        await field.fill('');
        await field.blur();
        await page.mouse.move(0, 0);
        await expect(field).toHaveCSS('background-color', 'rgb(245, 245, 220)');
        await expect(field).toHaveCSS('opacity', '0.5');
        await expect(field).not.toHaveAttribute('placeholder');
        await field.hover();
        await expect(field).toHaveCSS('opacity', '1');
        await field.focus();
        await page.mouse.move(0, 0);
        await expect(field).toHaveCSS('opacity', '1');
        await field.blur();
        await expect(field).toHaveCSS('opacity', '0.5');
    }
    const reserved = fields[0];
    await reserved.fill('0');
    await reserved.blur();
    await page.mouse.move(0, 0);
    await expect(reserved).toHaveCSS('opacity', '1');
    await expect(reserved).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.evaluate(() => addPolicy());
    const newPolicy = page.locator('.policy-entry').last();
    const effectiveDate = newPolicy.locator('input[name$="[effectiveDate]"]');
    const expirationDate = newPolicy.locator('input[name$="[expirationDate]"]');
    await expect(effectiveDate).toHaveCSS('opacity', '0.5');
    await expect(newPolicy.locator('input[type="text"]').first()).not.toHaveAttribute('placeholder');
    await effectiveDate.fill('2026-10-05');
    await effectiveDate.blur();
    await expect(expirationDate).toHaveValue('2027-10-05');
    await expect(expirationDate).toHaveCSS('opacity', '1');
    await page.locator('#insurance-history-form').evaluate(form => form.reset());
    await expect(effectiveDate).toHaveValue('');
    await expect(effectiveDate).toHaveCSS('opacity', '0.5');
    await expect(expirationDate).toHaveCSS('opacity', '0.5');
});

for (const width of [1440, 390]) {
    test(`claim rows are compact and highlight only when removing at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(workbenchUrl);
        await page.evaluate(() => seedTestData());
        const rows = page.locator('.policy-entry').first().locator('.claim-entry');
        const row = rows.first();
        const nextRow = rows.nth(1);
        const date = row.locator('input[type="date"]').first();
        for (const control of await row.locator('input, select, .remove-claim').all()) {
            await expect(control).toHaveCSS('height', '24px');
        }
        await expect(row).toHaveCSS('height', '24px');
        await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await row.locator('.remove-claim').hover();
        await expect(row).toHaveCSS('background-color', 'rgb(255, 241, 241)');
        await expect(nextRow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await date.hover();
        await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(date).toHaveCSS('background-color', 'rgb(245, 245, 220)');
        const count = await rows.count();
        await row.locator('.remove-claim').click();
        await expect(rows).toHaveCount(count - 1);
    });

    test(`policy cards keep balanced padding and compact headers at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(workbenchUrl);
        await page.evaluate(() => seedTestData());
        const card = page.locator('.policy-entry').first();
        const title = card.locator('.policy-title');
        const header = card.locator('.policy-entry-header');
        const button = card.getByRole('button', { name: 'Policy actions', exact: true });
        for (const side of ['top', 'right', 'bottom', 'left']) {
            await expect(card).toHaveCSS(`padding-${side}`, '12px');
        }
        const cardBox = await card.boundingBox();
        const titleBox = await title.boundingBox();
        expect(titleBox.y - cardBox.y).toBeCloseTo(titleBox.x - cardBox.x, 1);
        expect((await header.boundingBox()).height).toBeCloseTo(titleBox.height, 1);
        await expect(button).toHaveCSS('width', '36px');
        await expect(button).toHaveCSS('height', '36px');
        await expect(button).toHaveCSS('padding', '0px');
        await button.click();
        await expect(card.locator('.policy-actions')).toBeVisible();
        await button.click();
        await title.evaluate(element => { element.textContent = '2022-23 An insurer with a long name that wraps across multiple lines'; });
        expect((await header.boundingBox()).height).toBeCloseTo((await title.boundingBox()).height, 1);
        const buttonBox = await button.boundingBox();
        expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
        expect(buttonBox.y).toBeGreaterThanOrEqual(cardBox.y);
    });
}

test('select carets stay on the left and preserve selection behavior', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const status = page.locator('#claim-status-0-0');
    await expect(status).toHaveCSS('appearance', 'none');
    await expect(status).toHaveCSS('padding-left', '18px');
    await expect(status).toHaveCSS('background-position', '3px 50%, 7px 50%');
    const caret = await status.evaluate(element => getComputedStyle(element).backgroundImage);
    expect(caret).toContain('linear-gradient');
    await status.hover();
    await expect(status).toHaveCSS('background-image', caret);
    await status.focus();
    await expect(status).toHaveCSS('background-image', caret);
    await status.press('ArrowDown');
    await expect(status).toHaveValue('closed');
    await status.selectOption('open');
    await expect(status).toHaveValue('open');
    const coverage = page.locator('.selectBox').first();
    const arrowLeft = await coverage.evaluate(element => getComputedStyle(element, '::after').left);
    expect(arrowLeft).toBe('3px');
    await coverage.click();
    await expect(page.locator('.checkboxes').first()).toBeVisible();
});

test('claims sections retain an accessible name without a form header', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    await expect(page.locator('.claims-form-header')).toHaveCount(0);
    const claims = page.locator('.claims-form');
    expect(await claims.count()).toBeGreaterThan(0);
    for (const section of await claims.all()) {
        await expect(section).toHaveAttribute('aria-label', 'Claims on policy');
        await expect(section.locator('.claim-table-header')).toHaveCount(1);
    }
});

test('coverage control and label align with adjacent policy fields', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const coverage = page.locator('.coverage-group').first();
    const policy = page.locator('.policy-field').first();
    const coverageBox = await coverage.boundingBox();
    const policyBox = await policy.boundingBox();
    expect(coverageBox.y).toBeCloseTo(policyBox.y, 1);
    expect(coverageBox.height).toBeCloseTo(policyBox.height, 1);
    const coverageLabel = coverage.locator('.coverage-label');
    const policyLabel = policy.locator('.form-field-label');
    for (const property of ['font-size', 'font-weight', 'text-transform', 'height']) {
        await expect(coverageLabel).toHaveCSS(property, await policyLabel.evaluate((label, name) => getComputedStyle(label).getPropertyValue(name), property));
    }
    await expect(coverage.locator('.selectBox')).toHaveCSS('height', '24px');
    await coverage.locator('.selectBox').click();
    await expect(coverage.locator('.checkboxes')).toBeVisible();
    expect((await coverage.boundingBox()).height).toBeCloseTo(policyBox.height, 1);
});

test('date inputs keep the native calendar icon left of editable date text', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const session = await page.context().newCDPSession(page);
    const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
    const findNode = (node, predicate) => {
        if (predicate(node)) return node;
        for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
            const match = findNode(child, predicate);
            if (match) return match;
        }
    };
    for (const selector of ['#expiration-date-0', '.claim-field input[type="date"]']) {
        const input = page.locator(selector).first();
        const id = await input.getAttribute('id');
        const inputNode = findNode(root, node => node.nodeName === 'INPUT' && node.attributes.includes(id));
        const picker = findNode(inputNode, node => node.attributes?.includes('-webkit-calendar-picker-indicator'));
        const dateText = findNode(inputNode, node => node.attributes?.includes('-webkit-datetime-edit'));
        expect(picker).toBeTruthy();
        expect(dateText).toBeTruthy();
        const { model: pickerBox } = await session.send('DOM.getBoxModel', { nodeId: picker.nodeId });
        const { model: textBox } = await session.send('DOM.getBoxModel', { nodeId: dateText.nodeId });
        expect(pickerBox.border[2]).toBeLessThanOrEqual(textBox.border[0]);
        await input.fill('2026-10-05');
        await expect(input).toHaveValue('2026-10-05');
    }
    await session.detach();
});

test('form controls use minimalist default, hover, and focus styles', async ({ page }) => {
    await page.goto(workbenchUrl);
    await page.evaluate(() => seedTestData());
    const controls = [
        page.locator('#insurer-0'),
        page.locator('.form-field input[type="date"]').first(),
        page.locator('.claim-field input[type="text"]').first(),
        page.locator('.claim-field select').first(),
        page.locator('.selectBox').first(),
    ];
    for (const control of controls) {
        await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        for (const side of ['top', 'right', 'left']) {
            await expect(control).toHaveCSS(`border-${side}-width`, '0px');
        }
        await expect(control).toHaveCSS('border-bottom-width', '0px');
        const isSelect = await control.evaluate(element => element.tagName === 'SELECT');
        await expect(control).toHaveCSS('padding', isSelect ? '0px 0px 0px 18px' : '0px');
        await expect(control).toHaveCSS('border-radius', '0px');
        await control.hover();
        await expect(control).toHaveCSS('background-color', 'rgb(245, 245, 220)');
        const focusTarget = await control.locator('select').count() ? control.locator('select') : control;
        await focusTarget.focus();
        await expect(control).toHaveCSS('background-color', 'rgb(245, 245, 220)');
        await page.mouse.move(0, 0);
        await expect(control).toHaveCSS('background-color', 'rgb(245, 245, 220)');
        await focusTarget.blur();
        await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
    const selectBox = page.locator('.selectBox').first();
    await expect(selectBox.locator('select')).toHaveCSS('padding', '0px 0px 0px 18px');
    await selectBox.click();
    await expect(page.locator('.checkboxes').first()).toBeVisible();
    await expect(selectBox).toHaveCSS('background-color', 'rgb(245, 245, 220)');
    await page.locator('.checkboxes input').first().check();
    await expect(selectBox).toHaveCSS('background-color', 'rgb(245, 245, 220)');
});

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
