import toast from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { createCreditOrder } from "../../features/account/accountSlice";
import { openTab } from "../../lib/chrome-extension";

const CreditPackages = () => {
  const dispatch = useDispatch();
  const packages = useSelector((state) => state.account.packages);
  const paymentLoading = useSelector((state) => state.account.paymentLoading);
  const status = useSelector((state) => state.account.status);

  const buyCredits = async (packageId) => {
    try {
      const order = await dispatch(createCreditOrder(packageId)).unwrap();
      openTab(order.checkoutUrl);
      toast.success("Payment opened. Click Refresh after payment.");
    } catch (error) {
      toast.error(error.message || "Could not create payment order.");
    }
  };

  return (
    <section className="panel">
      <h2>Renew credits</h2>
      <div className="package-list">
        {packages.length ? packages.map((item) => (
          <button type="button" key={item.id} onClick={() => buyCredits(item.id)} disabled={paymentLoading}>
            <span>{item.label}: {item.credits} credits</span>
            <span>INR {item.amountPaise / 100}</span>
          </button>
        )) : <p>No credit packages available.</p>}
      </div>
      {status ? <p className="status">{status}</p> : null}
    </section>
  );
};

export default CreditPackages;
