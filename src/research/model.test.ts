import { describe, it, expect } from 'vitest';
import {
  canManageResearch,
  researchStatuses,
  taskColumns,
  experimentStatuses,
  ethicsStatuses,
  publicationStatuses,
  sensitivities,
  tabs,
  doiPattern,
  tr,
  type Research,
  type Member,
} from './model';

describe('research model domain rules', () => {
  it('correctly grants admin all supervisor privileges', () => {
    const research: Research = {
      id: 'res-1',
      title: 'AI Robotics',
      abstract: 'Autonomous systems',
      field: 'Robotics',
      status: 'active',
      supervisor_id: 'user-supervisor',
      is_public: true,
      ethics_status: 'approved',
      doi: null,
      conference: null,
      funding_source: null,
      start_date: null,
      target_date: null,
      archived_at: null,
    };

    const perms = canManageResearch('user-admin', research, [], ['admin']);
    expect(perms.isAdmin).toBe(true);
    expect(perms.isSupervisor).toBe(true);
    expect(perms.isMember).toBe(true);
  });

  it('recognizes supervisor by research supervisor_id', () => {
    const research: Research = {
      id: 'res-1',
      title: 'Quantum Tech',
      abstract: null,
      field: 'Physics',
      status: 'proposal',
      supervisor_id: 'prof-ali',
      is_public: false,
      ethics_status: null,
      doi: null,
      conference: null,
      funding_source: null,
      start_date: null,
      target_date: null,
      archived_at: null,
    };

    const perms = canManageResearch('prof-ali', research, [], ['employee']);
    expect(perms.isAdmin).toBe(false);
    expect(perms.isSupervisor).toBe(true);
    expect(perms.isMember).toBe(true);
  });

  it('recognizes team member with role lead or supervisor as supervisor', () => {
    const members: Member[] = [
      { research_id: 'res-1', user_id: 'user-lead', member_role: 'lead' },
      { research_id: 'res-1', user_id: 'user-dev', member_role: 'researcher' },
    ];

    const leadPerms = canManageResearch('user-lead', null, members, ['employee']);
    expect(leadPerms.isSupervisor).toBe(true);
    expect(leadPerms.isMember).toBe(true);

    const devPerms = canManageResearch('user-dev', null, members, ['employee']);
    expect(devPerms.isSupervisor).toBe(false);
    expect(devPerms.isMember).toBe(true);

    const strangerPerms = canManageResearch('user-stranger', null, members, ['employee']);
    expect(strangerPerms.isSupervisor).toBe(false);
    expect(strangerPerms.isMember).toBe(false);
  });

  it('defines valid statuses and options', () => {
    expect(researchStatuses.active.tone).toBe('success');
    expect(taskColumns.todo.tone).toBe('neutral');
    expect(experimentStatuses.failed.tone).toBe('danger');
    expect(ethicsStatuses.approved.tone).toBe('success');
    expect(publicationStatuses.published.tone).toBe('success');
    expect(sensitivities.restricted.tone).toBe('danger');
    expect(tabs.length).toBe(8);
  });

  it('validates doi regex pattern', () => {
    const regex = new RegExp(`^${doiPattern}$`);
    expect(regex.test('10.1000/182')).toBe(true);
    expect(regex.test('10.1109/ICRA.2026.123456')).toBe(true);
    expect(regex.test('invalid-doi')).toBe(false);
  });

  it('translates strings correctly', () => {
    expect(tr('ar', 'مرحباً', 'Hello')).toBe('مرحباً');
    expect(tr('en', 'مرحباً', 'Hello')).toBe('Hello');
  });
});
