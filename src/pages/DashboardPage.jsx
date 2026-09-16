import AccountStats from "../components/account/AccountStats";
import CreditLedger from "../components/account/CreditLedger";
import CreditPackages from "../components/account/CreditPackages";
import RecentUploads from "../components/account/RecentUploads";
import UploadPanel from "../components/choice/UploadPanel";
import PreviewReport from "../components/choice/PreviewReport";
import AppShell from "../components/layout/AppShell";

const DashboardPage = () => (
  <AppShell>
    <AccountStats />
    <UploadPanel />
    <CreditPackages />
    <RecentUploads />
    <CreditLedger />
    <PreviewReport />
  </AppShell>
);

export default DashboardPage;
