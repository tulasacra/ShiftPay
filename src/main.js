import QrScanner from 'qr-scanner';

import {
  SUPPORTED_NETWORKS,
  SUPPORTED_SCHEME_LABEL,
  buildBchDeepLink,
  detectNetworksFromAddress,
  hasPayloadAmount,
  hasSchemePrefix,
  parsePaymentCode,
  readMissingAmountDetails,
  readSchemeSettleTarget,
} from './lib/payment.js';
import { createAccountViaGraphql } from './lib/sideshiftAccount.js';
import {
  clearStoredCredentials,
  getStoredCredentials,
  hasStoredCredentials,
  saveCredentials,
} from './lib/sideshiftCredentials.js';
import {
  createFixedBchShift,
  fetchBchSettlePair,
  fetchCreateShiftPermission,
  fetchShiftStatus,
  fetchShiftsBulk,
} from './lib/sideshift.js';
import {
  appendShift,
  clearShifts,
  listShifts,
  updateShift,
} from './lib/shiftHistory.js';
import {
  isWalletPaymentStatus,
  isTerminalStatus,
  shouldShowDepositDetected,
  terminalShiftStatusMessage,
} from './lib/shiftStatus.js';
import { formatEnUsHistoryDate, formatEnUsNumber } from './lib/formatNumber.js';
import './styles.css';

const statusBanner = document.getElementById('statusBanner');
const video = document.getElementById('scannerVideo');
const overlay = document.getElementById('scannerOverlay');
const imageInput = document.getElementById('imageInput');
const rescanButton = document.getElementById('rescanButton');
const pasteUriButton = document.getElementById('pasteUriButton');
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
const supportedSchemesLabel = document.getElementById('supportedSchemesLabel');
const historyButton = document.getElementById('historyButton');
const historyDialog = document.getElementById('historyDialog');
const closeHistoryButton = document.getElementById('closeHistoryButton');
const historyList = document.getElementById('historyList');
const historyStatus = document.getElementById('historyStatus');
const refreshHistoryButton = document.getElementById('refreshHistoryButton');
const clearHistoryButton = document.getElementById('clearHistoryButton');
const networkDialog = document.getElementById('networkDialog');
const networkDialogTitle = document.getElementById('networkDialogTitle');
const networkDialogLede = document.getElementById('networkDialogLede');
const networkForm = document.getElementById('networkForm');
const networkField = document.getElementById('networkField');
const networkSelect = document.getElementById('networkSelect');
const networkAmountField = document.getElementById('networkAmountField');
const networkAmountLabel = document.getElementById('networkAmountLabel');
const networkAmountInput = document.getElementById('networkAmountInput');
const networkAmountHint = document.getElementById('networkAmountHint');
const networkAddress = document.getElementById('networkAddress');
const networkError = document.getElementById('networkError');
const cancelNetworkButton = document.getElementById('cancelNetworkButton');
const pasteDialog = document.getElementById('pasteDialog');
const pasteDialogLede = document.getElementById('pasteDialogLede');
const pasteForm = document.getElementById('pasteForm');
const pasteUriInput = document.getElementById('pasteUriInput');
const cancelPasteButton = document.getElementById('cancelPasteButton');

const SHIFT_POLL_MS = 4000;
const PASTE_DIALOG_LEDE_DEFAULT = 'Paste a payment URI or address, then continue.';
const PASTE_DIALOG_LEDE_DENIED =
  'Clipboard access is blocked for this site. Paste below, or re-enable clipboard in your browser site settings.';

const SECRET_MASK = '*'.repeat(24);
const CAMERA_READY_STATUS = 'Camera ready. Scan a supported payment QR.';
const CAMERA_UNAVAILABLE_STATUS = 'Camera unavailable here. Use File instead.';
const NETWORK_PROMPT_STATUS = 'This code has no network prefix. Pick the network to continue.';
const AMOUNT_PROMPT_STATUS = 'This code has no amount. Enter the amount to continue.';
const NETWORK_LEDE_WITH_AMOUNT =
  'This code has no network prefix, so ShiftPay cannot tell which coin it pays. Pick the network it belongs to.';
