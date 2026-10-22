import { z } from 'zod';

/* ── Modalidade (docs/11 · Modalidades) ─────────────────────────────────── */

export const metricaSchema = z.object({
  id: z.string().min(1),
  unidade: z.string().min(1),
});

export const vocabularioSchema = z.object({
  pessoa: z.string().min(1),
  pessoa_ginasio: z.string().min(1),
  sessao: z.string().min(1),
  aula: z.string().min(1),
  grupo_principal: z.string().min(1),
  responsavel: z.string().min(1),
}).catchall(z.string().min(1));

export const tipoDeGrupoSchema = z.enum(['turma', 'carteira', 'programa', 'escalao', 'plantel', 'equipa']);

export const modalidadeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  versao: z.number().int().positive(),
  vocabulario: vocabularioSchema,
  /** Plural de cada termo do vocabulário (o português não se pluraliza com uma regra). */
  plurais: z.record(z.string().min(1)).default({}),
  tipos_de_sessao: z.array(z.string().min(1)).min(1),
  metricas: z.array(metricaSchema).min(1),
  testes: z.array(z.string().min(1)),
  categorias_biblioteca: z.array(z.string().min(1)).min(1),
  tipos_de_grupo: z.array(tipoDeGrupoSchema).min(1),
  epoca: z.boolean(),
});
export type Modalidade = z.infer<typeof modalidadeSchema>;
export type ModalidadeInput = z.input<typeof modalidadeSchema>;
export type Vocabulario = z.infer<typeof vocabularioSchema>;

/* ── Modelo de dados (docs/11) ──────────────────────────────────────────── */

export const orgTypeSchema = z.enum(['solo_coach', 'studio', 'box', 'gym', 'club', 'online']);
export type OrgType = z.infer<typeof orgTypeSchema>;

export const shareCategorySchema = z.enum(['training', 'measurements', 'photos', 'checkins', 'health']);
export type ShareCategory = z.infer<typeof shareCategorySchema>;

export const permissionSchema = z.enum([
  'org.manage', 'team.manage', 'clients.read_all', 'clients.read_own', 'clients.write',
  'schedule.read_all', 'schedule.write', 'training.write', 'health.read',
]);
export type Permission = z.infer<typeof permissionSchema>;

/** Módulos que o serviço de direitos liga ou desliga (G-00). */
export const moduleSchema = z.enum([
  'today', 'clients', 'schedule', 'training', 'settings',
  'assessment', 'messages', 'business', 'access', 'desk', 'health', 'reports', 'documents',
]);
export type Module = z.infer<typeof moduleSchema>;

/* ── Payloads das funções da BD ─────────────────────────────────────────── */

export const createOrganizationInput = z.object({
  _name: z.string().trim().min(1),
  _type: orgTypeSchema,
  _sport: z.string().min(1).default('fitness'),
  _timezone: z.string().min(1).default('Europe/Lisbon'),
});
export type CreateOrganizationInput = z.input<typeof createOrganizationInput>;

export const addClientInput = z.object({
  _org: z.string().uuid(),
  _full_name: z.string().trim().min(1),
  _email: z.string().trim().email().nullable().optional(),
  _phone: z.string().trim().min(3).nullable().optional(),
  _birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  _responsible: z.string().uuid().nullable().optional(),
});
export type AddClientInput = z.input<typeof addClientInput>;

export const createInviteInput = z.object({
  _org: z.string().uuid(),
  _email: z.string().trim().email(),
  _role_key: z.string().min(1),
  _unit: z.string().uuid().nullable().optional(),
  _confirm_over_seats: z.boolean().optional(),
});
export type CreateInviteInput = z.input<typeof createInviteInput>;

/** Linha de my_orgs() — o seletor de organização. */
export const myOrgSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string(),
  type: orgTypeSchema,
  theme: z.enum(['oceano', 'ouro', 'limao', 'esboco']),
  timezone: z.string(),
  membership_id: z.string().uuid(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  subscription_status: z.enum(['trial', 'active', 'grace', 'read_only', 'cancelled']).nullable(),
});
export type MyOrg = z.infer<typeof myOrgSchema>;

/* ── Eventos de produto (tarefa 28): só identificadores internos ───────── */
// Cada evento tem o seu esquema estrito: uma chave a mais (nome, email, nota…) é recusada.
const id = z.string().uuid();
const baseEvento = { org_id: id.nullable(), actor_user: id.nullable(), person_id: id.nullable() };
const semProps = z.object({}).strict();
export const eventoProdutoSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('org_criada'), ...baseEvento, props: z.object({ tipo: orgTypeSchema }).strict() }).strict(),
  z.object({ kind: z.literal('cliente_adicionado'), ...baseEvento, props: z.object({ origem: z.enum(['manual', 'invite', 'athlete_code', 'signup']) }).strict() }).strict(),
  z.object({ kind: z.literal('primeiro_treino_criado'), ...baseEvento, props: semProps }).strict(),
  z.object({ kind: z.literal('plano_atribuido'), ...baseEvento, props: z.object({ primeiro: z.boolean() }).strict() }).strict(),
  z.object({ kind: z.literal('cliente_entrou_app'), ...baseEvento, props: semProps }).strict(),
  z.object({ kind: z.literal('treino_app_feito'), ...baseEvento, props: semProps }).strict(),
  z.object({ kind: z.literal('sessao_ao_vivo_concluida'), ...baseEvento, props: semProps }).strict(),
  z.object({ kind: z.literal('checkin_enviado'), ...baseEvento, props: semProps }).strict(),
  z.object({ kind: z.literal('checkin_revisto'), ...baseEvento, props: semProps }).strict(),
  z.object({ kind: z.literal('atleta_solo_criado'), ...baseEvento, props: semProps }).strict(),
  z.object({ kind: z.literal('ligacao_atleta_treinador'), ...baseEvento, props: z.object({ quem_comecou: z.enum(['atleta', 'treinador']) }).strict() }).strict(),
  z.object({ kind: z.literal('trial_iniciado'), ...baseEvento, props: semProps }).strict(),
  z.object({ kind: z.literal('trial_convertido'), ...baseEvento, props: semProps }).strict(),
  z.object({ kind: z.literal('trial_expirado'), ...baseEvento, props: semProps }).strict(),
  z.object({ kind: z.literal('org_so_leitura'), ...baseEvento, props: semProps }).strict(),
]);
export type EventoProduto = z.infer<typeof eventoProdutoSchema>;
export const TIPOS_EVENTO = eventoProdutoSchema.options.map((o) => o.shape.kind.value);

/** Resultado de activation_metrics() (painel interno). */
export const metricasAtivacaoSchema = z.object({
  semanas: z.array(z.object({ semana: z.string(), pt_ativos: z.number(), clientes_app: z.number(), clientes_por_pt: z.number().nullable() })),
  dias_ate_primeiro_plano: z.number().nullable(),
  organizacoes: z.number(), organizacoes_com_plano: z.number(),
  retencao_4_semanas: z.number().nullable(), coorte_retencao: z.number().nullable(),
  trial_convertidos: z.number(), trial_expirados: z.number(),
  ligacoes_vindas_do_atleta: z.number(), ligacoes_total: z.number(), so_leitura: z.number(), sessoes_ao_vivo: z.number(),
});
export type MetricasAtivacao = z.infer<typeof metricasAtivacaoSchema>;

export { z };
