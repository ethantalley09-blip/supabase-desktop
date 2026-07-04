export const ORG_TYPES = [
  { value: 'campaign_committee', label: 'Political Campaign Committee' },
  { value: 'pac', label: 'PAC / Independent Expenditure Committee' },
  { value: 'party_committee', label: 'Party Committee' },
  { value: 'nonprofit', label: 'Nonprofit / Advocacy Org' }
] as const;

export type OrgType = (typeof ORG_TYPES)[number]['value'];

export const PERMISSION_KEYS = [
  'org.manage',
  'projects.manage',
  'team.manage',
  'fundraising.view',
  'fundraising.manage',
  'comms.view',
  'comms.manage',
  'comms.broadcast',
  'compliance.view',
  'compliance.manage',
  'turf.view',
  'turf.manage',
  'exports.run',
  'hr.view',
  'hr.manage',
  'payroll.view',
  'payroll.manage'
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
