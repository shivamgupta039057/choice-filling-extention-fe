import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import PlanModal from "../components/account/PlanModal";
import LoginForm from "../components/auth/LoginForm";
import { API_ENDPOINTS } from "../constant/apiendpoints";
import { ROUTES_CONST } from "../constant/routeConstant";
import { Apiservice } from "../services/apiservices";

const LoginPage = () => {
  const loggedIn = useSelector((state) => Boolean(state.auth.token && state.auth.user));
  const apiUrl = useSelector((state) => state.auth.apiUrl);
  const navigate = useNavigate();
  const [packages, setPackages] = useState([]);
  const [plansOpen, setPlansOpen] = useState(true);

  useEffect(() => {
    if (loggedIn) navigate(ROUTES_CONST.HOME, { replace: true });
  }, [loggedIn, navigate]);

  useEffect(() => {
    const loadPackages = async () => {
      try {
        const res = await Apiservice.get(API_ENDPOINTS.payments.packages, apiUrl);
        setPackages(Array.isArray(res?.data?.packages) ? res.data.packages : []);
      } catch {
        setPackages([]);
      }
    };

    loadPackages();
  }, [apiUrl]);

  const handleLoginRequired = () => {
    setPlansOpen(false);
    toast("Login or create an account first, then upgrade credits.");
  };

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <h1>MCC Choice Helper</h1>
          <p>Login to use backend credits and choice filling.</p>
        </div>
      </section>
      <LoginForm />
      {plansOpen && packages.length ? (
        <PlanModal
          packages={packages}
          title="Choose a credit plan"
          subtitle="Login or create an account first, then add credits for file uploads."
          onClose={() => setPlansOpen(false)}
          onLoginRequired={handleLoginRequired}
        />
      ) : null}
    </main>
  );
};

export default LoginPage;
