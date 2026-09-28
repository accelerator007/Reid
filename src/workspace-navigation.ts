import type { Page } from './routes';

export type WorkspaceNavGroup={
  id:'center'|'intelligence'|'work'|'people'|'administration';
  label:{ar:string;en:string};
  pages:readonly Page[];
};

// One ordered map drives the desktop sidebar, mobile drawer and command
// launcher. Route permissions still come from routes.ts and are filtered by
// useNavigation before anything is shown.
export const workspaceNavGroups:readonly WorkspaceNavGroup[]=[
  {id:'center',label:{ar:'المركز',en:'Center'},pages:['owner','today']},
  {id:'intelligence',label:{ar:'فريق الذكاء',en:'AI team'},pages:['assistant','dashboard']},
  {id:'work',label:{ar:'العمل',en:'Work'},pages:['projects','operations','crm','research','workshops']},
  {id:'people',label:{ar:'التواصل والفريق',en:'Communication & people'},pages:['inbox','workspace']},
  {id:'administration',label:{ar:'الإدارة والإعدادات',en:'Administration'},pages:['admin','connections','profile']},
] as const;

export const mobilePrimaryPages:readonly Page[]=['owner','today','assistant','projects'];

export function workspaceLabel(page:Page,lang:'ar'|'en'){
  const labels:Partial<Record<Page,{ar:string;en:string}>>={
    owner:{ar:'مركز المالك',en:'Owner center'},today:{ar:'يومي',en:'My day'},
    assistant:{ar:'غرفة فريق الوكلاء',en:'Agent team room'},dashboard:{ar:'إدارة الوكلاء',en:'Agent management'},
    projects:{ar:'المشاريع',en:'Projects'},operations:{ar:'المهام والطلبات',en:'Tasks & requests'},
    crm:{ar:'العملاء والمبيعات',en:'CRM & sales'},research:{ar:'الأبحاث',en:'Research'},workshops:{ar:'الورشات',en:'Workshops'},
    inbox:{ar:'محادثات واتساب',en:'WhatsApp inbox'},workspace:{ar:'الفريق',en:'People'},
    admin:{ar:'الحسابات والصلاحيات',en:'Accounts & access'},connections:{ar:'الاتصالات والتكاملات',en:'Connections'},
    profile:{ar:'حسابي',en:'My account'},
  };
  return labels[page]?.[lang]||page;
}
