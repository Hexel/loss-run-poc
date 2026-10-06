// Manual fixtures: five consecutive Space presses restore the original sample;
// five a/b/c presses load improving/stable/deteriorating trucking loss histories.
// Shortcuts are disabled while editing fields or focusing buttons.
const seedPolicies = [
  {
    effectiveDate: "2022-01-01",
    expirationDate: "2023-01-01",
    insurer: "Alpha Insurer",
    premium: "78000",
    policyNumber: "ALPHA-01",
    coverageLines: ["Auto Liability", "General Liability"],
    claims: [
      {
        incidentDate: "2022-06-10",
        reportedDate: "2022-06-12",
        status: "open",
        incurred: "15000",
        alae: "500",
        paid: "10000",
        reserved: "5000",
        recovered: "0",
        details: "Small auto liability claim",
      },
      {
        incidentDate: "2022-10-11",
        reportedDate: "2022-10-15",
        status: "closed",
        incurred: "26000",
        alae: "1000",
        paid: "26000",
        reserved: "0",
        recovered: "0",
        details: "Large auto liability claim",
      },
    ],
  },
  {
    effectiveDate: "2023-01-01",
    expirationDate: "2024-01-01",
    insurer: "Beta Insurer",
    premium: "79500",
    policyNumber: "BETA-01",
    coverageLines: ["Auto Physical Damage"],
    claims: [
      {
        incidentDate: "2023-02-05",
        reportedDate: "2023-02-10",
        status: "open",
        incurred: "5000",
        alae: "200",
        paid: "0",
        reserved: "5000",
        recovered: "0",
        details: "Small physical damage claim",
      },
      {
        incidentDate: "2023-11-22",
        reportedDate: "2023-11-30",
        status: "open",
        incurred: "30000",
        alae: "1200",
        paid: "15000",
        reserved: "15000",
        recovered: "0",
        details: "Large physical damage claim",
      },
    ],
  },
  {
    effectiveDate: "2024-01-01",
    expirationDate: "2025-01-01",
    insurer: "Gamma Insurer",
    premium: "81000",
    policyNumber: "GAMMA-01",
    coverageLines: ["General Liability"],
    claims: [
      {
        incidentDate: "2024-04-14",
        reportedDate: "2024-04-20",
        status: "closed",
        incurred: "18000",
        alae: "600",
        paid: "18000",
        reserved: "0",
        recovered: "1000",
        details: "Small GL claim",
      },
    ],
  },
  {
    effectiveDate: "2025-01-01",
    expirationDate: "2026-01-01",
    insurer: "Delta Insurer",
    premium: "82000",
    policyNumber: "DELTA-01",
    coverageLines: ["Auto Liability", "Auto Physical Damage"],
    claims: [
      {
        incidentDate: "2025-03-12",
        reportedDate: "2025-03-22",
        status: "open",
        incurred: "40000",
        alae: "2000",
        paid: "15000",
        reserved: "25000",
        recovered: "0",
        details: "Large multi-line claim",
      },
    ],
  },
];

const seedLdfByYear = {
  2025: "2.0",
  2024: "1.75",
  2023: "1.5",
  2022: "1.25",
  2021: "1.0",
};

// Synthetic 20-power-unit fleets, with annual package premiums of $12,000–$15,000
// per truck. Closed claims include no reserves. Yearly average reporting lags
// worsen for a (3–24 days), improve for b (24–3 days), and stay at 8 days for c.
const truckingClaimDetails = {
  minor: "Low-speed backing collision; bumper and dock repairs, no injuries",
  moderate: "Tractor-trailer collision; towing and physical damage repairs",
  major: "At-fault highway collision; third-party bodily injury and property damage",
};

