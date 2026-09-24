// Dynamic policy and claim factories
function createPolicyEntry(policyIndex, data = {}) {
  const policy = document.createElement("article");
  policy.className = "policy-entry form-entry";
  policy.dataset.policyIndex = String(policyIndex);

  const coverageLines = Array.isArray(data.coverageLines)
    ? data.coverageLines
    : [];

  policy.innerHTML = `
                <header class="policy-entry-header">
                    <h3 class="policy-title">${getPolicyTitle(data)}</h3>
                </header>
                <div class="policy-row form-row">
                    <div class="coverage-group form-field">
                        <label class="coverage-label">Lines of Coverage</label>
                        <div class="multiselect">
                            <div class="selectBox">
                                <select class="coverage-select" aria-label="Lines of Coverage">
                                    <option selected>Lines of Coverage</option>
                                </select>
                                <div class="overSelect"></div>
                            </div>
                            <div class="checkboxes">
                                ${APP_CONFIG.coverageLines
                                  .map(
                                    (line) => `
                                    <label>
                                        <input type="checkbox" name="policies[${policyIndex}][linesOfCoverage][]" value="${line}" ${coverageLines.includes(line) ? "checked" : ""}>
                                        ${line}
                                    </label>
                                `,
                                  )
                                  .join("")}
                            </div>
                        </div>
                    </div>

                    <div class="policy-field form-field">
                        <label for="effective-date-${policyIndex}">Effective Date</label>
                        <input type="date" id="effective-date-${policyIndex}" name="policies[${policyIndex}][effectiveDate]" value="${data.effectiveDate || ""}">
                    </div>

                    <div class="policy-field form-field">
                        <label for="expiration-date-${policyIndex}">Expiration Date</label>
                        <input type="date" id="expiration-date-${policyIndex}" name="policies[${policyIndex}][expirationDate]" value="${data.expirationDate || ""}">
                    </div>

                    <div class="policy-field form-field">
                        <label for="insurer-${policyIndex}">Insurer</label>
                        <input type="text" id="insurer-${policyIndex}" name="policies[${policyIndex}][insurer]" value="${data.insurer || ""}" placeholder="Insurer">
                    </div>

                    <div class="policy-field form-field">
                        <label for="premium-${policyIndex}">Policy Premium</label>
                        <input type="text" id="premium-${policyIndex}" name="policies[${policyIndex}][premium]" value="${data.premium || ""}" placeholder="Premium">
                    </div>

                    <div class="policy-field form-field policy-number-field">
                        <label for="policy-number-${policyIndex}">Policy Number</label>
                        <input type="text" id="policy-number-${policyIndex}" name="policies[${policyIndex}][policyNumber]" value="${data.policyNumber || ""}" placeholder="Policy Number">
                    </div>
                </div>

                <div class="policy-actions">
                    <button type="button" class="button policy-button add-claims-button"><i class="fa-solid fa-square-plus" aria-hidden="true"></i> Add claim</button>
                    <button type="button" class="button policy-button add-prior-policy"><i class="fa-solid fa-clone" aria-hidden="true"></i> Add prior policy</button>
                    <button type="button" class="button policy-button add-renewal-policy"><i class="fa-solid fa-clone" aria-hidden="true"></i> Add renewal policy</button>
                    <button type="button" class="button remove-button remove-policy" aria-label="Remove policy"><i class="fa-solid fa-square-xmark" aria-hidden="true"></i> Remove policy</button>
                </div>

                <section class="claims-form" aria-labelledby="claims-title-${policyIndex}">
                    <header class="claims-form-header">
                        <h4 id="claims-title-${policyIndex}" class="claims-form-title">Claims on policy</h4>
                    </header>
                    <div class="claim-list">
                        <div class="claim-table-header">
                            <div>Incident Date</div>
                            <div>Status</div>
                            <div>Incurred</div>
                            <div>ALAE</div>
                            <div>Paid</div>
                            <div>Reserved</div>
                            <div>Recovered</div>
                            <div>Details</div>
                            <div class="claim-action-header"></div>
                        </div>
                    </div>
                </section>
            `;

  return policy;
}

