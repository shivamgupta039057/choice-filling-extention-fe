const CreditPackages = ({ packages, paymentLoading, status, onOpenPlans }) => (
  <section className="panel">
    <div className="section-heading">
      <div>
        <h2>Renew credits</h2>
        <p>Open upgrade plans and add credits with Razorpay.</p>
      </div>
      <button type="button" className="primary" onClick={onOpenPlans} disabled={paymentLoading || !packages.length}>
        {paymentLoading ? "Opening..." : "Upgrade Plans"}
      </button>
    </div>
    {status ? <p className="status">{status}</p> : null}
  </section>
);

export default CreditPackages;
