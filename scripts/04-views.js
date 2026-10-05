// Derived insurance history views
function formatSummaryDecimal(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

function formatSummaryClaimCount(value, suffix) {
  return `${formatSummaryDecimal(value)} ${suffix}`;
}

function autosizeSummaryInput(input) {
  input.style.width = `${Math.max(1, String(input.value).length) + 2}ch`;
}

function calculateLossRatio(totalPremium, totalIncurred, ldf = 1) {
  if (!totalPremium || !totalIncurred || !ldf) return null;
  return (totalIncurred * ldf) / totalPremium;
}

function averageYearReportingLag(row) {
  return row.reportingLagCount ? row.reportingLagTotal / row.reportingLagCount : NaN;
}

function formatReportingLag(value) {
  return Number.isFinite(value) ? `${formatSummaryDecimal(value)} days` : "—";
}

function averageReportingLagByYear(rows) {
  const values = rows.map(averageYearReportingLag).filter(Number.isFinite);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : NaN;
}

function renderReportingLagChart(container, rows) {
  const data = rows.map((row) => ({ year: row.policyYear, value: averageYearReportingLag(row) }))
    .sort((a, b) => a.year - b.year);
  const valid = data.filter((point) => Number.isFinite(point.value));
  if (!valid.length) {
    container.textContent = "No data";
    container.setAttribute("aria-label", "Average Reporting Lag: no claims with both incident and reported dates.");
    return;
  }
  const minimum = Math.min(0, ...valid.map((point) => point.value));
  const maximum = Math.max(1, ...valid.map((point) => point.value));
  const magnitude = 10 ** Math.floor(Math.log10((maximum - minimum) / 4));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= (maximum - minimum) / 4) * magnitude;
  const floor = Math.floor(minimum / step) * step;
  const ceiling = Math.ceil(maximum / step) * step;
  const x = (year) => data.length === 1 ? 245 : 95 + (year - data[0].year) / (data[data.length - 1].year - data[0].year) * 300;
  const y = (value) => 210 - (value - floor) / (ceiling - floor) * 170;
  const ticks = Array.from({ length: Math.round((ceiling - floor) / step) + 1 }, (_, index) => floor + index * step);
  const segments = [];
  let segment = [];
  data.forEach((point) => {
    if (Number.isFinite(point.value)) segment.push(point);
    else if (segment.length) { segments.push(segment); segment = []; }
  });
  if (segment.length) segments.push(segment);
  const line = (points) => points.map((point, index) => `${index ? "L" : "M"}${x(point.year)} ${y(point.value)}`).join(" ");
  container.setAttribute("aria-label", `Average Reporting Lag by policy year. X-axis: policy year. Y-axis: reporting lag in days. ${valid.map((point) => `${point.year}: ${formatReportingLag(point.value)}`).join("; ")}. Reporting lag is reported date minus incident date; claims missing either date are excluded.`);
  container.innerHTML = `<svg class="reporting-lag-line-chart" viewBox="0 0 440 280" aria-hidden="true">
    <defs><linearGradient id="reporting-lag-area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--color-action)" stop-opacity="0.18" />
      <stop offset="100%" stop-color="var(--color-action)" stop-opacity="0.02" />
    </linearGradient></defs>
    ${ticks.map((value) => `<path class="summary-trend-grid" d="M80 ${y(value)}H410" /><text class="summary-trend-label" text-anchor="end" x="68" y="${y(value) + 4}">${formatSummaryDecimal(value)}</text>`).join("")}
    <path class="summary-trend-axis" d="M80 40V210H410" />
    ${segments.filter((points) => points.length > 1).map((points) => `<path d="${line(points)} L${x(points[points.length - 1].year)} 210 L${x(points[0].year)} 210Z" fill="url(#reporting-lag-area)" />`).join("")}
    ${segments.map((points) => `<path class="summary-trend-line" d="${line(points)}" />`).join("")}
    ${valid.map((point) => `<circle class="summary-trend-point" cx="${x(point.year)}" cy="${y(point.value)}" r="5"><title>${point.year}: ${formatReportingLag(point.value)}</title></circle>
      ${data.length <= 6 ? `<text class="summary-trend-label summary-trend-axis-title" text-anchor="middle" x="${x(point.year)}" y="${y(point.value) - 14}">${formatReportingLag(point.value)}</text>` : ""}`).join("")}
    ${data.filter((point, index) => index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 6) === 0)
      .map((point) => `<text class="summary-trend-label" text-anchor="middle" x="${x(point.year)}" y="232">${point.year}</text>`).join("")}
    <text class="summary-trend-label summary-trend-axis-title" text-anchor="middle" x="245" y="265">Policy year</text>
    <text class="summary-trend-label summary-trend-axis-title" text-anchor="middle" transform="translate(18 125) rotate(-90)">Reporting lag (days)</text>
  </svg>`;
}

