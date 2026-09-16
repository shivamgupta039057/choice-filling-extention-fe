import { useSelector } from "react-redux";
import MiniList from "../common/MiniList";

const CreditLedger = () => {
  const transactions = useSelector((state) => state.account.transactions);

  return (
    <section className="panel">
      <h2>Credit ledger</h2>
      <MiniList
        items={transactions.slice(0, 8)}
        empty="No credit ledger yet."
        render={(tx) => [tx.reason || tx.type || "Transaction", `${Number(tx.amount) > 0 ? "+" : ""}${tx.amount}`]}
      />
    </section>
  );
};

export default CreditLedger;
