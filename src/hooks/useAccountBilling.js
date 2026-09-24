import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { API_ENDPOINTS } from "../constant/apiendpoints";
import { saveAuth, setAuthenticatedUser } from "../features/auth/authSlice";
import { openTab } from "../lib/chrome-extension";
import { apiBaseUrl, Apiservice } from "../services/apiservices";

const PENDING_PAYMENT_ORDER_KEY = "mcc-choice-helper-pending-payment-order";

export const useAccountBilling = ({ autoOpenPlansWhenEmpty = false } = {}) => {
  const dispatch = useDispatch();
  const auth = useSelector((state) => state.auth);

  const [uploads, setUploads] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [packages, setPackages] = useState([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [plansOpen, setPlansOpen] = useState(false);
  const [pendingPaymentOrderId, setPendingPaymentOrderId] = useState(() =>
    localStorage.getItem(PENDING_PAYMENT_ORDER_KEY) || ""
  );

  const refreshAccount = useCallback(async () => {
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
  }, [auth.apiUrl, auth.token, dispatch]);

  const refreshPackages = useCallback(async () => {
    try {
      const res = await Apiservice.get(API_ENDPOINTS.payments.packages, auth.apiUrl);
      setPackages(Array.isArray(res?.data?.packages) ? res.data.packages : []);
    } catch {
      setPackages([]);
    }
  }, [auth.apiUrl]);

  const refreshAll = useCallback(() => {
    refreshAccount();
    refreshPackages();
  }, [refreshAccount, refreshPackages]);

  const updateCreditsAfterUpload = useCallback((credits) => {
    const user = { ...(auth.user || {}), credits };
    saveAuth({ token: auth.token, user });
    dispatch(setAuthenticatedUser(user));
  }, [auth.token, auth.user, dispatch]);

  const savePendingPaymentOrder = useCallback((orderId) => {
    if (!orderId) return;
    localStorage.setItem(PENDING_PAYMENT_ORDER_KEY, orderId);
    setPendingPaymentOrderId(orderId);
  }, []);

  const clearPendingPaymentOrder = useCallback(() => {
    localStorage.removeItem(PENDING_PAYMENT_ORDER_KEY);
    setPendingPaymentOrderId("");
  }, []);

  const checkPaymentStatus = useCallback(async (orderId, { quiet = false } = {}) => {
    if (!auth.token || !orderId) return;

    try {
      const res = await Apiservice.getAuth(
        API_ENDPOINTS.payments.orderStatus(orderId),
        auth.token,
        auth.apiUrl
      );
      const data = res?.data || {};

      if (data.status === "paid") {
        clearPendingPaymentOrder();
        setPaymentStatus(`Payment successful. ${data.creditsPurchased || ""} credits added.`);
        toast.success("Payment successful. Credits added.");
        await refreshAccount();
        return;
      }

      setPaymentStatus("Payment is still pending. Complete Razorpay checkout.");
    } catch (error) {
      if (!quiet) {
        setPaymentStatus(error.message || "Could not check payment status.");
      }
    }
  }, [auth.apiUrl, auth.token, clearPendingPaymentOrder, refreshAccount]);

  const buyCredits = useCallback(async (packageId) => {
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

      savePendingPaymentOrder(order.orderId);
      openTab(checkoutUrl);
      setPlansOpen(false);
      setPaymentStatus("Payment opened in a new tab. Credits will refresh after successful payment.");
      toast.success("Payment opened.");
    } catch (error) {
      setPaymentStatus(error.message || "Could not create payment order.");
      toast.error(error.message || "Could not create payment order.");
    } finally {
      setPaymentLoading(false);
    }
  }, [auth.apiUrl, auth.token, savePendingPaymentOrder]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const credits = Number(auth.user?.credits ?? 0);
    if (autoOpenPlansWhenEmpty && auth.token && packages.length && credits <= 0) {
      setPlansOpen(true);
    }
  }, [auth.token, auth.user?.credits, autoOpenPlansWhenEmpty, packages.length]);

  useEffect(() => {
    if (!auth.token || !pendingPaymentOrderId) return undefined;

    setPaymentStatus("Checking pending payment...");
    checkPaymentStatus(pendingPaymentOrderId, { quiet: true });

    const intervalId = window.setInterval(() => {
      checkPaymentStatus(pendingPaymentOrderId, { quiet: true });
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [auth.token, checkPaymentStatus, pendingPaymentOrderId]);

  return {
    auth,
    uploads,
    transactions,
    packages,
    paymentLoading,
    paymentStatus,
    plansOpen,
    setPlansOpen,
    refreshAccount,
    refreshAll,
    updateCreditsAfterUpload,
    buyCredits
  };
};
