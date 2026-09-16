import { useSelector } from "react-redux";
import { selectOrderedMatches } from "../../features/helper/helperSlice";

const PreviewReport = () => {
  const helper = useSelector((state) => state.helper);
  const orderedMatches = useSelector(selectOrderedMatches);
  const skipped = helper.importReport?.skipped || [];

  return (
    <section className="panel">
      <h2>Preview report</h2>
      <p className="status">{helper.status}</p>
      <ol className="preview">
        {!orderedMatches.length && skipped.length ? skipped.map((item) => (
          <li className="miss" key={`skipped-${item.excelRow}`}>
            Excel row {item.excelRow}: skipped - {item.reason}{item.rowPreview ? `; seen: ${item.rowPreview}` : ""}
          </li>
        )) : null}
        {!orderedMatches.length && helper.importReport && !skipped.length ? (
          <li className="skip">Excel rows loaded. Open the MCC/Rajasthan choice page and click Preview to check matches.</li>
        ) : null}
        {orderedMatches.map((item) => <PreviewItem item={item} key={`${item.rank}-${item.excelRow}-${item.reason || "ok"}`} />)}
      </ol>
    </section>
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

export default PreviewReport;
