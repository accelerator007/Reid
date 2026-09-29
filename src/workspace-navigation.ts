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
  { id: 'center', label: { ar: 'الرئيسية', en: 'Home' }, pages: ['owner', 'today', 'assistant'] },
  { id: 'work', label: { ar: 'العمل', en: 'Work' }, pages: ['operations', 'projects', 'crm', 'research', 'workshops'] },
  { id: 'company', label: { ar: 'الشركة', en: 'Company' }, pages: ['workspace', 'inbox'] },
  { id: 'administration', label: { ar: 'الإدارة', en: 'Administration' }, pages: ['dashboard', 'forms', 'admin', 'connections'] },
] as const;

/** Pinned below the groups, next to sign-out. */
export const accountPages: readonly Page[] = ['profile'];

/** The phone's bottom bar; everything else lives in the drawer behind "More". */
export const mobilePrimaryPages: readonly Page[] = ['owner', 'today', 'assistant', 'operations', 'projects'];

const labels: Partial<Record<Page, { ar: string; en: string }>> = {
  owner: { ar: 'نظرة عامة', en: 'Overview' },
  today: { ar: 'يومي', en: 'My day' },
  assistant: { ar: 'فريق الوكلاء', en: 'Agent team' },
  operations: { ar: 'المهام والطلبات', en: 'Tasks & requests' },
  projects: { ar: 'المشاريع', en: 'Projects' },
  crm: { ar: 'العملاء', en: 'Clients' },
  research: { ar: 'الأبحاث', en: 'Research' },
  workshops: { ar: 'الورش', en: 'Workshops' },
  workspace: { ar: 'الفريق', en: 'People' },
  inbox: { ar: 'محادثات واتساب', en: 'WhatsApp inbox' },
  dashboard: { ar: 'إدارة الوكلاء', en: 'Agent management' },
  forms: { ar: 'النماذج', en: 'Forms' },
  admin: { ar: 'الحسابات والصلاحيات', en: 'Accounts & access' },
  connections: { ar: 'الاتصالات', en: 'Connections' },
  profile: { ar: 'حسابي', en: 'My account' },
};

/** Short labels for the phone's bottom bar, where space is tight. */
const shortLabels: Partial<Record<Page, { ar: string; en: string }>> = {
  owner: { ar: 'الرئيسية', en: 'Home' },
  assistant: { ar: 'الوكلاء', en: 'Agents' },
  operations: { ar: 'المهام', en: 'Tasks' },
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
