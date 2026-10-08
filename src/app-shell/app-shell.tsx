// The authenticated workspace frame: sidebar, top bar, phone bottom bar and
// the command menu. It owns layout and navigation only. Pages render inside
// it unchanged, and permissions still come from routes.ts via useNavigation.
import React from 'react';
import {
  Bot, CalendarCheck, CircleUserRound, ClipboardList, FilePlus2, FlaskConical, FolderKanban, GraduationCap, Handshake, House, ListChecks,
  LogOut, Menu, MessageCircle, Moon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plug, Plus, Search,
  ShieldCheck, Sparkles, Sun, UsersRound, X,
} from 'lucide-react';
import type { Page } from '../routes';
import type { useNavigation } from '../shell';
import {
  accountPages, mobilePrimaryPages, moreWorkspacePages, primaryWorkspacePages, workspaceGroupOf, workspaceLabel, workspaceNavGroups, workspaceShortLabel,
} from '../workspace-navigation';
import { CommandMenu, type CommandItem } from './command-menu';
import { Kbd } from '../ui';
import './app-shell.css';

type Lang = 'ar' | 'en';
type Navigation = ReturnType<typeof useNavigation>;

export const pageIcons: Partial<Record<Page, React.ReactNode>> = {
  owner: <House />, today: <CalendarCheck />, assistant: <Sparkles />,
  operations: <ListChecks />, projects: <FolderKanban />, crm: <Handshake />, research: <FlaskConical />,
  workshops: <GraduationCap />, workspace: <UsersRound />, inbox: <MessageCircle />,
  dashboard: <Bot />, forms: <ClipboardList />, admin: <ShieldCheck />, connections: <Plug />, profile: <CircleUserRound />,
};

const COLLAPSE_KEY = 'reid-nav-collapsed';
const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
};

type ShellProps = {
  lang: Lang;
  page: Page;
  navigation: Navigation;
  userName: string;
  dark: boolean;
  logo: string;
  go: (page: Page) => void;
  toggleDark: () => void;
  toggleLang: () => void;
  signOut: () => void;
  children: React.ReactNode;
};

