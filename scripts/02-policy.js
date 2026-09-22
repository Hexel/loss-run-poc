        // Policy controls and derived state
        function syncAddPolicyButtonLabel() {
            const hasPolicies = getPolicies().length > 0;
            if (addPolicyButton) {
                addPolicyButton.innerHTML = '<i class="fa-solid fa-square-plus" aria-hidden="true"></i>' + (hasPolicies ? 'Add another prior policy' : 'Add prior policy information');
            }
        }

        function syncPolicyListTip() {
            const tip = document.getElementById('tip-for-policy-list');
            if (!tip) return;
            const hasPolicies = getPolicies().length > 0;
            tip.style.display = hasPolicies ? 'none' : 'block';
        }

        function setAddClaimsButtonLabel(addClaimsButton, label) {
            if (!addClaimsButton) return;
            const text = label || 'Add claim';
            addClaimsButton.innerHTML = '<i class="fa-solid fa-square-plus" aria-hidden="true"></i> ' + text;
        }

        function insurerMatches(left, right) {
            return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
        }

        function hasPolicyCollision(policy, insurer, effectiveDate) {
            return getPolicies().some(candidate => {
                if (candidate === policy) return false;

                const insurerField = getPolicyField(candidate, 'insurer');
                const effectiveField = getPolicyField(candidate, 'effectiveDate');

                return insurerMatches(insurerField ? insurerField.value : '', insurer)
                    && effectiveField
                    && effectiveField.value
                    && effectiveField.value === effectiveDate;
            });
        }

        function syncPolicyActionButtons(policy) {
            if (!policy) return;

            const insurerField = getPolicyField(policy, 'insurer');
            const effectiveField = getPolicyField(policy, 'effectiveDate');
            const expirationField = getPolicyField(policy, 'expirationDate');
            const priorButton = policy.querySelector('.add-prior-policy');
            const renewalButton = policy.querySelector('.add-renewal-policy');

            const insurer = insurerField ? insurerField.value.trim() : '';
            const effectiveDate = effectiveField ? effectiveField.value : '';
            const expirationDate = expirationField ? expirationField.value : '';

            const priorCandidateDate = addYearsToDate(effectiveDate, -1);
            const priorAllowed = Boolean(effectiveDate) && !hasPolicyCollision(policy, insurer, priorCandidateDate);
            if (priorButton) {
                priorButton.style.display = priorAllowed ? '' : 'none';
            }

            const renewalAllowed = Boolean(expirationDate) && !hasPolicyCollision(policy, insurer, expirationDate);
            if (renewalButton) {
                renewalButton.style.display = renewalAllowed ? '' : 'none';
            }
        }

        function syncPolicyActionButtonsForAll() {
            getPolicies().forEach(syncPolicyActionButtons);
        }

        function refreshDerivedViews() {
            syncPolicyActionButtonsForAll();
            syncAddPolicyButtonLabel();
            syncPolicyListTip();
            renderInsuranceHistorySummaryTable();
            renderLargeLossesSection();
            syncInsuranceHistoryVisibility();
        }

        function updatePolicyTitle(policy) {
            if (!policy) return;
            const effectiveField = getPolicyField(policy, 'effectiveDate');
            const expirationField = getPolicyField(policy, 'expirationDate');
            const insurerField = getPolicyField(policy, 'insurer');
            const titleField = policy.querySelector('.policy-title');
            if (!titleField) return;

            const data = {
                effectiveDate: effectiveField ? effectiveField.value : '',
                expirationDate: expirationField ? expirationField.value : '',
                insurer: insurerField ? insurerField.value : ''
            };

            titleField.textContent = getPolicyTitle(data);
        }

        function getPolicyTitle(data = {}) {
            let policyTitle = `Prior Policy`;
            if (data.effectiveDate || data.insurer) {
                const policyTitleParts = [];
                policyTitle = ``;
                if (data.effectiveDate) {
                    const effectiveYear = new Date(data.effectiveDate + 'T00:00:00').getFullYear();
                    if (data.expirationDate) {
                        const expirationYear = (new Date(data.expirationDate + 'T00:00:00').getFullYear()) - 2000;
                        if (effectiveYear === expirationYear) {
                            policyTitleParts.push(effectiveYear);
                        } else {
                            policyTitleParts.push(`${effectiveYear}-${expirationYear}`);
                        }
                    } else {
                        policyTitleParts.push(effectiveYear);
                    }
                }
                if (data.insurer) {
                    policyTitleParts.push(data.insurer);
                }
                policyTitle = policyTitleParts.join(' ');
            }

            return policyTitle;
        }

