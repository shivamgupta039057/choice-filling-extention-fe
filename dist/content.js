(() => {
if (window.__choiceFillingHelperListener) {
  try {
    chrome.runtime.onMessage.removeListener(window.__choiceFillingHelperListener);
  } catch {
    // The extension was reloaded while this page was still open.
  }
}

const BUTTON_TEXT = /^add$/i;
const MCC_HOST = "mcc.admissions.nic.in";
const ADD_DELAY_MS = 3000;
const AUTO_SAVE_BATCH_SIZE = 6;
const HELPER_PANEL_ID = "mcc-choice-helper-panel";
const HELPER_LAUNCHER_ID = "mcc-choice-helper-launcher";
const HELPER_FRAME_ID = "mcc-choice-helper-frame";
const PLAN_MODAL_ID = "mcc-choice-helper-plan-modal";
let fillJob = null;

function hasLiveExtensionContext() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function getExtensionUrl(path) {
  try {
    if (!hasLiveExtensionContext()) return "";
    return chrome.runtime.getURL(path);
  } catch {
    return "";
  }
}

window.__choiceFillingHelperListener = (message, sender, sendResponse) => {
  if (message.type === "MCC_TOGGLE_HELPER_PANEL") {
    sendResponse(toggleHelperPanel());
    return true;
  }
  if (message.type === "MCC_CLOSE_HELPER_PANEL") {
    sendResponse(closeHelperPanel());
    return true;
  }
  if (message.type === "MCC_PREVIEW_CHOICES") {
    sendResponse(previewChoices(message.priorityItems || [], message.skippedRanks || []));
    return true;
  }
  if (message.type === "MCC_START_FILLING") {
    sendResponse(startFillJob(message.priorityItems || [], message.skippedRanks || []));
    return true;
  }
  if (message.type === "MCC_SKIP_BLOCKER") {
    sendResponse(skipBlockedChoice(message.priorityItems || [], message.skippedRanks || []));
    return true;
  }
  if (message.type === "MCC_PAUSE_FILLING") {
    sendResponse(pauseFillJob());
    return true;
  }
  if (message.type === "MCC_RESUME_FILLING") {
    sendResponse(resumeFillJob());
    return true;
  }
  if (message.type === "MCC_STOP_FILLING") {
    sendResponse(stopFillJob());
    return true;
  }
  if (message.type === "MCC_FILL_STATUS") {
    sendResponse(fillJobStatus());
    return true;
  }
  if (message.type === "MCC_CANDIDATE_INFO") {
    sendResponse(getCandidateInfo());
    return true;
  }
  return false;
};

if (hasLiveExtensionContext()) {
  chrome.runtime.onMessage.addListener(window.__choiceFillingHelperListener);
}
installHelperLauncher();
window.addEventListener("message", handleHelperFrameMessage);
window.addEventListener("beforeunload", warnIfFilling);

function installHelperLauncher() {
  if (!isMcc() || document.getElementById(HELPER_LAUNCHER_ID)) return;

  const launcher = document.createElement("button");
  launcher.id = HELPER_LAUNCHER_ID;
  launcher.type = "button";
  launcher.title = "Open MCC Choice Helper";
  launcher.innerHTML = "<span>MCC</span><strong>Helper</strong>";
  launcher.addEventListener("click", () => toggleHelperPanel());
  document.documentElement.appendChild(launcher);
  injectHelperChromeStyles();
}

function toggleHelperPanel() {
  if (!isMcc()) {
    return { ok: false, message: "Open the MCC choice filling page to use Choice Helper." };
  }

  const panel = document.getElementById(HELPER_PANEL_ID);
  if (panel) {
    panel.classList.toggle("mcc-helper-panel--open");
    return { ok: true, open: panel.classList.contains("mcc-helper-panel--open") };
  }

  openHelperPanel();
  return { ok: true, open: true };
}

function openHelperPanel() {
  injectHelperChromeStyles();
  const candidateInfo = getCandidateInfo();
  const helperParams = new URLSearchParams({ surface: "page-panel" });
  if (candidateInfo.rollNumber) helperParams.set("candidateRoll", candidateInfo.rollNumber);
  if (candidateInfo.candidateName) helperParams.set("candidateName", candidateInfo.candidateName);
  const helperUrl = getExtensionUrl(`index.html?${helperParams.toString()}#/`);

  const panel = document.createElement("aside");
  panel.id = HELPER_PANEL_ID;
  panel.className = "mcc-helper-panel mcc-helper-panel--open";
  panel.innerHTML = `
    <div class="mcc-helper-panel__topbar">
      <div>
        <strong>MCC Choice Helper</strong>
        <span>Credits, upload, preview and filling controls</span>
      </div>
      <button type="button" class="mcc-helper-panel__close" aria-label="Close Choice Helper">×</button>
    </div>
    ${helperUrl
      ? `<iframe id="${HELPER_FRAME_ID}" title="MCC Choice Helper" src="${helperUrl}"></iframe>`
      : `<div class="mcc-helper-panel__invalid">
          <strong>Extension was reloaded</strong>
          <span>Refresh this MCC page once, then open MCC Choice Helper again.</span>
        </div>`}
  `;

  panel.querySelector(".mcc-helper-panel__close").addEventListener("click", closeHelperPanel);
  document.documentElement.appendChild(panel);
}

function closeHelperPanel() {
  const panel = document.getElementById(HELPER_PANEL_ID);
  if (panel) panel.remove();
  removeHostPlanModal(false);
  return { ok: true, open: false };
}

function getCandidateInfo() {
  const rollNumber = cleanCandidateValue(
    document.querySelector("#ctl00_lblroll")?.textContent || findValueAfterLabel(/roll\s*number/i)
  );
  const candidateName = cleanCandidateValue(
    document.querySelector("#ctl00_lblnm")?.textContent || findValueAfterLabel(/^name$/i)
  );

  return {
    ok: Boolean(rollNumber),
    rollNumber,
    candidateName
  };
}

function findValueAfterLabel(labelPattern) {
  const bodyText = String(document.body?.innerText || "");
  const lines = bodyText.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(.*?):\s*(.+)$/);
    if (match && labelPattern.test(match[1])) return match[2];
  }

  return "";
}

function cleanCandidateValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function handleHelperFrameMessage(event) {
  const frame = document.getElementById(HELPER_FRAME_ID);
  if (!frame || event.source !== frame.contentWindow) return;

  const message = event.data || {};
  if (message.type === "MCC_SHOW_PLAN_MODAL") {
    renderHostPlanModal(message.payload || {});
  }
  if (message.type === "MCC_HIDE_PLAN_MODAL") {
    removeHostPlanModal(false);
  }
}

function renderHostPlanModal(payload) {
  removeHostPlanModal(false);
  injectHelperChromeStyles();

  const packages = Array.isArray(payload.packages) ? payload.packages : [];
  const features = Array.isArray(payload.features) && payload.features.length
    ? payload.features
    : ["Priority file upload", "MCC page preview", "Choice filling controls", "Credit ledger and upload history"];
  const authenticated = Boolean(payload.authenticated);
  const paymentLoading = Boolean(payload.paymentLoading);

  const modal = document.createElement("div");
  modal.id = PLAN_MODAL_ID;
  modal.innerHTML = `
    <section class="mcc-plan-dialog" role="dialog" aria-modal="true" aria-label="Upgrade plans">
      <button type="button" class="mcc-plan-close" aria-label="Close upgrade plans">×</button>
      <p class="mcc-plan-eyebrow">Upgrade plans</p>
      <h2>${escapeHtml(payload.title || "Choose the right plan")}</h2>
      <p class="mcc-plan-subtitle">${escapeHtml(payload.subtitle || "Add credits to your account and continue filling choices.")}</p>
      <div class="mcc-plan-billing">
        <span>Credits</span>
        <strong>Pay as you upload</strong>
        <em>No monthly lock-in</em>
      </div>
      <div class="mcc-plan-grid">
        ${packages.map((item, index) => `
          <button type="button" class="mcc-plan-card ${index === 0 ? "mcc-plan-card--popular" : ""}" data-package-id="${escapeAttribute(item.id)}" ${paymentLoading ? "disabled" : ""}>
            <small>${index === 0 ? "Popular" : escapeHtml(item.label || "Plan")}</small>
            <span>${escapeHtml(item.label || "Plan")}</span>
            <strong>INR ${Number(item.amountPaise || 0) / 100}</strong>
            <em>${Number(item.credits || 0)} credits</em>
            <b>${authenticated ? "Upgrade Now" : "Login to upgrade"}</b>
            <ul>${features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>
          </button>
        `).join("")}
      </div>
    </section>
  `;

  modal.querySelector(".mcc-plan-close").addEventListener("click", () => removeHostPlanModal(true));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) removeHostPlanModal(true);
  });
  modal.querySelectorAll("[data-package-id]").forEach((button) => {
    button.addEventListener("click", () => {
      postToHelperFrame({ type: "MCC_PLAN_MODAL_PACKAGE_SELECTED", packageId: button.dataset.packageId });
    });
  });

  document.documentElement.appendChild(modal);
}

function removeHostPlanModal(notifyFrame) {
  const modal = document.getElementById(PLAN_MODAL_ID);
  if (modal) modal.remove();
  if (notifyFrame) postToHelperFrame({ type: "MCC_PLAN_MODAL_CLOSED" });
}

