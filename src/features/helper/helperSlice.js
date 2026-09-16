import { createAsyncThunk, createSelector, createSlice } from "@reduxjs/toolkit";
import { fetchAccount } from "../account/accountSlice";
import { setAuthenticatedUser } from "../auth/authSlice";
import { parsePriorityFile } from "../../services/apiservices";
import {
  getActiveTab,
  getExtensionUrl,
  getFromStorage,
  injectContentScript,
  openTab,
  sendTabMessage,
  setInStorage
} from "../../lib/chrome-extension";
import { STORAGE_KEYS } from "../../constant/localStorageKeys";

const emptyJobState = { running: false, paused: false };

const initialState = {
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
  status: "Login to begin.",
  matchValue: "0",
  jobState: emptyJobState,
  skippedRanks: [],
  firstBlockingMatch: null,
  loading: "idle"
};

export const restoreHelperState = createAsyncThunk("helper/restore", async () => {
  const data = await getFromStorage(STORAGE_KEYS.helper);
  const state = data[STORAGE_KEYS.helper] || {};
  const sheets = normalizeSheets(state.workbookSheets || state.sheets || []);

  return {
    fileName: state.fileName || "",
    sheets,
    sheet: state.selectedSheet || state.sheet || "",
    settings: state.settings || {},
    priorityItems: Array.isArray(state.priorityItems) ? state.priorityItems : [],
    importReport: state.importReport || null,
    matches: Array.isArray(state.lastPreviewMatches) ? state.lastPreviewMatches : [],
    loadedFromBackend: Boolean(state.loadedFromBackend),
    skippedRanks: Array.isArray(state.skippedRanks) ? state.skippedRanks : []
  };
});

export const parseFile = createAsyncThunk("helper/parseFile", async (file, { dispatch, getState }) => {
  if (!file) throw new Error("Choose an Excel or CSV file first.");

  const { auth, helper } = getState();
  if (!auth.token) throw new Error("Login first. Upload uses backend credits.");

  const data = await parsePriorityFile({
    auth,
    file,
    sheet: helper.sheet,
    headerRow: helper.headerRow,
    column: helper.column,
    programColumn: helper.programColumn
  });

  const priorityItems = Array.isArray(data.items) ? data.items : [];
  const sheets = normalizeSheets(data.sheets || []);
  const selectedSheet = data.selectedSheet || sheets[0] || "";
  const nextState = {
    fileName: file.name,
    workbookSheets: sheets,
    selectedSheet,
    settings: {
      headerRow: helper.headerRow,
      instituteColumn: helper.column,
      programColumn: helper.programColumn
    },
    priorityItems,
    importReport: data.report || null,
    lastPreviewMatches: [],
    loadedFromBackend: true,
    skippedRanks: []
  };

  await setInStorage({
    [STORAGE_KEYS.priorityItems]: priorityItems,
    [STORAGE_KEYS.helper]: nextState
  });

  if (typeof data.credits === "number") {
    const user = { ...(auth.user || {}), credits: data.credits };
    dispatch(setAuthenticatedUser(user));
    await setInStorage({
      [STORAGE_KEYS.auth]: {
        apiUrl: auth.apiUrl,
        token: auth.token,
        user
      }
    });
  }

  dispatch(fetchAccount());

  return {
    fileName: file.name,
    sheets,
    sheet: selectedSheet,
    priorityItems,
    importReport: data.report || null,
    message: data.message || importReportText(priorityItems, data.report)
  };
});

export const previewChoices = createAsyncThunk("helper/preview", async (_, thunkApi) => {
  return sendPriorityMessage("MCC_PREVIEW_CHOICES", thunkApi);
});

export const startFilling = createAsyncThunk("helper/start", async (_, thunkApi) => {
  return sendPriorityMessage("MCC_START_FILLING", thunkApi);
});

export const skipBlockedChoice = createAsyncThunk("helper/skipBlocker", async (_, thunkApi) => {
  return sendPriorityMessage("MCC_SKIP_BLOCKER", thunkApi);
});

export const controlFilling = createAsyncThunk("helper/control", async (type) => {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("Open the MCC/Rajasthan choice page, then try again.");

  const response = await sendTabMessage(tab.id, { type });
  return { type, result: response || {} };
});

export const copyReport = createAsyncThunk("helper/copyReport", async (_, { getState }) => {
  const helper = getState().helper;
  const lines = buildReportLines(helper);
  await navigator.clipboard.writeText(lines.join("\n"));
  return true;
});

export const openHelperTab = createAsyncThunk("helper/openTab", async (_, { getState }) => {
  await persistHelperSnapshot(getState().helper);
  openTab(getExtensionUrl("index.html"));
});

