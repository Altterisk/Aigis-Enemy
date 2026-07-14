import { NavLink, Outlet } from "react-router-dom";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/logo.png" alt="" className="brand-logo" />
          <h1>Aigis Database</h1>
        </NavLink>
        <nav>
          <NavLink to="/units">Units</NavLink>
          <NavLink to="/enemies">Enemies</NavLink>
          <NavLink to="/stages">Stages</NavLink>
          <NavLink to="/buffs">Buffs</NavLink>
          <NavLink to="/costgen">Cost Gen</NavLink>
        </nav>
        <span className="note">
          unverified attributes are shown raw, not explained
        </span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
