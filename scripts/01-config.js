// Configuration and shared DOM access
const DOCUMENT_PROCESSOR_APIKEY =
  "YJ8o39NuCNyTQaNsOn2h03ma4ooNb9txGcrj4ZY9MfYh7y0CDlmvBOEuW1U0A48G";
const APP_CONFIG = Object.freeze({
  largeLossThreshold: 25000,
  cachePrefix: "document-processor-cache-v1:",
  documentApiUrl: "https://api.dev.blackshieldrisk.com",
  pollAttempts: 80,
  pollIntervalMs: 1500,
  coverageLines: [
    "Auto Liability",
    "Auto Physical Damage",
    "General Liability",
  ],
});

const policyList = document.getElementById("policy-list");
const addPolicyButton = document.getElementById("add-policy");
const continueButton = document.getElementById("continue-button");
const largeLossesList = document.getElementById("large-losses-list");
const filePreviewIframe = document.getElementById("file-preview");
const maximizePreviewButton = document.getElementById("maximize-preview");
const filePreviewModal = document.getElementById("file-preview-modal");
const closePreviewButton = document.getElementById("close-preview");
const filePreviewModalFrame = document.getElementById("file-preview-modal-frame");
let policyNumber = 0;

function getPolicies() {
  return Array.from(policyList.querySelectorAll(".policy-entry"));
}

function getPolicyIndex(policy) {
  return Number(policy.dataset.policyIndex);
}

function getPolicyField(policy, fieldName) {
  const policyIndex = getPolicyIndex(policy);
  return policy.querySelector(
    `[name="policies[${policyIndex}][${fieldName}]"]`,
  );
}

function getCoverageInputs(policy, checkedOnly = false) {
  const policyIndex = getPolicyIndex(policy);
  const checkedSelector = checkedOnly ? ":checked" : "";
  return Array.from(
    policy.querySelectorAll(
      `[name="policies[${policyIndex}][linesOfCoverage][]"]${checkedSelector}`,
    ),
  );
}

function getClaims(policy) {
  return Array.from(policy.querySelectorAll(".claim-entry"));
}

function getClaimField(policyIndex, claim, fieldName) {
  const claimIndex = Number(claim.dataset.claimIndex);
  return claim.querySelector(
    `[name="policies[${policyIndex}][claims][${claimIndex}][${fieldName}]"]`,
  );
}

// Date, number, and display formatting
function dateToISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addYearsToDate(dateString, years) {
  if (!dateString) return "";
  const date = new Date(dateString + "T00:00:00");
  date.setFullYear(date.getFullYear() + years);
  return dateToISO(date);
}

function parsePolicyNumber(policyNumber) {
  const raw = (policyNumber || "").trim();
  const match = raw.match(/^(.*)-([0-9]{2})$/);
  if (!match) {
    return { base: raw, suffix: null, hasSuffix: false };
  }
  return { base: match[1], suffix: Number(match[2]), hasSuffix: true };
}

function formatSuffix(value) {
  return String(value).padStart(2, "0");
}

function getPolicyNumberField(policy) {
  return getPolicyField(policy, "policyNumber");
}
