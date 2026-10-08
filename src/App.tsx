import { Link, NavLink, Outlet } from "react-router-dom";
import { HubBar, HubFooter } from "@altterisk/game-hub";

export default function App() {
  return (
    <div className="app">
      <HubBar
        game="aigis"
        logo={<img src="/logo.png" alt="" />}
        renderHomeLink={({ className, children }) => (
          <Link to="/" className={className}>{children}</Link>
        )}
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
      />
      <main>
        <Outlet />
      </main>
      <HubFooter
        game="aigis"
        links={[
          { label: "Source on GitHub", href: "https://github.com/Altterisk/Aigis-Enemy" },
          { label: "Portfolio", href: "https://altterisk.github.io/portfolio/" },
        ]}
      />
    </div>
  );
}
