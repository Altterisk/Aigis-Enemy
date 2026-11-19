// /prince -- the Prince (CardID 1) and every title that changes him.
//
// Data model: data/prince_titles.json (python/aigis/prince.py). A title with a
// `card` turns the Prince into that card; titles sharing a group are the
// levels of one emblem. The rest are stat titles (HP/ATK/DEF/skill bonus).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SearchBox } from "@altterisk/game-hub";
import { usePrinceTitles } from "../data";
import { UnitImage } from "../components";
import {
  PRINCE_ID, conditionEn, explanEn, familyName, familyTitle, princeFamilies,
  type PrinceFamily,
} from "../prince";
import type { PrinceTitle } from "../types";
import { gameName, useL } from "../i18n";

function Condition({ t }: { t: PrinceTitle }) {
  if (!t.condition) return <span className="muted">—</span>;
  const en = conditionEn(t.condition);
  return <span title={t.condition}>{en || t.condition}</span>;
}

function Explan({ t }: { t: PrinceTitle }) {
  const en = explanEn(t);
  return <span title={t.explan}>{en || t.explan}</span>;
}

function FormCard({ f }: { f: PrinceFamily }) {
  const L = useL();
  const limited = f.first.condition === "期間限定";
  return (
    <article className="prince-form">
      <Link to={`/units/${f.first.card}`} className="prince-form-head">
        <UnitImage kind="icon" id={f.first.card!} className="unit-icon-thumb" alt="" />
        <div className="prince-form-names">
          <div className="prince-form-name">{familyName(f)}</div>
          <div className="muted small">{familyTitle(f)}</div>
          {limited && <span className="badge prince-limited">{L("limited", "期間限定")}</span>}
        </div>
      </Link>
      <ol className="prince-levels">
        {f.rows.map((r) => (
          <li key={r.card}>
            <Link to={`/units/${r.card}`} className="prince-level-link">
              {f.rows.length > 1 ? `Lv${r.level}` : L("Form", "形態")}
            </Link>
            <span className="prince-level-text"><Explan t={r} /></span>
          </li>
        ))}
      </ol>
      {!limited && f.first.condition && (
        <div className="prince-cond muted small"><Condition t={f.first} /></div>
      )}
    </article>
  );
}

export default function Prince() {
  const data = usePrinceTitles();
  const [q, setQ] = useState("");
  const L = useL();
  const { forms, stats } = useMemo(
    () => (data ? princeFamilies(data) : { forms: [], stats: [] }),
    [data]
  );
  // newest emblem family first, like the unit list
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...forms]
      .reverse()
      .filter((f) => !term || f.rows.some((r) =>
        [r.title, r.card_name, r.card_name_en, String(r.card)]
          .some((s) => s && s.toLowerCase().includes(term))));
  }, [forms, q]);

  if (!data) return <p className="loading">{L("Loading Prince titles…", "王子の称号を読み込み中…")}</p>;
  const cardCount = forms.reduce((n, f) => n + f.rows.length, 0);
  const base = data.base;

  return (
    <div className="prince-page">
      <h2>{L("Prince", "王子")}</h2>
      <p className="muted">
        {L("The Prince is the player character. Equipping a title emblem turns him into another card with its own class, skills, abilities and stats; each emblem upgrade (Lv2–Lv4) is a separate card. {f} title forms, {c} cards.", "王子はプレイヤーキャラクターです。称号の紋章を装備すると、クラス・スキル・アビリティ・ステータスが異なる別のカードになります。紋章の強化 (Lv2〜Lv4) はそれぞれ別のカードです。称号の形態 {f} 種、カード {c} 枚。", { f: forms.length, c: cardCount })}
      </p>

      <Link to={`/units/${PRINCE_ID}`} className="enemy-tile unit-tile prince-base">
        <UnitImage kind="icon" id={PRINCE_ID} className="unit-icon-thumb" alt="" />
        <div className="enemy-tile-body unit-tile-body">
          <div className="unit-tile-name">{gameName(base.name_en, base.name) || L("Prince", "王子")} — {L("no title", "称号なし")}</div>
          <div className="muted small">#{PRINCE_ID} · {L("base stats, skills, quotes and art", "基本のステータス・スキル・台詞・イラスト")}</div>
        </div>
      </Link>

      <h3>{L("Title forms", "称号の形態")}</h3>
      <div className="toolbar">
        <SearchBox placeholder={L("Search name / title / id", "名前・称号・IDで検索")} value={q} onChange={setQ} />
        <span className="count">{L("{n} forms", "{n} 種", { n: shown.length })}</span>
      </div>
      {shown.length === 0 && <p className="muted">{L("No title matches.", "該当する称号がありません。")}</p>}
      <div className="prince-grid">
        {shown.map((f) => <FormCard key={f.group} f={f} />)}
      </div>

      {stats.length > 0 && (
        <>
          <h3>{L("Stat titles", "ステータス称号")}</h3>
          <p className="muted small">{L("Titles that keep the base Prince and add a bonus.", "王子の姿のまま能力を上げる称号。")}</p>
          <table className="grid prince-stat-table">
            <thead>
              <tr><th>{L("Title", "称号")}</th><th>{L("Effect", "効果")}</th><th>{L("Unlock", "解放条件")}</th></tr>
            </thead>
            <tbody>
              {stats.map((t) => (
                <tr key={`${t.group}-${t.level}`}>
                  <td>{t.title}</td>
                  <td><Explan t={t} /></td>
                  <td><Condition t={t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
