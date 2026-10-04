import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./styles/hero.css";
import "./styles/card.css";
import "./styles/run.css";
import "./styles/books.css";
import "./styles/dialog.css";
import "./styles/responsive.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
