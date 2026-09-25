import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { API_ENDPOINTS } from "../constant/apiendpoints";
import { STORAGE_KEYS } from "../constant/localStorageKeys";
import {
  getActiveTab,
  getExtensionUrl,
  getFromStorage,
  injectContentScript,
  openTab,
  sendTabMessage,
  setInStorage
} from "../lib/chrome-extension";
import { Apiservice } from "../services/apiservices";

const emptyJobState = { running: false, paused: false };
const CURRENT_PARSER_VERSION = "college-recovery-2026-09-24-v2";

const initialHelper = {
  fileName: "",
  sheets: [],
  sheet: "",
  headerRow: "1",
  column: "COLLEGE NAME",
  programColumn: "MBBS",
  priorityItems: [],
  importReport: null,
  matches: [],
  previewApproved: false,
  loadedFromBackend: false,
  status: "Choose an Excel/CSV file to begin.",
  matchValue: "0",
  jobState: emptyJobState,
  skippedRanks: [],
  firstBlockingMatch: null,
  loading: "idle"
};

export function useChoiceHelper({ auth, onCreditsUpdate, onRefreshAccount }) {
  const [helper, setHelper] = useState(initialHelper);

  const fillableBeforeBlock = useMemo(
    () => countLeadingFillable(helper.matches, helper.skippedRanks),
    [helper.matches, helper.skippedRanks]
  );

  const helperWithComputed = { ...helper, fillableBeforeBlock };

  useEffect(() => {
    restoreSavedHelper();
  }, []);

  useEffect(() => {
    if (!helper.jobState.running) return undefined;

    const timer = window.setInterval(() => {
      controlFilling("MCC_FILL_STATUS");
    }, 1000);

    return () => window.clearInterval(timer);
  }, [helper.jobState.running]);

  const updateSetting = (key, value) => {
    setHelper((current) => ({
      ...current,
      [key]: value,
      previewApproved: false,
      status: current.loadedFromBackend
        ? "Settings changed. Choose the file again to parse through backend and spend credit with these settings."
        : current.status
    }));
  };

  const uploadFile = async (file) => {
    if (!file) {
      toast.error("Choose an Excel or CSV file first.");
      return;
    }
    if (!auth.token) {
      toast.error("Login first. Upload uses backend credits.");
      return;
    }

    try {
      setHelper((current) => ({
        ...current,
        loading: "upload",
        status: "Uploading to backend and checking credits...",
        matches: [],
        matchValue: "0",
        previewApproved: false,
        firstBlockingMatch: null,
        skippedRanks: []
      }));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("sheet", helper.sheet || "");
      formData.append("headerRow", helper.headerRow || "1");
      formData.append("column", helper.column || "");
      formData.append("programColumn", helper.programColumn || "");

      const candidate = await getMccCandidateInfo();
      if (candidate.rollNumber) formData.append("candidateRoll", candidate.rollNumber);
      if (candidate.candidateName) formData.append("candidateName", candidate.candidateName);

      const res = await Apiservice.postAPIAuthFormData(API_ENDPOINTS.uploads.parse, formData, auth.token, auth.apiUrl);
      const data = res?.data || {};
      const priorityItems = Array.isArray(data.items) ? data.items : [];
      const sheets = normalizeSheets(data.sheets || []);
      const selectedSheet = data.selectedSheet || sheets[0] || "";
      const importReport = data.report || null;

      const nextHelper = {
        ...initialHelper,
        fileName: file.name,
        sheets,
        sheet: selectedSheet,
        headerRow: helper.headerRow,
        column: helper.column,
        programColumn: helper.programColumn,
        priorityItems,
        importReport,
        loadedFromBackend: true,
        status: data.message || importReportText(priorityItems, importReport)
      };

      setHelper(nextHelper);
      await persistHelper(nextHelper);

      if (typeof data.credits === "number") {
        onCreditsUpdate(data.credits);
      }

      onRefreshAccount();
      await sendPriorityMessage("MCC_PREVIEW_CHOICES", "preview", nextHelper);
    } catch (error) {
      setHelper((current) => ({
        ...current,
        loading: "idle",
        status: `Could not read file: ${error.message || "Upload failed."}`
      }));
      toast.error(error.message || "Upload failed.");
    }
  };

  const previewChoices = async () => {
    await sendPriorityMessage("MCC_PREVIEW_CHOICES", "preview");
  };

  const startFilling = async () => {
    await sendPriorityMessage("MCC_START_FILLING", "start");
  };

  const skipBlockedChoice = async () => {
    await sendPriorityMessage("MCC_SKIP_BLOCKER", "skip");
  };

  const controlFilling = async (type) => {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("Open the MCC choice page, then try again.");

      const result = await sendTabMessage(tab.id, { type });
      setHelper((current) => applyJobResult(current, result || {}));
    } catch (error) {
      setHelper((current) => ({
        ...current,
        status: error.message || "Open the MCC choice page, then try again."
      }));
    }
  };

  const copyReport = async () => {
    await navigator.clipboard.writeText(buildReportLines(helper).join("\n"));
    setHelper((current) => ({ ...current, status: "Report copied." }));
    toast.success("Report copied.");
  };

  const openHelperTab = async () => {
    await persistHelper(helper);
    openTab(getExtensionUrl("index.html"));
  };

  async function restoreSavedHelper() {
    const data = await getFromStorage(STORAGE_KEYS.helper);
    const saved = data[STORAGE_KEYS.helper] || {};
    const savedReport = saved.importReport || null;

    const hasOldSkippedReason = (savedReport?.skipped || []).some((item) =>
      String(item?.reason || "").includes("Institute value is blank or institute column is wrong")
    );

    if (saved.loadedFromBackend && (savedReport?.parserVersion !== CURRENT_PARSER_VERSION || hasOldSkippedReason)) {
      await setInStorage({ [STORAGE_KEYS.helper]: null, [STORAGE_KEYS.priorityItems]: null });
      setHelper({
        ...initialHelper,
        status: "Old saved parse data was cleared. Upload the Excel again to fetch all colleges with the latest parser."
      });
      return;
    }

    const restored = {
      ...initialHelper,
      fileName: saved.fileName || "",
      sheets: normalizeSheets(saved.workbookSheets || saved.sheets || []),
      sheet: saved.selectedSheet || saved.sheet || "",
      headerRow: saved.settings?.headerRow || saved.headerRow || initialHelper.headerRow,
      column: saved.settings?.instituteColumn || saved.column || initialHelper.column,
      programColumn: saved.settings?.programColumn || saved.programColumn || initialHelper.programColumn,
      priorityItems: Array.isArray(saved.priorityItems) ? saved.priorityItems : [],
      importReport: savedReport,
      matches: Array.isArray(saved.lastPreviewMatches) ? saved.lastPreviewMatches : [],
      loadedFromBackend: Boolean(saved.loadedFromBackend),
      skippedRanks: Array.isArray(saved.skippedRanks) ? saved.skippedRanks : []
    };

    if (restored.priorityItems.length) {
      restored.matchValue = restored.matches.length
        ? String(restored.matches.filter((item) => item.found).length)
        : "0";
      restored.status = restored.importReport
        ? `${restored.priorityItems.length} saved choices restored${restored.fileName ? ` from ${restored.fileName}` : ""}. Click Preview to refresh page matches.`
        : `${restored.priorityItems.length} saved priority rows ready. Click Preview to refresh page matches.`;
    }

    setHelper(restored);
  }

  async function sendPriorityMessage(type, loading, sourceHelper = helper) {
    if (!sourceHelper.priorityItems.length) {
      toast.error(sourceHelper.importReport ? "No choices loaded from this sheet." : "Upload a sheet first.");
      return;
    }

    try {
      setHelper((current) => ({
        ...current,
        loading,
        status: loading === "preview" ? "Checking page..." : "Starting..."
      }));

      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("Open the MCC choice page, then try again.");

      await injectContentScript(tab.id);
      const response = await sendTabMessage(tab.id, {
        type,
        priorityItems: sourceHelper.priorityItems,
        skippedRanks: sourceHelper.skippedRanks
      });

      const result = { matches: [], added: 0, errors: [], ...response };
      const nextHelper = applyPageResult({ ...sourceHelper, loading: "idle" }, type, result);
      setHelper(nextHelper);
      await persistHelper(nextHelper);
    } catch (error) {
      const reason = error.message || "Open the MCC choice page, reload it once, then try again.";
      setHelper((current) => {
        if (type !== "MCC_PREVIEW_CHOICES") {
          return { ...current, loading: "idle", status: reason };
        }
        return {
          ...current,
          loading: "idle",
          previewApproved: false,
          matchValue: "0",
          matches: pageUnavailableMatches(sourceHelper.priorityItems, reason),
          firstBlockingMatch: sourceHelper.priorityItems[0] || null,
          status: `${reason} Loaded rows are shown as not found until page preview can run.`
        };
      });
    }
  }

  return {
    helper: helperWithComputed,
    actions: {
      controlFilling,
      copyReport,
      openHelperTab,
      previewChoices,
      skipBlockedChoice,
      startFilling,
      updateSetting,
      uploadFile
    }
  };
}