function addPolicy() {
  const policy = createPolicyEntry(policyNumber);
  policyList.appendChild(policy);
  policyNumber += 1;
  refreshDerivedViews();
}

function removePolicy(button) {
  const policy = button.closest(".policy-entry");
  if (policy) policy.remove();
  refreshDerivedViews();
}

function addPriorPolicy(sourcePolicy) {
  const effectiveInput = getPolicyField(sourcePolicy, "effectiveDate");
  const insurerInput = getPolicyField(sourcePolicy, "insurer");
  const premiumInput = getPolicyField(sourcePolicy, "premium");
  const policyNumberInput = getPolicyNumberField(sourcePolicy);

  const selectedLines = getCoverageInputs(sourcePolicy, true).map(
    (item) => item.value,
  );
  const parsed = parsePolicyNumber(policyNumberInput.value);
  const base = parsed.base || (policyNumberInput.value || "").trim();
  let newPolicyNumber = "";

  if (!parsed.hasSuffix) {
    policyNumberInput.value = base + "-01";
    newPolicyNumber = base + "-00";
  } else if (parsed.suffix === 0) {
    policyNumberInput.value = base + "-01";
    const policies = Array.from(policyList.querySelectorAll(".policy-entry"));
    policies.forEach((entry) => {
      if (entry === sourcePolicy) return;
      const entryNumberField = getPolicyNumberField(entry);
      if (!entryNumberField || !entryNumberField.value.trim()) return;
      const parsedEntry = parsePolicyNumber(entryNumberField.value);
      if (!parsedEntry.hasSuffix) return;
      entryNumberField.value =
        parsedEntry.base + "-" + formatSuffix(parsedEntry.suffix + 1);
    });
    newPolicyNumber = base + "-00";
  } else {
    newPolicyNumber = base + "-" + formatSuffix(parsed.suffix - 1);
  }

  const newData = {
    coverageLines: selectedLines,
    effectiveDate: addYearsToDate(effectiveInput.value, -1),
    expirationDate: effectiveInput.value,
    insurer: insurerInput.value,
    premium: premiumInput.value,
    policyNumber: newPolicyNumber,
  };

  const newPolicy = createPolicyEntry(policyNumber, newData);
  sourcePolicy.insertAdjacentElement("afterend", newPolicy);
  policyNumber += 1;
  refreshDerivedViews();
}

function addRenewalPolicy(sourcePolicy) {
  const expirationInput = getPolicyField(sourcePolicy, "expirationDate");
  const insurerInput = getPolicyField(sourcePolicy, "insurer");
  const premiumInput = getPolicyField(sourcePolicy, "premium");
  const policyNumberInput = getPolicyNumberField(sourcePolicy);

  const selectedLines = getCoverageInputs(sourcePolicy, true).map(
    (item) => item.value,
  );
  const parsed = parsePolicyNumber(policyNumberInput.value);
  const base = parsed.base || (policyNumberInput.value || "").trim();
  let newPolicyNumber = "";

  if (!parsed.hasSuffix) {
    policyNumberInput.value = base + "-00";
    newPolicyNumber = base + "-01";
  } else {
    newPolicyNumber = base + "-" + formatSuffix(parsed.suffix + 1);
  }

  const newEffective = expirationInput.value;
  const newData = {
    coverageLines: selectedLines,
    effectiveDate: newEffective,
    expirationDate: addYearsToDate(newEffective, 1),
    insurer: insurerInput.value,
    premium: premiumInput.value,
    policyNumber: newPolicyNumber,
  };

  const newPolicy = createPolicyEntry(policyNumber, newData);
  sourcePolicy.parentElement.insertBefore(newPolicy, sourcePolicy);
  policyNumber += 1;
  refreshDerivedViews();
}

