import { Navigate, Route, Routes } from "react-router-dom";
import { ROUTES_CONST } from "../constant/routeConstant";
import ProtectedRoute from "./ProtectedRoutes";
import DashboardPage from "../pages/DashboardPage";
import LoginPage from "../pages/LoginPage";
import ProfilePage from "../pages/ProfilePage";

const AppRoutes = () => (
  <Routes>
    <Route path={ROUTES_CONST.LOGIN} element={<LoginPage />} />
    <Route
      path={ROUTES_CONST.HOME}
      element={(
        <ProtectedRoute>
          <DashboardPage />
        </ProtectedRoute>
      )}
    />
    <Route
      path={ROUTES_CONST.PROFILE}
      element={(
        <ProtectedRoute>
          <ProfilePage />
        </ProtectedRoute>
      )}
    />
    <Route path="*" element={<Navigate to={ROUTES_CONST.HOME} replace />} />
  </Routes>
);

export default AppRoutes;
