import { useEffect, useMemo, useRef } from "react";

const defaultFeatures = [
  "Priority file upload",
  "MCC page preview",
  "Choice filling controls",
  "Credit ledger and upload history"
];

const PlanModal = ({
  authenticated = false,
  packages = [],
  paymentLoading = false,
  title = "Choose the right plan",
  subtitle = "Add credits to your account and continue filling choices.",
  onBuyCredits,
  onClose,
  onLoginRequired
}) => {
  const callbacks = useRef({ onBuyCredits, onClose, onLoginRequired });
  const renderOnHostPage = typeof window !== "undefined"
    && window.parent !== window
    && document.documentElement.dataset.surface === "page-panel";

  callbacks.current = { onBuyCredits, onClose, onLoginRequired };

  const modalPayload = useMemo(() => ({
    authenticated,
    features: defaultFeatures,
    packages,
    paymentLoading,
    subtitle,
    title
  }), [authenticated, packages, paymentLoading, subtitle, title]);

  useEffect(() => {
    if (!renderOnHostPage) return undefined;

    const handleMessage = (event) => {
      const message = event.data || {};
      if (message.type === "MCC_PLAN_MODAL_PACKAGE_SELECTED") {
        if (authenticated) {
          callbacks.current.onBuyCredits?.(message.packageId);
          return;
        }
        callbacks.current.onLoginRequired?.();
      }

      if (message.type === "MCC_PLAN_MODAL_CLOSED") {
        callbacks.current.onClose?.();
      }
    };

    window.addEventListener("message", handleMessage);
    window.parent.postMessage({ type: "MCC_SHOW_PLAN_MODAL", payload: modalPayload }, "*");

    return () => {
      window.removeEventListener("message", handleMessage);
      window.parent.postMessage({ type: "MCC_HIDE_PLAN_MODAL" }, "*");
    };
  }, [authenticated, modalPayload, renderOnHostPage]);

  if (renderOnHostPage) return null;

  return (
    <div className="plan-backdrop" role="dialog" aria-modal="true" aria-label="Upgrade plans">
      <section className="plan-dialog">
        <button type="button" className="plan-close" onClick={onClose} aria-label="Close plans">×</button>

        <p className="eyebrow">Upgrade plans</p>
        <h2>{title}</h2>
        <p>{subtitle}</p>

        <div className="billing-toggle" aria-label="Billing period">
          <span>Credits</span>
          <strong>Pay as you upload</strong>
          <em>No monthly lock-in</em>
        </div>

        <div className="plan-grid">
          {packages.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={index === 0 ? "popular-plan" : ""}
              disabled={paymentLoading}
              onClick={() => (authenticated ? onBuyCredits(item.id) : onLoginRequired?.())}
            >
              <small>{index === 0 ? "Popular" : item.label}</small>
              <span>{item.label}</span>
              <strong>INR {item.amountPaise / 100}</strong>
              <em>{item.credits} credits</em>
              <b>{authenticated ? "Upgrade Now" : "Login to upgrade"}</b>
              <ul>
                {defaultFeatures.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default PlanModal;
