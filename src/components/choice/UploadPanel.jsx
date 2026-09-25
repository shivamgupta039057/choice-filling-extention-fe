import StatGrid from "../common/StatGrid";
import { getExtensionUrl } from "../../lib/chrome-extension";

const sampleFileUrl = getExtensionUrl("sample-college-file.xlsx");

const   UploadPanel = ({ helper, actions }) => {
  const pauseDisabled = !helper.jobState.running || helper.jobState.paused;
  const resumeDisabled = !helper.jobState.running || !helper.jobState.paused;
  const stopDisabled = !helper.jobState.running;
  const startDisabled = !helper.previewApproved || helper.loading === "start" || helper.jobState.running;
  const skipDisabled = helper.jobState.running || !helper.firstBlockingMatch;
  const startText = helper.previewApproved ? `Fill first ${helper.fillableBeforeBlock}` : "Start filling";

  const update = (key) => (event) => actions.updateSetting(key, event.target.value);

  return (
    <section className="panel">
      <h2>Upload priority file</h2>
      <label className="field">
        <span className="field-title">
          Excel / CSV file (1 credit per new roll number)
          <a className="sample-download" href={sampleFileUrl} download="college name.xlsx">Download sample file</a>
        </span>
        <input
          type="file"
          accept=".xlsx,.csv,.tsv,text/csv"
          onChange={(event) => actions.uploadFile(event.target.files?.[0])}
        />
      </label>

      <div className="form-grid">
        <label className="field">
          <span>Sheet</span>
          <select value={helper.sheet} onChange={update("sheet")}>
            <option value="">First sheet</option>
            {helper.sheets.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Header row</span>
          <input type="number" min="1" value={helper.headerRow} onChange={update("headerRow")} />
        </label>
        <label className="field">
          <span>College column</span>
          <input value={helper.column} onChange={update("column")} placeholder="COLLEGE NAME or 1" />
        </label>
        <label className="field">
          <span>Program column</span>
          <input value={helper.programColumn} onChange={update("programColumn")} placeholder="Program or MBBS" />
        </label>
      </div>

      <StatGrid
        compact
        items={[
          { value: helper.priorityItems.length, label: "sheet rows" },
          { value: helper.matchValue, label: "page matches" }
        ]}
      />

      <div className="actions">
        <button type="button" onClick={actions.previewChoices} disabled={helper.loading === "preview"}>Preview</button>
        <button type="button" className="primary" disabled={startDisabled} onClick={actions.startFilling}>{startText}</button>
        <button type="button" disabled={pauseDisabled} onClick={() => actions.controlFilling("MCC_PAUSE_FILLING")}>Pause</button>
        <button type="button" disabled={resumeDisabled} onClick={() => actions.controlFilling("MCC_RESUME_FILLING")}>Resume</button>
        <button type="button" disabled={skipDisabled} onClick={actions.skipBlockedChoice}>Skip blocked choice</button>
        <button type="button" className="danger" disabled={stopDisabled} onClick={() => actions.controlFilling("MCC_STOP_FILLING")}>Stop</button>
        <button type="button" onClick={actions.openHelperTab}>Open helper tab</button>
        <button type="button" disabled={!helper.importReport && !helper.matches.length} onClick={actions.copyReport}>Copy report</button>
      </div>
    </section>
  );
};

export default UploadPanel;
