// /weather -- what each weather does to each side of the field.
//
// Data model: data/weather.json (python/aigis/weather.py). Rows arrive raw,
// including the no-op 100% entries; those are dropped here. Target 1 is the
// enemy side, target 2 the ally side.
import { useMemo, useState } from "react";
import { FallbackImage, SearchBox } from "@altterisk/game-hub";
import { useWeather } from "../data";
import { UnitIconLink } from "../components";
import type { WeatherEntry, WeatherHelp, WeatherRow, WeatherSource } from "../types";
import { gameName, getLang, altName, useL } from "../i18n";

interface EffectMeta {
  label: string;
  note: string;
}

const EFFECTS: Record<number, { en: EffectMeta; ja: EffectMeta }> = {
  1: {
    en: { label: "Movement speed", note: "How fast the affected side moves. Higher is faster." },
    ja: { label: "移動速度", note: "影響を受ける側の移動の速さ。大きいほど速い。" },
  },
  2: {
    en: { label: "Range", note: "Attack range of the affected side." },
    ja: { label: "射程", note: "影響を受ける側の攻撃射程。" },
  },
  3: {
    en: { label: "UP recovery interval", note: "Time between UP ticks. A lower number means UP comes in faster." },
    ja: { label: "コスト回復間隔", note: "コストが回復する間隔。小さいほど早く回復する。" },
  },
  4: {
    en: { label: "ATK", note: "Attack power of the affected side." },
    ja: { label: "攻撃力", note: "影響を受ける側の攻撃力。" },
  },
  5: {
    en: { label: "Movement speed", note: "How fast the affected side moves. Higher is faster." },
    ja: { label: "移動速度", note: "影響を受ける側の移動の速さ。大きいほど速い。" },
  },
};

// The category a weather belongs to, for the units that carry a weather resist.
const FAMILIES: Record<number, { en: string; ja: string }> = {
  1: { en: "Blizzard", ja: "吹雪" },
  2: { en: "Storm / rain / heat", ja: "嵐・雨・暑さ" },
  3: { en: "Mist / wind / torrent", ja: "霧・風・激流" },
};

function effectMeta(id: number): EffectMeta {
  return EFFECTS[id]?.[getLang()] || { label: `effect ${id}`, note: "" };
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
  return (
    <FallbackImage
      className="wx-banner"
      srcs={[`${import.meta.env.BASE_URL}weather-icon/${id}.png`]}
      alt={name || `weather ${id}`}
      missing={null}
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
  const L = useL();
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

  const helpByWeather = useMemo(() => {
    const map = new Map<string, WeatherHelp>();
    for (const h of data?.help || []) for (const n of h.weathers) map.set(n, h);
    return map;
  }, [data]);
  const unmatchedHelp = (data?.help || []).filter((h) => !h.weathers.length);

  if (!data) return <p className="loading">{L("Loading weather…", "天候を読み込み中…")}</p>;

  const sideRows = (w: WeatherEntry, target: number) =>
    w.rows.filter((r) => r.target === target && !isNoOp(r));

  return (
    <div className="weather-page">
      <h2>{L("Weather", "天候")}</h2>
      <p className="muted">
        {L("Weather (天候) covers the whole battlefield and hits both sides at once — the enemies as well as your own units. Every banner below reads 悪天候, bad weather, except", "天候は戦場全体を覆い、敵と味方の両方に影響します。下のバナーはすべて「悪天候」ですが、")}{" "}
        <b>IceLightning</b>{L(": the only one the game calls plain 天候, and the only one that leaves your units alone.", " だけは「天候」と表示され、味方には影響しません。")}
      </p>

      <div className="toolbar">
        <SearchBox placeholder={L("Search id / name", "ID・名前で検索")} value={q} onChange={setQ} />
        <select value={effect} onChange={(e) => setEffect(e.target.value)}>
          <option value="all">{L("any effect", "すべての効果")}</option>
          {[1, 2, 3, 4].map((id) => (
            <option key={id} value={String(id)}>
              {effectMeta(id).label}
            </option>
          ))}
        </select>
        <span className="count">{L("{n} weathers", "{n} 種", { n: weathers.length })}</span>
      </div>

      <table className="grid wx-table">
        <thead>
          <tr>
            <th className="wx-col-id">id</th>
            <th>{L("Weather", "天候")}</th>
            <th>{L("Resist family", "耐性の系統")}</th>
            <th>{L("Enemies", "敵")}</th>
            <th>{L("Your units", "味方")}</th>
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
                    <span className="badge sky wx-badge">{L("skill", "スキル")}</span>
                  )}
                </div>
                {helpByWeather.get(w.name || "") && <HelpText help={helpByWeather.get(w.name || "")!} />}
              </td>
              <td className="muted">
                {w.specialty.map((s) => FAMILIES[s]?.[getLang()] || `family ${s}`).join(", ") || "—"}
              </td>
              <td><Chips rows={sideRows(w, 1)} /></td>
              <td><Chips rows={sideRows(w, 2)} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {unmatchedHelp.length > 0 && (
        <section className="wx-panel">
          <h3>{L("Other in-game help pages about weather", "その他の天候のヘルプ")}</h3>
          <p className="muted small">
            {L("The game's help also describes these weathers; their names are not tied to a weather id in the data.", "ゲーム内ヘルプにある天候ですが、データ上で天候IDとの対応がありません。")}
          </p>
          <div className="wx-help-list">
            {unmatchedHelp.map((h) => <HelpText key={h.title} help={h} withTitle />)}
          </div>
        </section>
      )}

      {data.sources.length > 0 && (
        <section className="wx-panel">
          <h3>{L("Weather from a unit skill", "ユニットのスキルによる天候")}</h3>
          <p className="muted small">
            {L("The skill overwrites whatever weather the stage was running, and that weather does not come back when the skill ends.", "スキルはステージの天候を上書きし、スキル終了後も元の天候には戻りません。")}
          </p>
          <table className="grid wx-source-table">
            <thead>
              <tr><th>{L("Unit", "ユニット")}</th><th>{L("Skill", "スキル")}</th><th>{L("Weather", "天候")}</th></tr>
            </thead>
            <tbody>
              {data.sources.map((s, i) => (
                <tr key={i}>
                  <td><UnitIconLink id={s.unit} name={gameName(s.unit_name_en, s.unit_name)} /></td>
                  <td>
                    {gameName(s.skill_en, s.skill)}
                    {altName(s.skill_en, s.skill) && (
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

// the game's own help text for a weather (Japanese, as shipped)
function HelpText({ help, withTitle }: { help: WeatherHelp; withTitle?: boolean }) {
  return (
    <div className="wx-help" lang="ja">
      {withTitle && <b>{help.title}</b>}
      {!withTitle && <span className="muted small">{help.title}</span>}
      {help.match === "effect" && (
        <span className="muted small" lang="en">
          {" "}{getLang() === "ja" ? "(アイコンと効果から対応)" : "(matched by icon and effects)"}
        </span>
      )}
      <ul>
        {help.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
          .reduce<string[]>((acc, line) => {
            // a line that does not start a bullet continues the previous one
            if (line.startsWith("・") || line.startsWith("※") || !acc.length) acc.push(line);
            else acc[acc.length - 1] += line;
            return acc;
          }, [])
          .map((line, i) => <li key={i}>{line.replace(/^・/, "")}</li>)}
      </ul>
    </div>
  );
}
