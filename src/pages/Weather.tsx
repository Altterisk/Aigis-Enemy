// /weather -- what each weather does to each side of the field.
//
// Data model: data/weather.json (python/aigis/weather.py). Rows arrive raw,
// including the no-op 100% entries; those are dropped here. Target 1 is the
// enemy side, target 2 the ally side.
import { useMemo, useState } from "react";
import { useWeather } from "../data";
import { UnitIconLink } from "../components";
import type { WeatherEntry, WeatherRow, WeatherSource } from "../types";

interface EffectMeta {
  label: string;
  note: string;
}

const EFFECTS: Record<number, EffectMeta> = {
  1: { label: "Movement speed", note: "How fast the affected side moves. Higher is faster." },
  2: { label: "Range", note: "Attack range of the affected side." },
  3: {
    label: "UP recovery interval",
    note: "Time between UP ticks. A lower number means UP comes in faster.",
  },
  4: { label: "ATK", note: "Attack power of the affected side." },
  5: { label: "Movement speed", note: "How fast the affected side moves. Higher is faster." },
};

// The category a weather belongs to, for the units that carry a weather resist.
const FAMILIES: Record<number, string> = {
  1: "Blizzard",
  2: "Storm / rain / heat",
  3: "Mist / wind / torrent",
};

function effectMeta(id: number): EffectMeta {
  return EFFECTS[id] || { label: `effect ${id}`, note: "" };
}

function rowLabel(r: WeatherRow): string {
  const suffix = r.add ? ` ${r.add > 0 ? "+" : "−"}${Math.abs(r.add)}` : "";
  return `${effectMeta(r.effect).label} ${r.param}%${suffix}`;
}

function isNoOp(r: WeatherRow): boolean {
  return r.param === 100 && !r.add;
}

// The banner the game itself puts on screen when the weather starts.
function WeatherBanner({ id, name }: { id: number; name: string | null }) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    <img
      className="wx-banner"
      src={`${import.meta.env.BASE_URL}weather-icon/${id}.png`}
      alt={name || `weather ${id}`}
      loading="lazy"
      onError={() => setMissing(true)}
    />
  );
}

function Chips({ rows }: { rows: WeatherRow[] }) {
  if (!rows.length) return <span className="muted">—</span>;
  return (
    <span className="wx-chips">
      {rows.map((r, i) => (
        <span
          key={i}
          className={`wx-chip ${r.param < 100 ? "wx-down" : r.param > 100 ? "wx-up" : ""}`}
          title={effectMeta(r.effect).note}
        >
          {rowLabel(r)}
        </span>
      ))}
    </span>
  );
}

export default function Weather() {
  const data = useWeather();
  const [q, setQ] = useState("");
  const [effect, setEffect] = useState("all");

  const weathers = useMemo(() => {
    const all = [...(data?.weathers || [])].sort((a, b) => a.id - b.id);
    const term = q.trim().toLowerCase();
    const wantEffect = effect === "all" ? null : Number(effect);
    return all.filter((w) => {
      if (wantEffect != null && !w.rows.some((r) => r.effect === wantEffect && !isNoOp(r))) {
        return false;
      }
      if (term) {
        const hay = `${w.id} ${w.name || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [data, q, effect]);

  const sourcesByWeather = useMemo(() => {
    const map = new Map<string, WeatherSource[]>();
    for (const s of data?.sources || []) {
      const list = map.get(s.weather) || [];
      list.push(s);
      map.set(s.weather, list);
    }
    return map;
  }, [data]);

  if (!data) return <p className="loading">Loading weather…</p>;

  const sideRows = (w: WeatherEntry, target: number) =>
    w.rows.filter((r) => r.target === target && !isNoOp(r));

  return (
    <div className="weather-page">
      <h2>Weather</h2>
      <p className="muted">
        Weather (天候) covers the whole battlefield and hits both sides at once —
        the enemies as well as your own units. Every banner below reads 悪天候,
        bad weather, except <b>IceLightning</b>: the only one the game calls
        plain 天候, and the only one that leaves your units alone.
      </p>

      <div className="toolbar">
        <input
          placeholder="Search id / name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={effect} onChange={(e) => setEffect(e.target.value)}>
          <option value="all">any effect</option>
          {[1, 2, 3, 4].map((id) => (
            <option key={id} value={String(id)}>
              {effectMeta(id).label}
            </option>
          ))}
        </select>
        <span className="count">{weathers.length} weathers</span>
      </div>

      <table className="grid wx-table">
        <thead>
          <tr>
            <th className="wx-col-id">id</th>
            <th>Weather</th>
            <th>Resist family</th>
            <th>Enemies</th>
            <th>Your units</th>
          </tr>
        </thead>
        <tbody>
          {weathers.map((w) => (
            <tr key={w.id}>
              <td className="wx-col-id">{w.id}</td>
              <td>
                <WeatherBanner id={w.id} name={w.name} />
                <div className="wx-name">
                  <b>{w.name}</b>
                  {(sourcesByWeather.get(w.name || "") || []).length > 0 && (
                    <span className="badge sky wx-badge">skill</span>
                  )}
                </div>
              </td>
              <td className="muted">
                {w.specialty.map((s) => FAMILIES[s] || `family ${s}`).join(", ") || "—"}
              </td>
              <td><Chips rows={sideRows(w, 1)} /></td>
              <td><Chips rows={sideRows(w, 2)} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.sources.length > 0 && (
        <section className="wx-panel">
          <h3>Weather from a unit skill</h3>
          <p className="muted small">
            The skill overwrites whatever weather the stage was running, and that
            weather does not come back when the skill ends.
          </p>
          <table className="grid wx-source-table">
            <thead>
              <tr><th>Unit</th><th>Skill</th><th>Weather</th></tr>
            </thead>
            <tbody>
              {data.sources.map((s, i) => (
                <tr key={i}>
                  <td><UnitIconLink id={s.unit} name={s.unit_name_en || s.unit_name} /></td>
                  <td>
                    {s.skill_en || s.skill}
                    {s.skill_en && s.skill && (
                      <div className="muted small">{s.skill}</div>
                    )}
                  </td>
                  <td>{s.weather}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
