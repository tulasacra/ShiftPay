import QrScanner from 'qr-scanner';

import { buildBchDeepLink, parsePaymentCode, truncateMiddle } from './lib/payment.js';
import { listenForSideShiftEvents, openSideShiftRequest } from './lib/sideshift.js';
import './styles.css';

const statusBanner = document.getElementById('statusBanner');
const video = document.getElementById('scannerVideo');
const overlay = document.getElementById('scannerOverlay');
const imageInput = document.getElementById('imageInput');
const rescanButton = document.getElementById('rescanButton');
const sideshiftButton = document.getElementById('sideshiftButton');
const walletLink = document.getElementById('walletLink');
const targetDetails = document.getElementById('targetDetails');
const shiftDetails = document.getElementById('shiftDetails');

const state = {
  scanner: null,
  isBusy: false,
  paymentRequest: null,
  shiftOrder: null,
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

function setWalletLinkState(deepLink) {
  if (!deepLink) {
    walletLink.href = '/';
    walletLink.classList.add('disabled');
    walletLink.setAttribute('aria-disabled', 'true');
    return;
  }

  walletLink.href = deepLink;
  walletLink.classList.remove('disabled');
  walletLink.setAttribute('aria-disabled', 'false');
}

function renderTargetDetails(paymentRequest) {
  if (!paymentRequest) {
    targetDetails.className = 'detail-list detail-list--placeholder';
    targetDetails.innerHTML = `
      <div>
        <dt>Status</dt>
        <dd>Scan a supported QR code to inspect the target payment.</dd>
      </div>
    `;
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
      <dd title="${escapeHtml(paymentRequest.address)}">${escapeHtml(
        truncateMiddle(paymentRequest.address),
      )}</dd>
    </div>
    <div>
      <dt>URI</dt>
      <dd title="${escapeHtml(paymentRequest.raw)}">${escapeHtml(truncateMiddle(paymentRequest.raw, 18))}</dd>
    </div>
  `;
}

function renderShiftDetails(order) {
  if (!order?.depositAddress || !order?.depositAmount) {
    shiftDetails.className = 'detail-list detail-list--placeholder';
    shiftDetails.innerHTML = `
      <div>
        <dt>Status</dt>
        <dd>Create a fixed-rate request to see the BCH deposit amount and address.</dd>
      </div>
    `;
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
      <dd title="${escapeHtml(order.depositAddress)}">${escapeHtml(
        truncateMiddle(order.depositAddress),
      )}</dd>
    </div>
    <div>
      <dt>Target payout</dt>
      <dd>${escapeHtml(order.settleAmount || state.paymentRequest?.amount || '?')} ${escapeHtml(
        (order.settleCoin || state.paymentRequest?.currencyCode || '').toUpperCase(),
      )}</dd>
    </div>
    <div>
      <dt>Order</dt>
      <dd title="${escapeHtml(order.id || order.orderId || '')}">${escapeHtml(
        truncateMiddle(order.id || order.orderId || 'Pending'),
      )}</dd>
    </div>
  `;
}

function resetShiftState() {
  state.shiftOrder = null;
  renderShiftDetails(null);
  setWalletLinkState(null);
}

async function stopScanner() {
  state.scanner?.stop();
}

async function startScanner() {
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
    setStatus('Camera ready. Scan a supported payment QR.', 'info');
  } catch (error) {
    setStatus('Camera unavailable here. Use "Scan from image" instead.', 'warning');
  }
}

async function openRequestFromPayment(paymentRequest) {
  state.paymentRequest = paymentRequest;
  renderTargetDetails(paymentRequest);
  resetShiftState();
  sideshiftButton.disabled = false;
  setStatus('Opening a fixed-rate SideShift request...', 'info');

  try {
    await openSideShiftRequest(paymentRequest);
    setStatus(
      'Complete the SideShift request. The BCH deposit details will appear here as soon as the order opens.',
      'success',
    );
  } catch (error) {
    setStatus(error.message, 'error');
  }
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
    await startScanner();
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
      navigator.serviceWorker.register('/sw.js').catch(() => {
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
    sideshiftButton.disabled = true;
    setStatus('Ready to scan again.', 'info');
    await startScanner();
  });

  sideshiftButton.addEventListener('click', async () => {
    if (!state.paymentRequest) {
      return;
    }

    await openRequestFromPayment(state.paymentRequest);
  });

  walletLink.addEventListener('click', (event) => {
    if (walletLink.classList.contains('disabled')) {
      event.preventDefault();
    }
  });

  listenForSideShiftEvents({
    order: (order) => {
      state.shiftOrder = order;
      renderShiftDetails(order);

      if (!order.depositAddress || !order.depositAmount) {
        setStatus('SideShift opened, but it did not expose BCH deposit details yet.', 'warning');
        return;
      }

      setWalletLinkState(buildBchDeepLink(order.depositAddress, order.depositAmount));
      setStatus('Fixed-rate request opened. Launch your BCH wallet with the prepared payment.', 'success');
    },
    deposit: () => {
      setStatus('SideShift detected the BCH deposit. Waiting for settlement.', 'success');
    },
    settle: () => {
      setStatus('SideShift marked the shift as settled.', 'success');
    },
  });
}

renderTargetDetails(null);
renderShiftDetails(null);
setWalletLinkState(null);
bindUi();
registerServiceWorker();
setStatus('Requesting camera access...', 'info');
startScanner();
