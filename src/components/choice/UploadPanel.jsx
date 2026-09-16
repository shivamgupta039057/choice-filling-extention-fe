import { useDispatch, useSelector } from "react-redux";
import {
  controlFilling,
  copyReport,
  openHelperTab,
  parseFile,
  previewChoices,
  selectFillableBeforeBlock,
  setSetting,
  skipBlockedChoice,
  startFilling
} from "../../features/helper/helperSlice";
import StatGrid from "../common/StatGrid";

const UploadPanel = () => {
  const dispatch = useDispatch();
  const helper = useSelector((state) => state.helper);
  const fillableBeforeBlock = useSelector(selectFillableBeforeBlock);

  const pauseDisabled = !helper.jobState.running || helper.jobState.paused;
  const resumeDisabled = !helper.jobState.running || !helper.jobState.paused;
  const stopDisabled = !helper.jobState.running;
  const startDisabled = !helper.previewApproved || helper.loading === "start" || helper.jobState.running;
  const skipDisabled = helper.jobState.running || !helper.firstBlockingMatch;
  const startText = helper.previewApproved ? `Fill first ${fillableBeforeBlock}` : "Start filling";

  const update = (key) => (event) => {
    dispatch(setSetting({ key, value: event.target.value }));
  };

  return (
    <section className="panel">
      <h2>Upload priority file</h2>
      <label className="field">
        <span>Excel / CSV file (uses 1 credit)</span>
        <input
          type="file"
          accept=".xlsx,.csv,.tsv,text/csv"
          onChange={(event) => dispatch(parseFile(event.target.files?.[0]))}
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
        <button type="button" onClick={() => dispatch(previewChoices())} disabled={helper.loading === "preview"}>Preview</button>
        <button type="button" className="primary" disabled={startDisabled} onClick={() => dispatch(startFilling())}>{startText}</button>
        <button type="button" disabled={pauseDisabled} onClick={() => dispatch(controlFilling("MCC_PAUSE_FILLING"))}>Pause</button>
        <button type="button" disabled={resumeDisabled} onClick={() => dispatch(controlFilling("MCC_RESUME_FILLING"))}>Resume</button>
        <button type="button" disabled={skipDisabled} onClick={() => dispatch(skipBlockedChoice())}>Skip blocked choice</button>
        <button type="button" className="danger" disabled={stopDisabled} onClick={() => dispatch(controlFilling("MCC_STOP_FILLING"))}>Stop</button>
        <button type="button" onClick={() => dispatch(openHelperTab())}>Open helper tab</button>
        <button type="button" disabled={!helper.importReport && !helper.matches.length} onClick={() => dispatch(copyReport())}>Copy report</button>
      </div>
    </section>
  );
};

export default UploadPanel;