function syncCoverageSelect(policy) {
  const checkboxes = getCoverageInputs(policy);
  const selectedLines = checkboxes
    .filter((item) => item.checked)
    .map((item) => item.value);
  const select = policy.querySelector(".coverage-select");
  if (!select) return;
  if (selectedLines.length === 0) {
    select.innerHTML = "<option selected>Lines of Coverage</option>";
  } else {
    select.innerHTML = `<option selected>${selectedLines.join(", ")}</option>`;
  }
}

function toggleCoverageDropdown(selectBox) {
  const checkboxes = selectBox.parentElement.querySelector(".checkboxes");
  if (!checkboxes) return;
  checkboxes.classList.toggle("open");
}

function createClaimEntry(policyIndex, claimsIndex, claim = {}) {
  const claimEntry = document.createElement("fieldset");
  claimEntry.className = "claim-entry";
  claimEntry.dataset.claimIndex = String(claimsIndex);
  claimEntry.innerHTML = `
                <legend class="visually-hidden">Claim ${claimsIndex + 1}</legend>
                <div class="claim-field">
                    <label for="claim-incident-date-${policyIndex}-${claimsIndex}">Incident Date</label>
                    <input type="date" id="claim-incident-date-${policyIndex}-${claimsIndex}" name="policies[${policyIndex}][claims][${claimsIndex}][incidentDate]" value="${claim.incidentDate || ""}">
                </div>
                <div class="claim-field">
                    <label for="claim-status-${policyIndex}-${claimsIndex}">Status</label>
                    <select id="claim-status-${policyIndex}-${claimsIndex}" name="policies[${policyIndex}][claims][${claimsIndex}][status]">
                        <option value="open" ${claim.status === "open" ? "selected" : ""}>open</option>
                        <option value="closed" ${claim.status === "closed" ? "selected" : ""}>closed</option>
                    </select>
                </div>
                <div class="claim-field">
                    <label for="claim-incurred-${policyIndex}-${claimsIndex}">Incurred</label>
                    <input type="text" id="claim-incurred-${policyIndex}-${claimsIndex}" name="policies[${policyIndex}][claims][${claimsIndex}][incurred]" value="${claim.incurred || ""}" placeholder="Incurred">
                </div>
                <div class="claim-field">
                    <label for="claim-alae-${policyIndex}-${claimsIndex}">ALAE</label>
                    <input type="text" id="claim-alae-${policyIndex}-${claimsIndex}" name="policies[${policyIndex}][claims][${claimsIndex}][alae]" value="${claim.alae || ""}" placeholder="ALAE">
                </div>
                <div class="claim-field">
                    <label for="claim-paid-${policyIndex}-${claimsIndex}">Paid</label>
                    <input type="text" id="claim-paid-${policyIndex}-${claimsIndex}" name="policies[${policyIndex}][claims][${claimsIndex}][paid]" value="${claim.paid || ""}" placeholder="Paid">
                </div>
                <div class="claim-field">
                    <label for="claim-reserved-${policyIndex}-${claimsIndex}">Reserved</label>
                    <input type="text" id="claim-reserved-${policyIndex}-${claimsIndex}" name="policies[${policyIndex}][claims][${claimsIndex}][reserved]" value="${claim.reserved || ""}" placeholder="Reserved">
                </div>
                <div class="claim-field">
                    <label for="claim-recovered-${policyIndex}-${claimsIndex}">Recovered</label>
                    <input type="text" id="claim-recovered-${policyIndex}-${claimsIndex}" name="policies[${policyIndex}][claims][${claimsIndex}][recovered]" value="${claim.recovered || ""}" placeholder="Recovered">
                </div>
                <div class="claim-field">
                    <label for="claim-details-${policyIndex}-${claimsIndex}">Details</label>
                    <input type="text" id="claim-details-${policyIndex}-${claimsIndex}" name="policies[${policyIndex}][claims][${claimsIndex}][details]" value="${claim.details || ""}" placeholder="Details">
                </div>
                <div class="claim-field">
                    <button type="button" class="button claim-remove remove-claim" aria-label="Remove claim"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>
            `;
  return claimEntry;
}

