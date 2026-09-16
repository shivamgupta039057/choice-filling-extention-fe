import { useSelector } from "react-redux";
import StatGrid from "../common/StatGrid";

const AccountStats = () => {
  const credits = useSelector((state) => state.auth.user?.credits);
  const uploads = useSelector((state) => state.account.uploads.length);

  return (
    <StatGrid
      items={[
        { value: credits ?? "-", label: "credits" },
        { value: uploads, label: "uploads" },
        { value: 1, label: "cost/upload" }
      ]}
    />
  );
};

export default AccountStats;
