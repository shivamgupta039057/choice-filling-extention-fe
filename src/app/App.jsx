import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import AppRoutes from "../routes/Route";
import { fetchAccount, fetchCreditPackages } from "../features/account/accountSlice";
import { restoreAuth } from "../features/auth/authSlice";
import { restoreHelperState } from "../features/helper/helperSlice";
import { useFillStatusPolling } from "../hooks/useFillStatusPolling";

const App = () => {
  const dispatch = useDispatch();
  const initialized = useSelector((state) => state.auth.initialized);

  useFillStatusPolling();

  useEffect(() => {
    dispatch(restoreHelperState());
    dispatch(restoreAuth())
      .unwrap()
      .then((auth) => {
        dispatch(fetchCreditPackages());
        if (auth.token) dispatch(fetchAccount());
      })
      .catch(() => {
        dispatch(fetchCreditPackages());
      });
  }, [dispatch]);

  if (!initialized) {
    return (
      <main className="shell">
        <section className="panel empty-state">
          <h1>MCC Choice Helper</h1>
          <p>Loading account...</p>
        </section>
      </main>
    );
  }

  return <AppRoutes />;
};

export default App;
