import AccountStats from "../components/account/AccountStats";
import CreditLedger from "../components/account/CreditLedger";
import CreditPackages from "../components/account/CreditPackages";
import PlanModal from "../components/account/PlanModal";
import RecentUploads from "../components/account/RecentUploads";
import AppShell from "../components/layout/AppShell";
import { useAccountBilling } from "../hooks/useAccountBilling";

const ProfilePage = () => {
  const account = useAccountBilling();
  const user = account.auth.user || {};
  const displayName = user.name || user.email || "MCC Helper user";

  return (
    <AppShell onRefresh={account.refreshAll}>
      <section className="panel profile-card">
        <div className="profile-avatar">{String(displayName).charAt(0).toUpperCase()}</div>
        <div>
          <h2>{displayName}</h2>
          <p>{user.email || "Extension account"}</p>
        </div>
      </section>

      <AccountStats credits={user.credits} uploadCount={account.uploads.length} />

      <CreditPackages
        packages={account.packages}
        paymentLoading={account.paymentLoading}
        status={account.paymentStatus}
        onOpenPlans={() => account.setPlansOpen(true)}
      />

      <RecentUploads uploads={account.uploads} />
      <CreditLedger transactions={account.transactions} />

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

export default ProfilePage;
