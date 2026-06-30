import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import StageList from "./pages/StageList";
import StageDetail from "./pages/StageDetail";
import EnemyList from "./pages/EnemyList";
import EnemyDetail from "./pages/EnemyDetail";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/stages" replace />} />
          <Route path="stages" element={<StageList />} />
          <Route path="stages/:questId" element={<StageDetail />} />
          <Route path="enemies" element={<EnemyList />} />
          <Route path="enemies/:id" element={<EnemyDetail />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
