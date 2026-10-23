-- ============================================================================
-- LUNA.OS v3 · 0031_modalidade_fitness_v2 — fitness versão 2
-- Gerado a partir de packages/modalidades/src/fitness/v2.json (o teste do pacote
-- confirma que são iguais). Única mudança: o termo da sessão passa de "treino"
-- para "sessão", como nos ecrãs do Figma do PT (199:108, 201:108).
-- A versão 1 fica no catálogo; as organizações de fitness passam para a 2.
-- ============================================================================
insert into public.sports (id, version, config) values ('fitness', 2, $json$
{
  "id": "fitness",
  "versao": 2,
  "vocabulario": {
    "pessoa": "cliente",
    "pessoa_ginasio": "sócio",
    "sessao": "sessão",
    "aula": "aula",
    "grupo_principal": "turma",
    "responsavel": "PT"
  },
  "plurais": {
    "cliente": "clientes",
    "sócio": "sócios",
    "treino": "treinos",
    "sessão": "sessões",
    "aula": "aulas",
    "turma": "turmas",
    "PT": "PT"
  },
  "tipos_de_sessao": [
    "sala",
    "aula_de_grupo",
    "pt_individual",
    "pt_pequeno_grupo",
    "wod",
    "online"
  ],
  "metricas": [
    {
      "id": "carga",
      "unidade": "kg"
    },
    {
      "id": "repeticoes",
      "unidade": "rep"
    },
    {
      "id": "tempo",
      "unidade": "s"
    },
    {
      "id": "distancia",
      "unidade": "m"
    },
    {
      "id": "esforco",
      "unidade": "RPE 1-10"
    },
    {
      "id": "fc",
      "unidade": "bpm"
    }
  ],
  "testes": [
    "1RM",
    "composicao_corporal",
    "flexibilidade",
    "cardio_6min"
  ],
  "categorias_biblioteca": [
    "forca",
    "cardio",
    "mobilidade",
    "pliometria",
    "equilibrio",
    "reabilitacao",
    "tecnica"
  ],
  "tipos_de_grupo": [
    "turma",
    "carteira",
    "programa"
  ],
  "epoca": false
}
$json$::jsonb)
on conflict (id, version) do nothing;

update public.org_sports set sport_version = 2 where sport_id = 'fitness' and sport_version = 1;
