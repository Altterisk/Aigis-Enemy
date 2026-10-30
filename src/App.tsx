import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { SiteShell, homeLink } from "@altterisk/game-hub";
import { LIST_META } from "./meta";
import { usePageMeta } from "./usePageMeta";

const FOOTER_LINKS = [
  { label: "Source on GitHub", href: "https://github.com/Altterisk/Aigis-Enemy" },
  { label: "Portfolio", href: "https://altterisk.github.io/portfolio/" },
];

export default function App() {
  // list pages here; detail pages and NotFound call usePageMeta themselves
  const { pathname } = useLocation();
  usePageMeta(LIST_META[pathname.replace(/\/$/, "")] ?? null);
  // contained={false}: pages render straight into <main>, which styles.css sizes
  return (
    <SiteShell
      game="aigis"
      logo={<img src="/logo.png" alt="" />}
      renderHomeLink={homeLink(Link, "to")}
      nav={
        <>
          <NavLink to="/units">Units</NavLink>
          <NavLink to="/collection">Collection</NavLink>
          <NavLink to="/enemies">Enemies</NavLink>
          <NavLink to="/stages">Stages</NavLink>
          <NavLink to="/buffs">Buffs</NavLink>
          <NavLink to="/costgen">Cost Gen</NavLink>
          <NavLink to="/dps">DPS</NavLink>
          <NavLink to="/weather">Weather</NavLink>
        </>
      }
      footer={{ links: FOOTER_LINKS }}
      resetKey={pathname}
      contained={false}
    >
      <Outlet />
    </SiteShell>
  );
}
