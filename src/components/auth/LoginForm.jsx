import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { fetchAccount } from "../../features/account/accountSlice";
import { login, signup } from "../../features/auth/authSlice";
import { ROUTES_CONST } from "../../constant/routeConstant";

const LoginForm = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const auth = useSelector((state) => state.auth);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(auth.user?.email || "");
  const [password, setPassword] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const action = mode === "signup" ? signup : login;

    try {
      await dispatch(action({ email, password })).unwrap();
      setPassword("");
      dispatch(fetchAccount());
      navigate(ROUTES_CONST.HOME, { replace: true });
    } catch {
      // The slice already stores the visible error message.
    }
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{mode === "signup" ? "Create account" : "Login"}</h2>
        <button type="button" className="link-button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Signup" : "Use login"}
        </button>
      </div>

      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
            />
          </label>
        </div>

        <div className="actions single">
          <button type="submit" className="primary" disabled={auth.loading}>
            {auth.loading ? "Please wait..." : mode === "signup" ? "Create account" : "Login"}
          </button>
        </div>
      </form>

      <p className="status">{auth.status}</p>
    </section>
  );
};

export default LoginForm;