function getNextClaimIndex(policy) {
  const indexes = getClaims(policy).map((claim) =>
    Number(claim.dataset.claimIndex),
  );
  return indexes.length === 0 ? 0 : Math.max(...indexes) + 1;
}

function appendClaim(policy, claimData = {}) {
  const policyIndex = getPolicyIndex(policy);
  const claimList = policy.querySelector(".claim-list");
  ensureClaimHeader(claimList);
  claimList.appendChild(
    createClaimEntry(policyIndex, getNextClaimIndex(policy), claimData),
  );
  syncClaimsForm(policy);
}

function syncClaimsForm(policy) {
  const claimsForm = policy.querySelector(".claims-form");
  const addClaimsButton = policy.querySelector(".add-claims-button");
  const hasClaims = getClaims(policy).length > 0;

  claimsForm.classList.toggle("open", hasClaims);
  setAddClaimsButtonLabel(
    addClaimsButton,
    hasClaims ? "Add another claim" : "Add claim",
  );
}

function ensureClaimHeader(claimList) {
  if (claimList.querySelector(".claim-table-header")) return;
  const header = document.createElement("div");
  header.className = "claim-table-header";
  header.innerHTML = `
                <div>Incident Date</div>
                <div>Status</div>
                <div>Incurred</div>
                <div>ALAE</div>
                <div>Paid</div>
                <div>Reserved</div>
                <div>Recovered</div>
                <div>Details</div>
                <div class="claim-action-header"></div>
            `;
  claimList.appendChild(header);
}

function readMoney(value) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const uploadForm = document.getElementById("loss-run-upload-form");
const uploadFileInput =
  uploadForm && uploadForm.querySelector('input[type="file"]');
const uploadFileNameSpan = document.getElementById("file-name");
const loadingPanel = document.getElementById("upload-loading");
const loadingText = document.getElementById("upload-status-text");
const uploadError = document.getElementById("upload-error");
const pageLoadingOverlay = document.getElementById("page-loading-overlay");
const pageLoadingMessage = document.getElementById("page-loading-message");
const uploadedFilesTable = document.getElementById("uploaded-files");
const uploadedFilesBody = document.getElementById("uploaded-files-body");
const uploadedFiles = [];
let uploadedFilesSort = { key: "uploadOrder", direction: "asc" };

function handleUploadFileChange() {
  const files = uploadFileInput.files ? Array.from(uploadFileInput.files) : [];

  if (files.length > 0) {
    uploadForm.requestSubmit();
  }
}

function showLoading(message) {
  if (pageLoadingOverlay) {
    pageLoadingOverlay.style.display = "flex";
    pageLoadingOverlay.setAttribute("aria-hidden", "false");
  }
  if (pageLoadingMessage) {
    pageLoadingMessage.textContent = message || "Processing PDF...";
  }
  if (loadingPanel) loadingPanel.hidden = false;
  if (loadingText) loadingText.textContent = message || "Uploading PDF...";
  if (uploadError) {
    uploadError.textContent = "";
    uploadError.hidden = true;
  }
}

function hideLoading() {
  if (pageLoadingOverlay) {
    pageLoadingOverlay.style.display = "none";
    pageLoadingOverlay.setAttribute("aria-hidden", "true");
  }
  if (loadingPanel) loadingPanel.hidden = true;
}

function showUploadError(message) {
  if (uploadError) {
    uploadError.textContent = message || "The loss run could not be processed.";
    uploadError.hidden = false;
  }
}

function normalizeCoverageLines(lines) {
  if (!Array.isArray(lines)) return [];
  const mapping = {
    "Commercial Auto": "Auto Liability",
    "Auto Physical Damage": "Auto Physical Damage",
    "General Liability": "General Liability",
    "Workers Compensation": "General Liability",
  };
  return lines
    .map((line) => mapping[line] || line)
    .filter(
      (line) =>
        line === "Auto Liability" ||
        line === "Auto Physical Damage" ||
        line === "General Liability",
    );
}

