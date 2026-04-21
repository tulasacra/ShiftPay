import QrScanner from 'qr-scanner';

import { buildBchDeepLink, parsePaymentCode } from './lib/payment.js';
import { createAccountViaGraphql } from './lib/sideshiftAccount.js';
import {
  clearStoredCredentials,
  getStoredCredentials,
  hasStoredCredentials,
  saveCredentials,
} from './lib/sideshiftCredentials.js';
import {
  createFixedBchShift,
  fetchCreateShiftPermission,
  fetchShiftStatus,
} from './lib/sideshift.js';
import './styles.css';

const statusBanner = document.getElementById('statusBanner');
const video = document.getElementById('scannerVideo');
const overlay = document.getElementById('scannerOverlay');
const imageInput = document.getElementById('imageInput');
const rescanButton = document.getElementById('rescanButton');
const walletLink = document.getElementById('walletLink');
const scannerFrame = document.getElementById('scannerFrame');
const scannerTargetPanel = document.getElementById('scannerTargetPanel');
const targetDetails = document.getElementById('targetDetails');
const shiftDetails = document.getElementById('shiftDetails');
const sideshiftCredsForm = document.getElementById('sideshiftCredsForm');
const affiliateIdInput = document.getElementById('affiliateIdInput');
const secretInput = document.getElementById('secretInput');
const clearCredsButton = document.getElementById('clearCredsButton');
const credsStatus = document.getElementById('credsStatus');
const settingsButton = document.getElementById('settingsButton');
const settingsDialog = document.getElementById('settingsDialog');
const closeSettingsButton = document.getElementById('closeSettingsButton');
const helpButton = document.getElementById('helpButton');
const helpDialog = document.getElementById('helpDialog');
const closeHelpButton = document.getElementById('closeHelpButton');

const SHIFT_POLL_MS = 4000;

const SECRET_MASK = '*'.repeat(24);

