import StatGrid from "../common/StatGrid";

const AccountStats = ({ credits, uploadCount }) => (
  <StatGrid
    items={[
      { value: credits ?? "-", label: "credits" },
      { value: uploadCount || 0, label: "uploads" },
      { value: 1, label: "cost/upload" }
    ]}
  />
);

export default AccountStats;