const NETWORK_LEDE_WITHOUT_AMOUNT =
  'This code has no network prefix, so ShiftPay cannot tell which coin it pays. Pick the network it belongs to and enter the amount to send.';

const state = {
  scanner: null,
  isBusy: false,
  orderWaitTimer: null,
  shiftPollTimer: null,
  shiftPollAbort: null,
  shiftPollLastStatus: null,
  paymentRequest: null,
  shiftOrder: null,
  shouldResumeScannerAfterModal: false,
  sideshiftCreateShiftAllowed: true,
  pendingNetworkPayload: null,
  pendingNetworkScheme: null,
  pendingNetworkAmountLocked: false,
  pendingAmountSettle: null,
  pairHintAbort: null,
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

function clearStaleCameraUnavailableStatus() {
  if (statusBanner.textContent !== CAMERA_UNAVAILABLE_STATUS || !isScannerVideoLive()) {
    return;
  }
  setStatus(CAMERA_READY_STATUS, 'info');
}

const SIDESHIFT_BLOCKED_HELP_URL =
  'https://help.sideshift.ai/en/articles/2874595-why-am-i-blocked-from-using-sideshift-ai';

function setBlockedStatus() {
  statusBanner.innerHTML = `SideShift is not allowing shifts from this location. See <a href="${SIDESHIFT_BLOCKED_HELP_URL}" target="_blank" rel="noopener noreferrer">why am I blocked</a>.`;
  statusBanner.className = 'status-banner error';
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

function formatHistoryTimestamp(value) {
  return formatEnUsHistoryDate(value);
}

function renderHistoryList() {
  if (!historyList || !historyStatus) {
    return;
  }
  const creds = getStoredCredentials();
  if (!creds) {
    historyList.hidden = true;
    historyList.innerHTML = '';
    historyStatus.textContent = 'Save your SideShift keys first to see past shifts.';
    return;
  }
  const entries = listShifts(creds.affiliateId);
  if (entries.length === 0) {
    historyList.hidden = true;
    historyList.innerHTML = '';
    historyStatus.textContent = 'No shifts recorded in this browser yet.';
    return;
  }

  historyStatus.textContent = `${formatEnUsNumber(entries.length)} shift${
    entries.length === 1 ? '' : 's'
  } saved in this browser.`;
  historyList.hidden = false;
  historyList.innerHTML = entries
    .map((entry) => {
      const status = entry.status || 'unknown';
      const statusClass = `history-item-status--${escapeHtml(String(status).toLowerCase())}`;
      const settleAmount = formatEnUsNumber(entry.settleAmount || entry.paymentAmount || '?');
      const settleCoin = (entry.settleCoin || entry.paymentCurrency || '').toUpperCase();
      const depositAmount = formatEnUsNumber(entry.depositAmount || '?');
      const when = formatHistoryTimestamp(entry.createdAt);
      return `
        <li>
          <button type="button" class="history-item" data-shift-id="${escapeHtml(entry.id)}">
            <span class="history-item-row">
              <span class="history-item-amount">${escapeHtml(settleAmount)} ${escapeHtml(settleCoin)}</span>
              <span class="history-item-status ${statusClass}">${escapeHtml(status)}</span>
            </span>
            <span class="history-item-meta">
              <span>${escapeHtml(depositAmount)} BCH${when ? ` • ${escapeHtml(when)}` : ''}</span>
              <span class="history-item-id">${escapeHtml(entry.id)}</span>
            </span>
          </button>
        </li>
      `;
    })
    .join('');
}

async function refreshHistoryStatuses() {
  if (!historyStatus) {
    return;
  }
  const creds = getStoredCredentials();
  if (!creds) {
    return;
  }
  const entries = listShifts(creds.affiliateId);
  if (entries.length === 0) {
    return;
  }
  const stale = entries.filter((e) => !isTerminalStatus(e.status));
  if (stale.length === 0) {
    historyStatus.textContent = `${formatEnUsNumber(entries.length)} shift${
      entries.length === 1 ? '' : 's'
    } saved in this browser. All final.`;
    return;
  }
  historyStatus.textContent = 'Refreshing statuses…';
  try {
    const shifts = await fetchShiftsBulk(stale.map((e) => e.id));
    for (const shift of shifts) {
      if (!shift?.id) {
        continue;
      }
      updateShift(creds.affiliateId, shift.id, {
        status: shift.status,
        settleAmount: shift.settleAmount ?? undefined,
        depositAmount: shift.depositAmount ?? undefined,
        depositAddress: shift.depositAddress ?? undefined,
        settleCoin: shift.settleCoin ?? undefined,
        depositMemo: shift.depositMemo ?? undefined,
      });
    }
    renderHistoryList();
    historyStatus.textContent = `Updated ${formatEnUsNumber(shifts.length)} of ${formatEnUsNumber(
      stale.length,
    )} non-final shift${stale.length === 1 ? '' : 's'}.`;
  } catch (error) {
    renderHistoryList();
    historyStatus.textContent = `Could not refresh: ${error?.message || 'request failed'}`;
  }
}

function reopenShiftFromHistory(shiftId) {
  const creds = getStoredCredentials();
  if (!creds) {
    return;
  }
  const entry = listShifts(creds.affiliateId).find((e) => e.id === shiftId);
  if (!entry) {
    return;
  }

  state.shouldResumeScannerAfterModal = false;
  historyDialog?.close();
  void stopScanner();

  const paymentRequest = entry.paymentRequest
    ? { ...entry.paymentRequest }
    : {
        currencyCode: (entry.settleCoin || '').toUpperCase(),
        label: (entry.settleCoin || '').toUpperCase(),
        amount: entry.settleAmount || '',
        amountLabel: `${formatEnUsNumber(entry.settleAmount || '')} ${(entry.settleCoin || '').toUpperCase()}`.trim(),
        address: entry.settleAddress || '',
        methodId: (entry.settleCoin || '').toLowerCase(),
        networkId: entry.settleNetwork || '',
        settleMemo: entry.settleMemo || '',
        raw: entry.paymentRaw || '',
        scheme: entry.paymentScheme || '',
      };

  state.paymentRequest = paymentRequest;
  renderTargetDetails(paymentRequest);
  resetShiftState();

  const order = {
    id: entry.id,
    orderId: entry.id,
    status: entry.status,
    depositAddress: entry.depositAddress,
    depositAmount: entry.depositAmount,
    depositMemo: entry.depositMemo,
    settleAmount: entry.settleAmount,
    settleCoin: entry.settleCoin,
  };
  state.shiftOrder = order;
  renderShiftDetails(order);

  if (entry.depositAddress && entry.depositAmount && isWalletPaymentStatus(entry.status)) {
    setWalletLinkState(
      buildBchDeepLink(entry.depositAddress, entry.depositAmount, entry.depositMemo),
    );
  } else {
    setWalletLinkState(null);
  }

  setStatus(`Reopened shift ${entry.id}.`, 'info');
  state.shiftPollLastStatus = entry.status ?? null;
  if (!isTerminalStatus(entry.status)) {
    startShiftStatusPoll(entry.id);
  }
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
    ${
      paymentRequest.settleMemo
        ? `<div>
      <dt>Memo/tag</dt>
      <dd>${escapeHtml(paymentRequest.settleMemo)}</dd>
    </div>`
        : ''
    }
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

  const orderId = order.id || order.orderId;
  const orderDd =
    orderId != null && orderId !== ''
      ? `<a class="detail-list__order-link" href="https://sideshift.ai/orders/${encodeURIComponent(
          String(orderId),
        )}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(orderId))}</a>`
      : escapeHtml('Pending');
  shiftDetails.className = 'detail-list';
  shiftDetails.innerHTML = `
    <div>
      <dt>BCH amount</dt>
      <dd>${escapeHtml(formatEnUsNumber(order.depositAmount))} BCH</dd>
    </div>
    <div>
      <dt>BCH address</dt>
      <dd>${escapeHtml(order.depositAddress)}</dd>
    </div>
    <div>
      <dt>Target payout</dt>
      <dd>${escapeHtml(
        formatEnUsNumber(order.settleAmount || state.paymentRequest?.amount || '?'),
      )} ${escapeHtml((order.settleCoin || state.paymentRequest?.currencyCode || '').toUpperCase())}</dd>
    </div>
    <div>
      <dt>Order</dt>
      <dd>${orderDd}</dd>
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
  state.shiftPollAbort?.abort();
  state.shiftPollAbort = null;
  if (state.shiftPollTimer !== null) {
    window.clearTimeout(state.shiftPollTimer);
    state.shiftPollTimer = null;
  }
}

/** Aborting is what stops a poll: clearing the timer alone leaves an in-flight tick to reschedule. */
function startShiftStatusPoll(shiftId) {
  stopShiftStatusPoll();

  const controller = new AbortController();
  state.shiftPollAbort = controller;

  const schedule = (delay) => {
    if (controller.signal.aborted) {
      return;
    }
    state.shiftPollTimer = window.setTimeout(tick, delay);
  };

  const tick = async () => {
    state.shiftPollTimer = null;

    try {
      const shift = await fetchShiftStatus(shiftId, { signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }
      const prev = state.shiftPollLastStatus;
      state.shiftPollLastStatus = shift.status;
      state.shiftOrder = shift;
      renderShiftDetails(shift);
      if (shift.depositAddress && shift.depositAmount && isWalletPaymentStatus(shift.status)) {
        setWalletLinkState(
          buildBchDeepLink(shift.depositAddress, shift.depositAmount, shift.depositMemo),
        );
      } else {
        setWalletLinkState(null);
      }

      const creds = getStoredCredentials();
      if (creds) {
        updateShift(creds.affiliateId, shiftId, {
          status: shift.status,
          settleAmount: shift.settleAmount ?? undefined,
          depositAmount: shift.depositAmount ?? undefined,
          depositAddress: shift.depositAddress ?? undefined,
          settleCoin: shift.settleCoin ?? undefined,
          depositMemo: shift.depositMemo ?? undefined,
        });
      }

      const st = shift.status;
      if (shouldShowDepositDetected(prev, st)) {
        setStatus('SideShift detected the BCH deposit. Waiting for settlement.', 'success');
      }

      const terminalMessage = terminalShiftStatusMessage(st);
      if (terminalMessage) {
        setStatus(terminalMessage.message, terminalMessage.tone);
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
    if (!preserveStatusOnReady || statusBanner.textContent === CAMERA_UNAVAILABLE_STATUS) {
      setStatus(CAMERA_READY_STATUS, 'info');
    }
  } catch (error) {
    updateScannerTargetPanelVisibility();
    if (isScannerVideoLive()) {
      clearStaleCameraUnavailableStatus();
      return;
    }
    if (!preserveStatusOnReady) {
      setStatus(CAMERA_UNAVAILABLE_STATUS, 'warning');
    }
  }
}

async function resolveSideshiftPermissions() {
  try {
    const allowed = await fetchCreateShiftPermission();
    state.sideshiftCreateShiftAllowed = allowed;
    if (!allowed) {
      setBlockedStatus();
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
    setBlockedStatus();
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

    if (order.id) {
      appendShift(creds.affiliateId, {
        id: order.id,
        createdAt: order.createdAt || new Date().toISOString(),
        status: order.status,
        depositAddress: order.depositAddress,
        depositAmount: order.depositAmount,
        depositMemo: order.depositMemo,
        settleAddress: order.settleAddress || paymentRequest.address,
        settleAmount: order.settleAmount || paymentRequest.amount,
        settleCoin: order.settleCoin || paymentRequest.methodId,
        settleNetwork: order.settleNetwork || paymentRequest.networkId,
        settleMemo: order.settleMemo || paymentRequest.settleMemo,
        paymentRequest: { ...paymentRequest },
      });
    }

    if (!order.depositAddress || !order.depositAmount) {
      setStatus('SideShift did not return BCH deposit details.', 'warning');
      return;
    }

    if (isWalletPaymentStatus(order.status)) {
      setWalletLinkState(
        buildBchDeepLink(order.depositAddress, order.depositAmount, order.depositMemo),
      );
      setStatus(
        'Fixed-rate request created. Launch your BCH wallet with the prepared payment.',
        'success',
      );
    } else {
      setWalletLinkState(null);
      setStatus(`SideShift returned shift status: ${order.status || 'unknown'}.`, 'warning');
    }

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

function setNetworkError(message) {
  if (!networkError) {
    return;
  }
  networkError.textContent = message;
  networkError.classList.toggle('creds-status--error', Boolean(message));
}

function setNetworkAmountLabel(currencyCode) {
  if (!networkAmountLabel) {
    return;
  }
  networkAmountLabel.textContent = currencyCode ? `Amount (${currencyCode})` : 'Amount';
}

function setNetworkAmountHint(text) {
  if (!networkAmountHint) {
    return;
  }
  if (!text) {
    networkAmountHint.hidden = true;
    networkAmountHint.textContent = '';
    return;
  }
  networkAmountHint.hidden = false;
  networkAmountHint.textContent = text;
}

function renderNetworkOptions(networks) {
  if (!networkSelect) {
    return;
  }
  networkSelect.innerHTML = [
    '<option value="" selected disabled>Select a network</option>',
    ...networks.map(
      ({ scheme, label }) =>
        `<option value="${escapeHtml(scheme)}">${escapeHtml(label)}</option>`,
    ),
  ].join('');
  networkSelect.value = '';
}

function abortPairHintFetch() {
  state.pairHintAbort?.abort();
  state.pairHintAbort = null;
}

async function refreshNetworkAmountMinimum(settle) {
  abortPairHintFetch();
  setNetworkAmountHint('');

  if (!settle?.methodId || !settle?.currencyCode) {
    return;
  }

  const controller = new AbortController();
  state.pairHintAbort = controller;

  try {
    const creds = getStoredCredentials();
    const pair = await fetchBchSettlePair(settle.methodId, settle.networkId, {
      signal: controller.signal,
      affiliateId: creds?.affiliateId,
    });
    if (controller.signal.aborted || !pair.minSettle) {
      return;
    }
    setNetworkAmountHint(
      `Minimum ~${formatEnUsNumber(pair.minSettle)} ${settle.currencyCode}`,
    );
  } catch (error) {
    if (error?.name === 'AbortError') {
      return;
    }
    setNetworkAmountHint('');
  } finally {
    if (state.pairHintAbort === controller) {
      state.pairHintAbort = null;
    }
  }
}

/**
 * A known network is either carried by the code's own prefix or detected from the recipient
 * format, so only the amount is still missing. Choices narrow the list when several fit.
 */
function openNetworkPicker(scannedText, knownNetwork = null, choices = []) {
  const hasPrefix = hasSchemePrefix(scannedText);
  const amountLocked = !knownNetwork && hasPayloadAmount(scannedText);
  state.pendingNetworkPayload = scannedText;
  state.pendingNetworkScheme = knownNetwork?.scheme ?? null;
  state.pendingNetworkAmountLocked = amountLocked;
  state.pendingAmountSettle = null;

  // A locked or narrowed network is already clear from the title / select; skip the lede and address.
  let lede = '';
  if (knownNetwork && hasPrefix) {
    lede = `This ${knownNetwork.label} code has no amount. Enter the amount to send.`;
  } else if (!knownNetwork && choices.length <= 1 && amountLocked) {
    lede = NETWORK_LEDE_WITH_AMOUNT;
  } else if (!knownNetwork && choices.length <= 1) {
    lede = NETWORK_LEDE_WITHOUT_AMOUNT;
  }

  if (networkAddress) {
    networkAddress.hidden = true;
    networkAddress.textContent = '';
  }
  if (networkDialogTitle) {
    networkDialogTitle.textContent = knownNetwork ? 'Enter the amount' : 'Pick the network';
  }
  if (networkDialogLede) {
    networkDialogLede.hidden = !lede;
    networkDialogLede.textContent = lede;
  }
  if (networkField) {
    networkField.hidden = Boolean(knownNetwork);
  }
  if (networkSelect) {
    networkSelect.required = !knownNetwork;
  }
  if (!knownNetwork) {
    renderNetworkOptions(choices.length > 1 ? choices : SUPPORTED_NETWORKS);
  }
  if (networkAmountField) {
    networkAmountField.hidden = amountLocked;
  }
  if (networkAmountInput) {
    networkAmountInput.value = '';
    networkAmountInput.required = !amountLocked;
  }
  setNetworkAmountHint('');
  if (!amountLocked) {
    const settle = knownNetwork ?? readSchemeSettleTarget(networkSelect?.value);
    state.pendingAmountSettle = settle;
    setNetworkAmountLabel(settle?.currencyCode ?? '');
    void refreshNetworkAmountMinimum(settle);
  }
  setNetworkError('');
  setStatus(knownNetwork ? AMOUNT_PROMPT_STATUS : NETWORK_PROMPT_STATUS, 'warning');
  networkDialog?.showModal();
}

async function submitNetworkPicker() {
  const scannedText = state.pendingNetworkPayload;
  if (!scannedText) {
    return;
  }

  const options = hasSchemePrefix(scannedText)
    ? {}
    : { scheme: state.pendingNetworkScheme ?? networkSelect.value };
  if (!state.pendingNetworkAmountLocked) {
    options.amount = networkAmountInput.value.trim();
  }

  let paymentRequest;
  try {
    paymentRequest = parsePaymentCode(scannedText, options);
  } catch (error) {
    setNetworkError(error.message);
    return;
  }

  state.pendingNetworkPayload = null;
  state.pendingNetworkScheme = null;
  state.pendingNetworkAmountLocked = false;
  state.pendingAmountSettle = null;
  networkDialog?.close();
  await openRequestFromPayment(paymentRequest);
}

/** Leaves the scanner stopped so the same incomplete code cannot immediately reopen the dialog. */
function cancelNetworkPicker() {
  if (!state.pendingNetworkPayload) {
    return;
  }
  const wasAmountOnly =
    Boolean(state.pendingNetworkScheme) || hasSchemePrefix(state.pendingNetworkPayload);
  state.pendingNetworkPayload = null;
  state.pendingNetworkScheme = null;
  state.pendingNetworkAmountLocked = false;
  state.pendingAmountSettle = null;
  abortPairHintFetch();
  setNetworkAmountHint('');
  setStatus(
    wasAmountOnly
      ? 'No amount entered. Use Camera to try again.'
      : 'No network picked. Use Camera to try again.',
    'info',
  );
}

async function handleDecodedText(decodedText) {
  if (state.isBusy) {
    return;
  }

  state.isBusy = true;

  try {
    await stopScanner();
    if (!hasSchemePrefix(decodedText)) {
      const payload = decodedText.trim();
      const detected = detectNetworksFromAddress(payload);
      const [onlyNetwork] = detected.length === 1 ? detected : [];
      if (onlyNetwork && hasPayloadAmount(payload, onlyNetwork.scheme)) {
        await openRequestFromPayment(parsePaymentCode(payload, { scheme: onlyNetwork.scheme }));
        return;
      }
      openNetworkPicker(payload, onlyNetwork ?? null, detected);
      return;
    }
    const missingAmount = readMissingAmountDetails(decodedText);
    if (missingAmount) {
      openNetworkPicker(decodedText.trim(), missingAmount);
      return;
    }
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

async function openPasteDialog(options = {}) {
  const denied = Boolean(options.denied);
  if (pasteDialogLede) {
    pasteDialogLede.textContent = denied ? PASTE_DIALOG_LEDE_DENIED : PASTE_DIALOG_LEDE_DEFAULT;
  }
  if (pasteUriInput) {
    pasteUriInput.value = '';
  }
  await openModalWithScannerPause(pasteDialog);
  pasteUriInput?.focus();
}

async function submitPasteDialog(event) {
  event.preventDefault();
  const text = pasteUriInput?.value.trim() || '';
  if (!text) {
    setStatus('Paste a payment code to continue.', 'warning');
    pasteUriInput?.focus();
    return;
  }
  pasteDialog?.close();
  setStatus('Reading payment code...', 'info');
  await handleDecodedText(text);
}

async function handlePasteUri() {
  if (!navigator.clipboard?.readText) {
    await openPasteDialog();
    return;
  }

  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) {
      setStatus('Clipboard is empty.', 'warning');
      return;
    }
    setStatus('Reading payment code from clipboard...', 'info');
    await handleDecodedText(text);
  } catch (error) {
    if (error?.name === 'NotAllowedError') {
      await openPasteDialog({ denied: true });
      return;
    }
    setStatus(error?.message || 'Could not read the clipboard.', 'error');
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
  pasteUriButton.addEventListener('click', handlePasteUri);
  pasteForm?.addEventListener('submit', (event) => {
    void submitPasteDialog(event);
  });
  cancelPasteButton?.addEventListener('click', () => {
    pasteDialog?.close();
  });
  bindModalWithScannerPause(pasteDialog);

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
      if (!state.sideshiftCreateShiftAllowed) {
        settingsDialog?.close();
        if (state.paymentRequest) {
          await startScanner({ preserveStatusOnReady: true });
        }
        return;
      }
      setStatus('SideShift keys saved for this browser.', 'success');
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
  bindModalWithScannerPause(historyDialog);

  networkForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitNetworkPicker();
  });

  networkSelect?.addEventListener('change', () => {
    if (
      !state.pendingNetworkPayload ||
      hasSchemePrefix(state.pendingNetworkPayload) ||
      state.pendingNetworkAmountLocked
    ) {
      return;
    }
    const settle = readSchemeSettleTarget(networkSelect.value);
    state.pendingAmountSettle = settle;
    setNetworkAmountLabel(settle?.currencyCode ?? '');
    void refreshNetworkAmountMinimum(settle);
  });

  networkDialog?.addEventListener('click', (event) => {
    if (event.target === networkDialog) {
      networkDialog.close();
    }
  });

  networkDialog?.addEventListener('close', cancelNetworkPicker);

  cancelNetworkButton?.addEventListener('click', () => {
    networkDialog?.close();
  });

  settingsButton?.addEventListener('click', async () => {
    await openModalWithScannerPause(settingsDialog);
  });

  helpButton?.addEventListener('click', async () => {
    await openModalWithScannerPause(helpDialog);
  });

  historyButton?.addEventListener('click', async () => {
    renderHistoryList();
    await openModalWithScannerPause(historyDialog);
    void refreshHistoryStatuses();
  });

  closeSettingsButton?.addEventListener('click', () => {
    settingsDialog?.close();
  });

  closeHelpButton?.addEventListener('click', () => {
    helpDialog?.close();
  });

  closeHistoryButton?.addEventListener('click', () => {
    historyDialog?.close();
  });

  refreshHistoryButton?.addEventListener('click', () => {
    void refreshHistoryStatuses();
  });

  clearHistoryButton?.addEventListener('click', () => {
    const creds = getStoredCredentials();
    if (!creds) {
      return;
    }
    clearShifts(creds.affiliateId);
    renderHistoryList();
  });

  historyList?.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('.history-item') : null;
    if (!button) {
      return;
    }
    const shiftId = button.getAttribute('data-shift-id');
    if (shiftId) {
      reopenShiftFromHistory(shiftId);
    }
  });

  walletLink.addEventListener('click', (event) => {
    if (walletLink.classList.contains('disabled')) {
      event.preventDefault();
    }
  });

  video?.addEventListener('emptied', () => {
    updateScannerTargetPanelVisibility();
  });
  video?.addEventListener('loadeddata', () => {
    clearStaleCameraUnavailableStatus();
    updateScannerTargetPanelVisibility();
  });
  video?.addEventListener('playing', () => {
    clearStaleCameraUnavailableStatus();
    updateScannerTargetPanelVisibility();
  });
}

renderTargetDetails(null);
renderShiftDetails(null);
setWalletLinkState(null);
if (supportedSchemesLabel) {
  supportedSchemesLabel.textContent = SUPPORTED_SCHEME_LABEL;
}
renderNetworkOptions(SUPPORTED_NETWORKS);
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
    permDetail = await resolveSideshiftPermissions();
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