function postToHelperFrame(message) {
  const frame = document.getElementById(HELPER_FRAME_ID);
  try {
    if (frame?.contentWindow) frame.contentWindow.postMessage(message, "*");
  } catch {
    // Ignore messages while the helper iframe is being torn down.
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function injectHelperChromeStyles() {
  if (document.getElementById("mcc-choice-helper-page-styles")) return;

  const style = document.createElement("style");
  style.id = "mcc-choice-helper-page-styles";
  style.textContent = `
    #${HELPER_LAUNCHER_ID} {
      align-items: center;
      background: linear-gradient(135deg, #0f766e, #2563eb);
      border: 0;
      border-radius: 999px 0 0 999px;
      box-shadow: 0 14px 36px rgba(15, 23, 42, 0.24);
      color: #fff;
      cursor: pointer;
      display: grid;
      font: 700 12px/1.1 Arial, sans-serif;
      gap: 1px;
      min-height: 56px;
      padding: 10px 12px;
      position: fixed;
      right: 0;
      top: 170px;
      width: 72px;
      z-index: 2147483644;
    }

    #${HELPER_LAUNCHER_ID} span {
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    #${HELPER_LAUNCHER_ID} strong {
      font-size: 13px;
    }

    #${HELPER_PANEL_ID} {
      background: #eef3f7;
      border-left: 1px solid rgba(148, 163, 184, .55);
      box-shadow: -18px 0 48px rgba(15, 23, 42, .22);
      display: grid;
      grid-template-rows: auto 1fr;
      height: 100vh;
      max-width: min(520px, calc(100vw - 28px));
      position: fixed;
      right: 0;
      top: 0;
      transform: translateX(102%);
      transition: transform .22s ease;
      width: 460px;
      z-index: 2147483645;
    }

    #${HELPER_PANEL_ID}.mcc-helper-panel--open {
      transform: translateX(0);
    }

    .mcc-helper-panel__topbar {
      align-items: center;
      background: #0f172a;
      color: white;
      display: flex;
      gap: 12px;
      justify-content: space-between;
      min-height: 64px;
      padding: 12px 14px;
    }

    .mcc-helper-panel__topbar strong,
    .mcc-helper-panel__topbar span {
      display: block;
      font-family: Arial, sans-serif;
    }

    .mcc-helper-panel__topbar strong {
      font-size: 15px;
    }

    .mcc-helper-panel__topbar span {
      color: #cbd5e1;
      font-size: 12px;
      margin-top: 3px;
    }

    .mcc-helper-panel__close {
      align-items: center;
      background: rgba(255, 255, 255, .12);
      border: 1px solid rgba(255, 255, 255, .2);
      border-radius: 999px;
      color: white;
      cursor: pointer;
      display: grid;
      flex: 0 0 34px;
      font: 400 24px/1 Arial, sans-serif;
      height: 34px;
      place-items: center;
      width: 34px;
    }

    #${HELPER_FRAME_ID} {
      border: 0;
      height: 100%;
      width: 100%;
    }

    .mcc-helper-panel__invalid {
      align-content: center;
      color: #111827;
      display: grid;
      font-family: Arial, sans-serif;
      gap: 10px;
      justify-items: center;
      padding: 32px;
      text-align: center;
    }

    .mcc-helper-panel__invalid strong {
      font-size: 22px;
    }

    .mcc-helper-panel__invalid span {
      color: #64748b;
      font-size: 14px;
      line-height: 1.5;
      max-width: 300px;
    }

    #${PLAN_MODAL_ID} {
      align-items: center;
      background: rgba(15, 23, 42, .56);
      display: flex;
      inset: 0;
      justify-content: center;
      padding: 28px;
      position: fixed;
      z-index: 2147483647;
    }

    #${PLAN_MODAL_ID} .mcc-plan-dialog {
      background: #f7f9fc;
      border: 1px solid rgba(203, 213, 225, .9);
      border-radius: 24px;
      box-shadow: 0 28px 80px rgba(15, 23, 42, .34);
      color: #111827;
      font-family: Arial, sans-serif;
      max-height: calc(100vh - 56px);
      max-width: 1180px;
      overflow: auto;
      padding: 30px 28px 28px;
      position: relative;
      width: min(1180px, calc(100vw - 56px));
    }

    #${PLAN_MODAL_ID} .mcc-plan-close {
      background: #fff;
      border: 2px solid #2563eb;
      border-radius: 999px;
      color: #1d4ed8;
      cursor: pointer;
      font: 400 28px/1 Arial, sans-serif;
      height: 44px;
      position: absolute;
      right: 20px;
      top: 20px;
      width: 44px;
    }

    #${PLAN_MODAL_ID} .mcc-plan-eyebrow {
      background: #eef2ff;
      border-radius: 999px;
      color: #635bff;
      font: 900 12px/1 Arial, sans-serif;
      letter-spacing: .18em;
      margin: 0 auto 18px;
      padding: 10px 18px;
      text-align: center;
      text-transform: uppercase;
      width: fit-content;
    }

    #${PLAN_MODAL_ID} h2 {
      font: 900 42px/1.05 Arial, sans-serif;
      letter-spacing: -1px;
      margin: 0 54px 10px;
      text-align: center;
    }

    #${PLAN_MODAL_ID} .mcc-plan-subtitle {
      color: #6b7280;
      font: 700 16px/1.45 Arial, sans-serif;
      margin: 0 auto 22px;
      max-width: 520px;
      text-align: center;
    }

    #${PLAN_MODAL_ID} .mcc-plan-billing {
      align-items: center;
      background: #fff;
      border-radius: 999px;
      display: flex;
      gap: 16px;
      justify-content: center;
      margin: 0 auto 28px;
      max-width: 520px;
      padding: 12px 16px;
    }

    #${PLAN_MODAL_ID} .mcc-plan-billing span {
      color: #94a3b8;
      font-weight: 900;
    }

    #${PLAN_MODAL_ID} .mcc-plan-billing strong {
      background: #eef2ff;
      border-radius: 999px;
      color: #4f46e5;
      padding: 10px 18px;
    }

    #${PLAN_MODAL_ID} .mcc-plan-billing em {
      background: #dcfce7;
      border-radius: 999px;
      color: #15803d;
      font-style: normal;
      font-weight: 900;
      padding: 9px 14px;
    }

    #${PLAN_MODAL_ID} .mcc-plan-grid {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    #${PLAN_MODAL_ID} .mcc-plan-card {
      align-content: start;
      background: #fff;
      border: 1px solid #dbe4ec;
      border-radius: 20px;
      cursor: pointer;
      display: grid;
      gap: 12px;
      min-height: 430px;
      padding: 24px 20px;
      text-align: left;
    }

    #${PLAN_MODAL_ID} .mcc-plan-card--popular {
      border-color: #c4b5fd;
      box-shadow: 0 20px 56px rgba(79, 70, 229, .16);
    }

    #${PLAN_MODAL_ID} .mcc-plan-card small {
      background: #eef2ff;
      border-radius: 999px;
      color: #635bff;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .14em;
      padding: 8px 12px;
      text-transform: uppercase;
      width: fit-content;
    }

    #${PLAN_MODAL_ID} .mcc-plan-card span {
      color: #635bff;
      font-size: 22px;
      font-weight: 900;
    }

    #${PLAN_MODAL_ID} .mcc-plan-card strong {
      color: #111827;
      font-size: 34px;
      line-height: 1.05;
    }

    #${PLAN_MODAL_ID} .mcc-plan-card em {
      color: #64748b;
      font-style: normal;
      font-weight: 900;
    }

    #${PLAN_MODAL_ID} .mcc-plan-card b {
      background: #111827;
      border-radius: 12px;
      color: #fff;
      display: block;
      font-size: 16px;
      margin: 8px 0 4px;
      padding: 13px;
      text-align: center;
    }

    #${PLAN_MODAL_ID} .mcc-plan-card ul {
      color: #334155;
      display: grid;
      gap: 9px;
      list-style: none;
      margin: 4px 0 0;
      padding: 0;
    }

    #${PLAN_MODAL_ID} .mcc-plan-card li {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.35;
    }

    #${PLAN_MODAL_ID} .mcc-plan-card li::before {
      color: #16a34a;
      content: "✓ ";
      font-weight: 900;
    }

    @media (max-width: 720px) {
      #${HELPER_PANEL_ID} {
        max-width: none;
        width: 100vw;
      }

      #${PLAN_MODAL_ID} {
        padding: 14px;
      }

      #${PLAN_MODAL_ID} .mcc-plan-dialog {
        width: calc(100vw - 28px);
      }

      #${PLAN_MODAL_ID} .mcc-plan-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.documentElement.appendChild(style);
}

function warnIfFilling(event) {
  if (!fillJob?.running) return undefined;

  event.preventDefault();
  event.returnValue = "Choice filling is still running in this tab.";
  return event.returnValue;
}

function previewChoices(priorityItems, skippedRanks = []) {
  if (!isMcc()) {
    return unavailablePageResult(priorityItems, skippedRanks, "Open the MCC choice filling page, then click Preview.");
  }

  const rows = getChoiceRows();
  if (!rows.length) {
    return unavailablePageResult(
      priorityItems,
      skippedRanks,
      "No MCC choice rows detected on this page. Stay on Choice Filling tab, wait for choices to load, then click Preview."
    );
  }

  const matches = matchAllChoices(priorityItems, rows);
  const foundCount = matches.filter((item) => item.found).length;
  const skippedSet = rankSet(skippedRanks);
  const leadingMatches = leadingFillableMatches(matches, skippedSet);
  const blocker = firstBlockingMatch(matches, skippedSet);
  const duplicateCount = matches.filter((item) => item.duplicate).length;
  const alreadyFilledCount = matches.filter((item) => item.alreadyFilled).length;
  const existingCount = getExistingChoiceCount();
  const missingProgramCount = matches.filter((item) => item.reason === "Program missing in sheet").length;
  let message = `${foundCount} of ${matches.length} choices matched.`;

  if (alreadyFilledCount) message += ` ${alreadyFilledCount} are already in Filled Choice(s).`;
  message += ` Next ${leadingMatches.length} can be filled safely in order.`;
  if (blocker) message += ` Filling will stop at rank ${blocker.rank}: ${blocker.reason || "Not found"}.`;
  if (duplicateCount) message += ` ${duplicateCount} duplicate Excel rows skipped because the first copy is already matched.`;
  if (skippedSet.size) message += ` Skipped ranks: ${[...skippedSet].join(", ")}.`;
  if (missingProgramCount) message += ` ${missingProgramCount} rows need a Program value.`;
  if (existingCount) message += ` Total filled choices currently on page: ${existingCount}.`;

  return {
    matches: stripInternalFields(matches),
    fillableBeforeBlock: leadingMatches.length,
    firstBlockingMatch: blocker ? stripInternalFields([blocker])[0] : null,
    skippedRanks: [...skippedSet],
    message
  };
}

function startFillJob(priorityItems, skippedRanks = []) {
  if (fillJob?.running) return fillJobStatus("Filling is already running.");
  if (!isMcc()) {
    return unavailablePageResult(priorityItems, skippedRanks, "Open the MCC choice filling page, then start filling.");
  }

  const matches = matchAllChoices(priorityItems, getChoiceRows());
  const skippedSet = rankSet(skippedRanks);
  const safeMatches = leadingFillableMatches(matches, skippedSet);
  const blocker = firstBlockingMatch(matches, skippedSet);

  if (!safeMatches.length) {
    return {
      matches: stripInternalFields(matches),
      added: 0,
      total: 0,
      running: false,
      paused: false,
      stopped: false,
      fillableBeforeBlock: 0,
      firstBlockingMatch: blocker ? stripInternalFields([blocker])[0] : null,
      skippedRanks: [...skippedSet],
      message: blocker
        ? `Cannot start. Rank ${blocker.rank} is not fillable: ${blocker.reason || "Not found"}.`
        : "No matched choices are available to fill."
    };
  }

  const existingCount = getExistingChoiceCount();
  fillJob = {
    running: true,
    paused: false,
    stopped: false,
    index: 0,
    added: 0,
    total: safeMatches.length,
    matches,
    safeMatches,
    firstBlockingMatch: blocker || null,
    skippedRanks: [...skippedSet],
    lastMessage: existingCount
      ? `Started filling first ${safeMatches.length} choices after existing ${existingCount} filled choices.`
      : `Started filling first ${safeMatches.length} choices with 3 second delay.`
  };

  if (blocker) {
    fillJob.lastMessage += ` It will stop before rank ${blocker.rank}: ${blocker.reason || "Not found"}.`;
  }

  runFillJob();
  return fillJobStatus(fillJob.lastMessage);
}

function skipBlockedChoice(priorityItems, skippedRanks = []) {
  if (!isMcc()) {
    return unavailablePageResult(priorityItems, skippedRanks, "Open the MCC choice filling page, then skip blocked choice.");
  }

  const matches = matchAllChoices(priorityItems, getChoiceRows());
  const skippedSet = rankSet(skippedRanks);
  const blocker = firstBlockingMatch(matches, skippedSet);

  if (!blocker) {
    return {
      matches: stripInternalFields(matches),
      added: 0,
      total: 0,
      running: false,
      paused: false,
      stopped: false,
      fillableBeforeBlock: 0,
      firstBlockingMatch: null,
      skippedRanks: [...skippedSet],
      message: "No blocked choice to skip."
    };
  }

  skippedSet.add(Number(blocker.rank));
  return startFillJob(priorityItems, [...skippedSet]);
}

async function runFillJob() {
  if (!fillJob) return;

  while (fillJob.index < fillJob.safeMatches.length && !fillJob.stopped) {
    while (fillJob.paused && !fillJob.stopped) {
      fillJob.lastMessage = `Paused at ${fillJob.added}/${fillJob.total}.`;
      await wait(300);
    }
    if (fillJob.stopped) break;

    const match = fillJob.safeMatches[fillJob.index];
    fillJob.lastMessage = `Adding ${fillJob.index + 1}/${fillJob.total}: ${match.choiceName} | ${match.program}`;

    if (!document.contains(match.button) || !BUTTON_TEXT.test(clean(match.button.value || match.button.textContent))) {
      fillJob.stopped = true;
      fillJob.firstBlockingMatch = { ...match, found: false, reason: "Add button was no longer available" };
      break;
    }

    markRow(match.row);
    match.button.click();
    fillJob.added += 1;
    fillJob.index += 1;
    fillJob.lastMessage = `Added ${fillJob.added}/${fillJob.total}. Waiting 3 seconds...`;
    await wait(ADD_DELAY_MS);

    if (fillJob.added > 0 && fillJob.added % AUTO_SAVE_BATCH_SIZE === 0) {
      const saveButton = findSaveAndContinueButton();
      if (!saveButton) {
        fillJob.stopped = true;
        fillJob.firstBlockingMatch = {
          ...match,
          found: false,
          reason: "Save and Continue button was not found after batch fill"
        };
        break;
      }

      markSaveButton(saveButton);
      fillJob.stopped = true;
      fillJob.lastMessage = `Auto-clicked Save and Continue after ${fillJob.added} choices. Wait for MCC to save/reload, then start the next batch.`;
      saveButton.click();
      break;
    }
  }

  if (!fillJob) return;
  fillJob.running = false;
  fillJob.paused = false;

  if (fillJob.stopped && fillJob.firstBlockingMatch) {
    fillJob.lastMessage = `Stopped at rank ${fillJob.firstBlockingMatch.rank}. Added ${fillJob.added}/${fillJob.total}; next choice is not fillable: ${fillJob.firstBlockingMatch.reason || "Not found"}. Review, then save manually.`;
  } else if (fillJob.stopped && fillJob.lastMessage) {
    // Keep the batch-save message set before clicking Save and Continue.
  } else if (fillJob.stopped) {
    fillJob.lastMessage = `Stopped after adding ${fillJob.added}/${fillJob.total}.`;
  } else if (fillJob.firstBlockingMatch) {
    fillJob.lastMessage = `Stopped at rank ${fillJob.firstBlockingMatch.rank}. Added ${fillJob.added}/${fillJob.total}; next choice is not fillable: ${fillJob.firstBlockingMatch.reason || "Not found"}. Review, then save manually.`;
  } else {
    fillJob.lastMessage = `Done. Added ${fillJob.added}/${fillJob.total}. Review the Filled Choice(s) table, then save manually.`;
  }
}

function pauseFillJob() {
  if (!fillJob?.running) return fillJobStatus("No active filling job.");
  fillJob.paused = true;
  fillJob.lastMessage = `Pause requested. It will pause after the current Add finishes.`;
  return fillJobStatus(fillJob.lastMessage);
}

function resumeFillJob() {
  if (!fillJob) return fillJobStatus("No paused filling job.");
  if (!fillJob.running && fillJob.index >= fillJob.total) return fillJobStatus(fillJob.lastMessage);
  const shouldRestartLoop = !fillJob.running;
  fillJob.paused = false;
  fillJob.running = true;
  fillJob.lastMessage = `Resumed at ${fillJob.added}/${fillJob.total}.`;
  if (shouldRestartLoop) runFillJob();
  return fillJobStatus(fillJob.lastMessage);
}

function stopFillJob() {
  if (!fillJob) return fillJobStatus("No active filling job.");
  fillJob.stopped = true;
  fillJob.paused = false;
  fillJob.lastMessage = `Stop requested after ${fillJob.added}/${fillJob.total}.`;
  return fillJobStatus(fillJob.lastMessage);
}

function fillJobStatus(message) {
  return {
    matches: stripInternalFields(fillJob?.matches || []),
    added: fillJob?.added || 0,
    total: fillJob?.total || 0,
    running: Boolean(fillJob?.running),
    paused: Boolean(fillJob?.paused),
    stopped: Boolean(fillJob?.stopped),
    firstBlockingMatch: fillJob?.firstBlockingMatch ? stripInternalFields([fillJob.firstBlockingMatch])[0] : null,
    skippedRanks: Array.isArray(fillJob?.skippedRanks) ? fillJob.skippedRanks : [],
    message: message || fillJob?.lastMessage || "No active filling job."
  };
}

function isFillableMatch(item) {
  return Boolean(item?.found && !item.alreadyFilled && item.button && !item.button.disabled);
}

function isSatisfiedMatch(item) {
  return Boolean(item?.found && (item.alreadyFilled || isFillableMatch(item)));
}

function leadingFillableMatches(matches, skippedSet = new Set()) {
  const fillable = [];
  for (const match of matches) {
    if (skippedSet.has(Number(match.rank))) continue;
    if (!isSatisfiedMatch(match)) break;
    if (isFillableMatch(match)) fillable.push(match);
  }
  return fillable;
}

function firstBlockingMatch(matches, skippedSet = new Set()) {
  return matches.find((match) => !skippedSet.has(Number(match.rank)) && !isSatisfiedMatch(match)) || null;
}

function rankSet(values) {
  return new Set((Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0));
}

function getChoiceRows() {
  const structuredRows = [
    ...structuredChoiceRows("#avlChoiceContainer", false),
    ...structuredChoiceRows("#filledChoiceContainer", true)
  ];
  if (structuredRows.length) return structuredRows;

  return [...document.querySelectorAll("tr")]
    .map((row) => {
      const button = findAddButton(row);
      const cells = [...row.querySelectorAll("td")].map((cell) => clean(cell.innerText));
      const text = clean(row.innerText);
      return { row, button, cells, text, name: inferInstituteName(cells, text), program: inferProgramName(cells) };
    })
    .filter((item) => item.button && item.name);
}

function structuredChoiceRows(selector, alreadyFilled) {
  return [...document.querySelectorAll(`${selector} tr`)]
    .map((row) => {
      const button = alreadyFilled ? null : (row.querySelector("input.aChoice") || findAddButton(row));
      const name = stripActionText(row.querySelector(".instnm"));
      const program = clean(row.querySelector(".brnm")?.textContent);
      const instituteId = clean(row.querySelector(".instcd")?.textContent);
      const programId = clean(row.querySelector(".brcd")?.textContent);
      const quotaId = clean(row.querySelector(".quotaid")?.textContent);
      const quota = clean(row.querySelector(".quota")?.textContent);
      const choiceNo = parseChoiceNo(row);
      return { row, button, name, program, instituteId, programId, quotaId, quota, choiceNo, alreadyFilled };
    })
    .filter((item) => item.name && item.program && (alreadyFilled || item.button));
}

function matchAllChoices(priorityItems, rows) {
  const usedRows = new Set();
  return priorityItems.map((choice) => {
    const match = matchChoice(choice, rows, usedRows);
    if (match.found && match.row) usedRows.add(match.row);
    return match;
  });
}

function matchChoice(choice, rows, usedRows) {
  if (!clean(choice.program) && !clean(choice.programId)) {
    return resultFor(choice, null, 0, "Program missing in sheet");
  }

  if (choice.instituteId && choice.programId) {
    const allIdHits = rows.filter(
      (row) => row.instituteId === choice.instituteId && row.programId === choice.programId
    );
    const hit = allIdHits.find((row) => !usedRows.has(row.row));
    if (hit) return resultFor(choice, hit, 1, "");
    if (allIdHits.length) return duplicateResult(choice);
  }

  return matchMccChoice(choice, rows, usedRows);
}

function matchMccChoice(choice, rows, usedRows) {
  const cn = normalizeMedical(choice.choiceName);
  const pn = normalizeMedicalProgram(choice.program);
  const qn = normalizeQuota(choice.quota);

  if (isGenericPlaceName(choice.choiceName)) {
    return resultFor(choice, null, 0, "Institute name looks like state/city; check institute column");
  }

  const filledAtRank = rows.find((row) =>
    row.alreadyFilled &&
    Number(row.choiceNo) === Number(choice.rank) &&
    namesMatchStrict(choice.choiceName, row.name) &&
    normalizeMedicalProgram(row.program) === pn &&
    (!qn || normalizeQuota(row.quota) === qn || normalizeQuota(row.quotaId) === qn) &&
    !usedRows.has(row.row)
  );
  if (filledAtRank) return resultFor(choice, filledAtRank, 0.99, "");

  const exactPairHits = rows.filter((row) =>
    normalizeMedical(row.name) === cn &&
    normalizeMedicalProgram(row.program) === pn
  );
  const quotaFilteredHits = qn
    ? exactPairHits.filter((row) => normalizeQuota(row.quota) === qn || normalizeQuota(row.quotaId) === qn)
    : exactPairHits;
  const unusedHits = quotaFilteredHits.filter((row) => !usedRows.has(row.row));

  if (unusedHits.length === 1) return resultFor(choice, unusedHits[0], 1, "");
  if (unusedHits.length > 1 && !qn) return resultFor(choice, null, 0, "Multiple quotas found; add Quota column in Excel");
  if (quotaFilteredHits.length) return duplicateResult(choice);

  const collegeOnPage = rows.some((row) => normalizeMedical(row.name) === cn);
  if (collegeOnPage) {
    const programOnCollege = rows.some((row) =>
      normalizeMedical(row.name) === cn &&
      normalizeMedicalProgram(row.program) === pn
    );
    return resultFor(choice, null, 0, programOnCollege ? "Quota not available for this institute/program" : "Program not available for this institute");
  }

  const sameProgramRows = rows.filter((row) => normalizeMedicalProgram(row.program) === pn && !usedRows.has(row.row));
  const scored = sameProgramRows
    .map((row) => ({ rowItem: row, score: textSimilarityMedical(choice.choiceName, row.name) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  const gap = second ? best.score - second.score : 1;

  if (best && best.score >= 0.82 && gap >= 0.04) {
    return resultFor(choice, best.rowItem, best.score, "");
  }

  return resultFor(choice, null, 0, "Not found");
}

function resultFor(choice, rowItem, score, reason) {
  return {
    rank: choice.rank,
    excelRow: choice.excelRow || "",
    choiceName: choice.choiceName,
    program: choice.program || "",
    quota: choice.quota || "",
    pageName: rowItem?.name || "",
    pageProgram: rowItem?.program || "",
    pageQuota: rowItem?.quota || "",
    pageChoiceNo: rowItem?.choiceNo || "",
    score: score ? Number(score.toFixed(2)) : 0,
    found: Boolean(rowItem),
    alreadyFilled: Boolean(rowItem?.alreadyFilled),
    reason,
    duplicate: false,
    button: rowItem?.button || null,
    row: rowItem?.row || null
  };
}

function duplicateResult(choice) {
  return {
    ...resultFor(choice, null, 0, "Duplicate in Excel; first copy is already matched"),
    duplicate: true
  };
}

function stripInternalFields(matches) {
  return matches.map(({ button, row, ...rest }) => rest);
}

function unavailablePageResult(priorityItems, skippedRanks, message) {
  return {
    matches: priorityItems.map((choice) => stripInternalFields([resultFor(choice, null, 0, message)])[0]),
    added: 0,
    total: 0,
    running: false,
    paused: false,
    stopped: false,
    fillableBeforeBlock: 0,
    firstBlockingMatch: null,
    skippedRanks: [...rankSet(skippedRanks)],
    message
  };
}

function getExistingChoiceCount() {
  return document.querySelectorAll("#filledChoiceContainer tr .fChoice").length;
}

function findAddButton(scope) {
  return [...scope.querySelectorAll("button, input[type='button'], input[type='submit'], a")]
    .find((button) => BUTTON_TEXT.test(clean(button.innerText || button.value || button.textContent)));
}

function findSaveAndContinueButton() {
  const direct = document.querySelector("#btnSave.clicksave, #btnSave");
  if (direct && /save\s+and\s+continue/i.test(clean(direct.value || direct.textContent))) return direct;

  return [...document.querySelectorAll("button, input[type='button'], input[type='submit'], a")]
    .find((button) => /save\s+and\s+continue/i.test(clean(button.innerText || button.value || button.textContent)));
}

function markSaveButton(button) {
  if (!button) return;
  button.style.outline = "3px solid #0f766e";
  button.style.outlineOffset = "2px";
}

function parseChoiceNo(row) {
  const classValue = clean(row.querySelector(".chno")?.textContent);
  const classNumber = Number(classValue);
  if (Number.isFinite(classNumber) && classNumber > 0) return classNumber;

  const cells = [...row.querySelectorAll("td")].map((cell) => clean(cell.innerText));
  const numericCells = cells
    .map((cell) => Number(cell))
    .filter((value) => Number.isInteger(value) && value > 0 && value < 10000);
  return numericCells.length ? numericCells[numericCells.length - 1] : "";
}

function inferInstituteName(cells, text) {
  const bestCell = cells.find((cell) => /college|institute|aiims|jipmer|medical|dental|hospital|university/i.test(cell));
  if (bestCell) return stripFeeText(bestCell);
  const lines = text.split("\n").map(stripFeeText).filter(Boolean);
  return lines.find((line) => !BUTTON_TEXT.test(line) && line.length > 5) || "";
}

function inferProgramName(cells) {
  return cells.find((cell) => /mbbs|bds|science|design|degree/i.test(cell)) || "";
}

function markRow(row) {
  if (!row) return;
  row.style.outline = "3px solid #0b7894";
  row.style.outlineOffset = "-3px";
}

function isMcc() {
  return location.hostname === MCC_HOST || Boolean(document.querySelector("#avlChoiceContainer"));
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripFeeText(value) {
  return clean(value).replace(/view fee detail/ig, "").replace(/view orcr/ig, "").trim();
}

function stripActionText(cell) {
  if (!cell) return "";
  const clone = cell.cloneNode(true);
  clone.querySelectorAll("input, button, a").forEach((item) => item.remove());
  return stripFeeText(clone.textContent).replace(/\s*Institute Address:\s*[\s\S]*$/i, "").trim();
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\blntelligence\b/g, "intelligence")
    .replace(/\bm\.?sc\.?\b/g, "master science")
    .replace(/\bb\.?sc\.?\b/g, "bachelor science")
    .replace(/\bph\.?d\.?\b/g, "doctor philosophy")
    .replace(/\baiims\b/g, "all india institute medical sciences")
    .replace(/\bjipmer\b/g, "jawaharlal institute postgraduate medical education research")
    .replace(/\bgmc\b/g, "government medical college")
    .replace(/\bafmc\b/g, "armed forces medical college")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|of|and|in|at|for|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMedical(value) {
  return String(value || "")
    .replace(/\s*Institute Address:\s*[\s\S]*$/i, "")
    .replace(/\s*\b(formerly|formely)\s+known\s+as\s+[\s\S]*$/i, "")
    .toLowerCase()
    .replace(/\bcapfims\b/g, "central armed police forces institute medical sciences")
    .replace(/\baiims\s+capfims\b/g, "central armed police forces institute medical sciences")
    .replace(/\baiims\s+rewari\b/g, "all india institute medical sciences rewari")
    .replace(/\bpatliputra medical college\b/g, "shaheed nirmal mahto medical college hospital dhanbad")
    .replace(/\bchapra saran\b/g, "government medical college chapra saran")
    .replace(/\bmedial\b/g, "medical")
    .replace(/\bmed\b/g, "medical")
    .replace(/\binstitue\b/g, "institute")
    .replace(/\binst\b/g, "institute")
    .replace(/\brch\b/g, "research")
    .replace(/\bgovt\b/g, "government")
    .replace(/\bgov\.\b/g, "government")
    .replace(/\bmc\b/g, "medical college")
    .replace(/\bm\.c\b/g, "medical college")
    .replace(/\bgmc\b/g, "government medical college")
    .replace(/\baiims\b/g, "all india institute medical sciences")
    .replace(/\bjipmer\b/g, "jawaharlal institute postgraduate medical education research")
    .replace(/\bjln\b/g, "jawaharlal nehru")
    .replace(/\brml\b/g, "ram manohar lohia")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsms\b/g, "sawai man singh")
    .replace(/\bs m s\b/g, "sawai man singh")
    .replace(/\brnt\b/g, "ravindra nath tagore")
    .replace(/\br n t\b/g, "ravindra nath tagore")
    .replace(/\bsk\b/g, "shri kalyan")
    .replace(/\bs k\b/g, "shri kalyan")
    .replace(/\bsn\b/g, "sarojini naidu")
    .replace(/\bs n\b/g, "sarojini naidu")
    .replace(/\bbj\b/g, "byramjee jeejeebhoy")
    .replace(/\bb j\b/g, "byramjee jeejeebhoy")
    .replace(/\bgs\b/g, "gordhandas sunderdas")
    .replace(/\bg s\b/g, "gordhandas sunderdas")
    .replace(/\bgr\b/g, "gajra raja")
    .replace(/\bg r\b/g, "gajra raja")
    .replace(/\bscb\b/g, "srirama chandra bhanja")
    .replace(/\bs c b\b/g, "srirama chandra bhanja")
    .replace(/\bucms\b/g, "university sciences")
    .replace(/\br g kar\b/g, "radha gobinda kar")
    .replace(/\b(asola|delhi|haryana|assam|saran|dhanbad|maidangarhi|majra|bhalkhi|hatimutra|majgaon)\b/g, " ")
    .replace(/\b(the|of|and|in|at|for|a|an|college|medical|institute|hospital|government|govt)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMedicalProgram(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bbachelor of dental surgery\b/g, "bds")
    .replace(/\bbachelor of medicine\b.*\bbachelor of surgery\b/g, "mbbs")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuota(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bai\b/g, "all india")
    .replace(/\bso\b/g, "open seat quota")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|of|and|in|at|for|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericPlaceName(value) {
  const original = String(value || "");
  if (/\b(college|medical|institute|hospital|university|aiims|jipmer|gmc|mc)\b/i.test(original)) {
    return false;
  }

  const text = normalizeMedical(value);
  if (!text) return false;
  const genericPlaces = new Set([
    "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "delhi",
    "new delhi", "goa", "gujarat", "haryana", "himachal pradesh", "jammu kashmir",
    "jharkhand", "karnataka", "kerala", "madhya pradesh", "maharashtra", "manipur",
    "meghalaya", "mizoram", "nagaland", "odisha", "orissa", "punjab", "rajasthan",
    "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand",
    "west bengal", "chandigarh", "puducherry", "pondicherry"
  ]);
  return genericPlaces.has(text);
}

function textSimilarity(left, right) {
  const lk = normalize(left);
  const rk = normalize(right);
  if (!lk || !rk) return 0;
  if (lk === rk) return 1;
  if (lk.includes(rk) || rk.includes(lk)) return 0.94;
  const lt = new Set(lk.split(" ").filter(Boolean));
  const rt = new Set(rk.split(" ").filter(Boolean));
  const overlap = [...lt].filter((token) => rt.has(token)).length;
  const precision = overlap / Math.max(1, Math.min(lt.size, rt.size));
  const union = new Set([...lt, ...rt]).size;
  const jaccard = overlap / Math.max(1, union);
  return (precision * 0.65) + (jaccard * 0.35);
}

function textSimilarityMedical(left, right) {
  return textSimilarity(normalizeMedical(left), normalizeMedical(right));
}

function namesMatchStrict(left, right) {
  const ln = normalizeMedical(left);
  const rn = normalizeMedical(right);
  if (!ln || !rn) return false;
  if (ln === rn) return true;
  return textSimilarityMedical(left, right) >= 0.92;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

})();
