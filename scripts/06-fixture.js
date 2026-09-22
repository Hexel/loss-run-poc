        // Optional local fixture for manual testing; intentionally not loaded by default.
        const seedPolicies = [
            {
                effectiveDate: '2022-01-01', expirationDate: '2023-01-01', insurer: 'Alpha Insurer', premium: '1200', policyNumber: 'ALPHA-01', coverageLines: ['Auto Liability', 'General Liability'], claims: [
                    { incidentDate: '2022-06-10', status: 'open', incurred: '15000', alae: '500', paid: '10000', reserved: '5000', recovered: '0', details: 'Small auto liability claim' },
                    { incidentDate: '2022-10-11', status: 'closed', incurred: '26000', alae: '1000', paid: '26000', reserved: '0', recovered: '0', details: 'Large auto liability claim' }
                ]
            },
            {
                effectiveDate: '2023-01-01', expirationDate: '2024-01-01', insurer: 'Beta Insurer', premium: '1400', policyNumber: 'BETA-01', coverageLines: ['Auto Physical Damage'], claims: [
                    { incidentDate: '2023-02-05', status: 'open', incurred: '5000', alae: '200', paid: '0', reserved: '5000', recovered: '0', details: 'Small physical damage claim' },
                    { incidentDate: '2023-11-22', status: 'open', incurred: '30000', alae: '1200', paid: '15000', reserved: '15000', recovered: '0', details: 'Large physical damage claim' }
                ]
            },
            {
                effectiveDate: '2024-01-01', expirationDate: '2025-01-01', insurer: 'Gamma Insurer', premium: '1600', policyNumber: 'GAMMA-01', coverageLines: ['General Liability'], claims: [
                    { incidentDate: '2024-04-14', status: 'closed', incurred: '18000', alae: '600', paid: '18000', reserved: '0', recovered: '1000', details: 'Small GL claim' }
                ]
            },
            {
                effectiveDate: '2025-01-01', expirationDate: '2026-01-01', insurer: 'Delta Insurer', premium: '1800', policyNumber: 'DELTA-01', coverageLines: ['Auto Liability', 'Auto Physical Damage'], claims: [
                    { incidentDate: '2025-03-12', status: 'open', incurred: '40000', alae: '2000', paid: '15000', reserved: '25000', recovered: '0', details: 'Large multi-line claim' }
                ]
            }
        ];

        function seedTestData() {
            clearPolicyList();
            seedPolicies.forEach((data, index) => {
                const policy = createPolicyEntry(index, data);
                policyList.appendChild(policy);
                getCoverageInputs(policy).forEach(line => {
                    if (data.coverageLines.includes(line.value)) line.checked = true;
                });

                data.claims.forEach(claimData => appendClaim(policy, claimData));

                syncCoverageSelect(policy);
                policyNumber += 1;
            });
            refreshDerivedViews();
        }

        initializeApp();