const state = {
  scanner: null,
  isBusy: false,
  orderWaitTimer: null,
  shiftPollTimer: null,
  shiftPollLastStatus: null,
  paymentRequest: null,
  shiftOrder: null,
  shouldResumeScannerAfterModal: false,
  sideshiftCreateShiftAllowed: true,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setStatus(message, tone = 'info') {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${tone}`;
}

function applySecretMaskState() {
  if (!secretInput) {
    return;
  }
  const creds = getStoredCredentials();
  if (creds?.secret) {
    secretInput.type = 'text';
    secretInput.value = SECRET_MASK;
    secretInput.readOnly = true;
    secretInput.dataset.masked = 'true';
  } else {
    secretInput.type = 'password';
    secretInput.value = '';
    secretInput.readOnly = false;
    delete secretInput.dataset.masked;
  }
}

function clearSecretMaskForEdit() {
  if (!secretInput || secretInput.dataset.masked !== 'true') {
    return;
  }
  secretInput.type = 'password';
  secretInput.value = '';
  secretInput.readOnly = false;
  delete secretInput.dataset.masked;
}

function resolveSecretForSave() {
  const trimmed = secretInput.value.trim();
  const stored = getStoredCredentials();
  if (secretInput.dataset.masked === 'true' && stored?.secret) {
    return stored.secret;
  }
  if (trimmed === SECRET_MASK && stored?.secret) {
    return stored.secret;
  }
  if (!trimmed && stored?.secret) {
    return stored.secret;
  }
  return trimmed;
}

function renderCredsStatus() {
  if (!credsStatus) {
    return;
  }
  credsStatus.textContent = hasStoredCredentials()
    ? 'Keys saved in this browser only. Clear them if you share this device.'
    : 'No keys saved yet.';
}

function setWalletLinkState(deepLink) {
  if (!deepLink) {
    walletLink.href = '#';
    walletLink.classList.add('disabled');
    walletLink.setAttribute('aria-disabled', 'true');
    return;
  }

  walletLink.href = deepLink;
  walletLink.classList.remove('disabled');
  walletLink.setAttribute('aria-disabled', 'false');
}

function updateScannerTargetPanelVisibility() {
  if (!scannerFrame || !scannerTargetPanel) {
    return;
  }
  const showPanel = Boolean(state.paymentRequest) && !isScannerVideoLive();
  if (showPanel) {
    scannerFrame.classList.add('scanner-frame--has-target');
    scannerTargetPanel.removeAttribute('hidden');
  } else {
    scannerFrame.classList.remove('scanner-frame--has-target');
    scannerTargetPanel.setAttribute('hidden', '');
  }
}

function renderTargetDetails(paymentRequest) {
  if (!paymentRequest) {
    targetDetails.className = 'detail-list';
    targetDetails.innerHTML = '';
    updateScannerTargetPanelVisibility();
    return;
  }

  targetDetails.className = 'detail-list';
  targetDetails.innerHTML = `
    <div>
      <dt>Currency</dt>
      <dd>${escapeHtml(paymentRequest.label)}</dd>
    </div>
    <div>
      <dt>Amount</dt>
      <dd>${escapeHtml(paymentRequest.amountLabel)}</dd>
    </div>
    <div>
      <dt>Recipient</dt>
      <dd>${escapeHtml(paymentRequest.address)}</dd>
    </div>
    <div>
      <dt>URI</dt>
      <dd>${escapeHtml(paymentRequest.raw)}</dd>
    </div>
  `;
  updateScannerTargetPanelVisibility();
}

function renderShiftDetails(order) {
  if (!order?.depositAddress || !order?.depositAmount) {
    shiftDetails.className = 'detail-list detail-list--placeholder';
    shiftDetails.innerHTML = '';
    return;
  }

  shiftDetails.className = 'detail-list';
  shiftDetails.innerHTML = `
    <div>
      <dt>BCH amount</dt>
      <dd>${escapeHtml(order.depositAmount)} BCH</dd>
    </div>
    <div>
      <dt>BCH address</dt>
      <dd>${escapeHtml(order.depositAddress)}</dd>
    </div>
    <div>
      <dt>Target payout</dt>
      <dd>${escapeHtml(order.settleAmount || state.paymentRequest?.amount || '?')} ${escapeHtml(
        (order.settleCoin || state.paymentRequest?.currencyCode || '').toUpperCase(),
      )}</dd>
    </div>
    <div>
      <dt>Order</dt>
      <dd>${escapeHtml(order.id || order.orderId || 'Pending')}</dd>
    </div>
    ${
      order.depositMemo
        ? `<div>
      <dt>BCH memo</dt>
      <dd>${escapeHtml(order.depositMemo)}</dd>
    </div>`
        : ''
    }
  `;
}

function resetShiftState() {
  window.clearTimeout(state.orderWaitTimer);
  state.orderWaitTimer = null;
  stopShiftStatusPoll();
  state.shiftPollLastStatus = null;
  state.shiftOrder = null;
  renderShiftDetails(null);
  setWalletLinkState(null);
}

function stopShiftStatusPoll() {
  if (state.shiftPollTimer !== null) {
    window.clearTimeout(state.shiftPollTimer);
    state.shiftPollTimer = null;
  }
}

function startShiftStatusPoll(shiftId) {
  stopShiftStatusPoll();

  const schedule = (delay) => {
    state.shiftPollTimer = window.setTimeout(tick, delay);
  };

  const tick = async () => {
    state.shiftPollTimer = null;

    try {
      const creds = getStoredCredentials();
      if (!creds) {
        schedule(SHIFT_POLL_MS * 2);
        return;
      }

      const shift = await fetchShiftStatus(shiftId, creds);
      const prev = state.shiftPollLastStatus;
      state.shiftPollLastStatus = shift.status;
      state.shiftOrder = shift;
      renderShiftDetails(shift);

      const st = shift.status;
      if (prev === 'waiting' && st && st !== 'waiting' && st !== 'settled') {
        setStatus('SideShift detected the BCH deposit. Waiting for settlement.', 'success');
      }

      if (st === 'settled') {
        setStatus('SideShift marked the shift as settled.', 'success');
        return;
      }

      schedule(SHIFT_POLL_MS);
    } catch {
      schedule(SHIFT_POLL_MS * 2);
    }
  };

  schedule(0);
}

function startOrderWatchdog() {
  window.clearTimeout(state.orderWaitTimer);
  state.orderWaitTimer = window.setTimeout(() => {
    if (state.shiftOrder?.depositAddress || !state.paymentRequest) {
      return;
    }

    setStatus(
      'Still waiting for the SideShift API to return BCH deposit details. Check your network and API keys.',
      'warning',
    );
  }, 8000);
}

async function stopScanner() {
  state.scanner?.stop();
}

function isScannerVideoLive() {
  const stream = video?.srcObject;
  return stream instanceof MediaStream && stream.getTracks().some((t) => t.readyState === 'live');
}

async function pauseScannerForModal() {
  await state.scanner?.pause();
}

async function resumeScannerAfterModalIfNeeded() {
  if (!state.shouldResumeScannerAfterModal) {
    return;
  }
  state.shouldResumeScannerAfterModal = false;
  try {
    await state.scanner?.start();
  } catch {
    // Camera may still be unavailable; keep existing status text.
  }
}

function bindModalWithScannerPause(dialog) {
  if (!dialog) {
    return;
  }
  dialog.addEventListener('close', () => {
    void resumeScannerAfterModalIfNeeded();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
}

async function openModalWithScannerPause(dialog) {
  if (!dialog) {
    return;
  }
  state.shouldResumeScannerAfterModal = isScannerVideoLive();
  await pauseScannerForModal();
  dialog.showModal();
}

async function startScanner(options = {}) {
  const preserveStatusOnReady = Boolean(options.preserveStatusOnReady);

  if (!state.scanner) {
    state.scanner = new QrScanner(
      video,
      (result) => handleDecodedText(result.data),
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        overlay,
        preferredCamera: 'environment',
        returnDetailedScanResult: true,
      },
    );
  }

  try {
    await state.scanner.start();
    updateScannerTargetPanelVisibility();
    if (!preserveStatusOnReady) {
      setStatus('Camera ready. Scan a supported payment QR.', 'info');
    }
  } catch (error) {
    updateScannerTargetPanelVisibility();
    if (!preserveStatusOnReady) {
      setStatus('Camera unavailable here. Use "Scan from image" instead.', 'warning');
    }
  }
}

async function resolveSideshiftPermissions(creds) {
  if (!creds?.secret) {
    state.sideshiftCreateShiftAllowed = true;
    return null;
  }

  try {
    const allowed = await fetchCreateShiftPermission(creds.secret);
    state.sideshiftCreateShiftAllowed = allowed;
    if (!allowed) {
      setStatus(
        'SideShift is not allowing shifts from this account or location. See https://help.sideshift.ai/en/articles/2874595-why-am-i-blocked-from-using-sideshift-ai',
        'error',
      );
    }
    return null;
  } catch (error) {
    state.sideshiftCreateShiftAllowed = true;
    return error?.message || 'Request failed';
  }
}

async function createShiftFromPayment() {
  const paymentRequest = state.paymentRequest;
  if (!paymentRequest) {
    return;
  }

  const creds = getStoredCredentials();
  if (!creds) {
    setStatus('Add your SideShift API keys in Settings first.', 'warning');
    return;
  }

  if (!state.sideshiftCreateShiftAllowed) {
    setStatus(
      'SideShift is not allowing shifts from this account or location. See https://help.sideshift.ai/en/articles/2874595-why-am-i-blocked-from-using-sideshift-ai',
      'error',
    );
    return;
  }

  resetShiftState();
  setStatus('Creating a fixed-rate SideShift request...', 'info');

  try {
    startOrderWatchdog();
    const order = await createFixedBchShift(paymentRequest, creds);
    window.clearTimeout(state.orderWaitTimer);
    state.orderWaitTimer = null;
    state.shiftOrder = order;
    renderShiftDetails(order);

    if (!order.depositAddress || !order.depositAmount) {
      setStatus('SideShift did not return BCH deposit details.', 'warning');
      return;
    }

    setWalletLinkState(
      buildBchDeepLink(order.depositAddress, order.depositAmount, order.depositMemo),
    );
    setStatus('Fixed-rate request created. Launch your BCH wallet with the prepared payment.', 'success');

    if (order.id) {
      state.shiftPollLastStatus = order.status ?? null;
      startShiftStatusPoll(order.id);
    }
  } catch (error) {
    window.clearTimeout(state.orderWaitTimer);
    state.orderWaitTimer = null;
    setStatus(error.message, 'error');
  }
}

async function openRequestFromPayment(paymentRequest) {
  state.paymentRequest = paymentRequest;
  renderTargetDetails(paymentRequest);
  resetShiftState();

  if (!hasStoredCredentials()) {
    setStatus('Open Settings to add your SideShift API keys. Saving keys creates the fixed-rate request.', 'warning');
    return;
  }

  await createShiftFromPayment();
}

async function handleDecodedText(decodedText) {
  if (state.isBusy) {
    return;
  }

  state.isBusy = true;

  try {
    await stopScanner();
    const paymentRequest = parsePaymentCode(decodedText);
    await openRequestFromPayment(paymentRequest);
  } catch (error) {
    state.paymentRequest = null;
    renderTargetDetails(null);
    resetShiftState();
    setStatus(error.message, 'error');
    await startScanner({ preserveStatusOnReady: true });
  } finally {
    state.isBusy = false;
  }
}

async function handleImageInput(event) {
  const [file] = event.target.files || [];

  if (!file) {
    return;
  }

  try {
    setStatus('Scanning the selected image...', 'info');
    const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
    await handleDecodedText(result.data);
  } catch (error) {
    setStatus(error?.message || 'No QR code found in that image.', 'error');
  } finally {
    imageInput.value = '';
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
        setStatus('The app loaded, but offline support could not be enabled.', 'warning');
      });
    });
  }
}

function bindUi() {
  imageInput.addEventListener('change', handleImageInput);

  rescanButton.addEventListener('click', async () => {
    state.paymentRequest = null;
    renderTargetDetails(null);
    resetShiftState();
    setStatus('Ready to scan again.', 'info');
    await startScanner();
  });

  sideshiftCredsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      saveCredentials(resolveSecretForSave(), affiliateIdInput.value);
      applySecretMaskState();
      renderCredsStatus();
      const permDetail = await resolveSideshiftPermissions(getStoredCredentials());
      if (!state.sideshiftCreateShiftAllowed) {
        settingsDialog?.close();
        if (state.paymentRequest) {
          await startScanner({ preserveStatusOnReady: true });
        }
        return;
      }
      if (permDetail) {
        setStatus(
          `SideShift keys saved. Could not verify permissions (${permDetail}); you can still try scanning.`,
          'warning',
        );
      } else {
        setStatus('SideShift keys saved for this browser.', 'success');
      }
      settingsDialog?.close();
      if (state.paymentRequest && hasStoredCredentials()) {
        await createShiftFromPayment();
      }
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  clearCredsButton.addEventListener('click', () => {
    clearStoredCredentials();
    state.sideshiftCreateShiftAllowed = true;
    affiliateIdInput.value = '';
    applySecretMaskState();
    renderCredsStatus();
    setStatus('SideShift keys cleared from this browser.', 'info');
  });

  secretInput?.addEventListener('focus', () => {
    clearSecretMaskForEdit();
  });

  secretInput?.addEventListener('blur', () => {
    if (!secretInput.value.trim() && getStoredCredentials()) {
      applySecretMaskState();
    }
  });

  settingsDialog?.addEventListener('toggle', () => {
    if (settingsDialog.open) {
      applySecretMaskState();
    }
  });

  bindModalWithScannerPause(settingsDialog);
  bindModalWithScannerPause(helpDialog);

  settingsButton?.addEventListener('click', async () => {
    await openModalWithScannerPause(settingsDialog);
  });

  helpButton?.addEventListener('click', async () => {
    await openModalWithScannerPause(helpDialog);
  });

  closeSettingsButton?.addEventListener('click', () => {
    settingsDialog?.close();
  });

  closeHelpButton?.addEventListener('click', () => {
    helpDialog?.close();
  });

  walletLink.addEventListener('click', (event) => {
    if (walletLink.classList.contains('disabled')) {
      event.preventDefault();
    }
  });

  video?.addEventListener('emptied', () => {
    updateScannerTargetPanelVisibility();
  });
}

renderTargetDetails(null);
renderShiftDetails(null);
setWalletLinkState(null);
renderCredsStatus();
const existingCreds = getStoredCredentials();
if (existingCreds && affiliateIdInput) {
  affiliateIdInput.value = existingCreds.affiliateId;
}
applySecretMaskState();
bindUi();
registerServiceWorker();

async function init() {
  let bootstrapFailed = false;
  if (!hasStoredCredentials()) {
    setStatus('Creating your SideShift account…', 'info');
    try {
      const { affiliateId, secret } = await createAccountViaGraphql();
      saveCredentials(secret, affiliateId);
      if (affiliateIdInput) {
        affiliateIdInput.value = affiliateId;
      }
      applySecretMaskState();
      renderCredsStatus();
    } catch (error) {
      bootstrapFailed = true;
      setStatus(
        error?.message ||
          'Could not create a SideShift account. Add keys in Settings or try again.',
        'error',
      );
    }
  }

  let permDetail = null;
  if (!bootstrapFailed) {
    permDetail = await resolveSideshiftPermissions(getStoredCredentials());
  }

  if (!bootstrapFailed && state.sideshiftCreateShiftAllowed) {
    if (permDetail) {
      setStatus(
        `Could not verify SideShift permissions (${permDetail}). You can still try scanning.`,
        'warning',
      );
    } else {
      setStatus('Requesting camera access...', 'info');
    }
  }

  const preserveStatusOnReady =
    bootstrapFailed ||
    state.sideshiftCreateShiftAllowed === false ||
    permDetail !== null;
  await startScanner({ preserveStatusOnReady });
}

void init();
