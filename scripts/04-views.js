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

function formatAffixedInput(input) {
  const isUsd = input.classList.contains("usd-input");
  const decorations = isUsd ? /[$,]/g : /%/g;
  const prefix = isUsd ? "$" : "";
  const suffix = isUsd ? "" : "%";
  const position = input.selectionStart;
  const significantBeforeCaret = input.value.slice(0, position ?? input.value.length).replace(decorations, "").length;
  const raw = input.value.replace(decorations, "");
  if (!/^-?\d*(?:\.\d*)?$/.test(raw)) {
    input.setCustomValidity(isUsd ? "Enter a valid dollar amount." : "Enter a valid percentage.");
    return;
  }
  input.setCustomValidity(input.min === "0" && Number(raw) < 0 ? "Enter a non-negative value." : "");
  const [integer, fraction] = raw.split(".");
  const formattedInteger = isUsd ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : integer;
  input.value = raw === "" ? "" : prefix + formattedInteger + (fraction === undefined ? "" : `.${fraction}`) + suffix;
  if (position !== null) {
    let caret = input.value ? prefix.length : 0;
    let count = 0;
    const end = input.value.length - (input.value ? suffix.length : 0);
    while (caret < end && count < significantBeforeCaret) {
      if (input.value[caret] !== ",") count += 1;
      caret += 1;
    }
    input.setSelectionRange(caret, caret);
  }
}

function initializeAffixedInput(input) {
  input.type = "text";
  input.inputMode = "decimal";
  formatAffixedInput(input);
}

function calculateLossRatio(totalPremium, totalIncurred, ldf = 1) {
  if (!totalPremium || !totalIncurred || !ldf) return null;
  return (totalIncurred * ldf) / totalPremium;
}

function averageYearReportingLag(row) {
  if (row.reportingLagOverride !== undefined) return row.reportingLagOverride;
  return row.reportingLagCount ? row.reportingLagTotal / row.reportingLagCount : NaN;
}

function formatReportingLag(value) {
  return Number.isFinite(value) ? `${formatSummaryDecimal(value)} days` : "—";
}

function averageReportingLagByYear(rows) {
  const values = rows.map(averageYearReportingLag).filter(Number.isFinite);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : NaN;
}

function calculateChartTrend(points) {
  const valid = points.filter((point) => Number.isFinite(point.value));
  const first = valid[0]?.value || 0;
  const last = valid[valid.length - 1]?.value || 0;
  const change = last - first;
  const tolerance = Math.abs(first) * 0.05 + Math.max(Math.abs(first), Math.abs(last), 1) * Number.EPSILON;
  const direction = valid.length < 2 || Math.abs(change) <= tolerance ? "stable" : change < 0 ? "positive" : "negative";
  const colors = { positive: "#15803d", stable: "#a87516", negative: "#dc2626" };
  const labels = { positive: "Improving", stable: "Stable", negative: "Worsening" };
  return { direction, color: colors[direction], label: labels[direction] };
}

function renderAnimatedChart(container, markup) {
  const previous = new Map();
  container.querySelectorAll("svg [data-chart-key]").forEach((element) => {
    const style = getComputedStyle(element);
    previous.set(element.dataset.chartKey, {
      tag: element.tagName,
      d: style.d,
      commands: (element.getAttribute("d") || "").replace(/[^a-z]/gi, ""),
      cx: style.cx,
      cy: style.cy,
      stroke: style.stroke,
      x: Number(element.getAttribute("x")),
      y: Number(element.getAttribute("y")),
    });
  });
  container.innerHTML = markup;
  if (!previous.size || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const options = { duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
  container.querySelectorAll("svg [data-chart-key]").forEach((element) => {
    const old = previous.get(element.dataset.chartKey);
    if (!old || old.tag !== element.tagName) {
      element.animate([{ opacity: 0 }, { opacity: 1 }], options);
    } else if (element.tagName === "circle") {
      const style = getComputedStyle(element);
      element.animate([{ cx: old.cx, cy: old.cy, stroke: old.stroke }, { cx: style.cx, cy: style.cy, stroke: style.stroke }], options);
    } else if (element.tagName === "path") {
      const commands = (element.getAttribute("d") || "").replace(/[^a-z]/gi, "");
      if (old.commands === commands) {
        const style = getComputedStyle(element);
        element.animate([{ d: old.d, stroke: old.stroke }, { d: style.d, stroke: style.stroke }], options);
      } else {
        element.animate([{ opacity: 0 }, { opacity: 1 }], options);
      }
    } else if (element.tagName === "text") {
      const dx = old.x - Number(element.getAttribute("x"));
      const dy = old.y - Number(element.getAttribute("y"));
      element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], options);
    }
  });
}

