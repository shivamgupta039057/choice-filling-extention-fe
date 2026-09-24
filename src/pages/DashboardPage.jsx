import PlanModal from "../components/account/PlanModal";
import PreviewReport from "../components/choice/PreviewReport";
import UploadPanel from "../components/choice/UploadPanel";
import AppShell from "../components/layout/AppShell";
import { useAccountBilling } from "../hooks/useAccountBilling";
import { useChoiceHelper } from "../hooks/useChoiceHelper";

const DashboardPage = () => {
  const account = useAccountBilling({ autoOpenPlansWhenEmpty: true });

  const { helper, actions } = useChoiceHelper({
    auth: account.auth,
    onCreditsUpdate: account.updateCreditsAfterUpload,
    onRefreshAccount: account.refreshAccount
  });

  return (
    <AppShell onRefresh={account.refreshAll}>
      <UploadPanel helper={helper} actions={actions} />
      <PreviewReport helper={helper} />
      {account.plansOpen ? (
        <PlanModal
          authenticated
          packages={account.packages}
          paymentLoading={account.paymentLoading}
          onBuyCredits={account.buyCredits}
          onClose={() => account.setPlansOpen(false)}
        />
      ) : null}
    </AppShell>
  );
};

export default DashboardPage;
