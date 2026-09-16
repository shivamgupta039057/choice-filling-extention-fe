import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import LoginForm from "../components/auth/LoginForm";
import { ROUTES_CONST } from "../constant/routeConstant";

const LoginPage = () => {
  const loggedIn = useSelector((state) => Boolean(state.auth.token && state.auth.user));
  const navigate = useNavigate();

  useEffect(() => {
    if (loggedIn) navigate(ROUTES_CONST.HOME, { replace: true });
  }, [loggedIn, navigate]);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <h1>MCC Choice Helper</h1>
          <p>Login to use backend credits and choice filling.</p>
        </div>
      </section>
      <LoginForm />
    </main>
  );
};

export default LoginPage;
