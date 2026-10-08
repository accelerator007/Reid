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
    // Workshops is a public page that also carries the management view once
    // signed in, so it is the one shell destination without an auth route.
    expect([...workspacePages].sort()).toEqual([...authenticated, 'workshops'].sort());
    expect(accountPages).toEqual(['profile']);
  });

  it('keeps the phone bar to five destinations including the agents', () => {
    expect(mobilePrimaryPages).toHaveLength(5);
    expect(mobilePrimaryPages).toContain('assistant');
    expect(mobilePrimaryPages.every(page => grouped.includes(page))).toBe(true);
  });

  it('uses clear labels in both languages, short ones on the phone', () => {
    expect(workspaceLabel('assistant', 'ar')).toBe('ريّد');
    expect(workspaceLabel('dashboard', 'en')).toBe('Agent setup');
    expect(workspaceLabel('operations', 'ar')).toBe('الطلبات');
    expect(workspaceShortLabel('operations', 'ar')).toBe('الطلبات');
    expect(workspaceShortLabel('projects', 'en')).toBe('Work');
  });

  it('knows which group a page belongs to', () => {
    expect(workspaceGroupOf('crm')?.id).toBe('company');
    expect(workspaceGroupOf('profile')).toBeUndefined();
  });
});