function applyPageResult(current, type, result) {
  const matches = Array.isArray(result.matches) ? result.matches : [];
  const foundCount = matches.filter((item) => item.found).length;
  const fillableBeforeBlock = typeof result.fillableBeforeBlock === "number"
    ? result.fillableBeforeBlock
    : countLeadingFillable(matches, result.skippedRanks || current.skippedRanks);

  const next = {
    ...current,
    loading: "idle",
    matches,
    matchValue: foundCount ? String(foundCount) : "0",
    status: result.message || fallbackPreviewMessage(matches),
    firstBlockingMatch: result.firstBlockingMatch || null,
    skippedRanks: Array.isArray(result.skippedRanks) ? result.skippedRanks : current.skippedRanks
  };

  if (type === "MCC_PREVIEW_CHOICES") {
    return {
      ...next,
      previewApproved: fillableBeforeBlock > 0,
      jobState: emptyJobState
    };
  }

  return applyJobResult({ ...next, previewApproved: false }, result);
}

function applyJobResult(current, result = {}) {
  return {
    ...current,
    status: result.message || current.status || "Filling status updated.",
    matchValue: typeof result.added === "number" && typeof result.total === "number" && result.total > 0
      ? `${result.added}/${result.total}`
      : current.matchValue,
    jobState: {
      running: Boolean(result.running),
      paused: Boolean(result.paused)
    },
    firstBlockingMatch: result.firstBlockingMatch || current.firstBlockingMatch,
    skippedRanks: Array.isArray(result.skippedRanks) ? result.skippedRanks : current.skippedRanks
  };
}

