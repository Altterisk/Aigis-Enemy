import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import StageList from "./pages/StageList";
import StageDetail from "./pages/StageDetail";
import EnemyList from "./pages/EnemyList";
import EnemyDetail from "./pages/EnemyDetail";
import UnitList from "./pages/UnitList";
import UnitDetail from "./pages/UnitDetail";
import TagPage from "./pages/TagPage";
import ArtistPage from "./pages/ArtistPage";
import Buffs from "./pages/Buffs";
import CostGen from "./pages/CostGen";
import Weather from "./pages/Weather";
import Dps from "./pages/Dps";
import Collection from "./pages/Collection";
import NotFound from "./pages/NotFound";
import "@altterisk/game-hub/hub.css";
import "@altterisk/game-hub/base.css";
import "@altterisk/game-hub/components.css";
import "./styles.css";

// Links from when the site used hash routes: /#/units/1?tab=x -> /units/1?tab=x
if (location.hash.startsWith("#/")) history.replaceState(null, "", location.hash.slice(1));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/units" replace />} />
          <Route path="stages" element={<StageList />} />
          <Route path="stages/:questId" element={<StageDetail />} />
          <Route path="enemies" element={<EnemyList />} />
          <Route path="enemies/:id" element={<EnemyDetail />} />
          <Route path="units" element={<UnitList />} />
          <Route path="units/:id" element={<UnitDetail />} />
          <Route path="tags/:tag" element={<TagPage />} />
          <Route path="artists" element={<ArtistPage />} />
          <Route path="buffs" element={<Buffs />} />
          <Route path="costgen" element={<CostGen />} />
          <Route path="weather" element={<Weather />} />
          <Route path="dps" element={<Dps />} />
          <Route path="collection" element={<Collection />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