async function sendPriorityMessage(type, { getState }) {
  const helper = getState().helper;
  if (!helper.priorityItems.length) {
    throw new Error(helper.importReport
      ? "No choices loaded from this sheet. Check the skipped rows below."
      : "Upload a sheet first.");
  }

  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("Open the MCC/Rajasthan choice page, then try again.");

  await injectContentScript(tab.id);
  const response = await sendTabMessage(tab.id, {
    type,
    priorityItems: helper.priorityItems,
    skippedRanks: helper.skippedRanks
  });

  const result = { matches: [], added: 0, errors: [], ...response };
  await persistHelperSnapshot({
    ...helper,
    matches: Array.isArray(result.matches) ? result.matches : [],
    skippedRanks: Array.isArray(result.skippedRanks) ? result.skippedRanks : helper.skippedRanks
  });

  return { type, result };
}

async function persistHelperSnapshot(helper, overrides = {}) {
  const nextState = {
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
    skippedRanks: helper.skippedRanks,
    ...overrides
  };

  await setInStorage({
    [STORAGE_KEYS.priorityItems]: nextState.priorityItems,
    [STORAGE_KEYS.helper]: nextState
  });
}

function applyPageResult(state, { type, result }) {
  const nextMatches = Array.isArray(result.matches) ? result.matches : [];
  const foundCount = nextMatches.filter((item) => item.found).length;
  const fillableBeforeBlock = typeof result.fillableBeforeBlock === "number"
    ? result.fillableBeforeBlock
    : countLeadingFillable(nextMatches, result.skippedRanks || state.skippedRanks);

  state.matches = nextMatches;
  state.matchValue = foundCount ? String(foundCount) : "0";
  state.status = result.message || fallbackPreviewMessage(nextMatches);
  state.firstBlockingMatch = result.firstBlockingMatch || null;
  state.skippedRanks = Array.isArray(result.skippedRanks) ? result.skippedRanks : state.skippedRanks;

  if (type === "MCC_PREVIEW_CHOICES") {
    state.previewApproved = fillableBeforeBlock > 0;
    state.jobState = emptyJobState;
  } else {
    state.previewApproved = false;
    applyJobResult(state, result);
  }
}