function renderReportingLagChart(container, rows) {
  renderYearlyTrendChart(container, rows, {
    title: "Average Reporting Lag",
    axis: "Reporting lag (days)",
    valueForRow: averageYearReportingLag,
    formatValue: formatReportingLag,
    description: "Reporting lag is reported date minus incident date; claims missing either date are excluded. Table overrides replace the calculated yearly averages.",
  });
}

function renderYearlyTrendChart(container, rows, settings) {
  const data = rows.map((row) => ({ year: row.policyYear, value: settings.valueForRow(row) }))
    .sort((a, b) => a.year - b.year);
  const valid = data.filter((point) => Number.isFinite(point.value));
  if (!valid.length) {
    container.textContent = "No data";
    container.setAttribute("aria-label", `${settings.title}: no valid calculated or overridden values.`);
    return;
  }
  const minimum = Math.min(0, ...valid.map((point) => point.value));
  const maximum = Math.max(1, ...valid.map((point) => point.value));
  const magnitude = 10 ** Math.floor(Math.log10((maximum - minimum) / 4));
  const step = Math.max(settings.integerTicks ? 1 : 0, [1, 2, 5, 10].find((factor) => factor * magnitude >= (maximum - minimum) / 4) * magnitude);
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
  const trend = calculateChartTrend(data);
  container.setAttribute("aria-label", `${settings.title} by policy year. X-axis: policy year. Y-axis: ${settings.axis}. ${valid.map((point) => `${point.year}: ${settings.formatValue(point.value)}`).join("; ")}.   ${settings.description} ${trend.label} trend. Stable means net change within 5% of the earliest available year; lower values are better.`);
    renderAnimatedChart(container, `<svg class="reporting-lag-line-chart trend-${trend.direction}" viewBox="0 0 440 280" aria-hidden="true">
    <defs><linearGradient id="${container.id}-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${trend.color}" stop-opacity="0.18" />
        <stop offset="100%" stop-color="${trend.color}" stop-opacity="0.02" />
    </linearGradient></defs>
    ${ticks.map((value) => `<path class="summary-trend-grid" d="M80 ${y(value)}H410" /><text class="summary-trend-label" text-anchor="end" x="68" y="${y(value) + 4}">${formatSummaryDecimal(value)}</text>`).join("")}
    <path class="summary-trend-axis" d="M80 40V210H410" />
    ${segments.filter((points) => points.length > 1).map((points, index) => `<path data-chart-key="area-${index}" d="${line(points)} L${x(points[points.length - 1].year)} 210 L${x(points[0].year)} 210Z" fill="url(#${container.id}-area)" />`).join("")}
    ${segments.map((points, index) => `<path data-chart-key="line-${index}" class="summary-trend-line" d="${line(points)}" />`).join("")}
    ${valid.map((point) => `<circle data-chart-key="point-${point.year}" class="summary-trend-point" cx="${x(point.year)}" cy="${y(point.value)}" r="5"><title>${point.year}: ${settings.formatValue(point.value)}</title></circle>
      ${data.length <= 6 ? `<text data-chart-key="label-${point.year}" class="summary-trend-label summary-trend-axis-title" text-anchor="middle" x="${x(point.year)}" y="${y(point.value) - 14}">${settings.formatValue(point.value)}</text>` : ""}`).join("")}
    ${data.filter((point, index) => index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 6) === 0)
      .map((point) => `<text class="summary-trend-label" text-anchor="middle" x="${x(point.year)}" y="232">${point.year}</text>`).join("")}
    <text class="summary-trend-label summary-trend-axis-title" text-anchor="middle" x="245" y="265">Policy year</text>
    <text class="summary-trend-label summary-trend-axis-title" text-anchor="middle" transform="translate(18 125) rotate(-90)">${settings.axis}</text>
  </svg><p class="chart-trend-note trend-${trend.direction}" aria-hidden="true">${trend.label} trend · lower is better</p>`);
}

