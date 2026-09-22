// Event handlers and application initialization
function handleContinue(event) {
  const shouldContinue =
    hasInsuranceHistoryInformation() ||
    window.confirm(
      "You have not entered any insurance history information. Are you sure you wish to continue?",
    );
  if (!shouldContinue) event.preventDefault();
}

function handlePolicyChange(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const policy = target.closest(".policy-entry");
  if (!policy) return;

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

let consecutiveSpacePresses = 0;

function handleTestDataShortcut(event) {
  if (event.repeat) return;

  const target = event.target;
  const isInteractive =
    target instanceof Element &&
    target.closest('input, textarea, select, button, [contenteditable="true"]');

  if (isInteractive || event.code !== "Space") {
    consecutiveSpacePresses = 0;
    return;
  }

  event.preventDefault();
  consecutiveSpacePresses += 1;

  if (consecutiveSpacePresses === 5) {
    consecutiveSpacePresses = 0;
    seedTestData();
  }
}

function initializeApp() {
  addPolicyButton.addEventListener("click", addPolicy);
  continueButton.addEventListener("click", handleContinue);
  policyList.addEventListener("change", handlePolicyChange);
  policyList.addEventListener("input", handlePolicyInput);
  policyList.addEventListener("click", handlePolicyClick);
  largeLossesList.addEventListener("input", handleLargeLossInput);
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
