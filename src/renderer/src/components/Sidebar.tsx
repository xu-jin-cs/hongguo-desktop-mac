import type { ReactElement } from 'react';
import { navigate, type RouteName } from '../router';
import { BookmarkIcon, GridIcon, HomeIcon, SearchIcon, TrophyIcon } from './Icons';

interface NavDef {
  key: RouteName;
  label: string;
  hash: string;
  testid: string;
  Icon: (p: { size?: number; className?: string }) => ReactElement;
}

const NAV: NavDef[] = [
  { key: 'home', label: '首页', hash: '#/home', testid: 'nav-home', Icon: HomeIcon },
  { key: 'category', label: '分类', hash: '#/category', testid: 'nav-category', Icon: GridIcon },
  { key: 'rank', label: '排行', hash: '#/rank', testid: 'nav-rank', Icon: TrophyIcon },
  { key: 'search', label: '搜索', hash: '#/search', testid: 'nav-search', Icon: SearchIcon },
  { key: 'library', label: '收藏/历史', hash: '#/library', testid: 'nav-library', Icon: BookmarkIcon },
];

/** 侧栏导航项（testid 字面量注入，机械门禁/冒烟可静态提取） */
function NavItem({
  def,
  active,
  offline,
}: {
  def: NavDef;
  active: boolean;
  offline: boolean;
}) {
  const { key, label, hash, Icon } = def;
  const disabled = offline && key !== 'library';
  const cls = `nav-item${active ? ' is-active' : ''}`;
  const onClick = () => navigate(hash);
  const icon = <Icon size={18} className="nav-icon" />;
  // 五项分支写字面量 data-testid（动态属性无法被 testid_diff 静态提取）
  switch (def.testid) {
    case 'nav-home':
      return (
        <button type="button" className={cls} data-testid="nav-home" disabled={disabled} onClick={onClick}>
          {icon}
          {label}
        </button>
      );
    case 'nav-category':
      return (
        <button type="button" className={cls} data-testid="nav-category" disabled={disabled} onClick={onClick}>
          {icon}
          {label}
        </button>
      );
    case 'nav-rank':
      return (
        <button type="button" className={cls} data-testid="nav-rank" disabled={disabled} onClick={onClick}>
          {icon}
          {label}
        </button>
      );
    case 'nav-search':
      return (
        <button type="button" className={cls} data-testid="nav-search" disabled={disabled} onClick={onClick}>
          {icon}
          {label}
        </button>
      );
    default:
      return (
        <button type="button" className={cls} data-testid="nav-library" disabled={disabled} onClick={onClick}>
          {icon}
          {label}
        </button>
      );
  }
}

/** 侧栏导航（ui_spec §6.1：w200 / 项高44 / 选中 3px 指示条 accent/bright） */
export function Sidebar({ active, offline }: { active: RouteName; offline: boolean }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-dot">HG</span>
        <span className="brand-name">红果短剧</span>
      </div>
      {NAV.map((def) => (
        <NavItem key={def.key} def={def} active={active === def.key} offline={offline} />
      ))}
    </aside>
  );
}
