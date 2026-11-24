import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { SegmentedButtons, SiteShell, homeLink } from "@altterisk/game-hub";
import { LIST_META } from "./meta";
import { usePageMeta } from "./usePageMeta";
import { LANGS, hubLabels, setLang, useL, useLang, type Lang } from "./i18n";
import { ChangelogDialog } from "./pages/Changelog";

function LanguagePicker() {
  const L = useL();
  const lang = useLang();
  return (
    <SegmentedButtons className="lang-picker" label={L("Language", "言語")} options={LANGS} selected={lang}
      onToggle={(v) => setLang(v as Lang)} />
  );
}

export default function App() {
  // list pages here; detail pages and NotFound call usePageMeta themselves
  const { pathname } = useLocation();
  usePageMeta(LIST_META[pathname.replace(/\/$/, "")] ?? null);
  const L = useL();
  const hub = hubLabels(useLang());
  // contained={false}: pages render straight into <main>, which styles.css sizes
  return (
    <SiteShell
      game="aigis"
      logo={<img src="/logo.png" alt="" />}
      renderHomeLink={homeLink(Link, "to")}
      nav={
        <>
          <NavLink to="/units">{L("Units", "ユニット")}</NavLink>
          <NavLink to="/prince">{L("Prince", "王子")}</NavLink>
          <NavLink to="/collection">{L("Collection", "所持")}</NavLink>
          <NavLink to="/enemies">{L("Enemies", "敵")}</NavLink>
          <NavLink to="/stages">{L("Stages", "ステージ")}</NavLink>
          <NavLink to="/story">{L("Story", "ストーリー")}</NavLink>
          <NavLink to="/buffs">{L("Buffs", "バフ")}</NavLink>
          <NavLink to="/costgen">{L("Cost Gen", "コスト回復")}</NavLink>
          <NavLink to="/dps">DPS</NavLink>
          <NavLink to="/team">{L("Team", "編成")}</NavLink>
          <NavLink to="/weather">{L("Weather", "天候")}</NavLink>
        </>
      }
      actions={<LanguagePicker />}
      barLabels={hub.bar}
      errorLabels={hub.error}
      skipLabel={hub.skip}
      footer={{
        links: [
          { label: L("What's new", "更新情報"), href: "/changelog" },
          { label: L("Source on GitHub", "ソース (GitHub)"), href: "https://github.com/Altterisk/Aigis-Enemy" },
          { label: L("Portfolio", "ポートフォリオ"), href: "https://altterisk.github.io/portfolio/" },
          { label: "Ko-fi", href: "https://ko-fi.com/altterisk" },
        ],
        labels: hub.footer,
      }}
      resetKey={pathname}
      contained={false}
    >
      <Outlet />
      <ChangelogDialog />
    </SiteShell>
  );
}