async function persistHelper(helper) {
  const saved = {
    fileName: helper.fileName,
    workbookSheets: helper.sheets,
    selectedSheet: helper.sheet,
    settings: {
      headerRow: helper.headerRow,
      instituteColumn: helper.column,
      programColumn: helper.programColumn
    },
    priorityItems: helper.priorityItems,
    importReport: helper.importReport,
    lastPreviewMatches: helper.matches,
    loadedFromBackend: helper.loadedFromBackend,
    skippedRanks: helper.skippedRanks
  };

  await setInStorage({
    [STORAGE_KEYS.priorityItems]: saved.priorityItems,
    [STORAGE_KEYS.helper]: saved
  });
}

function countLeadingFillable(items, skippedRanks = []) {
  const skipped = new Set((Array.isArray(skippedRanks) ? skippedRanks : []).map(Number));
  let count = 0;

  for (const item of items) {
    if (skipped.has(Number(item.rank))) continue;
    if (!item.found) break;
    if (!item.alreadyFilled) count += 1;
  }

  return count;
}

function pageUnavailableMatches(priorityItems, reason) {
  return priorityItems.map((item, index) => ({
    rank: item.rank || index + 1,
    excelRow: item.excelRow || "",
    choiceName: item.choiceName || item.name || "",
    program: item.program || "",
    quota: item.quota || "",
    found: false,
    duplicate: false,
    alreadyFilled: false,
    reason
  }));
}

async function getMccCandidateInfo() {
  const urlCandidate = getCandidateInfoFromUrl();
  if (urlCandidate.rollNumber) return urlCandidate;

  try {
    const tab = await getActiveTab();
    if (!tab?.id) return {};

    await injectContentScript(tab.id);
    const response = await sendTabMessage(tab.id, { type: "MCC_CANDIDATE_INFO" });
    return {
      rollNumber: cleanCandidateField(response?.rollNumber),
      candidateName: cleanCandidateField(response?.candidateName)
    };
  } catch {
    return {};
  }
}

function cleanCandidateField(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getCandidateInfoFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    rollNumber: cleanCandidateField(params.get("candidateRoll")),
    candidateName: cleanCandidateField(params.get("candidateName"))
  };
}

function fallbackPreviewMessage(matches) {
  const foundCount = matches.filter((item) => item.found).length;
  const alreadyFilledCount = matches.filter((item) => item.alreadyFilled).length;
  const missing = matches.filter((item) => !item.found && !item.duplicate).length;
  return `${foundCount} matched, ${alreadyFilledCount} already filled, ${missing} not matched.`;
}