function renderLossCostPerUnitChart(container, rows, valueForRow, incurred = false) {
  const data = rows.map((row, index) => {
    const value = valueForRow(row, index);
    const ldf = row.ldf === undefined ? 1 : row.ldf;
    return { year: row.policyYear, value, developed: Number.isFinite(ldf) && ldf >= 0 ? value * ldf : NaN };
  }).sort((a, b) => a.year - b.year);
  const measure = incurred ? "Incurred Loss" : "Loss Cost Per Unit";
  const unitSuffix = incurred ? "" : " per unit";
  const series = [
    { name: `Undeveloped ${measure}`, key: "value", className: "loss-cost-undeveloped" },
    { name: `Developed ${measure}`, key: "developed", className: "loss-cost-developed" },
  ].map((item) => {
    const points = data.map((point) => ({ year: point.year, value: point[item.key] }));
    return { ...item, points, trend: calculateChartTrend(points) };
  });
  const valid = series.flatMap((item) => item.points.filter((point) => Number.isFinite(point.value)));
  if (!valid.length) {
    container.textContent = incurred ? "No data" : "Enter units for a policy year to see loss cost per unit.";
    container.setAttribute("aria-label", container.textContent);
    return;
  }

  const maximum = Math.max(...valid.map((point) => Math.abs(point.value)), 1);
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 4));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= maximum / 4) * magnitude;
  const ceiling = step * 4;
  const floor = Math.floor(Math.min(0, ...valid.map((point) => point.value)) / step) * step;
  const firstYear = data[0].year;
  const lastYear = data[data.length - 1].year;
  const x = (year) => firstYear === lastYear ? 245 : 95 + (year - firstYear) / (lastYear - firstYear) * 300;
  const y = (value) => 210 - (value - floor) / (ceiling - floor) * 170;
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
  const ticks = Array.from({ length: Math.round((ceiling - floor) / step) + 1 }, (_, index) => floor + index * step);
  const fullMoney = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  const description = series.map((item) => `${item.name}: ${item.points.filter((point) => Number.isFinite(point.value))
    .map((point) => `${point.year}: ${fullMoney(point.value)}${unitSuffix}`).join("; ")}. ${item.trend.label} trend`).join(". ");
  const formula = incurred ? "Undeveloped equals total incurred; developed equals total incurred times LDF." : "Undeveloped equals total incurred divided by units; developed equals total incurred times LDF divided by units. Years without units have no data.";
  container.setAttribute("aria-label", `${measure} line chart. X-axis: policy year. Y-axis: ${measure.toLowerCase()} in dollars. ${description}. ${formula} Developed values require a valid LDF. Stable means net change within 5% of the earliest available year; lower values are better.`);
  renderAnimatedChart(container, `<svg class="loss-cost-line-chart" viewBox="0 0 440 280" aria-hidden="true">
    <defs><linearGradient id="${container.id}-area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${series[0].trend.color}" stop-opacity="0.18" />
      <stop offset="100%" stop-color="${series[0].trend.color}" stop-opacity="0.02" />
    </linearGradient></defs>
    ${ticks.map((value) => `<path class="loss-cost-grid" d="M80 ${y(value)}H410" />
      <text class="loss-cost-label" text-anchor="end" x="68" y="${y(value) + 4}">${tickMoney(value)}</text>`).join("")}
    <path class="loss-cost-axis" d="M80 40V210H410" />
    ${series[0].segments.filter((points) => points.length > 1).map((points, index) => `<path data-chart-key="area-${index}" d="${line(points)} L${x(points[points.length - 1].year)} 210 L${x(points[0].year)} 210Z" fill="url(#${container.id}-area)" />`).join("")}
    ${series.map((item) => `<g class="${item.className} trend-${item.trend.direction}">
      ${item.segments.map((points, index) => `<path data-chart-key="line-${item.key}-${index}" class="loss-cost-line" d="${line(points)}" />`).join("")}
      ${item.points.filter((point) => Number.isFinite(point.value)).map((point) => {
        const undeveloped = data.find((entry) => entry.year === point.year).value;
        const closeToUndeveloped = item.key === "developed" && Number.isFinite(undeveloped) && Math.abs(y(point.value) - y(undeveloped)) < 28;
        const labelY = closeToUndeveloped ? Math.min(y(point.value), y(undeveloped)) - 30 : y(point.value) - 14;
        return `<circle data-chart-key="point-${item.key}-${point.year}" class="loss-cost-point" cx="${x(point.year)}" cy="${y(point.value)}" r="${item.key === 'developed' ? 3 : 5}"><title>${item.name}, ${point.year}: ${fullMoney(point.value)}${unitSuffix}</title></circle>
          <text data-chart-key="label-${item.key}-${point.year}" class="loss-cost-label summary-trend-axis-title" text-anchor="middle" x="${x(point.year)}" y="${labelY}">${tickMoney(point.value)}</text>`;
      }).join("")}
    </g>`).join("")}
    ${data.filter((point, index) => index === 0 || index === data.length - 1 || index % Math.ceil(data.length / 6) === 0)
      .map((point) => `<text class="loss-cost-label" text-anchor="middle" x="${x(point.year)}" y="232">${point.year}</text>`).join("")}
    <text class="loss-cost-label loss-cost-axis-title" text-anchor="middle" x="245" y="265">Policy year</text>
    <text class="loss-cost-label loss-cost-axis-title" text-anchor="middle" transform="translate(18 125) rotate(-90)">${incurred ? "Incurred loss ($)" : "Loss cost per unit ($)"}</text>
  </svg>
  <div class="loss-cost-legend" aria-hidden="true">
    ${series.map((item) => `<span class="${item.className} trend-${item.trend.direction}" title="${item.trend.label} trend · lower is better">${item.name}</span>`).join("")}
  </div>`);
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
  if (container && containerId === "claim-count-chart") {
    renderYearlyTrendChart(container, rows, {
      title: "Claim Count Per Year", axis: "Claim count", valueForRow: (row) => row.claimCount,
      formatValue: (value) => `${formatSummaryDecimal(value)} ${value === 1 ? "claim" : "claims"}`,
      integerTicks: true, description: "Claim counts include table overrides.",
    });
    return;
  }
  if (container && containerId === "incurred-loss-chart") {
    renderLossCostPerUnitChart(container, rows, (row) => row.totalIncurred, true);
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
      ldf: 1,
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
    renderSummaryLineChart("claim-count-chart", [], () => NaN, "");
    renderSummaryLineChart("incurred-loss-chart", [], () => NaN, "");
    return;
  }

  summaryBody.innerHTML = rows
    .map(
      (row) => `
                <tr>
                    <td>${row.policyYear}</td>
                    <td>${escapeHtml(Array.from(row.insurers).join(", ") || "—")}</td>
                    <td>${escapeHtml(Array.from(row.coverageLines).join(", ") || "—")}</td>
                    <td><input class="units-input inline-cell-input" type="number" min="0" step="1" aria-label="Units for policy year ${row.policyYear}"></td>
                    <td class="editable-summary-cell claim-count-cell">${row.claimCount} ${row.claimCount === 1 ? "claim" : "claims"} <button type="button" class="summary-edit" aria-label="Override claims for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="editable-summary-cell">${row.openClaimCount} open <button type="button" class="summary-edit" aria-label="Override open claims for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="reporting-lag-cell editable-summary-cell">${formatReportingLag(averageYearReportingLag(row))} <button type="button" class="summary-edit" aria-label="Override average reporting lag for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="editable-summary-cell" data-currency="usd">${formatMoney(row.totalPaid)} <button type="button" class="summary-edit" aria-label="Override paid amount for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="editable-summary-cell" data-currency="usd">${formatMoney(row.totalReserve)} <button type="button" class="summary-edit" aria-label="Override reserve amount for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="editable-summary-cell" data-currency="usd">${formatMoney(row.totalIncurred)} <button type="button" class="summary-edit" aria-label="Override incurred amount for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="premium-cell editable-summary-cell">${formatMoney(row.totalPremium)} <button type="button" class="premium-edit summary-edit" aria-label="Override premium for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td class="editable-summary-cell" data-format="pct">${formatLossRatio(row.totalPremium, row.totalIncurred)} <button type="button" class="summary-edit" aria-label="Override loss ratio for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
                    <td><input class="ldf-input inline-cell-input" type="number" min="0" step="0.01" value="1.0" aria-label="LDF for policy year ${row.policyYear}"></td>
                    <td class="developed-loss-ratio editable-summary-cell" data-format="pct">— <button type="button" class="summary-edit" aria-label="Override developed loss ratio for policy year ${row.policyYear}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button></td>
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
      <tr><th colspan="3">${rows.length}-year Average</th><td>${average(totalUnits).toFixed(1)}</td><td class="claim-count-cell">${formatSummaryClaimCount(average(totalClaims), "avg")}</td><td>${formatSummaryClaimCount(average(totalOpenClaims), "open")}</td><td class="reporting-lag-cell">${reportingLagAverage}</td><td>${formatMoney(average(totalPaid))}</td><td>${formatMoney(average(totalReserve))}</td><td>${formatMoney(average(totalIncurred))}</td><td>${formatMoney(average(totalPremium))}</td>      <td>${formatLossRatio(totalPremium, totalIncurred)}</td><td class="average-ldf" title="Arithmetic average of valid yearly LDF values">—</td><td class="average-developed-loss-ratio" title="Arithmetic average of valid yearly developed loss ratios, including overrides">—</td></tr>
      <tr><th colspan="3">${rows.length}-year Total</th><td>${totalUnits}</td><td class="claim-count-cell">${totalClaims} total</td><td>${totalOpenClaims} open</td><td class="reporting-lag-cell">—</td><td>${formatMoney(totalPaid)}</td><td>${formatMoney(totalReserve)}</td><td>${formatMoney(totalIncurred)}</td><td>${formatMoney(totalPremium)}</td><td>${formatLossRatio(totalPremium, totalIncurred)}</td><td></td><td></td></tr>`;
  }
  if (averageReportingLag) averageReportingLag.textContent = formatReportingLag(averageReportingLagByYear(rows.slice(0, 4)));
  if (lossCostPerUnit) lossCostPerUnit.textContent = totalUnits ? formatMoney(totalIncurred / totalUnits) : "—";

  const tableRows = Array.from(summaryBody.querySelectorAll("tr"));
  const originalPremiums = rows.map((row) => row.totalPremium);
  const originalClaims = rows.map((row) => row.claimCount);
  const originalIncurred = rows.map((row) => row.totalIncurred);
  const calculatedDevelopedRatio = (row) => Number.isFinite(row.ldf) && row.ldf >= 0 && row.totalPremium > 0
    ? row.totalIncurred * row.ldf / row.totalPremium : NaN;
  const displayRatio = (value) => Number.isFinite(value) ? `${formatSummaryDecimal(value * 100)}%` : "—";
  const mean = (values) => {
    const valid = values.filter(Number.isFinite);
    return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : NaN;
  };
  const updateAverageRatios = () => {
    const averageLdf = summaryFoot?.querySelector(".average-ldf");
    const averageDeveloped = summaryFoot?.querySelector(".average-developed-loss-ratio");
    const ldfMean = mean(rows.map((row) => row.ldf >= 0 ? row.ldf : NaN));
    if (averageLdf) averageLdf.textContent = Number.isFinite(ldfMean) ? String(Number(ldfMean.toFixed(4))) : "—";
    if (averageDeveloped) averageDeveloped.textContent = displayRatio(mean(rows.map((row) =>
      row.developedRatioOverride === undefined ? calculatedDevelopedRatio(row) : row.developedRatioOverride)));
  };
  const updateFinancialTotals = () => {
    const updatedTotalPremium = rows.reduce((total, row) => total + row.totalPremium, 0);
    const updatedTotalIncurred = rows.reduce((total, row) => total + row.totalIncurred, 0);
    const footerRows = summaryFoot?.querySelectorAll("tr") || [];
    if (footerRows.length === 2) {
      footerRows[0].cells[8].innerHTML = formatMoney(updatedTotalPremium / rows.length);
      footerRows[1].cells[8].innerHTML = formatMoney(updatedTotalPremium);
      footerRows[0].cells[7].innerHTML = formatMoney(updatedTotalIncurred / rows.length);
      footerRows[1].cells[7].innerHTML = formatMoney(updatedTotalIncurred);
      footerRows[0].cells[9].innerHTML = formatLossRatio(updatedTotalPremium, updatedTotalIncurred);
      footerRows[1].cells[9].innerHTML = footerRows[0].cells[9].innerHTML;
    }
    if (lossCostPerUnit) {
      const units = Array.from(summaryBody.querySelectorAll(".units-input")).reduce((total, input) => total + (Number(input.value) || 0), 0);
      lossCostPerUnit.textContent = units ? formatMoney(updatedTotalIncurred / units) : "—";
    }
    updateAverageRatios();
  };
  const updateClaimTotals = () => {
    const count = rows.reduce((total, row) => total + row.claimCount, 0);
    const footerRows = summaryFoot?.querySelectorAll("tr") || [];
    if (footerRows.length === 2) {
      footerRows[0].cells[2].textContent = formatSummaryClaimCount(count / rows.length, "avg");
      footerRows[1].cells[2].textContent = `${count} total`;
    }
    renderSummaryLineChart("claim-count-chart", rows, (row) => row.claimCount, "");
  };
  const updateReportingLag = () => {
    renderSummaryLineChart("average-reporting-lag-chart", rows, averageYearReportingLag, " days");
    const footerLag = summaryFoot?.querySelector("tr:first-child .reporting-lag-cell");
    if (footerLag) footerLag.textContent = formatReportingLag(averageReportingLagByYear(rows));
    if (averageReportingLag) averageReportingLag.textContent = formatReportingLag(averageReportingLagByYear(rows.slice(0, 4)));
  };
  const renderEditableCell = (cell, value, label, isPremium = false) => {
    cell.innerHTML = `${value} <button type="button" class="summary-edit${isPremium ? " premium-edit" : ""}" aria-label="${escapeHtml(label)}" title="Override"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button>`;
    bindSummaryOverride(cell.querySelector(".summary-edit"));
  };
  const updateRatioCells = (tableRow, row) => {
    if (!tableRow.cells[11].querySelector("input")) {
      renderEditableCell(tableRow.cells[11], formatLossRatio(row.totalPremium, row.totalIncurred), `Override loss ratio for policy year ${row.policyYear}`);
    }
    const developedCell = tableRow.querySelector(".developed-loss-ratio");
    if (!developedCell.querySelector("input")) {
      renderEditableCell(developedCell, displayRatio(calculatedDevelopedRatio(row)), `Override developed loss ratio for policy year ${row.policyYear}`);
    }
  };
  const bindSummaryOverride = (button) => {
    button.onclick = () => {
      const cell = button.closest("td");
      const tableRow = cell.closest("tr");
      const index = tableRows.indexOf(tableRow);
      const row = rows[index];
      const originalValue = cell.cloneNode(true);
      originalValue.querySelector("button").remove();
      const calculatedValue = originalValue.innerHTML.trim();
      const rawValue = cell.textContent.replace(/[^0-9.-]/g, "");
      const label = button.getAttribute("aria-label");
      const isPremium = button.classList.contains("premium-edit");
      const isUsd = isPremium || cell.dataset.currency === "usd";
      const isPct = cell.dataset.format === "pct";
      const isDeveloped = cell.classList.contains("developed-loss-ratio");
      const isReportingLag = cell.classList.contains("reporting-lag-cell");
      const isClaims = cell.classList.contains("claim-count-cell");
      const isIncurred = cell.cellIndex === 9;
      cell.innerHTML = `<input class="${isPremium ? "premium-override" : "summary-override"} inline-cell-input${isUsd ? " usd-input" : ""}${isPct ? " pct-input" : ""}" type="number" ${isPremium ? 'min="0"' : ""} step="0.01" value="${rawValue}" aria-label="${escapeHtml(isPremium ? `Premium for policy year ${row.policyYear}` : label)}">
        <button type="button" class="summary-revert" aria-label="${escapeHtml(label.replace(/^Override/, "Revert"))}" title="Restore calculated value"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>`;
      const input = cell.querySelector("input");
      if (isUsd || isPct) initializeAffixedInput(input);
      autosizeSummaryInput(input);
      input.oninput = () => {
        if (isUsd || isPct) formatAffixedInput(input);
        autosizeSummaryInput(input);
        if (isPremium) {
          row.totalPremium = readMoney(input.value);
          updateRatioCells(tableRow, row);
          updateFinancialTotals();
        }
        if (isDeveloped) {
          const value = input.value.replace(/%/g, "");
          row.developedRatioOverride = value === "" || !input.validity.valid ? NaN : Number(value) / 100;
          updateAverageRatios();
        }
        if (isReportingLag) {
          row.reportingLagOverride = input.value === "" || !input.validity.valid ? NaN : Number(input.value);
          updateReportingLag();
        }
        if (isClaims) {
          row.claimCount = Number(input.value) || 0;
          updateClaimTotals();
        }
        if (isIncurred) {
          row.totalIncurred = readMoney(input.value);
          updateRatioCells(tableRow, row);
          updateFinancialTotals();
          updateLossCostChart();
          renderSummaryLineChart("incurred-loss-chart", rows, (row) => row.totalIncurred, "");
        }
      };
      cell.querySelector(".summary-revert").onclick = () => {
        if (isPremium) row.totalPremium = originalPremiums[index];
        if (isClaims) row.claimCount = originalClaims[index];
        if (isIncurred) row.totalIncurred = originalIncurred[index];
        if (isDeveloped) delete row.developedRatioOverride;
        if (isReportingLag) delete row.reportingLagOverride;
        const restored = isPremium ? formatMoney(row.totalPremium)
          : isDeveloped ? displayRatio(calculatedDevelopedRatio(row))
          : isReportingLag ? formatReportingLag(averageYearReportingLag(row))
          : isPct ? formatLossRatio(row.totalPremium, row.totalIncurred) : calculatedValue;
        renderEditableCell(cell, restored, label, isPremium);
        if (isPremium || isIncurred) {
          updateRatioCells(tableRow, row);
          updateFinancialTotals();
        }
        updateAverageRatios();
        if (isReportingLag) updateReportingLag();
        if (isClaims) updateClaimTotals();
        if (isIncurred) {
          updateLossCostChart();
          renderSummaryLineChart("incurred-loss-chart", rows, (row) => row.totalIncurred, "");
        }
        cell.querySelector(".summary-edit").focus();
      };
      input.focus();
    };
  };
  summaryBody.querySelectorAll(".summary-edit").forEach(bindSummaryOverride);
  tableRows.forEach((tableRow, index) => updateRatioCells(tableRow, rows[index]));
  updateAverageRatios();

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
      row.ldf = input.value === "" ? NaN : Number(input.value);
      updateRatioCells(tableRow, row);
      updateAverageRatios();
      updateLossCostChart();
      renderSummaryLineChart("incurred-loss-chart", rows, (row) => row.totalIncurred, "");
    };
  });

  updateLossCostChart();
  updateReportingLag();
  updateClaimTotals();
  renderSummaryLineChart("incurred-loss-chart", rows, (row) => row.totalIncurred, "");

  summaryBody.querySelectorAll(".units-input").forEach((input) => {
    input.oninput = () => {
      const updatedTotalUnits = Array.from(summaryBody.querySelectorAll(".units-input"))
        .reduce((total, current) => total + (Number(current.value) || 0), 0);
      const footerRows = summaryFoot?.querySelectorAll("tr") || [];
      if (footerRows.length === 2) {
        footerRows[0].cells[1].innerHTML = formatSummaryDecimal(updatedTotalUnits / rows.length);
                footerRows[1].cells[1].textContent = updatedTotalUnits;
      }
      if (lossCostPerUnit) lossCostPerUnit.textContent = updatedTotalUnits ? formatMoney(rows.reduce((total, row) => total + row.totalIncurred, 0) / updatedTotalUnits) : "—";
      updateLossCostChart();
    };
  });
}