function normalizeClaimStatus(status) {
  if (!status) return "open";
  const normalized = String(status).toLowerCase();
  if (normalized === "closed" || normalized === "denied") return "closed";
  return "open";
}

function toDateInputValue(inputDate) {
  if (!inputDate) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(inputDate)) return inputDate;
  if (inputDate instanceof Date) return dateToISO(inputDate);
  return String(inputDate).slice(0, 10);
}

function getCarrierName(carrier) {
  if (!carrier) return "";
  if (typeof carrier === "string") return carrier;
  if (typeof carrier === "object" && carrier.name) return carrier.name;
  if (Array.isArray(carrier))
    return carrier
      .map((c) => getCarrierName(c))
      .filter(Boolean)
      .join(", ");
  return "";
}

function clearPolicyList() {
  policyList.innerHTML = "";
  policyNumber = 0;
}

function computeFileHash(file) {
  return file
    .arrayBuffer()
    .then((buffer) => {
      return window.crypto.subtle.digest("SHA-256", buffer);
    })
    .then((hashBuffer) => {
      return Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    });
}

function getCachedExtraction(hash) {
  try {
    const key = APP_CONFIG.cachePrefix + hash;
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch (error) {
    return null;
  }
}

function cacheExtraction(hash, payload) {
  try {
    const key = APP_CONFIG.cachePrefix + hash;
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    // ignore storage quota or sandbox failures
  }
}

function getValuationDate(output) {
  const value =
    output?.valuation_date ||
    output?.valuationDate ||
    output?.valued_as_of ||
    output?.valuedAsOf ||
    output?.metadata?.valuation_date ||
    output?.metadata?.valuationDate;
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : dateToISO(parsed);
}

function hasRecordValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    (!Array.isArray(value) || value.length > 0)
  );
}

function mergeRecord(
  existing,
  incoming,
  existingValuationDate,
  incomingValuationDate,
) {
  const merged = { ...existing };
  const incomingIsNewer = incomingValuationDate >= existingValuationDate;

  Object.entries(incoming || {}).forEach(([key, incomingValue]) => {
    const existingValue = merged[key];
    if (!hasRecordValue(incomingValue)) {
      if (!hasRecordValue(existingValue)) merged[key] = incomingValue;
      return;
    }
    if (!hasRecordValue(existingValue) || incomingIsNewer) {
      merged[key] = incomingValue;
    }
  });

  return merged;
}

function getRecordKey(record, fieldName, fallback) {
  const value = record?.[fieldName];
  return hasRecordValue(value) ? String(value).trim() : fallback;
}

function mergeExtractionRecords() {
  const policyRecords = new Map();
  const claimRecords = new Map();

  uploadedFiles.forEach((fileRecord) => {
    const policies = Array.isArray(fileRecord.output?.policies)
      ? fileRecord.output.policies
      : [];
    const claims = Array.isArray(fileRecord.output?.claims)
      ? fileRecord.output.claims
      : [];
    const valuationDate = fileRecord.valuationDate;

    policies.forEach((policy, index) => {
      const key = getRecordKey(
        policy,
        "policy_number",
        `file-${fileRecord.uploadOrder}-policy-${index}`,
      );
      const current = policyRecords.get(key);
      policyRecords.set(
        key,
        current
          ? {
              record: mergeRecord(
                current.record,
                policy,
                current.valuationTimestamp,
                fileRecord.valuationTimestamp,
              ),
              valuationTimestamp: Math.max(
                current.valuationTimestamp,
                fileRecord.valuationTimestamp,
              ),
            }
          : {
              record: { ...policy },
              valuationTimestamp: fileRecord.valuationTimestamp,
            },
      );
    });

    claims.forEach((claim, index) => {
      const key = getRecordKey(
        claim,
        "claim_number",
        `file-${fileRecord.uploadOrder}-claim-${index}`,
      );
      const current = claimRecords.get(key);
      claimRecords.set(
        key,
        current
          ? {
              record: mergeRecord(
                current.record,
                claim,
                current.valuationTimestamp,
                fileRecord.valuationTimestamp,
              ),
              valuationTimestamp: Math.max(
                current.valuationTimestamp,
                fileRecord.valuationTimestamp,
              ),
            }
          : {
              record: { ...claim },
              valuationTimestamp: fileRecord.valuationTimestamp,
            },
      );
    });
  });

  return {
    policies: Array.from(policyRecords.values()).map((item) => item.record),
    claims: Array.from(claimRecords.values()).map((item) => item.record),
  };
}