export function AppShell({ lang, page, navigation, userName, dark, logo, go, toggleDark, toggleLang, signOut, children }: ShellProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(readCollapsed);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const allowed = React.useMemo(() => new Set<Page>(navigation.map(route => route.page)), [navigation]);
  const rtl = lang === 'ar';

  React.useEffect(() => { setDrawerOpen(false); setCommandOpen(false); setCreateOpen(false); }, [page]);
  React.useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* per-viewer convenience only */ }
  }, [collapsed]);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(open => !open);
      } else if (event.key === 'Escape') {
        setDrawerOpen(false);
        setCreateOpen(false);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const navigate = (target: Page) => { setDrawerOpen(false); go(target); };
  const openPath = (target: Page, path: string) => {
    setCreateOpen(false);
    go(target);
    history.replaceState({}, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
  };
  const quick = [
    { page: 'projects' as Page, path: '/projects?new=project', icon: <FolderKanban />, ar: 'مشروع جديد', en: 'New project' },
    { page: 'operations' as Page, path: '/operations?new=request', icon: <ListChecks />, ar: 'طلب أو مهمة', en: 'Task or request' },
    { page: 'crm' as Page, path: '/crm?new=lead', icon: <Handshake />, ar: 'عميل أو فرصة', en: 'Client or lead' },
    { page: 'assistant' as Page, path: '/assistant?focus=compose', icon: <Sparkles />, ar: 'تكليف ريّد', en: 'Brief Reid' },
    { page: 'forms' as Page, path: '/forms?new=form', icon: <FilePlus2 />, ar: 'نموذج', en: 'Form' },
  ].filter(item => allowed.has(item.page));
  const commands: CommandItem[] = workspaceNavGroups.flatMap(group =>
    group.pages.filter(target => allowed.has(target)).map(target => ({
      id: target, label: workspaceLabel(target, lang), group: group.label[lang], icon: pageIcons[target],
    })),
  ).concat(accountPages.filter(target => allowed.has(target)).map(target => ({
    id: target, label: workspaceLabel(target, lang), group: lang === 'ar' ? 'الحساب' : 'Account', icon: pageIcons[target],
  })));
  const group = workspaceGroupOf(page);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="shell" data-collapsed={collapsed} data-drawer={drawerOpen}>
      <a className="shell-skip" href="#shell-content">{rtl ? 'تخطَّ إلى المحتوى' : 'Skip to content'}</a>
      <Sidebar
        lang={lang} page={page} allowed={allowed} logo={logo} userName={userName} collapsed={collapsed}
        toggleCollapsed={() => setCollapsed(value => !value)} navigate={navigate} signOut={signOut} openTools={() => setCommandOpen(true)}
      />
      {drawerOpen && <button type="button" className="shell-scrim" aria-label={rtl ? 'إغلاق القائمة' : 'Close menu'} onClick={() => setDrawerOpen(false)} />}
      <div className="shell-main">
        <div className="shell-topbar" role="banner">
          <button type="button" className="shell-topbar__menu ui-icon-button" aria-label={rtl ? 'القائمة' : 'Menu'} aria-expanded={drawerOpen} onClick={() => setDrawerOpen(open => !open)}>
            {drawerOpen ? <X /> : <Menu />}
          </button>
          <div className="shell-topbar__title">
            {group && <span className="shell-topbar__group">{group.label[lang]}</span>}
            <strong>{workspaceLabel(page, lang)}</strong>
          </div>
          <button type="button" className="shell-search" onClick={() => setCommandOpen(true)}>
            <Search aria-hidden="true" />
            <span>{rtl ? 'ابحث أو انتقل…' : 'Search or jump to…'}</span>
            <Kbd>{mac ? '⌘' : 'Ctrl'} K</Kbd>
          </button>
          <div className="shell-topbar__tools">
            {!!quick.length && <div className="shell-create">
              <button type="button" className="shell-create__button" aria-expanded={createOpen} onClick={() => setCreateOpen(value => !value)}>
                <Plus aria-hidden="true" /><span>{rtl ? 'إنشاء' : 'Create'}</span>
              </button>
              {createOpen && <div className="shell-create__menu" role="menu" aria-label={rtl ? 'إنشاء جديد' : 'Create new'}>
                {quick.map(item => <button type="button" role="menuitem" key={item.path} onClick={() => openPath(item.page, item.path)}>{item.icon}<span>{rtl ? item.ar : item.en}</span></button>)}
              </div>}
            </div>}
            {allowed.has('assistant') && page !== 'assistant' && (
              <button type="button" className="shell-agents" onClick={() => go('assistant')}>
                <Sparkles aria-hidden="true" /><span>{rtl ? 'اسأل الفريق' : 'Ask the team'}</span>
              </button>
            )}
            <button type="button" className="ui-icon-button shell-search-icon" aria-label={rtl ? 'بحث' : 'Search'} onClick={() => setCommandOpen(true)}><Search /></button>
            <button type="button" className="ui-icon-button" aria-label={dark ? (rtl ? 'الوضع الفاتح' : 'Light mode') : (rtl ? 'الوضع الداكن' : 'Dark mode')} onClick={toggleDark}>
              {dark ? <Sun /> : <Moon />}
            </button>
            <button type="button" className="ui-icon-button shell-lang" aria-label={rtl ? 'English' : 'العربية'} onClick={toggleLang} lang={rtl ? 'en' : 'ar'}>
              {rtl ? 'EN' : 'ع'}
            </button>
          </div>
        </div>
        <div className="shell-content" id="shell-content" tabIndex={-1}>{children}</div>
      </div>
      <BottomNav lang={lang} page={page} allowed={allowed} navigate={navigate} more={() => setDrawerOpen(true)} />
      <CommandMenu lang={lang} open={commandOpen} items={commands} close={() => setCommandOpen(false)} choose={id => navigate(id as Page)} />
    </div>
  );
}

type SidebarProps = {
  lang: Lang; page: Page; allowed: Set<Page>; logo: string; userName: string; collapsed: boolean;
  toggleCollapsed: () => void; navigate: (page: Page) => void; signOut: () => void; openTools: () => void;
};