function renderLossCostPerUnitChart(container, rows, valueForRow) {
  const data = rows.map((row, index) => {
    const value = valueForRow(row, index);
    const ldf = row.ldf === undefined ? 1 : row.ldf;
    return { year: row.policyYear, value, developed: Number.isFinite(ldf) && ldf >= 0 ? value * ldf : NaN };
  }).sort((a, b) => a.year - b.year);
  const series = [
    { name: "Undeveloped Loss Cost Per Unit", key: "value", className: "loss-cost-undeveloped" },
    { name: "Developed Loss Cost Per Unit", key: "developed", className: "loss-cost-developed" },
  ].map((item) => ({ ...item, points: data.map((point) => ({ year: point.year, value: point[item.key] })) }));
  const valid = series.flatMap((item) => item.points.filter((point) => Number.isFinite(point.value)));
  if (!valid.length) {
    container.textContent = "Enter units for a policy year to see loss cost per unit.";
    container.setAttribute("aria-label", container.textContent);
    return;
  }

  const maximum = Math.max(...valid.map((point) => point.value), 1);
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 4));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= maximum / 4) * magnitude;
  const ceiling = step * 4;
  const firstYear = data[0].year;
  const lastYear = data[data.length - 1].year;
  const x = (year) => firstYear === lastYear ? 245 : 95 + (year - firstYear) / (lastYear - firstYear) * 300;
  const y = (value) => 210 - value / ceiling * 170;
  const tickMoney = (value) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 3,
  }).format(value);
  series.forEach((item) => {
    item.segments = [];
    let segment = [];
    item.points.forEach((point) => {
      if (Number.isFinite(point.value)) segment.push(point);
      else if (segment.length) { item.segments.push(segment); segment = []; }
    });
    if (segment.length) item.segments.push(segment);
  });
  const line = (points) => points.map((point, index) => `${index ? "L" : "M"}${x(point.year)} ${y(point.value)}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, index) => index * step);
  const fullMoney = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  const description = series.map((item) => `${item.name}: ${item.points.filter((point) => Number.isFinite(point.value))
    .map((point) => `${point.year}: ${fullMoney(point.value)} per unit`).join("; ")}`).join(". ");
  container.setAttribute("aria-label", `Loss Cost Per Unit line chart. X-axis: policy year. Y-axis: loss cost per unit in dollars. ${description}. Undeveloped equals total incurred divided by units; developed equals total incurred times LDF divided by units. Years without units have no data; developed values require a valid LDF.`);
  container.innerHTML = `<svg class="loss-cost-line-chart" viewBox="0 0 440 280" aria-hidden="true">
    <defs><linearGradient id="loss-cost-unit-area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--color-action)" stop-opacity="0.18" />
      <stop offset="100%" stop-color="var(--color-action)" stop-opacity="0.02" />
    </linearGradient></defs>
    ${ticks.map((value) => `<path class="loss-cost-grid" d="M80 ${y(value)}H410" />
      <text class="loss-cost-label" text-anchor="end" x="68" y="${y(value) + 4}">${tickMoney(value)}</text>`).join("")}
    <path class="loss-cost-axis" d="M80 40V210H410" />
    ${series[0].segments.filter((points) => points.length > 1).map((points) => `<path d="${line(points)} L${x(points[points.length - 1].year)} 210 L${x(points[0].year)} 210Z" fill="url(#loss-cost-unit-area)" />`).join("")}
    ${series.map((item) => `<g class="${item.className}">
      ${item.segments.map((points) => `<path class="loss-cost-line" d="${line(points)}" />`).join("")}
      ${item.points.filter((point) => Number.isFinite(point.value)).map((point) => `<circle class="loss-cost-point" cx="${x(point.year)}" cy="${y(point.value)}" r="${item.key === 'developed' ? 3 : 5}"><title>${item.name}, ${point.year}: ${fullMoney(point.value)} per unit</title></circle>`).join("")}
    </g>`).join("")}
    ${data.filter((point, index) => index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 6) === 0)
      .map((point) => `<text class="loss-cost-label" text-anchor="middle" x="${x(point.year)}" y="232">${point.year}</text>`).join("")}
    <text class="loss-cost-label loss-cost-axis-title" text-anchor="middle" x="245" y="265">Policy year</text>
    <text class="loss-cost-label loss-cost-axis-title" text-anchor="middle" transform="translate(18 125) rotate(-90)">Loss cost per unit ($)</text>
  </svg>
  <div class="loss-cost-legend" aria-hidden="true">
    <span class="loss-cost-undeveloped">Undeveloped Loss Cost Per Unit</span>
    <span class="loss-cost-developed">Developed Loss Cost Per Unit</span>
  </div>`;
}

function renderSummaryLineChart(containerId, rows, valueForRow, suffix) {
  const container = document.getElementById(containerId);
  if (container && containerId === "loss-cost-per-unit-chart") {
    renderLossCostPerUnitChart(container, rows, valueForRow);
    return;
  }
  if (container && containerId === "average-reporting-lag-chart") {
    renderReportingLagChart(container, rows);
    return;
  }
  if (!container || !rows.length) return;
  const values = rows.map(valueForRow);
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) { container.textContent = "No data"; return; }
  const max = Math.max(...valid, 1);
  const points = values.map((value, index) => `${index * 100 / Math.max(rows.length - 1, 1)},${100 - ((value || 0) / max) * 90}`).join(" ");
  container.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" /></svg><span>${valid[valid.length - 1].toFixed(1)}${suffix}</span>`;
}