function createPoliciesFromLossRun(output = mergeExtractionRecords()) {
  const policies = Array.isArray(output?.policies) ? output.policies : [];
  const claims = Array.isArray(output?.claims) ? output.claims : [];
  clearPolicyList();

  policies.forEach((policy, index) => {
    const lines = normalizeCoverageLines(policy.lines_of_coverage || []);
    const insurer = getCarrierName(policy.carrier);
    const policyEntry = createPolicyEntry(index, {
      effectiveDate: toDateInputValue(policy.effective_date),
      expirationDate: toDateInputValue(policy.expiration_date),
      insurer,
      premium: policy.premium ?? "",
      policyNumber: policy.policy_number || "",
      coverageLines: lines,
    });

    policyList.appendChild(policyEntry);
    syncPolicyActionButtons(policyEntry);

    const policyIndex = getPolicyIndex(policyEntry);
    const selectedLines = getCoverageInputs(policyEntry);
    selectedLines.forEach((checkbox) => {
      checkbox.checked = lines.includes(checkbox.value);
    });
    syncCoverageSelect(policyEntry);

    const claimList = policyEntry.querySelector(".claim-list");
    ensureClaimHeader(claimList);

    const matchingClaims = claims.filter(
      (claim) => claim.policy_number === policy.policy_number,
    );
    matchingClaims.forEach((claim, claimIndex) => {
      const claimEntry = createClaimEntry(policyIndex, claimIndex, {
        incidentDate: toDateInputValue(claim.loss_date),
        status: normalizeClaimStatus(claim.claim_status),
        incurred: claim.incurred_amount ?? "",
        alae: claim.alae_amount ?? "",
        paid: claim.paid_amount ?? "",
        reserved: claim.reserved_amount ?? "",
        recovered: claim.recovered_amount ?? "",
        details: claim.loss_description || claim.claim_number || "",
      });
      claimList.appendChild(claimEntry);
    });

    syncClaimsForm(policyEntry);

    policyNumber += 1;
  });

  refreshDerivedViews();
}

function renderUploadedFiles() {
  if (!uploadedFilesTable || !uploadedFilesBody) return;
  const rows = [...uploadedFiles].sort((left, right) => {
    const leftValue = left[uploadedFilesSort.key];
    const rightValue = right[uploadedFilesSort.key];
    const comparison =
      typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue || "").localeCompare(String(rightValue || ""));
    return uploadedFilesSort.direction === "asc" ? comparison : -comparison;
  });

  uploadedFilesBody.innerHTML = rows
    .map(
      (fileRecord) => `
                <tr tabindex="0" data-upload-order="${fileRecord.uploadOrder}" aria-label="Preview ${escapeHtml(fileRecord.filename)}">
                    <td>${escapeHtml(fileRecord.filename)}</td>
                    <td>${escapeHtml(fileRecord.valuationDate || "—")}</td>
                    <td>${fileRecord.policyCount}</td>
                    <td>${fileRecord.claimCount}</td>
                    <td class="indicator-column"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i> </td>
                </tr>
            `,
    )
    .join("");
  uploadedFilesTable.hidden = rows.length === 0;
}

function sortUploadedFiles(key) {
  if (uploadedFilesSort.key === key) {
    uploadedFilesSort.direction =
      uploadedFilesSort.direction === "asc" ? "desc" : "asc";
  } else {
    uploadedFilesSort = { key, direction: "asc" };
  }
  renderUploadedFiles();
}