function createTruckingFixture(name, premiums, yearlyLosses, yearlyReportingLags) {
  return {
    policies: yearlyLosses.map((amounts, index) => {
      const year = 2021 + index;
      return {
        effectiveDate: `${year}-01-01`,
        expirationDate: `${year + 1}-01-01`,
        insurer: "Illustrative Trucking Insurance Co.",
        premium: String(premiums[index]),
        policyNumber: `TRK-${name}-${year}`,
        coverageLines: ["Auto Liability", "Auto Physical Damage", "General Liability"],
        claims: amounts.map((amount, claimIndex) => {
          const month = Math.floor((claimIndex + 0.5) * 12 / amounts.length);
          const day = 3 + (claimIndex * 7 + index * 5) % 23;
          const lag = yearlyReportingLags[index][claimIndex];
          const incidentDate = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
          const reportedDate = new Date(Date.UTC(year, month, day + lag)).toISOString().slice(0, 10);
          const severity = amount >= 50000 ? "major" : amount >= 15000 ? "moderate" : "minor";
          return {
            incidentDate,
            reportedDate,
            status: "closed",
            incurred: String(amount),
            alae: String(Math.round(amount * (severity === "major" ? 0.08 : 0.03))),
            paid: String(amount),
            reserved: "0",
            recovered: "0",
            details: truckingClaimDetails[severity],
          };
        }),
      };
    }),
    unitsByYear: { 2021: 20, 2022: 20, 2023: 20, 2024: 20, 2025: 20 },
    ldfByYear: seedLdfByYear,
  };
}

const truckingFixtures = {
  a: createTruckingFixture("IMPROVING", [270000, 265000, 255000, 245000, 240000], [
    [125000, 85000, 55000, 30000, 15000, 5000],
    [85000, 60000, 35000, 15000, 5000],
    [50000, 35000, 15000, 10000],
    [25000, 15000, 5000],
    [8000, 4000],
  ], [
    [1, 2, 2, 3, 4, 6],
    [3, 5, 6, 7, 9],
    [5, 8, 11, 16],
    [10, 15, 23],
    [20, 28],
  ]),
  b: createTruckingFixture("STABLE", [250000, 250000, 250000, 250000, 250000], [
    [50000, 30000, 15000, 5000],
    [52000, 29000, 16000, 5000],
    [48000, 31000, 14000, 6000],
    [51000, 30000, 15000, 5000],
    [52000, 31000, 15000, 5000],
  ], [
    [18, 22, 26, 30],
    [10, 14, 18, 22],
    [4, 8, 12, 16],
    [2, 4, 7, 11],
    [1, 2, 3, 6],
  ]),
  c: createTruckingFixture("DETERIORATING", [240000, 245000, 255000, 275000, 300000], [
    [8000, 4000],
    [25000, 15000, 5000],
    [50000, 35000, 15000, 10000],
    [85000, 60000, 35000, 15000, 5000],
    [125000, 85000, 55000, 30000, 15000, 5000],
  ], [
    [6, 10],
    [4, 8, 12],
    [3, 6, 10, 13],
    [2, 5, 8, 11, 14],
    [1, 4, 7, 9, 12, 15],
  ]),
};

function seedTestData(key = " ") {
  const fixture = truckingFixtures[key];
  const policies = fixture ? fixture.policies : seedPolicies;
  const ldfByYear = fixture ? fixture.ldfByYear : seedLdfByYear;
  clearPolicyList();
  policies.forEach((data, index) => {
    const policy = createPolicyEntry(index, data);
    policyList.appendChild(policy);
    getCoverageInputs(policy).forEach((line) => {
      if (data.coverageLines.includes(line.value)) line.checked = true;
    });

    data.claims.forEach((claimData) => appendClaim(policy, claimData));

    syncCoverageSelect(policy);
    policyNumber += 1;
  });
  refreshDerivedViews();
  document.querySelectorAll("#insurance-history-summary-body .units-input").forEach((input, index) => {
    const year = input.closest("tr").cells[0].textContent;
    input.value = fixture ? fixture.unitsByYear[year] : [13, 12, 13, 14][index] || 1;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.querySelectorAll("#insurance-history-summary-body .ldf-input").forEach((input) => {
    const year = input.closest("tr").cells[0].textContent;
    input.value = ldfByYear[year] || "1.0";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

initializeApp();