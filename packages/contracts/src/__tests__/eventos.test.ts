import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eventoProdutoSchema, metricasAtivacaoSchema, TIPOS_EVENTO } from '../index';

const org = '00000000-0000-4000-8000-000000000001';
const base = { org_id: org, actor_user: null, person_id: null };

describe('eventos de produto (T28)', () => {
  it('aceita cada evento só com identificadores internos', () => {
    expect(eventoProdutoSchema.safeParse({ kind: 'cliente_adicionado', ...base, props: { origem: 'manual' } }).success).toBe(true);
    expect(eventoProdutoSchema.safeParse({ kind: 'plano_atribuido', ...base, props: { primeiro: true } }).success).toBe(true);
    expect(eventoProdutoSchema.safeParse({ kind: 'ligacao_atleta_treinador', ...base, props: { quem_comecou: 'atleta' } }).success).toBe(true);
  });

  it('recusa nome, email, telefone, notas ou saúde em qualquer evento', () => {
    for (const extra of [{ nome: 'Ana' }, { email: 'a@x.pt' }, { telefone: '912' }, { nota: 'joelho' }, { saude: 'asma' }]) {
      expect(eventoProdutoSchema.safeParse({ kind: 'cliente_adicionado', ...base, props: { origem: 'manual', ...extra } }).success).toBe(false);
      expect(eventoProdutoSchema.safeParse({ kind: 'treino_app_feito', ...base, props: {}, ...extra }).success).toBe(false);
    }
  });

  it('o esquema e a base de dados conhecem os mesmos eventos', () => {
    const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/0023_metricas.sql'), 'utf8');
    const lista = /kind\s+text not null check \(kind in \(([^)]*)\)\)/.exec(sql)?.[1] ?? '';
    const naBd = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect([...TIPOS_EVENTO].sort()).toEqual(naBd);
  });

  it('o painel recebe a forma certa', () => {
    expect(metricasAtivacaoSchema.safeParse({
      semanas: [{ semana: '2026-10-19', pt_ativos: 3, clientes_app: 12, clientes_por_pt: 4 }], dias_ate_primeiro_plano: 1.5,
      organizacoes: 5, organizacoes_com_plano: 4, retencao_4_semanas: null, coorte_retencao: null, trial_convertidos: 0, trial_expirados: 0,
      ligacoes_vindas_do_atleta: 0, ligacoes_total: 2, so_leitura: 0, sessoes_ao_vivo: 30,
    }).success).toBe(true);
  });
});