function previewUploadedFile(uploadOrder) {
  const fileRecord = uploadedFiles.find(
    (item) => item.uploadOrder === uploadOrder,
  );
  if (fileRecord?.previewUrl) {
    filePreviewIframe.style.display = "block";
    filePreviewIframe.src = fileRecord.previewUrl;
    filePreviewModalFrame.src = fileRecord.previewUrl;
    maximizePreviewButton.hidden = false;

    // Set target row as active
    document.querySelectorAll('[data-upload-order]').forEach(row => {
      console.log(row)
      if (Number(row.getAttribute('data-upload-order')) === uploadOrder) {
        row.classList.add('active');
      } else {
        row.classList.remove('active');
      }
    });

  }
}

async function processUploadedFile(file, uploadOrder) {
  const fileHash = await computeFileHash(file);
  const cached = getCachedExtraction(fileHash);
  let completed = cached && cached.output ? cached : null;

  if (!completed) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const uploadResponse = await fetch(
      APP_CONFIG.documentApiUrl + "/document",
      {
        method: "POST",
        headers: { "x-api-key": DOCUMENT_PROCESSOR_APIKEY },
        body: formData,
      },
    );
    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.json().catch(() => ({}));
      throw new Error(
        errorBody.message || "The document processor rejected the upload.",
      );
    }

    const accepted = await uploadResponse.json();
    if (!accepted.documentId)
      throw new Error("The upload response did not include a documentId.");
    completed = await pollDocument(accepted.documentId);
    if (!completed?.output)
      throw new Error("The loss run could not be extracted.");
    cacheExtraction(fileHash, {
      output: completed.output,
      documentId: accepted.documentId,
      status: completed.status,
    });
  }

  const output = completed.output;
  return {
    filename: file.name,
    previewUrl: URL.createObjectURL(file),
    output,
    valuationDate: getValuationDate(output),
    valuationTimestamp: Date.parse(getValuationDate(output)) || 0,
    policyCount: Array.isArray(output?.policies) ? output.policies.length : 0,
    claimCount: Array.isArray(output?.claims) ? output.claims.length : 0,
    uploadOrder,
  };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadAndPopulateLossRun(event) {
  event.preventDefault();
  const files = uploadFileInput?.files ? Array.from(uploadFileInput.files) : [];
  if (files.length === 0) {
    showUploadError("Choose a PDF file to upload.");
    return;
  }

  if (files.some((file) => file.type && file.type !== "application/pdf")) {
    showUploadError("Please choose a PDF file.");
    return;
  }

  showLoading(
    files.length === 1
      ? "Uploading PDF..."
      : `Uploading ${files.length} PDFs...`,
  );

  try {
    const newRecords = await Promise.all(
      files.map((file, index) =>
        processUploadedFile(file, uploadedFiles.length + index),
      ),
    );
    uploadedFiles.push(...newRecords);
    renderUploadedFiles();
    createPoliciesFromLossRun();
    hideLoading();
    previewUploadedFile(uploadedFiles.length - 1);
  } catch (error) {
    hideLoading();
    showUploadError(error.message || "The loss run could not be processed.");
  }
}

async function pollDocument(documentId) {
  const url = APP_CONFIG.documentApiUrl + "/documents/" + documentId;
  for (let attempt = 0; attempt < APP_CONFIG.pollAttempts; attempt += 1) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": DOCUMENT_PROCESSOR_APIKEY,
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        errorBody.message ||
          "The document processor could not retrieve the extraction.",
      );
    }

    const document = await response.json();
    if (document.status === "SUCCEEDED") {
      return document;
    }
    if (document.status === "FAILED") {
      throw new Error(
        document.statusMessage ||
          "The document processor failed to extract the PDF.",
      );
    }
    showLoading("Processing PDF... (" + String(attempt + 1) + ")");
    await sleep(APP_CONFIG.pollIntervalMs);
  }
  throw new Error(
    "The document processor did not finish extracting the PDF in time.",
  );
}
