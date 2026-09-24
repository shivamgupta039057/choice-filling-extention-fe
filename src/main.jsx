import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { HashRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./app/App";
import { store } from "./app/store";
import "./styles.css";

const surface = new URLSearchParams(window.location.search).get("surface") || "extension";
document.documentElement.dataset.surface = surface;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter>
        <App />
        <Toaster position="bottom-center" toastOptions={{ duration: 2400 }} />
      </HashRouter>
    </Provider>
  </React.StrictMode>
);