function Sidebar({ lang, page, allowed, logo, userName, collapsed, toggleCollapsed, navigate, signOut, openTools }: SidebarProps) {
  const rtl = lang === 'ar';
  const navRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' });
  }, [page]);
  const CollapseIcon = rtl ? (collapsed ? PanelRightOpen : PanelRightClose) : (collapsed ? PanelLeftOpen : PanelLeftClose);
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('') || 'R';

  return (
    <aside className="shell-sidebar" aria-label={rtl ? 'التنقل الرئيسي' : 'Main navigation'}>
      <div className="shell-brand">
        <button type="button" className="shell-brand__home" onClick={() => navigate(allowed.has('owner') ? 'owner' : 'today')}>
          <img src={logo} alt="" aria-hidden="true" />
          <span className="shell-brand__text"><strong>{rtl ? 'ريّد' : 'Reid'}</strong><small>{rtl ? 'مساحة الشركة' : 'Company workspace'}</small></span>
        </button>
        <button type="button" className="shell-collapse" onClick={toggleCollapsed} aria-pressed={collapsed}
          aria-label={collapsed ? (rtl ? 'توسيع القائمة' : 'Expand menu') : (rtl ? 'تصغير القائمة' : 'Collapse menu')}>
          <CollapseIcon aria-hidden="true" />
        </button>
      </div>
      <div className="shell-nav" ref={navRef}>
        {workspaceNavGroups.map(group => {
          const pages = group.pages.filter(target => allowed.has(target) && primaryWorkspacePages.includes(target) && !(target === 'today' && allowed.has('owner')));
          if (!pages.length) return null;
          return (
            <div className="shell-nav__group" key={group.id} role="group" aria-label={group.label[lang]}>
              <span className="shell-nav__label">{group.label[lang]}</span>
              {pages.map(target => (
                <NavItem key={target} page={target} lang={lang} current={page === target} collapsed={collapsed} navigate={navigate}
                  highlight={target === 'assistant'} />
              ))}
            </div>
          );
        })}
        {moreWorkspacePages.some(target => allowed.has(target)) && <button type="button" className="shell-nav__item shell-nav__more" onClick={openTools}>
          <span className="shell-nav__icon" aria-hidden="true"><Menu /></span><span className="shell-nav__text">{rtl ? 'كل الأدوات' : 'All tools'}</span>
        </button>}
      </div>
      <div className="shell-account">
        {accountPages.filter(target => allowed.has(target)).map(target => (
          <button key={target} type="button" className="shell-account__profile" aria-current={page === target ? 'page' : undefined}
            onClick={() => navigate(target)} title={collapsed ? workspaceLabel(target, lang) : undefined}>
            <span className="shell-avatar" aria-hidden="true">{initials}</span>
            <span className="shell-account__text"><strong>{userName}</strong><small>{workspaceLabel(target, lang)}</small></span>
          </button>
        ))}
        <button type="button" className="shell-signout ui-icon-button" onClick={signOut} aria-label={rtl ? 'تسجيل الخروج' : 'Sign out'} title={rtl ? 'تسجيل الخروج' : 'Sign out'}>
          <LogOut />
        </button>
      </div>
    </aside>
  );
}

function NavItem({ page, lang, current, collapsed, navigate, highlight }: {
  page: Page; lang: Lang; current: boolean; collapsed: boolean; navigate: (page: Page) => void; highlight?: boolean;
}) {
  const label = workspaceLabel(page, lang);
  return (
    <button type="button" className={`shell-nav__item${highlight ? ' shell-nav__item--agents' : ''}`}
      aria-current={current ? 'page' : undefined} onClick={() => navigate(page)} title={collapsed ? label : undefined}>
      <span className="shell-nav__icon" aria-hidden="true">{pageIcons[page]}</span>
      <span className="shell-nav__text">{label}</span>
    </button>
  );
}

function BottomNav({ lang, page, allowed, navigate, more }: { lang: Lang; page: Page; allowed: Set<Page>; navigate: (page: Page) => void; more: () => void }) {
  // Owners see "Home" as the overview; everyone else's home is their day.
  const pages = mobilePrimaryPages.filter(target => allowed.has(target) && !(target === 'today' && allowed.has('owner'))).slice(0, 4);
  return (
    <nav className="shell-bottom-nav" aria-label={lang === 'ar' ? 'التنقل السريع' : 'Quick navigation'}>
      {pages.map(target => (
        <button key={target} type="button" aria-current={page === target ? 'page' : undefined} onClick={() => navigate(target)}>
          <span aria-hidden="true">{target === 'today' ? <House /> : pageIcons[target]}</span>
          <small>{target === 'today' ? (lang === 'ar' ? 'الرئيسية' : 'Home') : workspaceShortLabel(target, lang)}</small>
        </button>
      ))}
      <button type="button" onClick={more}>
        <span aria-hidden="true"><Menu /></span>
        <small>{lang === 'ar' ? 'المزيد' : 'More'}</small>
      </button>
    </nav>
  );
}
