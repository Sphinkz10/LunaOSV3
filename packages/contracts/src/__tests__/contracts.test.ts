import { addClientInput, createOrganizationInput, modalidadeSchema, myOrgSchema } from '../index';

describe('contracts', () => {
  it('aplica os valores por omissão ao criar organização', () => {
    expect(createOrganizationInput.parse({ _name: ' Estúdio ', _type: 'studio' })).toEqual({
      _name: 'Estúdio', _type: 'studio', _sport: 'fitness', _timezone: 'Europe/Lisbon',
    });
  });

  it('recusa cliente sem nome ou com email inválido', () => {
    const org = '00000000-0000-4000-8000-000000000001';
    expect(addClientInput.safeParse({ _org: org, _full_name: ' ' }).success).toBe(false);
    expect(addClientInput.safeParse({ _org: org, _full_name: 'Ana', _email: 'ana' }).success).toBe(false);
    expect(addClientInput.safeParse({ _org: org, _full_name: 'Ana', _email: 'ana@x.pt' }).success).toBe(true);
  });

  it('modalidade exige vocabulário completo', () => {
    expect(modalidadeSchema.safeParse({ id: 'x', versao: 1 }).success).toBe(false);
  });

  it('valida linhas do seletor de organização', () => {
    expect(myOrgSchema.safeParse({
      org_id: '00000000-0000-4000-8000-000000000001', name: 'PT', type: 'solo_coach', theme: 'oceano',
      timezone: 'Europe/Lisbon', membership_id: '00000000-0000-4000-8000-000000000002',
      roles: ['owner'], permissions: ['org.manage'], subscription_status: 'trial',
    }).success).toBe(true);
  });
});
