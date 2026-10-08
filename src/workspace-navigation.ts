import type { Page } from './routes';

export type WorkspaceNavGroup = {
  id: 'center' | 'work' | 'company' | 'administration';
  label: { ar: string; en: string };
  pages: readonly Page[];
};

// One ordered map drives the desktop sidebar, the mobile drawer, the bottom
// bar and the command menu. Route permissions still come from routes.ts and
// are filtered by useNavigation before anything is shown, so a role never sees
// a destination the gate would refuse.
export const workspaceNavGroups: readonly WorkspaceNavGroup[] = [
  { id: 'center', label: { ar: 'ابدأ', en: 'Start' }, pages: ['owner', 'today'] },
  { id: 'work', label: { ar: 'العمل', en: 'Work' }, pages: ['projects', 'assistant', 'inbox'] },
  { id: 'company', label: { ar: 'كل الأدوات', en: 'All tools' }, pages: ['crm', 'operations', 'workspace', 'research', 'workshops', 'forms'] },
  { id: 'administration', label: { ar: 'الإدارة', en: 'Administration' }, pages: ['admin', 'connections', 'dashboard'] },
] as const;

/** The deliberately small everyday sidebar. Everything else stays searchable. */
export const primaryWorkspacePages: readonly Page[] = ['owner', 'today', 'projects', 'assistant', 'inbox', 'admin'];
export const moreWorkspacePages: readonly Page[] = ['crm', 'operations', 'workspace', 'research', 'workshops', 'forms', 'connections', 'dashboard'];

/** Pinned below the groups, next to sign-out. */
export const accountPages: readonly Page[] = ['profile'];

/** The phone's bottom bar; everything else lives in the drawer behind "More". */
export const mobilePrimaryPages: readonly Page[] = ['owner', 'today', 'projects', 'assistant', 'inbox'];

const labels: Partial<Record<Page, { ar: string; en: string }>> = {
  owner: { ar: 'الرئيسية', en: 'Home' },
  today: { ar: 'الرئيسية', en: 'Home' },
  assistant: { ar: 'ريّد', en: 'Reid' },
  operations: { ar: 'الطلبات', en: 'Requests' },
  projects: { ar: 'العمل', en: 'Work' },
  crm: { ar: 'العملاء', en: 'Clients' },
  research: { ar: 'الأبحاث', en: 'Research' },
  workshops: { ar: 'الورش', en: 'Workshops' },
  workspace: { ar: 'فريق الشركة', en: 'Company team' },
  inbox: { ar: 'واتساب', en: 'WhatsApp' },
  dashboard: { ar: 'إعداد الوكلاء', en: 'Agent setup' },
  forms: { ar: 'النماذج', en: 'Forms' },
  admin: { ar: 'الإدارة', en: 'Administration' },
  connections: { ar: 'الربط والتكاملات', en: 'Connections' },
  profile: { ar: 'حسابي', en: 'My account' },
};

/** Short labels for the phone's bottom bar, where space is tight. */
const shortLabels: Partial<Record<Page, { ar: string; en: string }>> = {
  owner: { ar: 'الرئيسية', en: 'Home' },
  assistant: { ar: 'ريّد', en: 'Reid' },
  operations: { ar: 'الطلبات', en: 'Requests' },
};

export function workspaceLabel(page: Page, lang: 'ar' | 'en'): string {
  return labels[page]?.[lang] || page;
}

export function workspaceShortLabel(page: Page, lang: 'ar' | 'en'): string {
  return shortLabels[page]?.[lang] || workspaceLabel(page, lang);
}

export function workspaceGroupOf(page: Page): WorkspaceNavGroup | undefined {
  return workspaceNavGroups.find(group => group.pages.includes(page));
}

/** Every page that renders inside the authenticated shell. */
export const workspacePages: readonly Page[] = [...workspaceNavGroups.flatMap(group => group.pages), ...accountPages];
