import { useSelector } from "react-redux";
import AppRoutes from "../routes/Route";

const App = () => {
  const initialized = useSelector((state) => state.auth.initialized);

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
