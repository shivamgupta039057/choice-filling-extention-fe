import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { clearAccount, fetchAccount, fetchCreditPackages } from "../../features/account/accountSlice";
import { logout } from "../../features/auth/authSlice";
import { ROUTES_CONST } from "../../constant/routeConstant";

const AppShell = ({ children }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const email = useSelector((state) => state.auth.user?.email);

  const refresh = () => {
    dispatch(fetchAccount());
    dispatch(fetchCreditPackages());
  };

  const handleLogout = () => {
    dispatch(logout());
    dispatch(clearAccount());
    navigate(ROUTES_CONST.LOGIN, { replace: true });
  };

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <h1>MCC Choice Helper</h1>
          <p>{email ? `Logged in as ${email}` : "React + Vite extension"}</p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={refresh}>Refresh</button>
          <button type="button" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      {children}
    </main>
  );
};

export default AppShell;
