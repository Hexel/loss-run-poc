// Event handlers and application initialization
let highlightedClaim = null;
let claimHighlightTimeout = null;

function clearClaimHighlight() {
  highlightedClaim?.classList.remove('claim-highlighted');
  highlightedClaim = null;
  clearTimeout(claimHighlightTimeout);
  claimHighlightTimeout = null;
}

function handleLargeLossClick(event) {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('.large-loss-jump');
  if (!button) return;
  const policy = policyList.querySelector(`[data-policy-index="${button.dataset.policyIndex}"]`);
  const claim = policy?.querySelector(`.claim-entry[data-claim-index="${button.dataset.claimIndex}"]`);
  if (!claim) return;

  clearClaimHighlight();
  claim.closest('.claims-form').classList.add('open');
  highlightedClaim = claim;
  claim.classList.add('claim-highlighted');
  claim.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'center',
    inline: 'nearest',
  });
  claimHighlightTimeout = setTimeout(clearClaimHighlight, 30000);
}

function clearClaimHighlightOnEdit(event) {
  if (event.target instanceof Element && event.target.matches('input, select, textarea')) {
    clearClaimHighlight();
  }
}

function handlePolicyChange(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const policy = target.closest(".policy-entry");
  if (!policy) return;

  if (target.matches('input.usd-input')) formatAffixedInput(target);

  if (target.matches('input[type="date"][name$="][effectiveDate]"]')) {
    const effectiveDate = target.value;
    const expirationField = getPolicyField(policy, "expirationDate");
    if (effectiveDate && !expirationField.value) {
      expirationField.value = addYearsToDate(effectiveDate, 1);
    }
  }

  if (target.matches('input[type="checkbox"][name$="][linesOfCoverage][]"]')) {
    syncCoverageSelect(policy);
  }

  updatePolicyTitle(policy);
  refreshDerivedViews();
}

function handlePolicyInput(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const policy = target.closest(".policy-entry");
  if (!policy) return;

  if (target.matches('input.usd-input')) formatAffixedInput(target);

  const policyIndex = getPolicyIndex(policy);
  const claim = target.closest(".claim-entry");

  if (target.matches('input[name$="][details]"]') && claim) {
    const claimIndex = Number(claim.dataset.claimIndex);
    const largeDetail = largeLossesList.querySelector(
      '[data-policy-index="' +
        policyIndex +
        '"][data-claim-index="' +
        claimIndex +
        '"]',
    );
    if (largeDetail) largeDetail.value = target.value;
  }

  updatePolicyTitle(policy);
  syncPolicyActionButtonsForAll();
  renderInsuranceHistorySummaryTable();
  syncInsuranceHistoryVisibility();
}

function handleLargeLossInput(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.matches("textarea.large-loss-detail-textarea")) return;

  const policyIndex = Number(target.dataset.policyIndex);
  const claimIndex = Number(target.dataset.claimIndex);
  const policy = policyList.querySelector(
    '[data-policy-index="' + policyIndex + '"]',
  );
  if (!policy) return;

  const claim = getClaims(policy).find(
    (item) => Number(item.dataset.claimIndex) === claimIndex,
  );
  const detailField = claim
    ? getClaimField(policyIndex, claim, "details")
    : null;
  if (!detailField) return;

  detailField.value = target.value;
}

function handlePolicyClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const policy = target.closest(".policy-entry");
  if (!policy) return;

  const selectBox = target.closest(".selectBox");
  if (selectBox) {
    toggleCoverageDropdown(selectBox);
    return;
  }

  const button = target.closest("button");
  if (!button) return;

  if (button.classList.contains("add-claims-button")) {
    appendClaim(policy);
    refreshDerivedViews();
    return;
  }

  if (button.classList.contains("remove-claim")) {
    button.closest(".claim-entry").remove();
    syncClaimsForm(policy);
    refreshDerivedViews();
    return;
  }

  if (button.classList.contains("remove-policy")) {
    removePolicy(button);
    return;
  }

  if (button.classList.contains("add-prior-policy")) {
    addPriorPolicy(policy);
  } else if (button.classList.contains("add-renewal-policy")) {
    addRenewalPolicy(policy);
  }
}

function closeCoverageMenus(event) {
  if (!(event.target instanceof Element)) return;
  const clickedInside = event.target.closest(".multiselect");
  if (!clickedInside) {
    document
      .querySelectorAll(".checkboxes")
      .forEach((item) => item.classList.remove("open"));
  }
}

function openFilePreviewModal() {
  if (filePreviewIframe.src) {
    filePreviewModalFrame.src = filePreviewIframe.src;
    filePreviewModal.showModal();
  }
}

function closeFilePreviewModal() {
  filePreviewModal.close();
}

function handleUploadedFilesClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const sortButton = target.closest("button[data-sort]");
  if (sortButton) {
    sortUploadedFiles(sortButton.dataset.sort);
    return;
  }

  const row = target.closest("tr[data-upload-order]");
  if (row) previewUploadedFile(Number(row.dataset.uploadOrder));
}

let consecutiveTestDataPresses = 0;
let lastTestDataKey = null;

function handleTestDataShortcut(event) {
  if (event.repeat) return;

  const target = event.target;
  const isInteractive =
    target instanceof Element &&
    target.closest('input, textarea, select, button, [contenteditable="true"]');
  const key = event.code === "Space" ? " " : event.key;
  const isShortcut = [" ", "a", "b", "c"].includes(key);

  if (isInteractive || !isShortcut || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
    consecutiveTestDataPresses = 0;
    lastTestDataKey = null;
    return;
  }

  event.preventDefault();
  consecutiveTestDataPresses = key === lastTestDataKey ? consecutiveTestDataPresses + 1 : 1;
  lastTestDataKey = key;

  if (consecutiveTestDataPresses === 5) {
    consecutiveTestDataPresses = 0;
    lastTestDataKey = null;
    seedTestData(key);
  }
}

function initializeApp() {
  addPolicyButton.addEventListener("click", addPolicy);
  policyList.addEventListener("change", handlePolicyChange);
  policyList.addEventListener("input", handlePolicyInput);
  policyList.addEventListener("click", handlePolicyClick);
  largeLossesList.addEventListener("input", handleLargeLossInput);
  largeLossesList.addEventListener("click", handleLargeLossClick);
  document.addEventListener("input", clearClaimHighlightOnEdit, true);
  document.addEventListener("change", clearClaimHighlightOnEdit, true);
  document.addEventListener("reset", clearClaimHighlight);
  document.addEventListener("reset", () => queueMicrotask(() => initializePolicyMoneyInputs(policyList)));
  maximizePreviewButton.addEventListener("click", openFilePreviewModal);
  closePreviewButton.addEventListener("click", closeFilePreviewModal);
  window.addEventListener("click", closeCoverageMenus);
  document.addEventListener("keydown", handleTestDataShortcut);

  if (uploadForm)
    uploadForm.addEventListener("submit", uploadAndPopulateLossRun);
  if (uploadFileInput)
    uploadFileInput.addEventListener("change", handleUploadFileChange);
  if (uploadedFilesTable)
    uploadedFilesTable.addEventListener("click", handleUploadedFilesClick);

  refreshDerivedViews();
}
