import { describe, expect, it } from 'vitest';
import { routes } from './routes';
import {
  accountPages, mobilePrimaryPages, workspaceGroupOf, workspaceLabel, workspaceNavGroups, workspacePages,
  workspaceShortLabel,
} from './workspace-navigation';

describe('Reid workspace information architecture', () => {
  const grouped = workspaceNavGroups.flatMap(group => group.pages);

  it('opens on the overview, with the agent team in the first group', () => {
    expect(workspaceNavGroups[0].id).toBe('center');
    expect(workspaceNavGroups[0].pages).toEqual(['owner', 'today']);
  });

  it('offers every authenticated destination exactly once', () => {
    expect(new Set(workspacePages).size).toBe(workspacePages.length);
    const authenticated = routes.filter(route => route.authenticated).map(route => route.page);
    expect([...workspacePages].sort()).toEqual(authenticated.sort());
    expect(accountPages).toEqual(['profile']);
  });

  it('keeps the core company workflow in the mobile navigation', () => {
    expect(mobilePrimaryPages).toHaveLength(6);
    expect(mobilePrimaryPages).toContain('crm');
    expect(mobilePrimaryPages).toContain('workspace');
    expect(mobilePrimaryPages).not.toContain('assistant');
    expect(mobilePrimaryPages.every(page => grouped.includes(page))).toBe(true);
  });

  it('uses clear labels in both languages, short ones on the phone', () => {
    expect(workspaceLabel('assistant', 'ar')).toBe('ريّد');
    expect(workspaceLabel('dashboard', 'en')).toBe('System & AI');
    expect(workspaceLabel('operations', 'ar')).toBe('الطلبات');
    expect(workspaceShortLabel('operations', 'ar')).toBe('الطلبات');
    expect(workspaceShortLabel('projects', 'en')).toBe('Work');
  });

  it('knows which group a page belongs to', () => {
    expect(workspaceGroupOf('crm')?.id).toBe('work');
    expect(workspaceGroupOf('profile')).toBeUndefined();
  });
});
