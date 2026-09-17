const CreditPackages = ({ packages, paymentLoading, status, onBuyCredits }) => (
  <section className="panel">
    <h2>Renew credits</h2>
    <div className="package-list">
      {packages.length ? packages.map((item) => (
        <button type="button" key={item.id} onClick={() => onBuyCredits(item.id)} disabled={paymentLoading}>
          <span>{item.label}: {item.credits} credits</span>
          <span>{paymentLoading ? "Opening..." : `INR ${item.amountPaise / 100}`}</span>
        </button>
      )) : <p>No credit packages available.</p>}
    </div>
    {status ? <p className="status">{status}</p> : null}
  </section>
);

export default CreditPackages;