function formatLossRatio(totalPremium, totalIncurred, ldf = 1) {
  const lossRatio = calculateLossRatio(totalPremium, totalIncurred, ldf);
  return lossRatio === null ? "—" : `${formatSummaryDecimal(lossRatio * 100)}%`;
}

function hasValue(field) {
  return Boolean(field && field.value && field.value.trim());
}

function hasInsuranceHistoryInformation() {
  const policyFieldNames = [
    "effectiveDate",
    "expirationDate",
    "insurer",
    "premium",
    "policyNumber",
  ];
  const claimFieldNames = [
    "incidentDate",
    "incurred",
    "alae",
    "paid",
    "reserved",
    "recovered",
    "details",
  ];

  return getPolicies().some((policy) => {
    if (
      policyFieldNames.some((fieldName) =>
        hasValue(getPolicyField(policy, fieldName)),
      )
    )
      return true;
    if (getCoverageInputs(policy, true).length > 0) return true;

    const policyIndex = getPolicyIndex(policy);
    return getClaims(policy).some((claim) => {
      return claimFieldNames.some((fieldName) =>
        hasValue(getClaimField(policyIndex, claim, fieldName)),
      );
    });
  });
}

function syncInsuranceHistoryVisibility() {
  const summaryTable = document.getElementById(
    "insurance-history-summary-table",
  );
  const largeLossList = document.getElementById("large-losses-list");
  const summaryPanel = document.getElementById(
    "insurance-history-summary-panel",
  );
  const largeLossPanel = document.getElementById("large-losses");
  const tipInsurance = document.getElementById("tip-for-insurance-history");
  const tipLarge = document.getElementById("tip-for-large-losses");
  const hasHistory = hasInsuranceHistoryInformation();

  if (tipInsurance) tipInsurance.style.display = "block";
  if (tipLarge) tipLarge.style.display = hasHistory ? "none" : "block";
  if (summaryTable) summaryTable.style.display = hasHistory ? "table" : "none";
  if (largeLossList)
    largeLossList.style.display = hasHistory ? "block" : "none";

  if (summaryPanel) {
    summaryPanel.classList.toggle("faded", !hasHistory);
  }
  if (largeLossPanel) {
    largeLossPanel.classList.toggle("faded", !hasHistory);
  }
}

