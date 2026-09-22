        // Derived insurance history views
        function hasValue(field) {
            return Boolean(field && field.value && field.value.trim());
        }

        function hasInsuranceHistoryInformation() {
            const policyFieldNames = ['effectiveDate', 'expirationDate', 'insurer', 'premium', 'policyNumber'];
            const claimFieldNames = ['incidentDate', 'incurred', 'alae', 'paid', 'reserved', 'recovered', 'details'];

            return getPolicies().some(policy => {
                if (policyFieldNames.some(fieldName => hasValue(getPolicyField(policy, fieldName)))) return true;
                if (getCoverageInputs(policy, true).length > 0) return true;

                const policyIndex = getPolicyIndex(policy);
                return getClaims(policy).some(claim => {
                    return claimFieldNames.some(fieldName => hasValue(getClaimField(policyIndex, claim, fieldName)));
                });
            });
        }

        function syncInsuranceHistoryVisibility() {
            const summaryTable = document.getElementById('insurance-history-summary-table');
            const largeLossList = document.getElementById('large-losses-list');
            const summaryPanel = document.getElementById('insurance-history-summary-panel');
            const largeLossPanel = document.getElementById('large-losses');
            const tipInsurance = document.getElementById('tip-for-insurance-history');
            const tipLarge = document.getElementById('tip-for-large-losses');
            const hasHistory = hasInsuranceHistoryInformation();

            if (tipInsurance) tipInsurance.style.display = 'block';
            if (tipLarge) tipLarge.style.display = hasHistory ? 'none' : 'block';
            if (summaryTable) summaryTable.style.display = hasHistory ? 'table' : 'none';
            if (largeLossList) largeLossList.style.display = hasHistory ? 'block' : 'none';

            if (summaryPanel) {
                summaryPanel.classList.toggle('faded', !hasHistory);
            }
            if (largeLossPanel) {
                largeLossPanel.classList.toggle('faded', !hasHistory);
            }
        }

        function renderLargeLossesSection() {
            const list = document.getElementById('large-losses-list');
            if (!list) return;

            const rows = [];

            getPolicies().forEach(policy => {
                const policyIndex = getPolicyIndex(policy);
                const effectiveField = getPolicyField(policy, 'effectiveDate');
                const insurerField = getPolicyField(policy, 'insurer');
                const policyYear = effectiveField && effectiveField.value ? Number(effectiveField.value.slice(0, 4)) : '—';
                const insurer = insurerField && insurerField.value.trim() ? insurerField.value.trim() : '—';

                getClaims(policy).forEach(claim => {
                    const claimIndex = Number(claim.dataset.claimIndex);
                    const incidentField = getClaimField(policyIndex, claim, 'incidentDate');
                    const statusField = getClaimField(policyIndex, claim, 'status');
                    const incurredField = getClaimField(policyIndex, claim, 'incurred');
                    const detailsField = getClaimField(policyIndex, claim, 'details');

                    const incurred = readMoney(incurredField?.value || '0');
                    if (incurred < APP_CONFIG.largeLossThreshold) return;

                    rows.push({
                        policyIndex,
                        claimIndex,
                        policyYear,
                        insurer,
                        incidentDate: incidentField?.value || '—',
                        status: statusField?.value || 'open',
                        incurred: formatMoney(incurred),
                        details: detailsField?.value || ''
                    });
                });
            });

            if (rows.length === 0) {
                list.innerHTML = '<p class="large-losses-empty">No large losses with incurred amounts of at least $25,000 entered above.</p>';
                return;
            }

            list.innerHTML = rows.map(row => `
                <article class="large-loss-entry form-entry">
                    <dl class="large-loss-entry-grid">
                        <div class="large-loss-field form-field">
                            <dt>Policy Year</dt>
                            <dd>${escapeHtml(row.policyYear)}</dd>
                        </div>
                        <div class="large-loss-field form-field">
                            <dt>Insurer</dt>
                            <dd>${escapeHtml(row.insurer)}</dd>
                        </div>
                        <div class="large-loss-field form-field">
                            <dt>Incident Date</dt>
                            <dd>${escapeHtml(row.incidentDate)}</dd>
                        </div>
                        <div class="large-loss-field form-field">
                            <dt>Status</dt>
                            <dd>${escapeHtml(row.status)}</dd>
                        </div>
                        <div class="large-loss-field form-field">
                            <dt>Incurred</dt>
                            <dd>${escapeHtml(row.incurred)}</dd>
                        </div>
                        <div class="large-loss-field form-field large-loss-details">
                            <dt><label for="large-loss-details-${row.policyIndex}-${row.claimIndex}">Details</label></dt>
                            <dd><textarea id="large-loss-details-${row.policyIndex}-${row.claimIndex}" class="large-loss-detail-textarea" rows="5" data-policy-index="${row.policyIndex}" data-claim-index="${row.claimIndex}">${escapeHtml(row.details)}</textarea></dd>
                        </div>
                    </dl>
                </article>
            `).join('');
        }

        function renderInsuranceHistorySummaryTable() {
            const summaryBody = document.getElementById('insurance-history-summary-body');
            if (!summaryBody) return;

            const aggregateByYear = new Map();

            getPolicies().forEach(policy => {
                const effectiveField = getPolicyField(policy, 'effectiveDate');
                const insurerField = getPolicyField(policy, 'insurer');
                const lines = getCoverageInputs(policy, true).map(item => item.value);
                const claims = getClaims(policy);

                const effectiveYear = effectiveField && effectiveField.value ? Number(effectiveField.value.slice(0, 4)) : null;
                if (!effectiveYear) return;

                const row = aggregateByYear.get(effectiveYear) || {
                    policyYear: effectiveYear,
                    insurers: new Set(),
                    coverageLines: new Set(),
                    claimCount: 0,
                    openClaimCount: 0,
                    totalPaid: 0,
                    totalReserve: 0,
                    totalIncurred: 0
                };

                if (insurerField && insurerField.value.trim()) {
                    row.insurers.add(insurerField.value.trim());
                }

                lines.forEach(line => row.coverageLines.add(line));

                claims.forEach(claim => {
                    const statusField = claim.querySelector('[name$="][status]"]');
                    const paidField = claim.querySelector('[name$="][paid]"]');
                    const reserveField = claim.querySelector('[name$="][reserved]"]');
                    const incurredField = claim.querySelector('[name$="][incurred]"]');

                    const paid = readMoney(paidField?.value);
                    const reserved = readMoney(reserveField?.value);
                    const incurred = readMoney(incurredField?.value) || (paid + reserved);
                    const status = statusField?.value || 'open';

                    row.claimCount += 1;
                    if (status === 'open') row.openClaimCount += 1;
                    row.totalPaid += paid;
                    row.totalReserve += reserved;
                    row.totalIncurred += incurred;
                });

                aggregateByYear.set(effectiveYear, row);
            });

            const rows = Array.from(aggregateByYear.values()).sort((a, b) => b.policyYear - a.policyYear);
            if (rows.length === 0) {
                summaryBody.innerHTML = '';
                return;
            }

            summaryBody.innerHTML = rows.map(row => `
                <tr>
                    <td>${row.policyYear}</td>
                    <td>${escapeHtml(Array.from(row.insurers).join(', ') || '—')}</td>
                    <td>${escapeHtml(Array.from(row.coverageLines).join(', ') || '—')}</td>
                    <td>${row.claimCount}</td>
                    <td>${row.openClaimCount}</td>
                    <td>${formatMoney(row.totalPaid)}</td>
                    <td>${formatMoney(row.totalReserve)}</td>
                    <td>${formatMoney(row.totalIncurred)}</td>
                </tr>
            `).join('');
        }

