import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { ROUTES_CONST } from "../constant/routeConstant";

const ProtectedRoute = ({ children }) => {
  const loggedIn = useSelector((state) => Boolean(state.auth.token && state.auth.user));
  return loggedIn ? children : <Navigate to={ROUTES_CONST.LOGIN} replace />;
};

export default ProtectedRoute;
