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
          <NavLink to="/collection">Collection</NavLink>
          <NavLink to="/enemies">Enemies</NavLink>
          <NavLink to="/stages">Stages</NavLink>
          <NavLink to="/buffs">Buffs</NavLink>
          <NavLink to="/costgen">Cost Gen</NavLink>
          <NavLink to="/weather">Weather</NavLink>
        </nav>
        <span className="note">
          unverified attributes are shown raw, not explained
        </span>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <a href="https://github.com/Altterisk/Aigis-Enemy" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
        <span className="footer-sep">·</span>
        <a href="https://altterisk.github.io/portfolio/" target="_blank" rel="noreferrer">
          Portfolio
        </a>
      </footer>
    </div>
  );
}
