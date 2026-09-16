import { useState } from "react";
import toast from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { API_ENDPOINTS } from "../../constant/apiendpoints";
import { ROUTES_CONST } from "../../constant/routeConstant";
import { saveAuth, setAuth, setAuthStatus } from "../../features/auth/authSlice";
import { Apiservice } from "../../services/apiservices";

const LoginForm = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const auth = useSelector((state) => state.auth);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(auth.user?.email || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submitHandler = async (event) => {
    event.preventDefault();

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      toast.error("Enter email and password.");
      return;
    }

    try {
      setLoading(true);
      dispatch(setAuthStatus(mode === "signup" ? "Creating account..." : "Logging in..."));

      const endpoint = mode === "signup" ? API_ENDPOINTS.auth.signup : API_ENDPOINTS.auth.login;
      const res = await Apiservice.post(endpoint, {
        email: normalizedEmail,
        password
      });

      const token = res?.data?.token;
      const user = res?.data?.user;

      if (token && user) {
        saveAuth({ token, user });
        dispatch(setAuth({ token, user }));
        setPassword("");
        toast.success(res?.data?.message || "Logged in successfully.");
        navigate(ROUTES_CONST.HOME, { replace: true });
      }
    } catch (error) {
      toast.error(error.message || "Login failed.");
      dispatch(setAuthStatus(error.message || "Login failed."));
    } finally {
      setLoading(false);
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

      <form onSubmit={submitHandler}>
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
          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Please wait..." : mode === "signup" ? "Create account" : "Login"}
          </button>
        </div>
      </form>

      <p className="status">{auth.status}</p>
    </section>
  );
};

export default LoginForm;
