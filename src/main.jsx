// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { seedAdminAccount } from "./utils/seedAdmin";

// Seed the admin account before rendering the app
seedAdminAccount().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
