import { useSelector } from "react-redux";
import MiniList from "../common/MiniList";

const RecentUploads = () => {
  const uploads = useSelector((state) => state.account.uploads);

  return (
    <section className="panel">
      <h2>Recent uploads</h2>
      <MiniList
        items={uploads.slice(0, 6)}
        empty="No uploads yet."
        render={(upload) => [upload.fileName || "Upload", `${upload.choiceCount || 0} choices`]}
      />
    </section>
  );
};

export default RecentUploads;
