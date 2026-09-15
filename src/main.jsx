import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  apiBaseUrl,
  cleanApiUrl,
  DEFAULT_API_URL,
  createPaymentOrder,
  getAccount,
  getCreditPackages,
  loginUser,
  parsePriorityFile
} from "./lib/api";
import {
  getActiveTab,
  getExtensionUrl,
  getFromStorage,
  injectContentScript,
  openTab,
  sendTabMessage,
  setInStorage
} from "./lib/chrome-extension";

const STORAGE_KEY = "choiceFillingHelperState";
const AUTH_STORAGE_KEY = "choiceFillingHelperAuth";

const initialAuth = {
  apiUrl: DEFAULT_API_URL,
  token: "",
  user: null
};

const emptyAccount = {
  uploads: [],
  transactions: []
};

const getOrderedMatches = (items) => [
  ...items.filter(({ found, duplicate }) => !found && !duplicate),
  ...items.filter(({ duplicate }) => duplicate),
  ...items.filter(({ found }) => found)
];

const App = () => {
  const [auth, setAuth] = useState(initialAuth);
  const [account, setAccount] = useState(emptyAccount);
  const [packages, setPackages] = useState([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sheet, setSheet] = useState("");
  const [headerRow, setHeaderRow] = useState("1");
  const [column, setColumn] = useState("Institute");
  const [programColumn, setProgramColumn] = useState("Program");
  const [sheets, setSheets] = useState([]);
  const [priorityItems, setPriorityItems] = useState([]);
  const [importReport, setImportReport] = useState(null);
  const [matches, setMatches] = useState([]);
  const [previewApproved, setPreviewApproved] = useState(false);
  const [loadedFromBackend, setLoadedFromBackend] = useState(false);
  const [status, setStatus] = useState("Login to begin.");
  const [authStatus, setAuthStatus] = useState("Login with your extension account.");
  const [matchValue, setMatchValue] = useState("0");
  const [jobState, setJobState] = useState({ running: false, paused: false });
  const [fileName, setFileName] = useState("");
  const statusTimer = useRef(null);

  const loggedIn = Boolean(auth.token && auth.user);
  const fillableBeforeBlock = useMemo(() => countLeadingFillable(matches), [matches]);
  const orderedMatches = useMemo(() => getOrderedMatches(matches), [matches]);

  useEffect(() => {
    void restoreAllState();
    void loadCreditPackages(DEFAULT_API_URL);
    return stopStatusPolling;
  }, []);

  async function restoreAllState() {
    const [authData, stateData] = await Promise.all([
      getFromStorage(AUTH_STORAGE_KEY),
      getFromStorage(STORAGE_KEY)
    ]);

    const savedAuth = authData[AUTH_STORAGE_KEY] || {};
    const nextAuth = {
      apiUrl: savedAuth.apiUrl || DEFAULT_API_URL,
      token: savedAuth.token || "",
      user: savedAuth.user || null
    };
    setAuth(nextAuth);
    setEmail(nextAuth.user?.email || "");

    const state = stateData[STORAGE_KEY] || {};
    setPriorityItems(Array.isArray(state.priorityItems) ? state.priorityItems : []);
    setImportReport(state.importReport || null);
    setMatches(Array.isArray(state.lastPreviewMatches) ? state.lastPreviewMatches : []);
    setFileName(state.fileName || "");
    setLoadedFromBackend(Boolean(state.loadedFromBackend));
    setSheets(Array.isArray(state.workbookSheets) ? state.workbookSheets : []);
    setSheet(state.selectedSheet || "");
    if (state.settings) {
      setHeaderRow(state.settings.headerRow || "1");
      setColumn(state.settings.instituteColumn || "Institute");
      setProgramColumn(state.settings.programColumn || "Program");
    }

    if (state.importReport) {
      setStatus(`${(state.priorityItems || []).length} saved choices restored${state.fileName ? ` from ${state.fileName}` : ""}. Click Preview to refresh page matches.`);
    }

    if (nextAuth.token) {
      void refreshAccount(nextAuth);
    }
  }

  async function persistAuth(nextAuth = auth) {
    const cleanAuth = { ...nextAuth, apiUrl: cleanApiUrl(nextAuth.apiUrl) };
    await setInStorage({ [AUTH_STORAGE_KEY]: cleanAuth });
  }

  async function persistState(overrides = {}) {
    const nextState = {
      fileName,
      workbookSheets: sheets,
      selectedSheet: sheet,
      settings: {
        headerRow,
        instituteColumn: column,
        programColumn
      },
      priorityItems,
      importReport,
      lastPreviewMatches: matches,
      loadedFromBackend,
      ...overrides
    };
    await setInStorage({
      priorityItems: nextState.priorityItems,
      [STORAGE_KEY]: nextState
    });
  }

  async function login() {
    try {
      const apiUrl = cleanApiUrl(auth.apiUrl);
      const normalizedEmail = email.trim();
      if (!normalizedEmail || !password) {
        setAuthStatus("Enter email and password.");
        return;
      }

      setAuthStatus("Logging in...");
      const { token, user } = await loginUser({
        apiUrl,
        email: normalizedEmail,
        password
      });

      const nextAuth = { apiUrl, token, user };
      setAuth(nextAuth);
      setPassword("");
      setAuthStatus(`Logged in as ${user.email}.`);
      await persistAuth(nextAuth);
      await refreshAccount(nextAuth);
    } catch (error) {
      setAuthStatus(error.message);
    }
  }

  async function logout() {
    const nextAuth = { apiUrl: auth.apiUrl, token: "", user: null };
    setAuth(nextAuth);
    setAccount(emptyAccount);
    setAuthStatus("Login with your extension account.");
    await persistAuth(nextAuth);
  }

  async function refreshAccount(authOverride = auth) {
    try {
      if (!authOverride.token) return;
      const data = await getAccount(authOverride);
      const nextAuth = { ...authOverride, user: data.user };
      setAuth(nextAuth);
      setAccount({
        uploads: Array.isArray(data.uploads) ? data.uploads : [],
        transactions: Array.isArray(data.transactions) ? data.transactions : []
      });
      setAuthStatus(`Logged in as ${data.user.email}.`);
      await persistAuth(nextAuth);
    } catch (error) {
      const nextAuth = { ...authOverride, token: "", user: null };
      setAuth(nextAuth);
      setAccount(emptyAccount);
      setAuthStatus("Login expired. Login again.");
      await persistAuth(nextAuth);
    }
  }

  async function loadCreditPackages(apiUrl = auth.apiUrl) {
    try {
      const nextPackages = await getCreditPackages(apiUrl);
      setPackages(nextPackages);
    } catch (error) {
      setPackages([]);
    }
  }

  async function buyCredits(packageId) {
    try {
      if (!auth.token) {
        setAuthStatus("Login first to renew credits.");
        return;
      }
      setAuthStatus("Creating payment order...");
      const order = await createPaymentOrder({ auth, packageId });
      const checkoutUrl = order.checkoutUrl || `${apiBaseUrl(auth.apiUrl)}/api/payments/checkout/${order.orderId}`;
      openTab(checkoutUrl);
      setAuthStatus("Payment opened in a new tab. Click Refresh after payment.");
    } catch (error) {
      setAuthStatus(error.message);
    }
  }

  function onSettingsChange(setter, value) {
    setter(value);
    if (loadedFromBackend) {
      setPreviewApproved(false);
      setStatus("Settings changed. Choose the file again to parse through backend and spend credit with these settings.");
    }
  }

  async function parseFile(file) {
    try {
      if (!file) return;
      if (!auth.token) {
        setStatus("Login first. Upload uses backend credits.");
        return;
      }

      resetLoadedState();
      setFileName(file.name);
      setStatus("Uploading to backend and checking credits...");

      const data = await parsePriorityFile({
        auth,
        file,
        sheet,
        headerRow,
        column,
        programColumn
      });

      const nextSheets = (data.sheets || []).map((name) => ({ name, rows: [] }));
      const nextItems = Array.isArray(data.items) ? data.items : [];
      const selectedSheet = data.selectedSheet || nextSheets[0]?.name || "";
      setLoadedFromBackend(true);
      setSheets(nextSheets);
      setSheet(selectedSheet);
      setPriorityItems(nextItems);
      setImportReport(data.report || null);
      setMatches([]);
      setMatchValue("0");
      setPreviewApproved(false);
      setJobState({ running: false, paused: false });

      if (typeof data.credits === "number") {
        const nextAuth = { ...auth, user: { ...(auth.user || {}), credits: data.credits } };
        setAuth(nextAuth);
        await persistAuth(nextAuth);
      }

      setStatus(importReportText(nextItems, data.report));
      await persistState({
        fileName: file.name,
        workbookSheets: nextSheets,
        selectedSheet,
        priorityItems: nextItems,
        importReport: data.report || null,
        lastPreviewMatches: [],
        loadedFromBackend: true
      });
      await refreshAccount();
    } catch (error) {
      setStatus(`Could not read file: ${error.message}`);
    }
  }

  function resetLoadedState() {
    setLoadedFromBackend(false);
    setPriorityItems([]);
    setImportReport(null);
    setMatches([]);
    setMatchValue("0");
    setPreviewApproved(false);
  }

  async function sendToTab(type) {
    try {
      if (!priorityItems.length) {
        setStatus(importReport ? "No choices loaded from this sheet. Check skipped rows below." : "Upload a sheet first.");
        return;
      }

      const tab = await getActiveTab();
      if (!tab?.id) return;

      setStatus(type === "MCC_PREVIEW_CHOICES" ? "Checking page..." : "Starting...");
      await injectContentScript(tab.id);
      const response = await sendTabMessage(tab.id, { type, priorityItems });
      renderPreviewResult({ matches: [], added: 0, errors: [], ...response }, type);
    } catch (error) {
      setStatus("Open the MCC choice page, reload it once, then try again.");
    }
  }

  async function sendControlToTab(type) {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) return;

      const response = await sendTabMessage(tab.id, { type });
      renderJobStatus(response);
      if (type === "MCC_STOP_FILLING") stopStatusPolling();
    } catch (error) {
      setStatus("Open the MCC choice page, then try again.");
    }
  }

  function renderPreviewResult(result, type) {
    const nextMatches = result.matches || [];
    const foundCount = nextMatches.filter((item) => item.found).length;
    const nextFillable = typeof result.fillableBeforeBlock === "number"
      ? result.fillableBeforeBlock
      : countLeadingFillable(nextMatches);
    const alreadyFilledCount = nextMatches.filter((item) => item.alreadyFilled).length;
    const missing = nextMatches.filter((item) => !item.found && !item.duplicate).length;

    setMatches(nextMatches);
    setMatchValue(String(foundCount));
    setStatus(result.message || `${foundCount} matched, ${alreadyFilledCount} already filled, ${missing} not matched.`);

    if (type === "MCC_PREVIEW_CHOICES") {
      setPreviewApproved(nextFillable > 0);
      setJobState({ running: false, paused: false });
    } else if (type === "MCC_START_FILLING") {
      setPreviewApproved(false);
      renderJobStatus(result);
      startStatusPolling();
    } else {
      setPreviewApproved(false);
    }

    void persistState({ lastPreviewMatches: nextMatches });
  }

  function renderJobStatus(result) {
    setStatus(result.message || "Filling status updated.");
    if (typeof result.added === "number" && typeof result.total === "number" && result.total > 0) {
      setMatchValue(`${result.added}/${result.total}`);
    }
    setJobState({
      running: Boolean(result.running),
      paused: Boolean(result.paused)
    });
    if (!result.running) stopStatusPolling();
  }

  function startStatusPolling() {
    stopStatusPolling();
    statusTimer.current = setInterval(() => {
      sendControlToTab("MCC_FILL_STATUS");
    }, 1000);
  }

  function stopStatusPolling() {
    if (statusTimer.current) clearInterval(statusTimer.current);
    statusTimer.current = null;
  }

  async function copyReport() {
    const lines = [];
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
        lines.push(`SKIPPED row ${skipped.excelRow}: ${skipped.reason}`);
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

    await navigator.clipboard.writeText(lines.join("\n"));
    setStatus("Report copied.");
  }

  const pauseDisabled = !jobState.running || jobState.paused;
  const resumeDisabled = !jobState.running || !jobState.paused;
  const stopDisabled = !jobState.running;
  const startText = previewApproved ? `Fill first ${fillableBeforeBlock}` : "Start filling";

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <h1>MCC Choice Helper</h1>
          <p>React + Vite extension</p>
        </div>
        <button type="button" onClick={() => refreshAccount()}>Refresh</button>
      </header>

      <section className="auth-box">
        <label className="field">
          <span>Backend API</span>
          <input value={auth.apiUrl} onChange={(event) => setAuth((current) => ({ ...current, apiUrl: event.target.value }))} onBlur={() => persistAuth()} />
        </label>

        <div className="auth-grid">
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
          </label>
        </div>

        <div className="auth-actions">
          <button type="button" className="primary" onClick={login} disabled={loggedIn}>Login</button>
          <button type="button" onClick={logout} disabled={!loggedIn}>Logout</button>
        </div>
        <p className="status">{authStatus}</p>
      </section>

      <section className="stats">
        <div>
          <strong>{auth.user?.credits ?? "-"}</strong>
          <span>credits</span>
        </div>
        <div>
          <strong>{account.uploads.length}</strong>
          <span>uploads</span>
        </div>
        <div>
          <strong>1</strong>
          <span>cost/upload</span>
        </div>
      </section>

      <section className="panel">
        <h2>Upload priority file</h2>
        <label className="field">
          <span>Excel / CSV file (uses 1 credit)</span>
          <input type="file" accept=".xlsx,.csv,.tsv,text/csv" onChange={(event) => parseFile(event.target.files?.[0])} />
        </label>

        <div className="form-grid">
          <label className="field">
            <span>Sheet</span>
            <select value={sheet} onChange={(event) => onSettingsChange(setSheet, event.target.value)}>
              <option value="">First sheet</option>
              {sheets.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Header row</span>
            <input type="number" min="1" value={headerRow} onChange={(event) => onSettingsChange(setHeaderRow, event.target.value)} />
          </label>
          <label className="field">
            <span>College column</span>
            <input value={column} onChange={(event) => onSettingsChange(setColumn, event.target.value)} placeholder="COLLEGE NAME or 1" />
          </label>
          <label className="field">
            <span>Program column</span>
            <input value={programColumn} onChange={(event) => onSettingsChange(setProgramColumn, event.target.value)} placeholder="Program, MBBS, BDS" />
          </label>
        </div>

        <section className="stats compact">
          <div>
            <strong>{priorityItems.length}</strong>
            <span>sheet rows</span>
          </div>
          <div>
            <strong>{matchValue}</strong>
            <span>page matches</span>
          </div>
        </section>

        <div className="actions">
          <button type="button" onClick={() => sendToTab("MCC_PREVIEW_CHOICES")}>Preview</button>
          <button type="button" className="primary" disabled={!previewApproved} onClick={() => sendToTab("MCC_START_FILLING")}>{startText}</button>
          <button type="button" disabled={pauseDisabled} onClick={() => sendControlToTab("MCC_PAUSE_FILLING")}>Pause</button>
          <button type="button" disabled={resumeDisabled} onClick={() => sendControlToTab("MCC_RESUME_FILLING")}>Resume</button>
          <button type="button" className="danger" disabled={stopDisabled} onClick={() => sendControlToTab("MCC_STOP_FILLING")}>Stop</button>
          <button type="button" onClick={() => openTab(getExtensionUrl("index.html"))}>Open helper tab</button>
          <button type="button" disabled={!importReport && !matches.length} onClick={copyReport}>Copy report</button>
        </div>
      </section>

      <section className="panel">
        <h2>Renew credits</h2>
        <div className="package-list">
          {packages.length ? packages.map((item) => (
            <button type="button" key={item.id} onClick={() => buyCredits(item.id)}>
              <span>{item.label}: {item.credits} credits</span>
              <span>INR {item.amountPaise / 100}</span>
            </button>
          )) : <p>No credit packages available.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>Recent uploads</h2>
        <MiniList
          items={account.uploads.slice(0, 6)}
          empty="No uploads yet."
          render={(upload) => [upload.fileName || "Upload", `${upload.choiceCount || 0} choices`]}
        />
      </section>

      <section className="panel">
        <h2>Credit ledger</h2>
        <MiniList
          items={account.transactions.slice(0, 8)}
          empty="No credit ledger yet."
          render={(tx) => [tx.reason || tx.type || "Transaction", `${Number(tx.amount) > 0 ? "+" : ""}${tx.amount}`]}
        />
      </section>

      <section className="panel">
        <h2>Preview report</h2>
        <p className="status">{status}</p>
        <ol className="preview">
          {!orderedMatches.length && importReport?.skipped?.length ? importReport.skipped.map((item) => (
            <li className="miss" key={`skipped-${item.excelRow}`}>Excel row {item.excelRow}: skipped - {item.reason}</li>
          )) : null}
          {!orderedMatches.length && importReport && !importReport.skipped?.length ? (
            <li className="ok">All non-empty Excel rows were loaded.</li>
          ) : null}
          {orderedMatches.map((item) => <PreviewItem item={item} key={`${item.rank}-${item.excelRow}-${item.reason || "ok"}`} />)}
        </ol>
      </section>
    </main>
  );
};