function applyJobResult(state, result = {}) {
  state.status = result.message || state.status || "Filling status updated.";
  if (typeof result.added === "number" && typeof result.total === "number" && result.total > 0) {
    state.matchValue = `${result.added}/${result.total}`;
  }
  state.jobState = {
    running: Boolean(result.running),
    paused: Boolean(result.paused)
  };
  state.firstBlockingMatch = result.firstBlockingMatch || state.firstBlockingMatch;
  state.skippedRanks = Array.isArray(result.skippedRanks) ? result.skippedRanks : state.skippedRanks;
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
  const columnText = `Institute col ${report.instituteColumnLabel}, Program col ${report.programColumnLabel}, Quota col ${report.quotaColumnLabel}, Order ${report.orderColumnLabel}`;
  return `${items.length} choices loaded from ${report.dataRowCount} data rows. ${columnText}. ${skippedCount} skipped.`;
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
    const unmatched = matches.filter((item) => !item.found);
    const duplicates = matches.filter((item) => item.duplicate);
    const matched = matches.filter((item) => item.found);
    const alreadyFilled = matched.filter((item) => item.alreadyFilled);
    lines.push(`Matched: ${matched.length}`);
    lines.push(`Already filled on page: ${alreadyFilled.length}`);
    lines.push(`Duplicate Excel rows skipped: ${duplicates.length}`);
    lines.push(`Skipped ranks by user: ${skippedRanks.length ? skippedRanks.join(", ") : "none"}`);
    lines.push(`Unmatched/Ambiguous: ${unmatched.length - duplicates.length}`);

    for (const item of unmatched.filter((item) => !item.duplicate)) {
      lines.push(`UNMATCHED rank ${item.rank}, Excel row ${item.excelRow || "?"}: ${item.choiceName} | ${item.program || "No program"} | ${item.quota || "No quota"} | ${item.reason || "Not found"}`);
    }
    for (const item of duplicates) {
      lines.push(`DUPLICATE rank ${item.rank}, Excel row ${item.excelRow || "?"}: ${item.choiceName} | ${item.program || "No program"} | ${item.quota || "No quota"} | first copy already matched`);
    }
    for (const item of matched) {
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

const helperSlice = createSlice({
  name: "helper",
  initialState,
  reducers: {
    setSetting(state, action) {
      const { key, value } = action.payload;
      state[key] = value;
      if (state.loadedFromBackend) {
        state.previewApproved = false;
        state.status = "Settings changed. Choose the file again to parse through backend and spend credit with these settings.";
      }
    },
    setHelperStatus(state, action) {
      state.status = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreHelperState.fulfilled, (state, action) => {
        state.fileName = action.payload.fileName;
        state.sheets = action.payload.sheets;
        state.sheet = action.payload.sheet;
        state.priorityItems = action.payload.priorityItems;
        state.importReport = action.payload.importReport;
        state.matches = action.payload.matches;
        state.loadedFromBackend = action.payload.loadedFromBackend;
        state.skippedRanks = action.payload.skippedRanks;
        state.matchValue = action.payload.matches.length
          ? String(action.payload.matches.filter((item) => item.found).length)
          : "0";

        if (action.payload.settings) {
          state.headerRow = action.payload.settings.headerRow || state.headerRow;
          state.column = action.payload.settings.instituteColumn || state.column;
          state.programColumn = action.payload.settings.programColumn || state.programColumn;
        }

        if (action.payload.importReport) {
          state.status = `${action.payload.priorityItems.length} saved choices restored${action.payload.fileName ? ` from ${action.payload.fileName}` : ""}. Click Preview to refresh page matches.`;
        } else if (action.payload.priorityItems.length) {
          state.status = `${action.payload.priorityItems.length} saved priority rows ready. Click Preview to refresh page matches.`;
        }
      })
      .addCase(parseFile.pending, (state) => {
        state.loading = "upload";
        state.status = "Uploading to backend and checking credits...";
        state.matches = [];
        state.matchValue = "0";
        state.previewApproved = false;
        state.jobState = emptyJobState;
        state.firstBlockingMatch = null;
        state.skippedRanks = [];
      })
      .addCase(parseFile.fulfilled, (state, action) => {
        state.loading = "idle";
        state.fileName = action.payload.fileName;
        state.sheets = action.payload.sheets;
        state.sheet = action.payload.sheet;
        state.priorityItems = action.payload.priorityItems;
        state.importReport = action.payload.importReport;
        state.loadedFromBackend = true;
        state.status = action.payload.message;
      })
      .addCase(parseFile.rejected, (state, action) => {
        state.loading = "idle";
        state.status = `Could not read file: ${action.error.message || "Upload failed."}`;
      })
      .addCase(previewChoices.pending, (state) => {
        state.loading = "preview";
        state.status = "Checking page...";
      })
      .addCase(previewChoices.fulfilled, (state, action) => {
        state.loading = "idle";
        applyPageResult(state, action.payload);
      })
      .addCase(previewChoices.rejected, (state, action) => {
        const reason = action.error.message || "Open the MCC/Rajasthan choice page, reload it once, then try again.";
        state.loading = "idle";
        state.previewApproved = false;
        state.matchValue = "0";
        state.matches = pageUnavailableMatches(state.priorityItems, reason);
        state.firstBlockingMatch = state.matches[0] || null;
        state.status = `${reason} Loaded rows are shown as not found until page preview can run.`;
      })
      .addCase(startFilling.pending, (state) => {
        state.loading = "start";
        state.status = "Starting...";
      })
      .addCase(startFilling.fulfilled, (state, action) => {
        state.loading = "idle";
        applyPageResult(state, action.payload);
      })
      .addCase(startFilling.rejected, (state, action) => {
        state.loading = "idle";
        state.status = action.error.message || "Open the MCC/Rajasthan choice page, reload it once, then try again.";
      })
      .addCase(skipBlockedChoice.pending, (state) => {
        state.loading = "skip";
        state.status = "Skipping blocked rank and starting next safe choices...";
      })
      .addCase(skipBlockedChoice.fulfilled, (state, action) => {
        state.loading = "idle";
        applyPageResult(state, action.payload);
      })
      .addCase(skipBlockedChoice.rejected, (state, action) => {
        state.loading = "idle";
        state.status = action.error.message || "Could not skip blocked choice.";
      })
      .addCase(controlFilling.fulfilled, (state, action) => {
        applyJobResult(state, action.payload.result);
      })
      .addCase(controlFilling.rejected, (state, action) => {
        state.status = action.error.message || "Open the MCC/Rajasthan choice page, then try again.";
      })
      .addCase(copyReport.fulfilled, (state) => {
        state.status = "Report copied.";
      });
  }
});

export const selectOrderedMatches = createSelector(
  (state) => state.helper.matches,
  (matches) => [
    ...matches.filter(({ found, duplicate }) => !found && !duplicate),
    ...matches.filter(({ duplicate }) => duplicate),
    ...matches.filter(({ found }) => found)
  ]
);

export const selectFillableBeforeBlock = createSelector(
  (state) => state.helper.matches,
  (state) => state.helper.skippedRanks,
  countLeadingFillable
);

export const { setHelperStatus, setSetting } = helperSlice.actions;

export default helperSlice.reducer;
