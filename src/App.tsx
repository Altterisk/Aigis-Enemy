import { NavLink, Outlet } from "react-router-dom";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <h1>Aigis Data</h1>
        <nav>
          <NavLink to="/stages">Stages</NavLink>
          <NavLink to="/enemies">Enemies</NavLink>
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
