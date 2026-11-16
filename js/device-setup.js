// First-run setup: with no usable TV address stored, ask for one before the
// remote can send anything.
//
// "192.168.1." is prefilled because it is the most common home subnet, so
// usually only the last part has to be typed. OK stays disabled until the
// whole value parses as an address the remote could actually use, so the
// dialog can't store something that would be rejected later anyway.

import { parseDeviceAddress } from "./address.js";

export const IP_PREFIX = "192.168.1.";

/**
 * @param {object} deps
 * @param {HTMLElement} deps.dialog
 * @param {HTMLInputElement} deps.input
 * @param {HTMLElement} deps.error
 * @param {HTMLButtonElement} deps.okButton
 * @param {HTMLButtonElement} deps.laterButton
 * @param {(parsed: {host: string, addressSpace: "local"|"loopback"}) => void} deps.onSubmit
 * @param {HTMLButtonElement} [deps.testButton] "Test" button, like the one in Settings
 * @param {HTMLElement} [deps.result] line showing the test outcome
 * @param {(parsed: object) => Promise<{tone: string, message: string}>} [deps.testConnection]
 * @param {string} [deps.initialValue]
 * @param {(HTMLElement|null)[]} [deps.background] made inert while the dialog is open
 */
export function createDeviceSetup({
  dialog,
  input,
  error,
  okButton,
  laterButton,
  onSubmit,
  testButton,
  result,
  testConnection,
  initialValue = IP_PREFIX,
  background = [],
}) {
  let open = false;
  let testing = false;
  // Bumped whenever the field changes, so a slow test can't report for an old address.
  let testRun = 0;

  function setError(message) {
    error.textContent = message ?? "";
    error.hidden = !message;
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function setResult(tone, message) {
    if (!result) return;
    result.dataset.tone = tone || "";
    result.textContent = message ?? "";
  }

  function clearResult() {
    testRun++;
    setResult("", "");
  }

  /** Enables OK as soon as the value is usable; clears an old error once it is. */
  function validate() {
    const parsed = parseDeviceAddress(input.value);
    okButton.disabled = !parsed.ok;
    if (parsed.ok && !error.hidden) setError(null);
    return parsed;
  }

  function show() {
    if (open) return;
    open = true;
    input.value = initialValue;
    setError(null);
    clearResult();
    validate();
    dialog.hidden = false;
    background.forEach((el) => el && (el.inert = true));
    input.focus({ preventScroll: true });
    input.setSelectionRange?.(input.value.length, input.value.length);
  }

  function close() {
    if (!open) return;
    open = false;
    dialog.hidden = true;
    background.forEach((el) => el && (el.inert = false));
    setError(null);
    clearResult();
  }

  /** Asks the transport whether the address answers, like Settings → Test does. */
  async function runTest() {
    if (!testConnection || testing) return;
    const parsed = parseDeviceAddress(input.value);
    if (!parsed.ok) {
      okButton.disabled = true;
      setError(parsed.error);
      input.focus({ preventScroll: true });
      return;
    }
    setError(null);
    const run = ++testRun;
    testing = true;
    if (testButton) testButton.disabled = true;
    setResult("busy", `Contacting ${parsed.host}:6095…`);
    try {
      const { tone, message } = await testConnection(parsed);
      if (run === testRun && open) setResult(tone, message);
    } catch (err) {
      if (run === testRun && open) setResult("error", err?.message || String(err));
    } finally {
      testing = false;
      if (testButton) testButton.disabled = false;
    }
  }

  function submit() {
    const parsed = parseDeviceAddress(input.value);
    if (!parsed.ok) {
      okButton.disabled = true;
      setError(parsed.error);
      input.focus({ preventScroll: true });
      return;
    }
    close();
    onSubmit(parsed);
  }

  input.addEventListener("input", () => {
    validate();
    clearResult();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    submit();
  });
  okButton.addEventListener("click", submit);
  laterButton.addEventListener("click", close);
  testButton?.addEventListener("click", runTest);
  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    close();
  });

  return {
    open: show,
    close,
    submit,
    runTest,
    validate,
    get isOpen() {
      return open;
    },
  };
}
