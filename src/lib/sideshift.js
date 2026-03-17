const SIDESHIFT_SCRIPT_ID = 'sideshift-widget-script';
const SIDESHIFT_SCRIPT_URL = 'https://sideshift.ai/static/js/main.js';
const SIDESHIFT_EVENTS = ['order', 'deposit', 'settle'];

let widgetPromise;

function waitForWidgetApi(timeoutMs = 15000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (window.sideshift?.show) {
        resolve(window.sideshift);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Timed out waiting for the SideShift widget.'));
        return;
      }

      window.setTimeout(check, 100);
    };

    check();
  });
}

function themeMode() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function baseWidgetConfig() {
  return {
    defaultDepositMethodId: 'bch',
    defaultSettleMethodId: undefined,
    settleAddress: undefined,
    settleAmount: undefined,
    type: 'fixed',
    theme: themeMode(),
  };
}

function applyConfig(config) {
  window.__SIDESHIFT__ = {
    ...baseWidgetConfig(),
    ...(window.__SIDESHIFT__ || {}),
    ...config,
  };
}

function normalizeEventDetail(detail) {
  if (!detail) {
    return {};
  }

  return detail.order ?? detail;
}

export function listenForSideShiftEvents(handlers) {
  const listeners = SIDESHIFT_EVENTS.map((eventName) => {
    const callback = handlers[eventName];

    if (!callback) {
      return null;
    }

    const listener = (event) => callback(normalizeEventDetail(event.detail));
    window.addEventListener(`sideshift.ai/${eventName}`, listener);

    return { eventName, listener };
  });

  return () => {
    listeners.forEach((entry) => {
      if (!entry) {
        return;
      }

      window.removeEventListener(`sideshift.ai/${entry.eventName}`, entry.listener);
    });
  };
}

export async function ensureSideShiftWidget() {
  if (window.sideshift) {
    return window.sideshift;
  }

  if (widgetPromise) {
    return widgetPromise;
  }

  applyConfig({});

  widgetPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(SIDESHIFT_SCRIPT_ID);
    const finalizeResolve = () => waitForWidgetApi().then(resolve).catch(reject);

    if (existingScript) {
      if (window.sideshift?.show) {
        resolve(window.sideshift);
        return;
      }

      const timeoutId = window.setTimeout(() => {
        reject(new Error('Timed out waiting for the SideShift widget.'));
      }, 15000);

      existingScript.addEventListener(
        'load',
        () => {
          window.clearTimeout(timeoutId);
          finalizeResolve();
        },
        { once: true },
      );
      existingScript.addEventListener(
        'error',
        () => {
          window.clearTimeout(timeoutId);
          reject(new Error('Failed to load the SideShift widget.'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Timed out loading the SideShift widget.'));
    }, 15000);

    script.id = SIDESHIFT_SCRIPT_ID;
    script.src = SIDESHIFT_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeoutId);
      finalizeResolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error('Failed to load the SideShift widget.'));
    };

    document.head.append(script);
  });

  return widgetPromise.catch((error) => {
    widgetPromise = undefined;
    throw error;
  });
}

export async function openSideShiftRequest(paymentRequest) {
  applyConfig({
    defaultDepositMethodId: 'bch',
    defaultSettleMethodId: paymentRequest.methodId,
    settleAddress: paymentRequest.address,
    settleAmount: paymentRequest.amount,
    type: 'fixed',
    theme: themeMode(),
  });

  const widget = await ensureSideShiftWidget();
  widget.show();
}
