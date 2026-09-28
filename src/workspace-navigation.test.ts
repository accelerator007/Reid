import {describe,expect,it} from 'vitest';
import {mobilePrimaryPages,workspaceLabel,workspaceNavGroups} from './workspace-navigation';

describe('Reid OS information architecture',()=>{
  const pages=workspaceNavGroups.flatMap(group=>group.pages);

  it('places the agent team immediately after the center',()=>{
    expect(workspaceNavGroups.map(group=>group.id).slice(0,2)).toEqual(['center','intelligence']);
    expect(workspaceNavGroups[1].pages[0]).toBe('assistant');
  });

  it('offers every workspace destination exactly once',()=>{
    expect(new Set(pages).size).toBe(pages.length);
    expect(pages).toEqual(expect.arrayContaining([
      'owner','today','assistant','dashboard','projects','operations','crm','research','workshops',
      'inbox','workspace','admin','connections','profile',
    ]));
  });

  it('keeps the agent room in mobile primary navigation',()=>{
    expect(mobilePrimaryPages).toContain('assistant');
  });

  it('uses clear task-oriented labels in both languages',()=>{
    expect(workspaceLabel('assistant','ar')).toBe('غرفة فريق الوكلاء');
    expect(workspaceLabel('dashboard','en')).toBe('Agent management');
    expect(workspaceLabel('operations','ar')).toBe('المهام والطلبات');
  });
});