function importReportText(items, report) {
  if (!report) return `${items.length} priority rows loaded.`;
  const skippedCount = report.skipped?.length || 0;
  const fallbackCount = Number(report.instituteFallbackRowCount || 0);
  const recoveredCount = Number(report.instituteRecoveredRowCount || 0);
  const looseRecoveredCount = Number(report.instituteLooseRecoveredRowCount || 0);
  const columnText = `Institute col ${report.instituteColumnLabel}, Program col ${report.programColumnLabel}, Quota col ${report.quotaColumnLabel}, Order ${report.orderColumnLabel}`;
  const fallbackText = fallbackCount ? ` ${fallbackCount} rows auto-corrected from nearby institute cells.` : "";
  const recoveredText = recoveredCount ? ` ${recoveredCount} rows recovered from full row text.` : "";
  const looseRecoveredText = looseRecoveredCount ? ` ${looseRecoveredCount} rows recovered with loose text fallback.` : "";
  return `${items.length} choices loaded from ${report.dataRowCount} data rows. ${columnText}.${fallbackText}${recoveredText}${looseRecoveredText} ${skippedCount} skipped.`;
}

function buildReportLines(helper) {
  const lines = [];
  const { importReport, matches, priorityItems, sheet, skippedRanks } = helper;

  if (importReport) {
    lines.push("Import report");
    lines.push(`Sheet: ${sheet || ""}`);
    lines.push(`Header row: ${importReport.headerRow}`);
    lines.push(`Rows read: ${importReport.rawRowCount}`);
    lines.push(`Data rows: ${importReport.dataRowCount}`);
    lines.push(`Loaded choices: ${priorityItems.length}`);
    lines.push(`Institute column: ${importReport.instituteColumnLabel}`);
    if (Number(importReport.instituteFallbackRowCount || 0)) {
      lines.push(`Institute row auto-corrections: ${importReport.instituteFallbackRowCount}`);
    }
    if (Number(importReport.instituteRecoveredRowCount || 0)) {
      lines.push(`Institute row recoveries: ${importReport.instituteRecoveredRowCount}`);
    }
    if (Number(importReport.instituteLooseRecoveredRowCount || 0)) {
      lines.push(`Institute loose recoveries: ${importReport.instituteLooseRecoveredRowCount}`);
    }
    lines.push(`Program column: ${importReport.programColumnLabel}`);
    lines.push(`Quota column: ${importReport.quotaColumnLabel}`);
    lines.push(`Order column: ${importReport.orderColumnLabel}`);
    lines.push(`Skipped rows: ${importReport.skipped?.length || 0}`);

    for (const skipped of importReport.skipped || []) {
      lines.push(`SKIPPED row ${skipped.excelRow}: ${skipped.reason}${skipped.rowPreview ? `; seen: ${skipped.rowPreview}` : ""}`);
    }
  }

  if (matches.length) {
    lines.push("");
    lines.push("Preview report");

    const missing = matches.filter((item) => !item.found);
    const duplicates = matches.filter((item) => item.duplicate);
    const found = matches.filter((item) => item.found);
    const alreadyFilled = found.filter((item) => item.alreadyFilled);

    lines.push(`Matched: ${found.length}`);
    lines.push(`Already filled on page: ${alreadyFilled.length}`);
    lines.push(`Duplicate Excel rows skipped: ${duplicates.length}`);
    lines.push(`Skipped ranks by user: ${skippedRanks.length ? skippedRanks.join(", ") : "none"}`);
    lines.push(`Unmatched/Ambiguous: ${missing.length - duplicates.length}`);

    for (const item of missing.filter((entry) => !entry.duplicate)) {
      lines.push(`UNMATCHED rank ${item.rank}, Excel row ${item.excelRow || "?"}: ${item.choiceName} | ${item.program || "No program"} | ${item.quota || "No quota"} | ${item.reason || "Not found"}`);
    }

    for (const item of duplicates) {
      lines.push(`DUPLICATE rank ${item.rank}, Excel row ${item.excelRow || "?"}: ${item.choiceName} | ${item.program || "No program"} | ${item.quota || "No quota"} | first copy already matched`);
    }

    for (const item of found) {
      const label = item.alreadyFilled ? "ALREADY FILLED" : "MATCHED";
      const pageChoiceNo = item.pageChoiceNo ? ` | choice no ${item.pageChoiceNo}` : "";
      lines.push(`${label} rank ${item.rank}, Excel row ${item.excelRow || "?"}: ${item.choiceName} | ${item.program || ""} | ${item.quota || ""} -> ${item.pageName} | ${item.pageProgram || ""} | ${item.pageQuota || ""}${pageChoiceNo}`);
    }
  }

  return lines.length ? lines : ["No report available yet."];
}

function normalizeSheets(sheets) {
  return (Array.isArray(sheets) ? sheets : [])
    .map((sheet) => (typeof sheet === "string" ? sheet : sheet?.name))
    .filter(Boolean);
}