const PreviewItem = ({ item }) => {
  const choiceQuota = item.quota ? ` | ${item.quota}` : "";
  const pageQuota = item.pageQuota ? ` | ${item.pageQuota}` : "";
  const filledNo = item.alreadyFilled && item.pageChoiceNo ? ` #${item.pageChoiceNo}` : "";
  const matchState = item.alreadyFilled ? `Already filled${filledNo}` : "Matched";
  const className = item.found ? "ok" : item.duplicate ? "skip" : "miss";
  return (
    <li className={className}>
      {item.found
        ? `${item.rank}. Excel row ${item.excelRow || "?"}: ${item.choiceName} | ${item.program || "No program"}${choiceQuota} -> ${matchState}: ${item.pageName} | ${item.pageProgram || ""}${pageQuota}`
        : `${item.rank}. Excel row ${item.excelRow || "?"}: ${item.choiceName} | ${item.program || "No program"}${choiceQuota} -> ${item.reason || "Not found"}`}
    </li>
  );
};

const MiniList = ({ items, empty, render }) => {
  const rows = items.length ? items : [null];
  return (
    <ul className="mini-list">
      {rows.map((item, index) => {
        const [left, right] = item ? render(item) : [empty, ""];
        return (
          <li key={item?._id || index}>
            <span>{left}</span>
            <span>{right}</span>
          </li>
        );
      })}
    </ul>
  );
};

const importReportText = (items, report) => {
  if (!report) return `${items.length} priority rows loaded.`;
  const skippedCount = report.skipped?.length || 0;
  const columnText = `Institute col ${report.instituteColumnLabel}, Program col ${report.programColumnLabel}, Quota col ${report.quotaColumnLabel}, Order ${report.orderColumnLabel}`;
  return `${items.length} choices loaded from ${report.dataRowCount} data rows. ${columnText}. ${skippedCount} skipped.`;
};

const countLeadingFillable = (items) => {
  let count = 0;
  for (const item of items) {
    if (!item.found) break;
    if (!item.alreadyFilled) count += 1;
  }
  return count;
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