function renderLargeLossesSection() {
  const list = document.getElementById("large-losses-list");
  if (!list) return;

  const rows = [];

  getPolicies().forEach((policy) => {
    const policyIndex = getPolicyIndex(policy);
    const effectiveField = getPolicyField(policy, "effectiveDate");
    const insurerField = getPolicyField(policy, "insurer");
    const policyYear =
      effectiveField && effectiveField.value
        ? Number(effectiveField.value.slice(0, 4))
        : "—";
    const insurer =
      insurerField && insurerField.value.trim()
        ? insurerField.value.trim()
        : "—";

    getClaims(policy).forEach((claim) => {
      const claimIndex = Number(claim.dataset.claimIndex);
      const incidentField = getClaimField(policyIndex, claim, "incidentDate");
      const statusField = getClaimField(policyIndex, claim, "status");
      const incurredField = getClaimField(policyIndex, claim, "incurred");
      const detailsField = getClaimField(policyIndex, claim, "details");

      const incurred = readMoney(incurredField?.value || "0");
      if (incurred < APP_CONFIG.largeLossThreshold) return;

      rows.push({
        policyIndex,
        claimIndex,
        policyYear,
        insurer,
        incidentDate: incidentField?.value || "—",
        status: statusField?.value || "open",
        incurred: formatMoney(incurred),
        details: detailsField?.value || "",
      });
    });
  });

  if (rows.length === 0) {
    list.innerHTML =
      '<p class="large-losses-empty">No large losses with incurred amounts of at least $25,000 entered above.</p>';
    return;
  }

  list.innerHTML = rows
    .map(
      (row) => `
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
            `,
    )
    .join("");
}

