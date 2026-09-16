import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import AccountStats from "../components/account/AccountStats";
import CreditLedger from "../components/account/CreditLedger";
import CreditPackages from "../components/account/CreditPackages";
import RecentUploads from "../components/account/RecentUploads";
import PreviewReport from "../components/choice/PreviewReport";
import UploadPanel from "../components/choice/UploadPanel";
import AppShell from "../components/layout/AppShell";
import { API_ENDPOINTS } from "../constant/apiendpoints";
import { saveAuth, setAuthenticatedUser } from "../features/auth/authSlice";
import { openTab } from "../lib/chrome-extension";
import { useChoiceHelper } from "../hooks/useChoiceHelper";
import { apiBaseUrl, Apiservice } from "../services/apiservices";

const DashboardPage = () => {
  const dispatch = useDispatch();
  const auth = useSelector((state) => state.auth);
  console.log("authauthauthauthauthauth" ,  auth);
  
  const [uploads, setUploads] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState("");

  const refreshAccount = async () => {
    if (!auth.token) return;

    try {
      const res = await Apiservice.getAuth(API_ENDPOINTS.user.me, auth.token, auth.apiUrl);
      const data = res?.data || {};

      if (data.user) {
        saveAuth({ token: auth.token, user: data.user });
        dispatch(setAuthenticatedUser(data.user));
      }

      setUploads(Array.isArray(data.uploads) ? data.uploads : []);
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
    } catch (error) {
      toast.error(error.message || "Could not refresh account.");
    }
  };

  const refreshPackages = async () => {
    try {
      const res = await Apiservice.get(API_ENDPOINTS.payments.packages, auth.apiUrl);
      setPackages(Array.isArray(res?.data?.packages) ? res.data.packages : []);
    } catch {
      setPackages([]);
    }
  };

  const refreshAll = () => {
    refreshAccount();
    refreshPackages();
  };

  const updateCreditsAfterUpload = (credits) => {
    const user = { ...(auth.user || {}), credits };
    saveAuth({ token: auth.token, user });
    dispatch(setAuthenticatedUser(user));
  };

  const buyCredits = async (packageId) => {
    try {
      setPaymentLoading(true);
      setPaymentStatus("Creating payment order...");

      const res = await Apiservice.postAuth(
        API_ENDPOINTS.payments.orders,
        { packageId },
        auth.token,
        auth.apiUrl
      );

      const order = res?.data || {};
      const checkoutUrl = order.checkoutUrl || `${apiBaseUrl(auth.apiUrl)}/api/payments/checkout/${order.orderId}`;

      openTab(checkoutUrl);
      setPaymentStatus("Payment opened in a new tab. Click Refresh after payment.");
      toast.success("Payment opened. Click Refresh after payment.");
    } catch (error) {
      setPaymentStatus(error.message || "Could not create payment order.");
      toast.error(error.message || "Could not create payment order.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const { helper, actions } = useChoiceHelper({
    auth,
    onCreditsUpdate: updateCreditsAfterUpload,
    onRefreshAccount: refreshAccount
  });

  console.log("helperhelperhelperhelperhelper" , helper , actions);
  

  useEffect(() => {
    refreshAll();
  }, [auth.token]);

  return (
    <AppShell onRefresh={refreshAll}>
      <AccountStats credits={auth.user?.credits} uploadCount={uploads.length} />
      <UploadPanel helper={helper} actions={actions} />
      <CreditPackages
        packages={packages}
        paymentLoading={paymentLoading}
        status={paymentStatus}
        onBuyCredits={buyCredits}
      />
      <RecentUploads uploads={uploads} />
      <CreditLedger transactions={transactions} />
      <PreviewReport helper={helper} />
    </AppShell>
  );
};

export default DashboardPage;