function renderInsuranceHistorySummaryTable() {
  const summaryBody = document.getElementById("insurance-history-summary-body");
  if (!summaryBody) return;

  const aggregateByYear = new Map();

  getPolicies().forEach((policy) => {
    const effectiveField = getPolicyField(policy, "effectiveDate");
    const insurerField = getPolicyField(policy, "insurer");
    const lines = getCoverageInputs(policy, true).map((item) => item.value);
    const claims = getClaims(policy);
    const policyIndex = getPolicyIndex(policy);
    const premiumField = getPolicyField(policy, "premium");

    const effectiveYear =
      effectiveField && effectiveField.value
        ? Number(effectiveField.value.slice(0, 4))
        : null;
    if (!effectiveYear) return;

    const row = aggregateByYear.get(effectiveYear) || {
      policyYear: effectiveYear,
      insurers: new Set(),
      coverageLines: new Set(),
      claimCount: 0,
      openClaimCount: 0,
      totalPaid: 0,
      totalReserve: 0,
      totalIncurred: 0,
      totalPremium: 0,
      reportingLagTotal: 0,
      reportingLagCount: 0,
      totalUnits: 0,
    };

    if (insurerField && insurerField.value.trim()) {
      row.insurers.add(insurerField.value.trim());
    }

    lines.forEach((line) => row.coverageLines.add(line));
    row.totalPremium += readMoney(premiumField?.value);

    claims.forEach((claim) => {
      const statusField = claim.querySelector('[name$="][status]"]');
      const paidField = claim.querySelector('[name$="][paid]"]');
      const reserveField = claim.querySelector('[name$="][reserved]"]');
      const incurredField = claim.querySelector('[name$="][incurred]"]');
      const reportedField = getClaimField(policyIndex, claim, "reportedDate");

      const paid = readMoney(paidField?.value);
      const reserved = readMoney(reserveField?.value);
      const incurred = readMoney(incurredField?.value) || paid + reserved;
      const status = statusField?.value || "open";

      row.claimCount += 1;
      if (status === "open") row.openClaimCount += 1;
      row.totalPaid += paid;
      row.totalReserve += reserved;
      row.totalIncurred += incurred;

      const incidentDate = new Date(claim.querySelector('[name$="][incidentDate]"]')?.value);
      const reportedDate = new Date(reportedField?.value);
      if (!Number.isNaN(incidentDate.valueOf()) && !Number.isNaN(reportedDate.valueOf())) {
        row.reportingLagTotal += (reportedDate - incidentDate) / 86400000;
        row.reportingLagCount += 1;
      }
    });

    aggregateByYear.set(effectiveYear, row);
  });

  const rows = Array.from(aggregateByYear.values()).sort(
    (a, b) => b.policyYear - a.policyYear,
  );
  const summaryFoot = document.getElementById("insurance-history-summary-foot");
  const averageReportingLag = document.getElementById("average-reporting-lag");
  const lossCostPerUnit = document.getElementById("loss-cost-per-unit");
  if (rows.length === 0) {
    summaryBody.innerHTML = "";
    if (summaryFoot) summaryFoot.innerHTML = "";
    if (averageReportingLag) averageReportingLag.textContent = "—";
    if (lossCostPerUnit) lossCostPerUnit.textContent = "—";
    renderSummaryLineChart("loss-cost-per-unit-chart", [], () => NaN, "");
    renderSummaryLineChart("average-reporting-lag-chart", [], () => NaN, " days");
    return;
  }

  summaryBody.innerHTML = rows
    .map(
      (row) => `
                <tr>
                    <td>${row.policyYear}</td>
                    <td>${escapeHtml(Array.from(row.insurers).join(", ") || "—")}</td>
                    <td>${escapeHtml(Array.from(row.coverageLines).join(", ") || "—")}</td>
                    <td><input class="units-input" type="number" min="0" step="1" aria-label="Units for policy year ${row.policyYear}"></td>
                    <td class="editable-summary-cell">${row.claimCount} ${row.claimCount === 1 ? "claim" : "claims"} <button type="button" class="summary-edit" aria-label="Override claims for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="editable-summary-cell">${row.openClaimCount} open <button type="button" class="summary-edit" aria-label="Override open claims for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="reporting-lag-cell">${formatReportingLag(averageYearReportingLag(row))}</td>
                    <td class="editable-summary-cell">${formatMoney(row.totalPaid)} <button type="button" class="summary-edit" aria-label="Override paid amount for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="editable-summary-cell">${formatMoney(row.totalReserve)} <button type="button" class="summary-edit" aria-label="Override reserve amount for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="editable-summary-cell">${formatMoney(row.totalIncurred)} <button type="button" class="summary-edit" aria-label="Override incurred amount for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="premium-cell editable-summary-cell">${formatMoney(row.totalPremium)} <button type="button" class="premium-edit summary-edit" aria-label="Override premium for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="editable-summary-cell">${formatLossRatio(row.totalPremium, row.totalIncurred)} <button type="button" class="summary-edit" aria-label="Override loss ratio for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td><input class="ldf-input" type="number" min="0" step="0.01" value="1.0" aria-label="LDF for policy year ${row.policyYear}"></td>
                    <td class="developed-loss-ratio">—</td>
                </tr>
            `,
    )
    .join("");

  const totalClaims = rows.reduce((total, row) => total + row.claimCount, 0);
  const totalOpenClaims = rows.reduce((total, row) => total + row.openClaimCount, 0);
  const totalPaid = rows.reduce((total, row) => total + row.totalPaid, 0);
  const totalReserve = rows.reduce((total, row) => total + row.totalReserve, 0);
  const totalIncurred = rows.reduce((total, row) => total + row.totalIncurred, 0);
  const totalPremium = rows.reduce((total, row) => total + row.totalPremium, 0);
  const totalUnits = Array.from(summaryBody.querySelectorAll(".units-input"))
    .reduce((total, input) => total + (Number(input.value) || 0), 0);
  const average = (value) => value / rows.length;
  const reportingLagAverage = formatReportingLag(averageReportingLagByYear(rows));
  if (summaryFoot) {
    summaryFoot.innerHTML = `
      <tr><th colspan="3">${rows.length}-year Average</th><td>${average(totalUnits).toFixed(1)}</td><td>${formatSummaryClaimCount(average(totalClaims), "avg")}</td><td>${formatSummaryClaimCount(average(totalOpenClaims), "avg open")}</td><td class="reporting-lag-cell">${reportingLagAverage}</td><td>${formatMoney(average(totalPaid))}</td><td>${formatMoney(average(totalReserve))}</td><td>${formatMoney(average(totalIncurred))}</td><td>${formatMoney(average(totalPremium))}</td><td>${formatLossRatio(totalPremium, totalIncurred)}</td><td></td><td></td></tr>
      <tr><th colspan="3">${rows.length}-year Total</th><td>${totalUnits}</td><td>${totalClaims} total</td><td>${totalOpenClaims} open</td><td class="reporting-lag-cell">—</td><td>${formatMoney(totalPaid)}</td><td>${formatMoney(totalReserve)}</td><td>${formatMoney(totalIncurred)}</td><td>${formatMoney(totalPremium)}</td><td>${formatLossRatio(totalPremium, totalIncurred)}</td><td></td><td></td></tr>`;
  }
  if (averageReportingLag) averageReportingLag.textContent = formatReportingLag(averageReportingLagByYear(rows.slice(0, 4)));
  if (lossCostPerUnit) lossCostPerUnit.textContent = totalUnits ? formatMoney(totalIncurred / totalUnits) : "—";

  summaryBody.querySelectorAll(".summary-edit:not(.premium-edit)").forEach((button) => {
    button.onclick = () => {
      const cell = button.closest("td");
      const rawValue = cell.textContent.replace(/[^0-9.-]/g, "");
      cell.innerHTML = `<input class="summary-override" type="number" step="0.01" value="${rawValue}" aria-label="Override value">`;
      const input = cell.querySelector("input");
      autosizeSummaryInput(input);
      input.oninput = () => autosizeSummaryInput(input);
      input.focus();
    };
  });

  summaryBody.querySelectorAll("tr").forEach((tableRow, index) => {
    const row = rows[index];
    const premiumCell = tableRow.querySelector(".premium-cell");
    const editButton = premiumCell?.querySelector(".premium-edit");
    if (!premiumCell || !editButton) return;
    editButton.onclick = () => {
      premiumCell.innerHTML = `<input class="premium-override" type="number" min="0" step="0.01" value="${row.totalPremium}" aria-label="Premium for policy year ${row.policyYear}">`;
      const input = premiumCell.querySelector(".premium-override");
      autosizeSummaryInput(input);
      input.focus();
      input.oninput = () => {
        autosizeSummaryInput(input);
        row.totalPremium = Number(input.value) || 0;
        tableRow.cells[11].innerHTML = row.totalPremium ? formatLossRatio(row.totalPremium, row.totalIncurred) : "—";
        const updatedTotalPremium = rows.reduce((total, current) => total + current.totalPremium, 0);
        const footerRows = summaryFoot?.querySelectorAll("tr") || [];
        if (footerRows.length === 2) {
          footerRows[0].cells[8].innerHTML = formatMoney(updatedTotalPremium / rows.length);
          footerRows[1].cells[8].innerHTML = formatMoney(updatedTotalPremium);
          footerRows[0].cells[9].innerHTML = updatedTotalPremium ? `${formatSummaryDecimal((totalIncurred / updatedTotalPremium) * 100)}%` : "—";
          footerRows[1].cells[9].innerHTML = footerRows[0].cells[9].innerHTML;
        }
      };
    };
  });

  const updateLossCostChart = () => renderSummaryLineChart("loss-cost-per-unit-chart", rows, (row, index) => {
    const units = Number(summaryBody.querySelectorAll(".units-input")[index]?.value) || 0;
    return units > 0 ? row.totalIncurred / units : NaN;
  }, "");

  summaryBody.querySelectorAll(".ldf-input").forEach((input) => {
    const tableRow = input.closest("tr");
    const row = rows[Array.from(summaryBody.querySelectorAll("tr")).indexOf(tableRow)];
    autosizeSummaryInput(input);
    input.oninput = () => {
      autosizeSummaryInput(input);
      const ldf = Number(input.value) || 0;
      row.ldf = input.value === "" ? NaN : Number(input.value);
      tableRow.querySelector(".developed-loss-ratio").textContent = ldf && row.totalIncurred
        ? formatLossRatio(row.totalPremium, row.totalIncurred, ldf)
        : "—";
      updateLossCostChart();
    };
  });

  updateLossCostChart();
  renderSummaryLineChart("average-reporting-lag-chart", rows, (row) => row.reportingLagCount ? row.reportingLagTotal / row.reportingLagCount : NaN, " days");

  summaryBody.querySelectorAll(".units-input").forEach((input) => {
    input.oninput = () => {
      const updatedTotalUnits = Array.from(summaryBody.querySelectorAll(".units-input"))
        .reduce((total, current) => total + (Number(current.value) || 0), 0);
      const footerRows = summaryFoot?.querySelectorAll("tr") || [];
      if (footerRows.length === 2) {
        footerRows[0].cells[1].innerHTML = formatSummaryDecimal(updatedTotalUnits / rows.length);
                footerRows[1].cells[1].textContent = updatedTotalUnits;
      }
      if (lossCostPerUnit) lossCostPerUnit.textContent = updatedTotalUnits ? formatMoney(totalIncurred / updatedTotalUnits) : "—";
      updateLossCostChart();
    };
  });
}







