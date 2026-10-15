# TEMPLATE MASTER — AUDITORIA UX/UI, NAVEGAÇÃO, FUNÇÕES E REFACTORING
## LUNA.OS / Aplicação interna complexa

> Documento de auditoria profissional. Cruza avaliação heurística (Nielsen Norman Group), journey mapping, arquitetura de informação, service mapping, design systems, acessibilidade WCAG 2.2 e design centrado no utilizador (ISO 9241-210). Referências de produto: Apple HIG, Material Design, IBM Carbon, Atlassian, Baymard.

---

## 0. Objetivo do documento

Este documento serve para analisar profundamente uma aplicação existente antes de qualquer redesign, Figma final ou refactorização em React.

O objetivo não é apenas avaliar se a interface está "bonita".

O objetivo é perceber:

1. Que módulos existem.
2. Que utilizadores usam a app.
3. Que tarefas críticas fazem.
4. Que caminhos percorrem.
5. Onde se perdem.
6. Que botões, filtros, modais, drawers, menus e tabs existem.
7. Que funções estão mal colocadas.
8. Que funções estão escondidas.
9. Que funções estão duplicadas.
10. Que funções são perigosas.
11. Que funções podem desaparecer por acidente durante o redesign.
12. Como redesenhar a app sem perda funcional.
13. Que diagramas de navegação e fluxos devem ser produzidos.
14. Que lacunas UX/UI devem ser resolvidas antes de passar para React.

**Regra central:**
**Limpar a interface não é apagar funções.**
**Limpar a interface é relocalizar funções para o sítio certo.**

---

# 1. Fontes de análise obrigatórias

Antes de analisar, recolher todos os materiais disponíveis.

## 1.1 Materiais técnicos

| Item                          | Existe? | Localização | Observações |
| ----------------------------- | ------: | ----------- | ----------- |
| HTML atual / SPA              | Sim/Não |             |             |
| Ficheiros JS                  | Sim/Não |             |             |
| CSS atual                     | Sim/Não |             |             |
| JSON/mock data                | Sim/Não |             |             |
| Screenshots desktop           | Sim/Não |             |             |
| Screenshots mobile            | Sim/Não |             |             |
| Vídeo de utilização           | Sim/Não |             |             |
| Lista de bugs conhecidos      | Sim/Não |             |             |
| Lista de funções atuais       | Sim/Não |             |             |
| Inventário de botões          | Sim/Não |             |             |
| Inventário de modais          | Sim/Não |             |             |
| Inventário de drawers         | Sim/Não |             |             |
| Inventário de filtros         | Sim/Não |             |             |
| Inventário de tabs            | Sim/Não |             |             |
| Inventário de ações perigosas | Sim/Não |             |             |
| Código React alvo             | Sim/Não |             |             |

## 1.2 Materiais de produto

| Item                    | Existe? | Observações |
| ----------------------- | ------: | ----------- |
| Objetivo da app         |         |             |
| Público-alvo            |         |             |
| Utilizadores principais |         |             |
| Tarefas críticas        |         |             |
| Módulos prioritários    |         |             |
| Módulos secundários     |         |             |
| Regras de negócio       |         |             |
| Estados críticos        |         |             |
| Dados reais vs mock     |         |             |
| Restrições técnicas     |         |             |

---

# 2. Perfis de utilizador

Identificar quem usa a app.

## 2.1 Mapa de utilizadores

| Perfil               | Objetivo principal                         | Frequência de uso | Conhecimento técnico | Risco se a UX falhar |
| -------------------- | ------------------------------------------ | ----------------: | -------------------- | -------------------- |
| Treinador            | Gerir atletas, sessões, cargas e evolução  |            Diário | Médio                | Alto                 |
| Coordenador          | Ver grupos, relatórios e estado geral      |    Semanal/diário | Médio                | Alto                 |
| Fisioterapeuta/saúde | Ver lesões, notas clínicas, alertas        |            Diário | Médio                | Alto                 |
| Analista             | Consultar métricas, relatórios, tendências |           Semanal | Alto                 | Médio                |
| Admin                | Gerir settings, integrações, permissões    |         Ocasional | Alto                 | Alto                 |
| Operador/assistente  | Criar marcações, enviar forms, tarefas     |            Diário | Baixo/Médio          | Alto                 |

## 2.2 Jobs To Be Done

Preencher para cada perfil:

| Perfil         | Quando...               | Quero...                    | Para conseguir...        | Resultado esperado            |
| -------------- | ----------------------- | --------------------------- | ------------------------ | ----------------------------- |
| Treinador      | abro a lista de atletas | perceber quem está em risco | agir rapidamente         | prevenir sobrecarga/lesão     |
| Coordenador    | entro num grupo         | ver estado coletivo         | decidir ações            | melhorar acompanhamento       |
| Fisioterapeuta | abro Saúde              | ver alertas e histórico     | registar consulta        | manter acompanhamento clínico |
| Analista       | abro Analytics          | montar uma query            | gerar relatório          | apoiar decisão                |
| Admin          | entro em Settings       | gerir segurança             | evitar risco operacional | sistema controlado            |

---

# 3. Inventário global de módulos

Listar todos os módulos da app.

| ID  | Módulo       | Objetivo                                                      | Tipo                 | Prioridade | Dependências                           | Risco se falhar |
| --- | ------------ | ------------------------------------------------------------- | -------------------- | ---------- | -------------------------------------- | --------------- |
| M01 | App Shell    | Estrutura global: sidebar, topbar, main, drawer, modal, toast | Core                 | P0         | Nenhuma                                | Crítico         |
| M02 | Dashboard    | Visão geral operacional                                       | Produto              | P1         | Atletas, Grupos, Calendário, Analytics | Médio           |
| M03 | Atletas      | Gestão de atletas                                             | Core                 | P0         | App Shell                              | Crítico         |
| M04 | Atleta 360   | Vista completa do atleta                                      | Core                 | P0         | Atletas                                | Crítico         |
| M05 | Grupos       | Gestão de grupos                                              | Operacional          | P1         | Atletas                                | Alto            |
| M06 | Grupo 360    | Vista completa do grupo                                       | Operacional          | P1         | Grupos, Atletas                        | Alto            |
| M07 | Studio       | Criação de treinos, exercícios, planos                        | Operacional/Avançado | P1/P2      | Atletas, Grupos                        | Médio           |
| M08 | Forms.OS     | Formulários, respostas, pacotes                               | Operacional          | P1         | Atletas, Grupos                        | Alto            |
| M09 | Analytics.OS | Query, charts, relatórios                                     | Avançado             | P2         | Todos                                  | Médio           |
| M10 | Data.OS      | Regras, fórmulas, automações, logs                            | Avançado             | P2         | Forms, Analytics, Atletas              | Médio           |
| M11 | Live         | Sessões ao vivo, timer, exercícios                            | Avançado             | P2         | Atletas, Studio                        | Médio           |
| M12 | Calendário   | Eventos, marcações, férias, lista espera                      | Operacional          | P1         | Atletas, Grupos                        | Alto            |
| M13 | Settings     | Perfil, aparência, segurança, integrações                     | Sistema              | P2         | App Shell                              | Alto            |

---

# 4. Inventário bruto de funções

Criar uma linha por função.
Não agrupar em excesso.
Não resumir "ações do atleta" numa só linha.

## 4.1 Tabela obrigatória

| ID   | Módulo  | Vista | Elemento       | Tipo             | Label visível     | Ação real        | Onde aparece hoje | Estado necessário | Prioridade | Confirmado? |
| ---- | ------- | ----- | -------------- | ---------------- | ----------------- | ---------------- | ----------------- | ----------------- | ---------- | ----------- |
| F001 | Atletas | Lista | Campo pesquisa | Input            | Pesquisar atletas | Filtra lista     | Toolbar           | query             | P0         | Sim/Não     |
| F002 | Atletas | Lista | Filtro grupo   | Select/Chip      | Grupo             | Filtra atletas   | Toolbar           | filters.group     | P0         | Sim/Não     |
| F003 | Atletas | Lista | Botão Ver 360  | Button           | Ver 360           | Abre Atleta 360  | Card/row          | athleteId         | P0         | Sim/Não     |
| F004 | Atletas | Lista | Menu Mais      | Dropdown         | Mais              | Mostra ações     | Card/row          | athleteId         | P0         | Sim/Não     |
| F005 | Atletas | Lista | Editar         | Menu item        | Editar            | Abre edição      | Menu Mais         | activeDrawer      | P0         | Sim/Não     |
| F006 | Atletas | Lista | Eliminar       | Dangerous action | Eliminar          | Abre confirmação | Menu Mais/Danger  | activeModal       | P0         | Sim/Não     |

## 4.2 Tipos de elemento permitidos

Classificar cada função como:

* button
* link
* input
* search
* select
* filter
* chip
* checkbox
* dropdown
* menu item
* tab
* modal
* drawer
* toolbar action
* bulk action
* contextual action
* dangerous action
* route/view
* card action
* row action
* wizard
* builder
* toast
* empty state
* loading state
* error state
* keyboard shortcut

---

# 5. Inventário específico de botões e ações

## 5.1 Registo de botões

| ID   | Label            | Módulo  | Vista       | Local atual | Tipo de ação | Sempre visível? | Condição  | Novo destino UX  | Componente React         | Teste                     |
| ---- | ---------------- | ------- | ----------- | ----------- | ------------ | --------------: | --------- | ---------------- | ------------------------ | ------------------------- |
| B001 | Adicionar atleta | Atletas | Lista       | Header      | Primary      |             Sim | Nenhuma   | Botão primário   | AddAthleteButton         | Clicar abre modal/drawer  |
| B002 | Importar         | Atletas | Lista       | Header      | Secondary    |             Sim | Nenhuma   | Botão secundário | ImportAthletesButton     | Clicar abre import drawer |
| B003 | Ver 360          | Atletas | Card        | Card        | Primary      |             Sim | athleteId | Botão visível    | View360Button            | Abre rota correta         |
| B004 | Editar           | Atletas | Menu Mais   | Dropdown    | Secondary    |             Não | athleteId | Drawer           | AthleteEditDrawerTrigger | Abre drawer               |
| B005 | Eliminar         | Atletas | Menu/Danger | Dropdown    | Dangerous    |             Não | athleteId | ConfirmDialog    | DeleteAthleteAction      | Pede confirmação          |

## 5.2 Classificação de ações

| Tipo       | Definição                       | Onde deve viver                   | Exemplos                                     |
| ---------- | ------------------------------- | --------------------------------- | -------------------------------------------- |
| Primary    | Ação principal do contexto      | Botão visível                     | Ver 360, Adicionar, Guardar                  |
| Secondary  | Útil, mas não principal         | Menu Mais                         | Editar, exportar, duplicar                   |
| Contextual | Só faz sentido com seleção/foco | Toolbar/drawer contextual         | Exportar selecionados, atribuir selecionados |
| Advanced   | Complexa ou configurável        | Drawer, página dedicada, settings | Field builder, query builder, rule builder   |
| Dangerous  | Destrutiva ou crítica           | Danger zone + confirmação         | Eliminar, arquivar, cancelar, revogar        |

---

# 6. Inventário de modais

## 6.1 Tabela de modais

| ID     | Nome atual           | Módulo       | Abre através de  | Objetivo                  | Conteúdo                | Botão primário | Botão secundário | Perigoso? | Problema atual             | Novo destino      | Teste                     |
| ------ | -------------------- | ------------ | ---------------- | ------------------------- | ----------------------- | -------------- | ---------------- | --------: | -------------------------- | ----------------- | ------------------------- |
| MOD001 | Criar atleta         | Atletas      | Adicionar atleta | Criar perfil              | Campos do atleta        | Guardar        | Cancelar         |       Não | Pode ser grande            | Drawer/Dialog     | Cria atleta               |
| MOD002 | Editar atleta        | Atletas      | Editar           | Editar perfil             | Campos do atleta        | Guardar        | Cancelar         |   Parcial | Pode misturar ações        | AthleteEditDrawer | Edita sem perder contexto |
| MOD003 | Confirmar eliminação | Atletas      | Eliminar         | Confirmar ação destrutiva | Aviso + nome            | Eliminar       | Cancelar         |       Sim | Deve ser isolado           | ConfirmDialog     | Exige confirmação         |
| MOD004 | Field Builder        | Forms.OS     | Editor           | Configurar campo          | Tipos e propriedades    | Guardar campo  | Cancelar         |       Não | Modal pesado               | Drawer/Página     | Campo criado              |
| MOD005 | Query Builder        | Analytics.OS | Nova query       | Construir query           | Fonte, métrica, período | Executar       | Cancelar         |       Não | Complexo demais para modal | Página dedicada   | Query executada           |

## 6.2 Regras para modais

* Modal é para tarefas curtas ou confirmação.
* Modal não deve ser depósito de interfaces complexas.
* Modal não deve abrir outro modal, salvo exceção muito justificada.
* Builders complexos devem ir para página ou painel dedicado.
* Ações perigosas devem ter confirmação clara.
* O utilizador deve conseguir cancelar sem perder contexto.

---

# 7. Inventário de drawers / gavetas

## 7.1 Tabela de drawers

| ID     | Drawer               | Módulo         | Quando abre       | Dados recebidos | Ações principais          | Ações secundárias              | Danger zone        | Store            | Teste               |
| ------ | -------------------- | -------------- | ----------------- | --------------- | ------------------------- | ------------------------------ | ------------------ | ---------------- | ------------------- |
| DRW001 | GlobalDrawer         | App Shell      | Ação contextual   | activeDrawer    | variável                  | variável                       | se aplicável       | ui.store         | abre/fecha          |
| DRW002 | AthleteActionDrawer  | Atletas        | Menu Mais         | athleteId       | Ver 360, Editar, Atribuir | Mensagem, form, docs, exportar | Arquivar, Eliminar | ui + athletes    | ações existem       |
| DRW003 | AthleteEditDrawer    | Atletas        | Editar            | athleteId       | Guardar                   | Cancelar, histórico            | Arquivar, Eliminar | athletes         | editar guarda       |
| DRW004 | AssignmentDrawer     | Atletas/Grupos | Atribuir          | selectedIds     | Confirmar atribuição      | configurar destino             | cancelar           | assignment/store | atribuição funciona |
| DRW005 | AdvancedSearchDrawer | Atletas        | Pesquisa avançada | filters         | Aplicar                   | limpar                         | não                | athletes         | filtros aplicam     |
| DRW006 | ExportDrawer         | Global         | Exportar          | scope/ids       | Exportar                  | formato                        | não                | ui/domain        | exporta             |

## 7.2 Estrutura padrão de drawer

Todos os drawers devem seguir esta anatomia:

1. **Header**
   * título
   * estado
   * breadcrumb/contexto
   * fechar
2. **Summary**
   * 3 a 4 dados principais
3. **Primary Actions**
   * 1 a 3 ações principais
4. **Secondary Actions**
   * agrupadas por categoria
5. **Context / History**
   * últimas ações
   * notas
   * atividade recente
6. **Danger Zone**
   * destrutivas
   * separadas
   * com confirmação

---

# 8. Inventário de filtros, pesquisa e ordenação

## 8.1 Tabela

| ID     | Módulo     | Tipo     | Label             | Controla          | Local atual | Store destino           | UI destino           | Teste                    |
| ------ | ---------- | -------- | ----------------- | ----------------- | ----------- | ----------------------- | -------------------- | ------------------------ |
| FIL001 | Atletas    | Search   | Pesquisar atletas | Lista de atletas  | Toolbar     | athletes.query          | SearchInput          | filtra por nome          |
| FIL002 | Atletas    | Filter   | Grupo             | Lista de atletas  | Toolbar     | athletes.filters.group  | FilterBar            | filtra por grupo         |
| FIL003 | Atletas    | Filter   | Estado            | Lista de atletas  | Toolbar     | athletes.filters.status | FilterBar            | filtra por estado        |
| FIL004 | Atletas    | Sort     | Ordenar por       | Ordem da lista    | Toolbar     | athletes.sort           | SortSelect           | altera ordem             |
| FIL005 | Atletas    | Advanced | Pesquisa avançada | filtros compostos | Painel      | athletes.advancedSearch | AdvancedSearchDrawer | aplica múltiplos filtros |
| FIL006 | Calendário | View     | Mês/Semana/Dia    | Eventos           | Header      | calendar.activeView     | CalendarTabs         | muda vista               |

## 8.2 Critérios de qualidade para filtros

* Filtros ativos devem ser visíveis como chips.
* Deve existir "limpar filtros".
* Filtros não devem ocupar metade do ecrã.
* Pesquisa simples e filtros avançados devem ser separados.
* O utilizador deve perceber quantos filtros estão ativos.
* Em mobile, filtros devem ir para bottom sheet ou painel.
* Ordenação deve ser explícita.

---

# 9. Inventário de tabs

## 9.1 Tabela

| Módulo     | Tab           | Objetivo            | Conteúdo              | Store                | Componente           | Teste                  |
| ---------- | ------------- | ------------------- | --------------------- | -------------------- | -------------------- | ---------------------- |
| Atleta 360 | Principal     | Visão geral         | KPIs, resumo, alertas | athlete360.activeTab | Athlete360Overview   | tab abre               |
| Atleta 360 | Saúde         | Saúde e lesões      | estado, lesões, notas | athlete360.activeTab | Athlete360Health     | dados aparecem         |
| Atleta 360 | Analítica     | Métricas analíticas | gráficos, tendências  | athlete360.activeTab | Athlete360Analytics  | gráficos carregam      |
| Atleta 360 | Forms         | Formulários         | respostas, pendentes  | athlete360.activeTab | Athlete360Forms      | lista aparece          |
| Atleta 360 | Sessões       | Treinos/sessões     | sessões passadas      | athlete360.activeTab | Athlete360Sessions   | sessões aparecem       |
| Atleta 360 | Métricas      | Métricas detalhadas | dados por período     | athlete360.activeTab | Athlete360Metrics    | filtros funcionam      |
| Atleta 360 | Timeline      | Histórico           | eventos e ações       | athlete360.activeTab | Athlete360Timeline   | ordenação temporal     |
| Grupo 360  | Resumo        | Visão geral         | KPIs grupo            | group360.activeTab   | Group360Overview     | abre                   |
| Grupo 360  | Membros       | Lista membros       | atletas do grupo      | group360.activeTab   | Group360Members      | membros aparecem       |
| Grupo 360  | Como funciona | Regras dinâmicas    | lógica do grupo       | group360.activeTab   | Group360DynamicRules | só aparece se dinâmico |

---

# 10. Diagrama de navegação global

Criar um diagrama da navegação principal.

## 10.1 Template textual

```
LUNA.OS
│
├── Dashboard
│   ├── Resumo do dia
│   ├── Alertas
│   └── Ações rápidas
│
├── Atletas
│   ├── Lista de atletas
│   ├── Pesquisa
│   ├── Filtros
│   ├── Seleção múltipla
│   └── Atleta 360
│       ├── Principal
│       ├── Saúde
│       ├── Analítica
│       ├── Forms
│       ├── Sessões
│       ├── Métricas
│       └── Timeline
│
├── Grupos
│   ├── Lista de grupos
│   ├── Grupo 360
│   │   ├── Resumo
│   │   ├── Membros
│   │   ├── Atribuições
│   │   ├── Forms
│   │   ├── Relatórios
│   │   ├── Saúde
│   │   ├── Performance
│   │   ├── Tarefas
│   │   ├── Histórico
│   │   └── Como funciona
│
├── Studio
├── Forms.OS
├── Analytics.OS
├── Data.OS
├── Live
├── Calendário
└── Settings
```

## 10.2 Critérios de avaliação da navegação

Para cada item da navegação, avaliar:

| Critério     | Pergunta                        | Resultado   |
| ------------ | ------------------------------- | ----------- |
| Clareza      | O nome do módulo é óbvio?       | Passa/Falha |
| Profundidade | Há demasiados níveis?           | Passa/Falha |
| Consistência | O padrão repete-se nos módulos? | Passa/Falha |
| Regressar    | O utilizador sabe voltar?       | Passa/Falha |
| Localização  | O utilizador sabe onde está?    | Passa/Falha |
| Mobile       | A navegação adapta-se bem?      | Passa/Falha |

---

# 11. Diagramas de user flow obrigatórios

Cada tarefa crítica deve ter um diagrama.

## 11.1 Template de user flow

```
Início
↓
Ecrã inicial
↓
Ação do utilizador
↓
Sistema responde
↓
Decisão
├── Caminho A: sucesso
├── Caminho B: erro
└── Caminho C: cancelar
↓
Estado final
```

## 11.2 Fluxos mínimos da LUNA.OS

Criar estes fluxos:

1. **Gestão de atleta**
   Atletas → pesquisar → filtrar → abrir Atleta 360 → ver Saúde → executar ação.
2. **Ação em massa**
   Atletas → selecionar vários → toolbar contextual → escolher ação → confirmar → toast.
3. **Editar atleta**
   Atletas → menu Mais → Editar → drawer → guardar → toast.
4. **Eliminar atleta**
   Atletas → menu Mais → Eliminar → confirmation dialog → confirmar → lista atualizada.
5. **Atleta 360**
   Atletas → Ver 360 → Principal → Saúde → Forms → Timeline.
6. **Criar grupo**
   Grupos → Novo grupo → escolher tipo → adicionar membros → guardar.
7. **Grupo dinâmico**
   Grupos → Criar grupo dinâmico → regras → preview membros → guardar.
8. **Criar form**
   Forms.OS → Novo form → field builder → preview → publicar → atribuir.
9. **Responder/consultar form**
   Forms.OS → respostas → abrir resposta → drawer → marcar revista/exportar.
10. **Criar query**
    Analytics.OS → Query builder → fonte → métrica → período → executar → gráfico.
11. **Criar regra**
    Data.OS → Nova regra IF/THEN → formula builder → testar → guardar → logs.
12. **Live session**
    Live → escolher atleta → escolher treino → iniciar timer → gerir séries → guardar resumo.
13. **Calendário**
    Calendário → nova marcação → escolher atleta/grupo → confirmar → evento criado.
14. **Settings segurança**
    Settings → Segurança → 2FA/códigos → confirmar ação.

---

# 12. Mapa de disposição de funções

Este é um dos pontos mais importantes.

## 12.1 Tabela "Onde está hoje → onde deve ficar"

| Função            | Onde está hoje     | Problema             | Novo local                               | Motivo                          |
| ----------------- | ------------------ | -------------------- | ---------------------------------------- | ------------------------------- |
| Ver 360           | Card atleta        | É ação principal     | Botão visível no card                    | Deve ser o CTA principal        |
| Editar atleta     | Botão/menu no card | Pode poluir o card   | Menu Mais → AthleteEditDrawer            | Ação secundária                 |
| Atribuir          | Botão solto        | Pode confundir       | AthleteActionDrawer / AssignmentDrawer   | Precisa contexto                |
| Exportar          | Card/toolbar       | Varia por contexto   | Menu Mais ou BulkToolbar                 | Depende de seleção              |
| Eliminar          | Menu/card          | Perigoso             | Danger Zone + ConfirmDialog              | Evitar erro                     |
| Pesquisa avançada | Área densa         | Ocupa espaço         | AdvancedSearchDrawer                     | Complexidade progressiva        |
| Colunas           | Toolbar            | Avançado             | ColumnConfigDrawer                       | Configuração                    |
| Forms pendentes   | Card               | Métrica importante   | Card como métrica curta + detalhe no 360 | Hierarquia                      |
| Histórico         | Drawer/card        | Pode ficar escondido | Timeline                                 | Histórico pertence à página 360 |

## 12.2 Regras de relocalização

* Ação principal → botão visível.
* Ação secundária → menu Mais.
* Ação contextual → toolbar contextual.
* Ação avançada → drawer ou página.
* Ação perigosa → danger zone.
* Informação resumida → card.
* Informação detalhada → página 360.
* Histórico → timeline.
* Configuração → settings/drawer.
* Builder complexo → página dedicada.

---

# 13. Auditoria heurística UX

Avaliar a app com 10 critérios.

## 13.1 Tabela de avaliação

| Heurística             | Pergunta aplicada                               | Nota 0-5 | Evidência | Problema | Correção |
| ---------------------- | ----------------------------------------------- | -------: | --------- | -------- | -------- |
| Visibilidade do estado | O utilizador sabe o que está a acontecer?       |          |           |          |          |
| Linguagem real         | Os labels fazem sentido para treinadores/staff? |          |           |          |          |
| Controlo e liberdade   | Há voltar, cancelar, desfazer?                  |          |           |          |          |
| Consistência           | Botões e padrões repetem-se?                    |          |           |          |          |
| Prevenção de erros     | Ações perigosas estão protegidas?               |          |           |          |          |
| Reconhecimento         | O utilizador vê opções sem decorar caminhos?    |          |           |          |          |
| Eficiência             | Utilizadores avançados conseguem agir rápido?   |          |           |          |          |
| Minimalismo            | Há ruído visual ou informação excessiva?        |          |           |          |          |
| Recuperação de erro    | Os erros dizem como resolver?                   |          |           |          |          |
| Ajuda/contexto         | Há ajuda onde a função é complexa?              |          |           |          |          |

## 13.2 Escala

| Nota | Significado              |
| ---: | ------------------------ |
|    0 | Não existe / falha grave |
|    1 | Muito fraco              |
|    2 | Existe mas confuso       |
|    3 | Aceitável                |
|    4 | Bom                      |
|    5 | Excelente                |

---

# 14. Auditoria de arquitetura de informação

Avaliar onde vivem as funções.

| Área        | Pergunta                                    | Resultado | Correção |
| ----------- | ------------------------------------------- | --------- | -------- |
| Sidebar     | Os módulos estão agrupados de forma lógica? |           |          |
| Topbar      | Só tem ações globais?                       |           |          |
| Cards       | Mostram apenas resumo e ação principal?     |           |          |
| Menu Mais   | Guarda ações secundárias?                   |           |          |
| Drawers     | Têm contexto e ações organizadas?           |           |          |
| Modais      | São curtos e focados?                       |           |          |
| Tabs        | Têm nomes claros e conteúdo coerente?       |           |          |
| 360 views   | Centralizam detalhe real?                   |           |          |
| Settings    | Não mistura funções operacionais?           |           |          |
| Danger zone | Está separada?                              |           |          |

---

# 15. Auditoria de cards

## 15.1 Card atual

Para cada tipo de card, preencher:

| Card              | Informação visível | Ações visíveis | Problema | Manter | Mover |
| ----------------- | ------------------ | -------------- | -------- | ------ | ----- |
| Atleta            |                    |                |          |        |       |
| Grupo             |                    |                |          |        |       |
| Form              |                    |                |          |        |       |
| Sessão Live       |                    |                |          |        |       |
| Evento calendário |                    |                |          |        |       |
| Regra Data.OS     |                    |                |          |        |       |

## 15.2 Regra ideal de card

Cada card só deve mostrar:

* identidade
* estado principal
* máximo 2 alertas
* 2 a 4 métricas
* 1 ação principal
* menu Mais

## 15.3 Card de atleta proposto

**Visível:**

* checkbox
* avatar/iniciais
* nome
* grupo/modalidade
* estado principal
* até 2 alertas
* readiness
* carga semanal
* forms pendentes
* botão Ver 360
* menu Mais

**Menu Mais:**

* editar
* atribuir
* enviar formulário
* pedir documentos
* mensagem
* exportar
* arquivar
* eliminar

---

# 16. Auditoria de drawers

Para cada drawer, avaliar:

| Critério       | Pergunta                                        | Passa/Falha |
| -------------- | ----------------------------------------------- | ----------- |
| Contexto       | O drawer explica sobre que item estamos a agir? |             |
| Resumo         | Mostra 3-4 dados importantes?                   |             |
| Ação principal | A principal está clara?                         |             |
| Secundárias    | Estão agrupadas?                                |             |
| Histórico      | Existe contexto/atividade?                      |             |
| Perigosas      | Estão separadas?                                |             |
| Fechar         | É fácil fechar sem perder dados?                |             |
| Mobile         | Funciona como bottom sheet?                     |             |

## 16.1 Estrutura exigida

```
Drawer
├── Header
├── Summary
├── Primary actions
├── Secondary grouped actions
├── Context / History
└── Danger Zone
```

---

# 17. Auditoria de modais

| Critério       | Pergunta                           | Passa/Falha |
| -------------- | ---------------------------------- | ----------- |
| Duração        | A tarefa é curta?                  |             |
| Interrupção    | Faz sentido bloquear o utilizador? |             |
| Conteúdo       | Cabe bem no modal?                 |             |
| Ações          | Primária/secundária claras?        |             |
| Cancelar       | É seguro cancelar?                 |             |
| Erros          | Mostra validação?                  |             |
| Acessibilidade | Foco e teclado funcionam?          |             |

## 17.1 Decisão modal vs drawer vs página

| Caso                 | Destino correto             |
| -------------------- | --------------------------- |
| Confirmação curta    | Modal/Dialog                |
| Edição contextual    | Drawer                      |
| Ver detalhes + ações | Drawer                      |
| Builder complexo     | Página dedicada             |
| Configuração longa   | Settings/Página             |
| Ação perigosa        | ConfirmDialog + Danger Zone |

---

# 18. Auditoria de navegação mobile

| Área           | Pergunta                | Problema | Correção     |
| -------------- | ----------------------- | -------- | ------------ |
| Sidebar        | Como aparece em mobile? |          |              |
| Filtros        | Cabem no ecrã?          |          | Bottom sheet |
| Cards          | São legíveis?           |          |              |
| Ações          | Menu Mais funciona?     |          |              |
| Drawers        | Viram bottom sheet?     |          |              |
| Tabs           | São scrolláveis?        |          |              |
| Bulk actions   | Seleção é clara?        |          |              |
| Danger actions | Confirmação é visível?  |          |              |

---

# 19. Auditoria de acessibilidade

Avaliar:

| Critério     | Pergunta                                | Passa/Falha | Correção |
| ------------ | --------------------------------------- | ----------- | -------- |
| Contraste    | Texto tem contraste suficiente?         |             |          |
| Foco visível | Teclado mostra foco?                    |             |          |
| Labels       | Inputs têm label?                       |             |          |
| Botões       | Labels são claros?                      |             |          |
| Ícones       | Ícones têm texto/aria-label?            |             |          |
| Modais       | Foco fica preso no modal?               |             |          |
| Teclado      | Dá para usar sem rato?                  |             |          |
| Erros        | Erros são anunciados e claros?          |             |          |
| Estados      | Loading/empty/error são compreensíveis? |             |          |
| Alvo toque   | Botões mobile têm tamanho suficiente?   |             |          |

---

# 20. Matriz de lacunas UX/UI

## 20.1 Escala de severidade

| Severidade | Critério                       |
| ---------- | ------------------------------ |
| S0         | Bloqueia tarefa crítica        |
| S1         | Causa erro ou perda de dados   |
| S2         | Causa confusão/fricção forte   |
| S3         | Incomoda mas há contorno       |
| S4         | Melhoria estética/consistência |

## 20.2 Tabela de lacunas

| ID    | Módulo     | Lacuna                               | Evidência                 | Impacto           | Severidade | Correção                  | Prioridade |
| ----- | ---------- | ------------------------------------ | ------------------------- | ----------------- | ---------- | ------------------------- | ---------- |
| UX001 | Atletas    | Card sobrecarregado                  | Muitos dados/ações juntos | Demora a ler      | S2         | Reduzir card + menu Mais  | P0         |
| UX002 | Atletas    | Ação perigosa perto de ações normais | Eliminar em menu comum    | Risco de erro     | S1         | Danger zone + confirmação | P0         |
| UX003 | Atleta 360 | Tabs densas ou pouco claras          | Muitos dados              | Confusão          | S2         | Agrupar por tema          | P0         |
| UX004 | Global     | Modais complexos demais              | Builders em modal         | Baixa usabilidade | S2         | Página/drawer             | P1/P2      |

---

# 21. Matriz função atual → destino novo

Esta é a matriz mais importante para não perder funções.

| Função atual          | Módulo  | Local atual | Problema    | Novo destino UX   | Componente React  | Store            | Teste           | Estado             |
| --------------------- | ------- | ----------- | ----------- | ----------------- | ----------------- | ---------------- | --------------- | ------------------ |
| Pesquisar atletas     | Atletas | Toolbar     | OK          | Toolbar           | SearchInput       | athletes.query   | search.spec     | Manter             |
| Filtrar grupo         | Atletas | Toolbar     | Pode poluir | FilterBar/Drawer  | GroupFilter       | athletes.filters | filter.spec     | Manter/Relocalizar |
| Ver 360               | Atletas | Card        | OK          | Botão principal   | View360Button     | focusedAthleteId | navigation.spec | Manter             |
| Editar                | Atletas | Card/Menu   | Ruído       | AthleteEditDrawer | AthleteEditDrawer | activeDrawer     | edit.spec       | Relocalizar        |
| Eliminar              | Atletas | Menu        | Perigoso    | ConfirmDialog     | DeleteDialog      | activeModal      | delete.spec     | Relocalizar        |
| Exportar selecionados | Atletas | Toolbar     | OK          | BulkToolbar       | BulkExportAction  | selectedIds      | bulk.spec       | Manter             |

**Estado permitido:**

* Manter
* Relocalizar
* Substituir
* A validar
* Remover apenas se duplicado e comprovado

---

# 22. Diagrama de estados e feedback

Cada ação importante deve ter estado.

## 22.1 Template

| Ação            | Loading | Sucesso           | Erro           | Cancelar | Toast    |
| --------------- | ------- | ----------------- | -------------- | -------- | -------- |
| Guardar atleta  | Sim     | Perfil atualizado | Erro validação | Sim      | Sim      |
| Eliminar atleta | Sim     | Atleta eliminado  | Erro permissão | Sim      | Sim      |
| Exportar        | Sim     | Download iniciado | Erro export    | Sim      | Sim      |
| Aplicar filtros | Não/Sim | Lista atualizada  | Erro dados     | Sim      | Opcional |

## 22.2 Estados obrigatórios

* loading
* empty
* no results
* error
* success
* disabled
* selected
* focused
* unsaved changes
* dangerous confirmation
* offline/failed request

---

# 23. Diagrama de dados / estado para React

## 23.1 Stores

| Store               | Responsabilidade         | Estado                                                        |
| ------------------- | ------------------------ | ------------------------------------------------------------- |
| ui.store.ts         | UI global                | activeModal, activeDrawer, toast, theme, sidebar, mobile      |
| athletes.store.ts   | Lista e ações de atletas | athletes, query, filters, sort, selectedIds, focusedAthleteId |
| athlete360.store.ts | Vista completa atleta    | athleteId, activeTab, filters, alerts, notes, timeline        |
| groups.store.ts     | Lista grupos             | groups, filters, selectedIds, dynamicRules                    |
| forms.store.ts      | Forms                    | forms, fields, responses, packages                            |
| calendar.store.ts   | Calendário               | currentDate, activeView, events, bookingWizard                |
| analytics.store.ts  | Analytics                | queryBuilder, charts, reports                                 |
| dataos.store.ts     | Regras                   | variables, rules, formulas, logs                              |
| live.store.ts       | Sessão live              | timer, currentExercise, sets, summary                         |
| settings.store.ts   | Configuração             | profile, appearance, security, integrations                   |

---

# 24. Diagramas finais obrigatórios

A análise só está completa quando produzir estes diagramas:

## 24.1 Global Navigation Map
Mostra todos os módulos, submódulos e profundidade.

## 24.2 User Journey Map
Mostra jornada por perfil de utilizador. Colunas:

* fase
* objetivo
* ações
* emoções/dificuldades
* lacunas
* oportunidades

## 24.3 Task Flow Diagram
Mostra passos de uma tarefa específica.
Exemplo: Editar atleta, eliminar atleta, criar form, iniciar sessão Live.

## 24.4 Screen Flow Diagram
Mostra navegação entre ecrãs.
Exemplo: Atletas → Atleta 360 → Saúde → Drawer → Toast.

## 24.5 IA Tree
Mostra arquitetura de informação.

## 24.6 Function Relocation Map
Mostra: "Função atual → Novo local".

## 24.7 Modal / Drawer Lifecycle Diagram
Mostra: abrir → editar → guardar/cancelar → feedback.

## 24.8 State Diagram
Mostra estados: default → loading → success/error → toast.

## 24.9 React Component Map
Mostra: view → component → store → test.

---

# 25. Template para user journey map

| Persona        | Fase             | Objetivo    | Ação            | Ecrã       | Dor/fricção          | Oportunidade         | Métrica             |
| -------------- | ---------------- | ----------- | --------------- | ---------- | -------------------- | -------------------- | ------------------- |
| Treinador      | Encontrar atleta | Ver estado  | Pesquisa/filtro | Atletas    | Lista pesada         | Card limpo + filtros | Tempo até encontrar |
| Treinador      | Avaliar          | Ver detalhe | Ver 360         | Atleta 360 | Dados dispersos      | KPIs + tabs          | Tempo até decisão   |
| Fisioterapeuta | Saúde            | Ver lesão   | Tab Saúde       | Atleta 360 | Informação escondida | Saúde dedicada       | Erros reduzidos     |
| Coordenador    | Grupo            | Ver membros | Grupo 360       | Grupos     | Regras confusas      | Como funciona        | Sucesso tarefa      |

---

# 26. Template para task flow

## Nome da tarefa
Exemplo: Editar atleta.

## Objetivo
Atualizar dados de um atleta sem perder contexto.

## Fluxo

```
Atletas
↓
Pesquisar atleta
↓
Menu Mais
↓
Editar
↓
AthleteEditDrawer
↓
Alterar campos
↓
Guardar
↓
Toast de sucesso
↓
Lista/360 atualizada
```

## Caminhos alternativos

| Situação                 | Resultado esperado       |
| ------------------------ | ------------------------ |
| Utilizador cancela       | Fecha drawer sem guardar |
| Campo inválido           | Mostra erro inline       |
| Erro servidor            | Mostra toast de erro     |
| Alterações não guardadas | Aviso antes de fechar    |

---

# 27. Template para análise de ecrã

Para cada ecrã:

| Campo                        | Resposta |
| ---------------------------- | -------- |
| Nome do ecrã                 |          |
| Módulo                       |          |
| Objetivo principal           |          |
| Utilizador principal         |          |
| Ação principal               |          |
| Ações secundárias            |          |
| Ações contextuais            |          |
| Ações perigosas              |          |
| Informação crítica           |          |
| Informação em excesso        |          |
| Filtros/pesquisa             |          |
| Estados vazios/loading/error |          |
| Problemas UX                 |          |
| Problemas UI                 |          |
| Recomendações                |          |

---

# 28. Template para comparação de versões visuais

Quando forem criadas várias versões no Figma, avaliar assim:

| Versão                    | Clareza | Profissionalismo | Densidade | Rapidez | Escalabilidade | Risco | Nota final |
| ------------------------- | ------: | ---------------: | --------: | ------: | -------------: | ----- | ---------: |
| A — Command Center Dark   |         |                  |           |         |                |       |            |
| B — Clean Sports Clinic   |         |                  |           |         |                |       |            |
| C — Performance Lab       |         |                  |           |         |                |       |            |
| D — Minimal SaaS          |         |                  |           |         |                |       |            |
| E — Tactical Team Manager |         |                  |           |         |                |       |            |
| F — Apple-like Premium    |         |                  |           |         |                |       |            |

**Critérios:**

* O card fica mais limpo?
* A ação principal está clara?
* O utilizador encontra as funções?
* As drawers são úteis?
* Atleta 360 parece forte?
* O visual aguenta muitos dados?
* Mobile é viável?
* Parece produto real ou template bonito?

---

# 29. Acceptance Gate antes de Figma final

Só avançar para design final quando:

| Critério                                 | Estado |
| ---------------------------------------- | ------ |
| Todos os módulos foram listados          |        |
| Todos os ecrãs P0 foram listados         |        |
| Todos os botões P0 foram mapeados        |        |
| Todos os modais P0 têm destino           |        |
| Todos os drawers P0 têm destino          |        |
| Todos os filtros P0 têm store            |        |
| Todas as tabs P0 têm componente          |        |
| Todas as ações perigosas têm confirmação |        |
| Todas as ações em massa têm toolbar      |        |
| Todos os fluxos P0 têm diagrama          |        |
| Todas as lacunas S0/S1/S2 têm solução    |        |
| Versão visual escolhida                  |        |

---

# 30. Acceptance Gate antes de React

Só avançar para React quando:

| Critério                              | Estado |
| ------------------------------------- | ------ |
| Figma P0 aprovado                     |        |
| Componentes base definidos            |        |
| Design system base definido           |        |
| Rotas definidas                       |        |
| Stores definidas                      |        |
| Testes definidos                      |        |
| Paridade P0 validada                  |        |
| Atletas aprovado                      |        |
| Atleta 360 aprovado                   |        |
| Mobile P0 aprovado                    |        |
| Estados empty/loading/error definidos |        |
| Handoff pronto                        |        |

---

# 31. Entregáveis finais esperados

A análise deve entregar:

1. Relatório UX/UI.
2. Global Navigation Map.
3. User Journey Maps.
4. Task Flow Diagrams.
5. Screen Flow Diagrams.
6. Function Inventory.
7. Button Registry.
8. Modal Registry.
9. Drawer Registry.
10. Filter/Search Registry.
11. Tab Registry.
12. Dangerous Actions Registry.
13. UX Relocation Map.
14. Component Map React.
15. Zustand Store Map.
16. QA Checklist.
17. Lista de lacunas por severidade.
18. Recomendação de prioridades P0/P1/P2.
19. Figma brief para gerar versões visuais.
20. Definition of Done.

---

# 32. Definition of Done da auditoria

A auditoria só está concluída quando for possível responder, para cada função:

1. Esta função existe hoje?
2. Onde aparece hoje?
3. Que problema causa?
4. É primary, secondary, contextual, advanced ou dangerous?
5. Vai ficar onde no novo UX?
6. Que componente React vai usar?
7. Que store/estado precisa?
8. Que teste prova que não se perdeu?
9. É P0, P1 ou P2?
10. Está confirmada ou ainda precisa validação?

**Se alguma função não tiver resposta, a auditoria não está fechada.**

---

## Referências

- Nielsen Norman Group — 10 Usability Heuristics for User Interface Design
- NN/g — Journey Mapping 101
- GOV.UK Service Manual — Map a user's whole problem
- W3C — WCAG 2.2 (Web Content Accessibility Guidelines)
- ISO 9241-210 — Human-centred design for interactive systems
- Apple — Human Interface Guidelines (HIG)
- Material Design — Navigation & Navigation drawer
- IBM Carbon Design System — Data tables & Modals
- Atlassian Design System — Navigation
- Baymard Institute — Search, Filtering & Listings UX research

---

# 33. Análise crítica do estado atual (com evidência no código)

> Esta secção **não é template** — é a auditoria real feita ao código de `apps/coach` (React + Vite + Supabase, monorepo Turbo). Cada achado tem evidência `ficheiro:linha`, severidade (S0–S4, ver §20.1) e correção concreta. É o "o que está mal" que faltava ao documento.

## 33.0 Veredito em uma linha

A app tem **boas fundações** (router protegido, estados loading/empty/error tratados, fluxo de arquivar com confirmação, board contextual bem pensado), mas sofre de **três doenças sistémicas**:

1. **Navegação que mente** — a sidebar, a barra mobile e o command palette mostram módulos diferentes entre si, e a maioria leva a páginas "Em breve".
2. **Afordâncias falsas** — dezenas de botões que só fazem `toast('Em breve')`, um atalho `⌘K` anunciado mas não montado, filtros que devolvem sempre lista vazia.
3. **Fragmentação de design system** — dois sistemas de modal a coexistir, 86 KB de CSS à mão, e a arquitetura de estado prometida (stores) não existe — é tudo `useState` local.

**Maturidade UX/UI atual estimada: ~2,5/5.** O esqueleto é sólido; a casca promete muito mais do que entrega.

---

## 33.1 Navegação incoerente entre as três fontes (S1)

Existem **três listas de módulos** que deviam ser uma só e **não coincidem**:

| Módulo       | Sidebar (`CoachNav`) | Barra mobile (`MobileNav`) | Command Palette |
| ------------ | :------------------: | :------------------------: | :-------------: |
| Início       | ✅ | ✅ | ✅ |
| Atletas      | ✅ | ✅ | ✅ |
| Grupos       | ✅ | ❌ | ✅ |
| Studio       | ✅ | ✅ | ✅ |
| Forms.OS     | ✅ | ❌ | ❌ |
| Analytics.OS | ✅ | ❌ | ❌ |
| Data.OS      | ✅ | ❌ | ✅ |
| Live         | ✅ | ❌ | ✅ |
| Calendário   | ✅ | ❌ | ✅ |
| Definições   | ✅ | ✅ | ✅ |

**Evidência:** [CoachNav.tsx:4](apps/coach/src/app/CoachNav.tsx#L4) (`PRINCIPAL`), [MobileNav.tsx:32](apps/coach/src/app/MobileNav.tsx#L32) (apenas 4 destinos + FAB), [CommandPalette.tsx:5](apps/coach/src/app/CommandPalette.tsx#L5) (`NAV` — falta Forms.OS e Analytics.OS).

**Problemas concretos:**
- A barra mobile dá lugar de destaque ao **Studio (que é um stub "Em breve")** mas **esconde Grupos e Calendário**, que são módulos reais.
- O command palette **omite Forms.OS e Analytics.OS** que existem na sidebar.
- Dois itens da sidebar partilham o **mesmo ícone `cal`**: Studio e Calendário ([CoachNav.tsx:8](apps/coach/src/app/CoachNav.tsx#L8) e [:13](apps/coach/src/app/CoachNav.tsx#L13)).

**Correção:** extrair uma **única fonte de verdade** (`navModules.ts`) com `{ id, label, icon, to, status, surfaces[] }` e derivar sidebar, barra mobile e palette dessa lista. Atribuir o lugar mobile aos módulos reais mais usados, não a stubs.

---

## 33.2 Módulos anunciados que são cascas vazias (S1)

Dos 9 módulos "Principal" da sidebar, **só 3 estão construídos** (Atletas, Grupos, Calendário, + Dashboard). Os restantes são `<Soon>`:

**Evidência:** [router.tsx:39-60](apps/coach/src/app/router.tsx#L39) — `Live`, `Data.OS`, `Studio`, `Forms.OS`, `Analytics.OS` e `Definições` renderizam todos `<Soon name=… />`.

| Módulo | Estado real | A sidebar promete? |
| ------ | ----------- | ------------------ |
| Dashboard, Atletas, Atleta 360, Grupos, Grupo 360, Calendário | Construído | ✅ |
| Studio, Forms.OS, Analytics.OS, Data.OS, Live, Definições | "Em breve" | ✅ (engana) |

**Problema:** a navegação trata os 9 módulos como iguais. Um utilizador clica em "Forms.OS" e bate numa parede. Pior: **Definições é um stub** — não há onde gerir perfil, segurança ou tema, embora a sidebar e a barra mobile lá levem.

**Correção:** distinguir visualmente módulos ativos de futuros (badge "Brevemente" inline, como já se faz no grupo `Próximas fases` em [CoachNav.tsx:42](apps/coach/src/app/CoachNav.tsx#L42)), e **não dar lugar de navegação primária a stubs**. Mover os "Em breve" para a secção colapsada que já existe.

---

## 33.3 Atalho `⌘K` anunciado mas morto (S2)

A página de Atletas mostra o subtítulo **"Gestão operacional · Ctrl/⌘K para comandar"** ([Athletes.tsx:576](apps/coach/src/pages/Athletes.tsx#L576)), mas o hook `useCommandPalette` **nunca é importado nem montado** em lado nenhum (só existe no próprio ficheiro).

**Evidência:** `useCommandPalette` definido em [CommandPalette.tsx:16](apps/coach/src/app/CommandPalette.tsx#L16); zero usos noutros ficheiros. Nem `CoachShell` nem `router` o montam.

**Agravante:** mesmo que fosse montado, mostra atalhos sequenciais `G D`, `G A`… como `kbd` ([CommandPalette.tsx:85](apps/coach/src/app/CommandPalette.tsx#L85)) mas **não há handler** para eles — só `Ctrl/⌘K` está implementado ([:36](apps/coach/src/app/CommandPalette.tsx#L36)). Dupla afordância falsa.

**Correção:** montar o palette no shell (uma vez, global) e implementar os atalhos `G+letra`, **ou** remover o texto que o anuncia e os `kbd` decorativos. Não prometer o que não existe.

---

## 33.4 Botões que não fazem nada — "Em breve" como padrão (S2)

A página de Atletas está cheia de ações que só disparam `stubModuleAction` → `toast('Em breve')`.

**Evidência:** [Athletes.tsx:50](apps/coach/src/pages/Athletes.tsx#L50) (`stubModuleAction`) usado em **Pedir documento, Enviar form, Atribuir coach, Criar tarefa, Mensagem, Exportar, Pedir documentos** ([:289-293](apps/coach/src/pages/Athletes.tsx#L289), [:339-349](apps/coach/src/pages/Athletes.tsx#L339)).

No board de seleção única, **5 das 6 "Ações rápidas" são stubs**. Na seleção múltipla, metade das ações são stubs.

**Problema:** o utilizador não distingue o que funciona do que é promessa até clicar. Isto destrói confiança e viola "Visibilidade do estado" e "Prevenção de erros" (§13). É ruído que faz o card/board parecer mais capaz do que é.

**Correção:** ou marcar visualmente as ações futuras (estado `disabled` + badge "Brevemente", como no nav), ou removê-las até o módulo existir. Nunca um botão de aparência normal que só diz "Em breve".

---

## 33.5 Filtros e métricas permanentemente vazios (S2)

Vários filtros e contadores estão **hardcoded a zero / lista vazia**, mas continuam visíveis e clicáveis:

**Evidência:**
- `forms: 0` fixo em [Athletes.tsx:78](apps/coach/src/pages/Athletes.tsx#L78) (`phase3Counts`).
- `filter === 'forms'` → `list = []` **sempre** ([:455](apps/coach/src/pages/Athletes.tsx#L455)); `'onboarding'` idem ([:457](apps/coach/src/pages/Athletes.tsx#L457)).
- O board mostra "Forms pendentes" e oferece um botão **"Ver forms pendentes"** ([:223](apps/coach/src/pages/Athletes.tsx#L223)) que filtra para uma lista garantidamente vazia.

Há mitigação parcial (`NO_DATA_FILTERS` desativa os chips `forms`/`onboarding` em [:432](apps/coach/src/pages/Athletes.tsx#L432)), mas **o board ignora essa proteção** e continua a oferecer o atalho morto.

**Correção:** alinhar board e chips à mesma lista `NO_DATA_FILTERS`; esconder (não desativar) o que nunca terá dados nesta fase.

---

## 33.6 Duplicação de pontos de entrada (S3)

A mesma ação aparece várias vezes na mesma vista:

| Ação | Onde aparece (duplicado) |
| ---- | ------------------------ |
| **+ Atleta** | `topActions` ([:577](apps/coach/src/pages/Athletes.tsx#L577)) **e** `head-actions` ([:622](apps/coach/src/pages/Athletes.tsx#L622)) — dois botões primários no mesmo ecrã desktop |
| **Mais filtros** | inline ([:663](apps/coach/src/pages/Athletes.tsx#L663)) + barra avançada ([:680](apps/coach/src/pages/Athletes.tsx#L680)) + ícone ⚙ ([:673](apps/coach/src/pages/Athletes.tsx#L673)) — **três gatilhos** para o mesmo modal |
| **Filtrar por estado** | `stats` (botões `aria-pressed`, [:627](apps/coach/src/pages/Athletes.tsx#L627)) **e** `filter-row` (chips `role=tab`, [:691](apps/coach/src/pages/Athletes.tsx#L691)) — dois sistemas visuais para o mesmo `setFilter` |
| **Guardar vista** | `head-actions` + board "Ações rápidas" |

**Problema:** viola "Consistência e padrões" e "Minimalismo" (§13). Aumenta carga cognitiva e área de manutenção.

**Correção:** uma ação = um lugar canónico. `+ Atleta` só no topbar; um único gatilho de "Mais filtros"; unificar stats e chips num só sistema de filtro (ou tornar os stats puramente informativos e os chips o controlo).

---

## 33.7 Acessibilidade — lacunas reais (S1/S2)

**Sem focus trap nos overlays (S1):** nem `ProtoModal` nem `ProtoDrawer` prendem o foco. Fazem ESC, backdrop e focam o container ao abrir, mas o `Tab` sai do diálogo para a página por trás, e o foco **não regressa ao gatilho** ao fechar. Viola WCAG 2.4.3 (Focus Order) e o padrão de diálogo modal da APG.
**Evidência:** [ProtoModal.tsx:33-44](apps/coach/src/app/ProtoModal.tsx#L33), [ProtoDrawer.tsx:27-38](apps/coach/src/app/ProtoDrawer.tsx#L27).

**Rótulo do diálogo (S2):** usa `aria-label={title}` em vez de `aria-labelledby` a apontar para o `<h3>` real ([ProtoModal.tsx:56](apps/coach/src/app/ProtoModal.tsx#L56)). Funciona, mas duplica string e perde ligação semântica.

**`role="link"` com botões lá dentro (S2):** cada linha de atleta é um `role="link"` ([Athletes.tsx:771](apps/coach/src/pages/Athletes.tsx#L771)) que **contém dois `<button>`** (info e ação). Conteúdo interativo dentro de um link é HTML inválido e confunde leitores de ecrã.

**Mau uso de `role="tab"` (S2):** os chips de filtro usam `role="tab"`/`aria-selected` ([Athletes.tsx:691-704](apps/coach/src/pages/Athletes.tsx#L691)) mas **não há `tabpanel`** — é um grupo de toggle, não tabs. Devia ser `aria-pressed` (como os stats já fazem).

**Correção:** adicionar focus trap + restauro de foco a um único componente de overlay; trocar `role="link"` por um `<button>`/`<a>` real sem interativos aninhados; trocar `role="tab"` por toggles `aria-pressed`.

---

## 33.8 Fragmentação do design system (S2)

**Dois sistemas de modal a coexistir:**
- `ProtoModal` / `ProtoDrawer` (locais à app, fiéis ao CSS do protótipo) — usados em toda a app.
- `Modal` de `@luna/ui` — usado só no `CommandPalette` ([CommandPalette.tsx:3](apps/coach/src/app/CommandPalette.tsx#L3)) e na `Poc`.

**86 KB de CSS à mão:** [luna-proto.css](apps/coach/src/luna-proto.css) (86 818 bytes) com classes utilitárias próprias (`.btn primary`, `.badge bwarn`, `.board-card`…) em paralelo com `packages/tokens` e `packages/ui`. Há **tokens via `var(--…)` inline** no palette ([CommandPalette.tsx:53+](apps/coach/src/app/CommandPalette.tsx#L53)) e classes do proto-CSS em todo o lado — dois vocabulários de estilo.

**Problema:** o §30 do gate ("Design system base definido") **falha**. Qualquer redesign tem de decidir entre `@luna/ui` e o proto-CSS antes de escalar.

**Correção:** escolher UM sistema. Migrar `ProtoModal`/`ProtoDrawer` para `@luna/ui` (com focus trap incluído) e aposentar o uso direto de `luna-proto.css` por componente.

---

## 33.9 A arquitetura de estado prometida não existe (S3)

O §23 deste documento desenha 10 stores Zustand (`ui.store`, `athletes.store`, `athlete360.store`…). **Na realidade, o estado é todo `useState` local.**

**Evidência:** `Athletes` tem **~16 `useState`** no mesmo componente ([Athletes.tsx:368-385](apps/coach/src/pages/Athletes.tsx#L368)); o Atleta 360 guarda a tab ativa em `useState` local ([Athlete360.tsx:164](apps/coach/src/pages/Athlete360.tsx#L164)); vistas guardadas vão direto a `localStorage` ([Athletes.tsx:35-48](apps/coach/src/pages/Athletes.tsx#L35)). O único store real é `useAuthStore` (de `@luna/core`).

**Consequência prática:** features cross-component ficam impossíveis. É por isto que o command palette **não consegue** agir sobre a seleção de atletas — a seleção vive dentro de `Athletes`, não num store partilhado.

**Correção:** extrair pelo menos `ui.store` (overlays/toast/tema) e `athletes.store` (query/filters/sort/selection) antes de ligar palette e ações globais.

---

## 33.10 Sobreposição de camadas de navegação em mobile (S2 — validar em dispositivo)

Em mobile (<960px) coexistem **quatro** camadas de navegação/ação:
1. `☰` no topbar → abre a sidebar completa como drawer ([CoachShell.tsx:61-92](apps/coach/src/app/CoachShell.tsx#L61)).
2. `.mnav` — barra inferior fixa de 5 slots ([MobileNav.tsx:32](apps/coach/src/app/MobileNav.tsx#L32)).
3. FAB radial central com 3 ações ([MobileNav.tsx:40](apps/coach/src/app/MobileNav.tsx#L40)).
4. `.mobile-actions` — barra de ações **por página** (Atletas) também fixa em baixo ([Athletes.tsx:580](apps/coach/src/pages/Athletes.tsx#L580)).

**Risco:** a barra global `.mnav` e a barra `.mobile-actions` da página são ambas fixas no fundo → potencial **colisão/empilhamento** e duplicação de "Atribuir". A descoberta divide-se entre ☰ (tudo) e a barra (4 itens), obrigando o utilizador a aprender dois mapas.

**Correção:** decidir uma estratégia mobile única. Sugerido: barra inferior só para os 4 destinos reais + FAB para criar; ações de página vivem no board/drawer, não numa segunda barra fixa. **Verificar em dispositivo real** antes de assumir colisão.

---

## 33.11 Atleta 360 — tabs com metade do conteúdo por ligar (S3)

Das 7 tabs, **2 são placeholders**: "Analítica" e "Forms" renderizam `ModulePlaceholder` ("entram quando o módulo estiver ligado").

**Evidência:** [Athlete360.tsx:332-333](apps/coach/src/pages/Athlete360.tsx#L332).

**Problema:** o utilizador paga o custo de navegação (clicar a tab) para receber um vazio. Mesma família de problema do §33.2/33.4.

**Correção:** esconder tabs sem dados nesta fase, ou marcá-las claramente como "Brevemente" no próprio separador (não só no conteúdo).

---

## 33.12 O que está BEM (para não destruir no redesign)

A auditoria também tem de proteger o que funciona:

- **Router protegido e coerente** — `Protected` + `ModuleLayout` por módulo, com `:id` aninhado para 360 ([router.tsx:49-58](apps/coach/src/app/router.tsx#L49)).
- **Estados loading / empty / error tratados** na lista de atletas, incluindo empty state com CTA ([Athletes.tsx:736-746](apps/coach/src/pages/Athletes.tsx#L736)).
- **Fluxo destrutivo correto** — Arquivar vive numa "Zona de risco" separada **e** exige `ConfirmArchiveModal` ([Athletes.tsx:297](apps/coach/src/pages/Athletes.tsx#L297), [:974](apps/coach/src/pages/Athletes.tsx#L974)). É exatamente o padrão pedido no §6/§12.
- **Board contextual inteligente** — muda entre "sem seleção / 1 atleta / N atletas" com pré-visualização de impacto ([Athletes.tsx:179-362](apps/coach/src/pages/Athletes.tsx#L179)).
- **Pesquisa + ordenação + filtros + vistas guardadas** já implementados e persistidos.
- **Cancelamento de pedidos** com flag `cancelled` no fetch ([Athletes.tsx:397-403](apps/coach/src/pages/Athletes.tsx#L397)).

> Regra do §0 reforçada: estes pontos são **funções a manter/relocalizar**, nunca a apagar.

---

## 33.13 Plano de remediação priorizado

| # | Achado | Sev. | Esforço | Prioridade |
| - | ------ | :--: | :-----: | :--------: |
| 1 | Fonte única de navegação (§33.1) | S1 | M | **P0** |
| 2 | Stubs fora da navegação primária (§33.2) | S1 | S | **P0** |
| 3 | Focus trap + restauro de foco nos overlays (§33.7) | S1 | M | **P0** |
| 4 | Remover/assinalar botões "Em breve" (§33.4) | S2 | S | **P0** |
| 5 | `role="link"`/`role="tab"` corrigidos (§33.7) | S2 | S | **P0** |
| 6 | Atalho ⌘K: montar ou remover anúncio (§33.3) | S2 | S | P1 |
| 7 | Alinhar filtros/board vazios (§33.5) | S2 | S | P1 |
| 8 | Unificar pontos de entrada duplicados (§33.6) | S3 | M | P1 |
| 9 | Escolher um design system (§33.8) | S2 | L | P1 |
| 10 | Extrair `ui.store` + `athletes.store` (§33.9) | S3 | L | P2 |
| 11 | Estratégia mobile única (§33.10) | S2 | M | P2 |
| 12 | Tabs vazias do 360 (§33.11) | S3 | S | P2 |

**Sequência recomendada:** primeiro a "navegação que mente" (1, 2) e a acessibilidade bloqueante (3, 5) — são P0 de baixo/médio esforço e alto impacto de confiança. Depois limpar as afordâncias falsas (4, 6, 7). Só então atacar a dívida estrutural (9, 10), que é onde está o esforço grande.

---

# ANEXO 34 — AUDITORIA DE COMPLETUDE FUNCIONAL, SUITES E WORKFLOW REAL DO CLIENTE
## LUNA.OS / Verificação de funções em falta, lacunas de processo e cobertura ponta-a-ponta

## 34.0 Objetivo deste anexo

Este anexo deve ser executado como complemento obrigatório à auditoria UX/UI principal.

A auditoria anterior identifica problemas de navegação, UI, modais, drawers, stubs, acessibilidade, design system e arquitetura de estado. Este anexo tem outro objetivo:

**verificar se falta alguma função, passo, ecrã, ação, permissão, estado, relatório, integração ou fluxo essencial para que a LUNA.OS cubra o processo real de trabalho do cliente do início ao fim.**

A pergunta principal é:

> A app permite ao utilizador fazer o trabalho completo, sem recorrer a folhas externas, notas soltas, WhatsApp, Excel, calendários externos ou memória humana para completar processos que deviam estar dentro da LUNA.OS?

---

# 34.1 Regra central desta auditoria

Nenhuma suite deve ser avaliada apenas por ecrãs existentes.

Cada suite deve ser avaliada por:

1. Processo real do utilizador.
2. Tarefas críticas.
3. Entradas de dados.
4. Ações disponíveis.
5. Estados intermédios.
6. Exceções e erros.
7. Saídas esperadas.
8. Relatórios gerados.
9. Responsáveis.
10. Permissões.
11. Histórico/auditoria.
12. Notificações.
13. Integrações.
14. Mobile/tablet.
15. Paridade entre app atual e app futura.

Se uma suite tem ecrã bonito mas não cobre o processo real, a suite está incompleta.

---

# 34.2 Objetivos concretos da auditoria

Esta auditoria deve responder obrigatoriamente a estas perguntas:

| Pergunta                                                     | Resposta obrigatória      |
| ------------------------------------------------------------ | ------------------------- |
| Existem funções em falta em alguma suite?                    | Sim/Não + lista           |
| Existem workflows incompletos?                               | Sim/Não + etapa em falta  |
| Existem ações que aparecem mas não funcionam?                | Sim/Não + localização     |
| Existem ações necessárias que não aparecem em lado nenhum?   | Sim/Não + novo destino UX |
| Existem módulos anunciados mas não entregues?                | Sim/Não + decisão         |
| Existem relatórios que o cliente vai precisar e não existem? | Sim/Não + especificação   |
| Existem estados críticos não tratados?                       | Sim/Não + correção        |
| Existem permissões/roles em falta?                           | Sim/Não + impacto         |
| Existem notificações/reminders em falta?                     | Sim/Não + impacto         |
| Existem integrações necessárias?                             | Sim/Não + prioridade      |
| Existem dados que são recolhidos mas não usados?             | Sim/Não + destino         |
| Existem dados que são necessários mas não são recolhidos?    | Sim/Não + origem          |
| Existe rastreabilidade/histórico suficiente?                 | Sim/Não + lacuna          |
| O utilizador consegue completar o processo sem sair da app?  | Sim/Não + onde sai        |

---

# 34.3 Suites obrigatórias a auditar

Auditar individualmente cada suite/módulo.

| ID  | Suite/Módulo                 | Prioridade | Tipo de auditoria                                           |
| --- | ---------------------------- | ---------: | ----------------------------------------------------------- |
| S01 | App Shell / Navegação global |         P0 | Navegação, permissões, shortcuts, command palette, mobile   |
| S02 | Dashboard                    |         P1 | Visão operacional, alertas, resumo do dia, decisões rápidas |
| S03 | Atletas                      |         P0 | CRUD, filtros, pesquisa, ações individuais, bulk actions    |
| S04 | Atleta 360                   |         P0 | Vista completa, saúde, métricas, forms, sessões, timeline   |
| S05 | Grupos                       |         P1 | Criação, membros, filtros, ações coletivas                  |
| S06 | Grupo 360                    |         P1 | Resumo, membros, atribuições, saúde coletiva, performance   |
| S07 | Studio                       |      P1/P2 | Exercícios, treinos, planos, aulas, biblioteca, publicação  |
| S08 | Forms.OS                     |         P1 | Criação, envio, resposta, revisão, exportação               |
| S09 | Analytics.OS                 |         P2 | Queries, gráficos, relatórios, templates, distribuição      |
| S10 | Data.OS                      |         P2 | Variáveis, regras, automações, logs, conflitos              |
| S11 | Live                         |         P2 | Sessão ao vivo, timer, exercícios, séries, resumo           |
| S12 | Calendário                   |         P1 | Eventos, marcações, disponibilidade, férias, lista espera   |
| S13 | Settings                     |      P1/P2 | Perfil, utilizadores, permissões, segurança, integrações    |
| S14 | Relatórios                   |      P1/P2 | Relatórios operacionais, clínicos, performance e gestão     |
| S15 | Notificações                 |      P1/P2 | Alertas, reminders, tarefas, follow-ups                     |
| S16 | Auditoria/Histórico          |      P1/P2 | Logs, alterações, rastreabilidade, responsabilidade         |

---

# 34.4 Matriz de completude por suite

Para cada suite, preencher esta matriz.

| Suite        | Objetivo real                      | Funções existentes | Funções em falta | Fluxos incompletos | Relatórios necessários | Severidade | Prioridade |
| ------------ | ---------------------------------- | ------------------ | ---------------- | ------------------ | ---------------------- | ---------- | ---------- |
| Atletas      | Gerir atletas e aceder ao 360      |                    |                  |                    |                        |            |            |
| Atleta 360   | Ver estado completo do atleta      |                    |                  |                    |                        |            |            |
| Grupos       | Gerir grupos e ações coletivas     |                    |                  |                    |                        |            |            |
| Forms.OS     | Criar, enviar e analisar forms     |                    |                  |                    |                        |            |            |
| Calendário   | Gerir eventos e disponibilidade    |                    |                  |                    |                        |            |            |
| Live         | Executar sessões ao vivo           |                    |                  |                    |                        |            |            |
| Studio       | Criar treino/plano/exercício       |                    |                  |                    |                        |            |            |
| Analytics.OS | Analisar dados e gerar insights    |                    |                  |                    |                        |            |            |
| Data.OS      | Automatizar regras e dados         |                    |                  |                    |                        |            |            |
| Settings     | Configurar app, segurança e equipa |                    |                  |                    |                        |            |            |

---

# 34.5 Auditoria de workflow real do cliente

Esta parte deve mapear o processo real, não a interface.

## 34.5.1 Workflow macro esperado

Auditar se a LUNA.OS cobre este ciclo completo:

```txt
1. Criar / importar atleta
2. Atribuir atleta a grupo
3. Recolher dados iniciais
4. Enviar formulário inicial
5. Agendar avaliação ou sessão
6. Registar dados de saúde/performance
7. Criar plano ou treino
8. Atribuir plano/treino/form/tarefa
9. Executar sessão Live
10. Registar métricas e notas
11. Detetar alertas / risco
12. Gerar ação recomendada
13. Comunicar com atleta/staff
14. Acompanhar evolução
15. Gerar relatório
16. Rever histórico
17. Arquivar ou alterar estado
```

## 34.5.2 Tabela de cobertura do workflow

| Etapa                     | Existe na app? | Onde existe | Quem executa | Dados necessários | Resultado esperado | Lacuna | Severidade |
| ------------------------- | -------------: | ----------- | ------------ | ----------------- | ------------------ | ------ | ---------- |
| Criar atleta              |        Sim/Não |             |              |                   |                    |        |            |
| Importar atleta           |        Sim/Não |             |              |                   |                    |        |            |
| Atribuir a grupo          |        Sim/Não |             |              |                   |                    |        |            |
| Enviar formulário inicial |        Sim/Não |             |              |                   |                    |        |            |
| Registar avaliação        |        Sim/Não |             |              |                   |                    |        |            |
| Agendar sessão            |        Sim/Não |             |              |                   |                    |        |            |
| Criar plano               |        Sim/Não |             |              |                   |                    |        |            |
| Atribuir treino/plano     |        Sim/Não |             |              |                   |                    |        |            |
| Executar sessão Live      |        Sim/Não |             |              |                   |                    |        |            |
| Registar notas            |        Sim/Não |             |              |                   |                    |        |            |
| Detetar risco             |        Sim/Não |             |              |                   |                    |        |            |
| Criar tarefa/follow-up    |        Sim/Não |             |              |                   |                    |        |            |
| Comunicar com atleta      |        Sim/Não |             |              |                   |                    |        |            |
| Gerar relatório           |        Sim/Não |             |              |                   |                    |        |            |
| Ver histórico             |        Sim/Não |             |              |                   |                    |        |            |
| Arquivar atleta           |        Sim/Não |             |              |                   |                    |        |            |

---

# 34.6 Auditoria de funções em falta por tipo

## 34.6.1 CRUD completo

Cada entidade principal deve ter Create, Read, Update, Archive/Delete, Duplicate quando aplicável.

| Entidade          | Criar | Ver | Editar | Arquivar | Eliminar | Duplicar | Exportar | Importar | Histórico | Estado |
| ----------------- | ----: | --: | -----: | -------: | -------: | -------: | -------: | -------: | --------: | ------ |
| Atleta            |       |     |        |          |          |          |          |          |           |        |
| Grupo             |       |     |        |          |          |          |          |          |           |        |
| Exercício         |       |     |        |          |          |          |          |          |           |        |
| Treino            |       |     |        |          |          |          |          |          |           |        |
| Plano             |       |     |        |          |          |          |          |          |           |        |
| Formulário        |       |     |        |          |          |          |          |          |           |        |
| Resposta de form  |       |     |        |          |          |          |          |          |           |        |
| Evento calendário |       |     |        |          |          |          |          |          |           |        |
| Regra Data.OS     |       |     |        |          |          |          |          |          |           |        |
| Relatório         |       |     |        |          |          |          |          |          |           |        |

## 34.6.2 Ações funcionais obrigatórias

| Ação            | Existe? | Onde? | Funciona? | Stub? | Deve existir em que suites? | Prioridade |
| --------------- | ------: | ----- | --------: | ----: | --------------------------- | ---------- |
| Criar           |         |       |           |       |                             |            |
| Editar          |         |       |           |       |                             |            |
| Duplicar        |         |       |           |       |                             |            |
| Arquivar        |         |       |           |       |                             |            |
| Eliminar        |         |       |           |       |                             |            |
| Exportar        |         |       |           |       |                             |            |
| Importar        |         |       |           |       |                             |            |
| Atribuir        |         |       |           |       |                             |            |
| Enviar          |         |       |           |       |                             |            |
| Agendar         |         |       |           |       |                             |            |
| Remarcar        |         |       |           |       |                             |            |
| Cancelar        |         |       |           |       |                             |            |
| Adicionar nota  |         |       |           |       |                             |            |
| Ver histórico   |         |       |           |       |                             |            |
| Criar tarefa    |         |       |           |       |                             |            |
| Notificar       |         |       |           |       |                             |            |
| Gerar relatório |         |       |           |       |                             |            |

---

# 34.7 Auditoria por processo: Atleta

## 34.7.1 Processo completo do atleta

Auditar se o processo de um atleta está completo.

```txt
Atleta criado
↓
Dados básicos completos
↓
Grupo atribuído
↓
Estado inicial definido
↓
Form inicial enviado
↓
Avaliação registada
↓
Plano/treino atribuído
↓
Sessões executadas
↓
Métricas recolhidas
↓
Alertas detetados
↓
Ações/tarefas criadas
↓
Relatório gerado
↓
Histórico consultável
```

## 34.7.2 Checklist de completude do atleta

| Item                      | Existe? | Observações |
| ------------------------- | ------: | ----------- |
| Dados pessoais/base       |         |             |
| Modalidade/desporto       |         |             |
| Grupo/equipa              |         |             |
| Estado operacional        |         |             |
| Estado clínico            |         |             |
| Contacto                  |         |             |
| Responsável/coach         |         |             |
| Tags                      |         |             |
| Documentos                |         |             |
| Forms pendentes           |         |             |
| Histórico de forms        |         |             |
| Sessões realizadas        |         |             |
| Próximas sessões          |         |             |
| Métricas atuais           |         |             |
| Tendências                |         |             |
| Alertas                   |         |             |
| Notas clínicas            |         |             |
| Notas internas            |         |             |
| Tarefas associadas        |         |             |
| Relatórios                |         |             |
| Timeline completa         |         |             |
| Exportação do perfil      |         |             |
| Arquivo/eliminação segura |         |             |

---

# 34.8 Auditoria por processo: Grupo

## 34.8.1 Processo completo de grupo

```txt
Grupo criado
↓
Tipo de grupo definido
↓
Membros adicionados
↓
Regras de entrada/saída definidas
↓
Atribuições coletivas feitas
↓
Forms/plano/tarefas enviados
↓
Estado coletivo monitorizado
↓
Alertas coletivos detetados
↓
Relatório de grupo gerado
↓
Histórico consultável
```

## 34.8.2 Checklist de completude do grupo

| Item                       | Existe? | Observações |
| -------------------------- | ------: | ----------- |
| Criar grupo manual         |         |             |
| Criar grupo dinâmico       |         |             |
| Adicionar membros          |         |             |
| Remover membros            |         |             |
| Regras dinâmicas           |         |             |
| Preview de membros         |         |             |
| Atribuir treino/plano/form |         |             |
| Mensagem coletiva          |         |             |
| Tarefas coletivas          |         |             |
| Métricas agregadas         |         |             |
| Alertas coletivos          |         |             |
| Saúde coletiva             |         |             |
| Performance coletiva       |         |             |
| Exportar grupo             |         |             |
| Relatório de grupo         |         |             |
| Timeline/histórico         |         |             |

---

# 34.9 Auditoria por processo: Forms.OS

## 34.9.1 Processo completo de formulário

```txt
Criar formulário
↓
Adicionar campos
↓
Configurar validações
↓
Pré-visualizar
↓
Publicar
↓
Atribuir a atleta/grupo
↓
Enviar
↓
Receber respostas
↓
Marcar resposta revista
↓
Gerar alerta se necessário
↓
Exportar/analisar
↓
Associar ao Atleta 360
```

## 34.9.2 Checklist Forms.OS

| Item                    | Existe? | Observações |
| ----------------------- | ------: | ----------- |
| Criar form              |         |             |
| Editar form             |         |             |
| Duplicar form           |         |             |
| Arquivar form           |         |             |
| Field builder           |         |             |
| Tipos de campo          |         |             |
| Validação de campos     |         |             |
| Secções/páginas         |         |             |
| Preview                 |         |             |
| Publicar/despublicar    |         |             |
| Atribuir a atleta       |         |             |
| Atribuir a grupo        |         |             |
| Enviar lembrete         |         |             |
| Ver respostas           |         |             |
| Marcar revista          |         |             |
| Gerar alerta            |         |             |
| Exportar respostas      |         |             |
| Ligar ao Atleta 360     |         |             |
| Histórico de alterações |         |             |

---

# 34.10 Auditoria por processo: Studio

## 34.10.1 Processo completo Studio

```txt
Criar exercício
↓
Criar treino
↓
Criar plano
↓
Organizar biblioteca
↓
Atribuir a atleta/grupo
↓
Executar em Live
↓
Recolher resultado
↓
Analisar evolução
↓
Ajustar plano
```

## 34.10.2 Checklist Studio

| Item                     | Existe? | Observações |
| ------------------------ | ------: | ----------- |
| Criar exercício          |         |             |
| Biblioteca de exercícios |         |             |
| Categorias/tags          |         |             |
| Criar treino             |         |             |
| Workout builder          |         |             |
| Drag/drop                |         |             |
| Séries/repetições/tempo  |         |             |
| Criar plano              |         |             |
| Calendário de plano      |         |             |
| Publicar plano           |         |             |
| Duplicar treino/plano    |         |             |
| Atribuir a atleta        |         |             |
| Atribuir a grupo         |         |             |
| Histórico de versões     |         |             |
| Ligação ao Live          |         |             |
| Exportar plano           |         |             |

---

# 34.11 Auditoria por processo: Live

## 34.11.1 Processo completo Live

```txt
Selecionar atleta/grupo
↓
Selecionar treino
↓
Iniciar sessão
↓
Controlar timer
↓
Registar séries/exercícios
↓
Adicionar notas
↓
Marcar concluído/falhado
↓
Guardar resumo
↓
Atualizar Atleta 360
↓
Gerar relatório de sessão
```

## 34.11.2 Checklist Live

| Item                 | Existe? | Observações |
| -------------------- | ------: | ----------- |
| Nova sessão          |         |             |
| Escolher atleta      |         |             |
| Escolher grupo       |         |             |
| Escolher treino      |         |             |
| Timer                |         |             |
| Pausar/retomar       |         |             |
| Trocar exercício     |         |             |
| Saltar exercício     |         |             |
| Registar série       |         |             |
| Marcar OK/falhado    |         |             |
| Notas durante sessão |         |             |
| Quick add exercício  |         |             |
| Resumo final         |         |             |
| Guardar sessão       |         |             |
| Exportar PDF         |         |             |
| Atualizar métricas   |         |             |
| Ligar ao Atleta 360  |         |             |

---

# 34.12 Auditoria por processo: Calendário

## 34.12.1 Processo completo calendário

```txt
Criar evento
↓
Escolher tipo
↓
Escolher atleta/grupo
↓
Ver disponibilidade
↓
Confirmar
↓
Notificar envolvidos
↓
Remarcar/cancelar se necessário
↓
Registar resultado
↓
Atualizar histórico
```

## 34.12.2 Checklist Calendário

| Item                        | Existe? | Observações |
| --------------------------- | ------: | ----------- |
| Criar evento                |         |             |
| Tipo de evento              |         |             |
| Evento atleta               |         |             |
| Evento grupo                |         |             |
| Disponibilidade             |         |             |
| Conflitos                   |         |             |
| Remarcar                    |         |             |
| Cancelar                    |         |             |
| Férias/ausências            |         |             |
| Lista de espera             |         |             |
| Promover da lista de espera |         |             |
| Notificações                |         |             |
| Vista mês                   |         |             |
| Vista semana                |         |             |
| Vista dia                   |         |             |
| Agenda/lista                |         |             |
| Integração externa          |         |             |
| Histórico de eventos        |         |             |

---

# 34.13 Auditoria por processo: Analytics.OS

## 34.13.1 Processo completo Analytics

```txt
Escolher fonte de dados
↓
Escolher população/scope
↓
Escolher período
↓
Escolher métrica
↓
Aplicar agregação
↓
Gerar gráfico
↓
Guardar consulta
↓
Gerar relatório
↓
Partilhar/exportar
```

## 34.13.2 Checklist Analytics.OS

| Item                  | Existe? | Observações |
| --------------------- | ------: | ----------- |
| Query builder         |         |             |
| Escolher fonte        |         |             |
| Escolher atleta/grupo |         |             |
| Escolher período      |         |             |
| Escolher métrica      |         |             |
| Agregações            |         |             |
| Filtros               |         |             |
| Comparações           |         |             |
| Gráficos              |         |             |
| Guardar query         |         |             |
| Templates             |         |             |
| Relatórios            |         |             |
| Exportar CSV/PDF      |         |             |
| Partilhar relatório   |         |             |
| Ligação ao Dashboard  |         |             |
| Ligação ao Atleta 360 |         |             |

---

# 34.14 Auditoria por processo: Data.OS

## 34.14.1 Processo completo Data.OS

```txt
Definir variável
↓
Criar regra
↓
Definir IF/THEN
↓
Testar regra
↓
Ativar regra
↓
Correr automaticamente
↓
Gerar alerta/tarefa
↓
Guardar log
↓
Resolver conflito
```

## 34.14.2 Checklist Data.OS

| Item                      | Existe? | Observações |
| ------------------------- | ------: | ----------- |
| Catálogo de variáveis     |         |             |
| Criar variável            |         |             |
| Criar regra               |         |             |
| Editar regra              |         |             |
| Duplicar regra            |         |             |
| IF/THEN builder           |         |             |
| Formula builder           |         |             |
| Testar regra              |         |             |
| Ativar/desativar          |         |             |
| Prioridades               |         |             |
| Logs                      |         |             |
| Conflitos                 |         |             |
| Alertas automáticos       |         |             |
| Tarefas automáticas       |         |             |
| Integrações com Forms     |         |             |
| Integrações com Analytics |         |             |
| Histórico de execução     |         |             |

---

# 34.15 Auditoria de relatórios necessários

A app não deve apenas permitir executar ações. Deve também conseguir provar, resumir e exportar o que aconteceu.

## 34.15.1 Relatórios mínimos recomendados

| Relatório                      | Objetivo                                   | Público         | Fonte de dados        | Formato       | Prioridade |
| ------------------------------ | ------------------------------------------ | --------------- | --------------------- | ------------- | ---------- |
| Relatório individual de atleta | Resumo do estado, evolução e alertas       | Treinador/saúde | Atleta 360            | PDF/CSV       | P1         |
| Relatório de saúde             | Lesões, notas, alertas e histórico clínico | Saúde/fisio     | Saúde                 | PDF           | P1         |
| Relatório de grupo             | Estado coletivo, carga, risco, forms       | Coordenador     | Grupo 360             | PDF/CSV       | P1         |
| Relatório de sessão Live       | Resultado de treino/sessão                 | Treinador       | Live                  | PDF           | P2         |
| Relatório de forms             | Respostas, pendências, alertas             | Staff           | Forms.OS              | CSV/PDF       | P1         |
| Relatório operacional diário   | Tarefas, alertas, eventos do dia           | Dashboard       | Vários                | Dashboard/PDF | P1         |
| Relatório de performance       | Tendências, métricas e carga               | Analista        | Analytics.OS          | PDF/CSV       | P2         |
| Relatório de adesão            | Forms respondidos, sessões realizadas      | Coordenação     | Forms/Live/Calendário | PDF/CSV       | P2         |
| Relatório de risco             | Atletas com carga alta, fadiga, lesão      | Treinador/saúde | Data.OS/Atleta 360    | Dashboard/PDF | P1         |
| Relatório de auditoria         | Quem alterou o quê e quando                | Admin           | Logs                  | CSV/PDF       | P2         |
| Relatório de calendário        | Eventos, faltas, remarcações               | Coordenação     | Calendário            | PDF/CSV       | P2         |
| Relatório de tarefas           | Tarefas abertas/concluídas/atrasadas       | Staff           | Tasks                 | Dashboard/CSV | P2         |

## 34.15.2 Template para especificar relatório

| Campo                 | Resposta |
| --------------------- | -------- |
| Nome do relatório     |          |
| Objetivo              |          |
| Quem usa              |          |
| Quando é gerado       |          |
| Dados necessários     |          |
| Filtros               |          |
| Métricas              |          |
| Visualizações         |          |
| Formato de exportação |          |
| Permissões            |          |
| Frequência            |          |
| Lacunas atuais        |          |

---

# 34.16 Auditoria de notificações, tarefas e follow-ups

Verificar se a app ajuda o utilizador a agir, e não apenas a ver dados.

| Evento                | Deve gerar alerta? | Deve gerar tarefa? | Deve notificar quem? | Onde aparece?        | Prioridade |
| --------------------- | -----------------: | -----------------: | -------------------- | -------------------- | ---------- |
| Atleta com carga alta |                Sim |                Sim | Treinador            | Dashboard/Atleta 360 | P1         |
| Form não respondido   |                Sim |           Opcional | Atleta/staff         | Forms/Atleta 360     | P1         |
| Lesão registada       |                Sim |                Sim | Saúde/treinador      | Saúde/Atleta 360     | P1         |
| Sessão cancelada      |                Sim |           Opcional | Treinador/atleta     | Calendário           | P1         |
| Evento próximo        |                Sim |                Não | Staff/atleta         | Calendário/Dashboard | P1         |
| Readiness baixo       |                Sim |                Sim | Treinador            | Dashboard/Atleta 360 | P1         |
| Regra Data.OS falhou  |                Sim |                Sim | Admin                | Data.OS/Settings     | P2         |
| Relatório pronto      |                Sim |                Não | Solicitante          | Relatórios           | P2         |
| Tarefa atrasada       |                Sim |                Sim | Responsável          | Dashboard            | P1         |

---

# 34.17 Auditoria de permissões e roles

A app deve garantir que cada perfil vê e executa apenas o que deve.

| Perfil         | Pode ver                    | Pode criar         | Pode editar        | Pode eliminar/arquivar | Pode exportar    | Lacunas |
| -------------- | --------------------------- | ------------------ | ------------------ | ---------------------- | ---------------- | ------- |
| Admin          | Tudo                        | Tudo               | Tudo               | Tudo                   | Tudo             |         |
| Coordenador    | Atletas, grupos, relatórios | Grupos/eventos     | Grupos/atribuições | Limitado               | Sim              |         |
| Treinador      | Atletas/grupos atribuídos   | Notas/sessões      | Dados operacionais | Não/limitado           | Limitado         |         |
| Fisioterapeuta | Saúde/lesões/notas clínicas | Notas saúde        | Saúde              | Não                    | Relatórios saúde |         |
| Analista       | Métricas/relatórios         | Queries/relatórios | Templates          | Não                    | Sim              |         |
| Operador       | Calendário/forms/tarefas    | Eventos/forms      | Eventos/tarefas    | Não                    | Limitado         |         |

Perguntas obrigatórias:

1. Quem pode ver dados clínicos?
2. Quem pode eliminar atletas?
3. Quem pode exportar dados?
4. Quem pode ver relatórios?
5. Quem pode alterar regras Data.OS?
6. Quem pode ver logs?
7. Quem pode alterar permissões?
8. Que ações precisam de confirmação extra?

---

# 34.18 Auditoria de dados necessários

Verificar se existem dados suficientes para completar workflows e relatórios.

| Entidade  | Dados obrigatórios              | Dados opcionais          | Dados em falta | Impacto |
| --------- | ------------------------------- | ------------------------ | -------------- | ------- |
| Atleta    | nome, modalidade, grupo, estado | contacto, tags           |                |         |
| Saúde     | estado, nota, lesão, data       | profissional, severidade |                |         |
| Form      | título, campos, estado          | tags, versão             |                |         |
| Resposta  | atleta, data, respostas         | score, flags             |                |         |
| Sessão    | atleta/grupo, treino, data      | notas, carga             |                |         |
| Evento    | tipo, data, participantes       | local, recurso           |                |         |
| Regra     | condição, ação, estado          | prioridade               |                |         |
| Relatório | fonte, período, scope           | template                 |                |         |

---

# 34.19 Auditoria de estados vazios, erro e exceções

Cada processo deve prever falhas.

| Situação               | Existe estado? | Mensagem | Ação de recuperação    | Severidade |
| ---------------------- | -------------: | -------- | ---------------------- | ---------- |
| Sem atletas            |                |          | Adicionar/importar     |            |
| Sem resultados         |                |          | Limpar filtros         |            |
| Erro a carregar        |                |          | Tentar novamente       |            |
| Sem dados de saúde     |                |          | Adicionar nota         |            |
| Sem forms              |                |          | Criar/enviar form      |            |
| Sem eventos            |                |          | Criar evento           |            |
| Sem permissões         |                |          | Pedir acesso           |            |
| Conflito de calendário |                |          | Escolher outro horário |            |
| Regra Data.OS falha    |                |          | Ver logs               |            |
| Exportação falha       |                |          | Tentar novamente       |            |

---

# 34.20 Auditoria de integrações

Identificar dependências externas necessárias.

| Integração                | Necessária? | Para quê                               | Suite             | Prioridade |
| ------------------------- | ----------: | -------------------------------------- | ----------------- | ---------- |
| Email                     |             | Enviar forms, relatórios, notificações | Forms/Relatórios  | P1         |
| SMS/WhatsApp              |             | Lembretes e comunicação                | Notificações      | P2         |
| Google Calendar / Outlook |             | Sincronizar eventos                    | Calendário        | P2         |
| Storage de documentos     |             | Documentos de atletas                  | Atletas           | P2         |
| Wearables/API métricas    |             | Dados de carga/readiness               | Analytics/Data.OS | P3         |
| Export PDF                |             | Relatórios                             | Relatórios        | P1         |
| Export CSV/Excel          |             | Análise externa                        | Analytics/Forms   | P1         |
| Autenticação/SSO          |             | Segurança                              | Settings          | P2         |

---

# 34.21 Auditoria de paridade app atual → refactor

Nenhuma função atual deve desaparecer no redesign.

| Função atual | Existe no código atual? | Vai existir na nova UI? | Novo local | Componente | Teste | Estado                       |
| ------------ | ----------------------: | ----------------------: | ---------- | ---------- | ----- | ---------------------------- |
|              |                         |                         |            |            |       | Manter/Relocalizar/A validar |

Estados permitidos:

* Manter
* Relocalizar
* Substituir
* A validar
* Remover apenas se duplicado e aprovado

Qualquer função marcada como "A validar" deve bloquear o handoff final.

---

# 34.22 Relatórios adicionais que devem ser produzidos

Além da auditoria principal, recomenda-se produzir os seguintes relatórios separados.

## R01 — Relatório de Cobertura Funcional por Suite
Objetivo: confirmar que cada suite tem todas as funções mínimas para operar.
Inclui: funções existentes; funções em falta; funções stub; funções duplicadas; ações perigosas; estados vazios/erro; prioridade P0/P1/P2.

## R02 — Relatório de Workflow Ponta-a-Ponta do Cliente
Objetivo: confirmar se o utilizador consegue completar o processo real sem sair da app.
Inclui: jornada do treinador; jornada do fisioterapeuta; jornada do coordenador; jornada do admin; tarefas críticas; pontos de fricção; dependências externas; lacunas por etapa.

## R03 — Relatório de Paridade Funcional Atual vs Refactor
Objetivo: impedir perda de funções durante a nova UI/React.
Inclui: função atual; localização atual; destino novo; componente novo; store; teste; estado de aprovação.

## R04 — Relatório de Navegação e Arquitetura de Informação
Objetivo: validar se a app está organizada de forma lógica.
Inclui: mapa global de navegação; módulos ativos vs "brevemente"; sidebar; mobile nav; command palette; profundidade de navegação; inconsistências.

## R05 — Relatório de Ações, Botões, Modais e Drawers
Objetivo: garantir que todas as ações têm destino correto.
Inclui: button registry; modal registry; drawer registry; menu Mais; bulk actions; dangerous actions; ações sem destino; ações duplicadas.

## R06 — Relatório de Estados, Erros e Feedback
Objetivo: garantir que a app responde bem a loading, vazio, erro e sucesso.
Inclui: loading states; empty states; no results; errors; success; toasts; validação; recuperação de erro.

## R07 — Relatório de Permissões, Segurança e Dados Sensíveis
Objetivo: garantir que cada perfil só vê e faz o que deve.
Inclui: roles; permissões por ação; dados clínicos; exportações; logs; ações destrutivas; segurança.

## R08 — Relatório de Relatórios e Exportações
Objetivo: definir que relatórios a app tem de produzir.
Inclui: relatórios individuais; relatórios de grupo; relatórios clínicos; relatórios operacionais; relatórios de performance; CSV/PDF; filtros e permissões.

## R09 — Relatório de Mobile / Tablet / Campo
Objetivo: confirmar que a app funciona em contexto real de treino, clínica ou campo.
Inclui: navegação mobile; bottom sheets; ações rápidas; leitura em ecrã pequeno; conflitos de barras fixas; uso com uma mão; touch targets.

## R10 — Relatório de Testes E2E e QA de Workflow
Objetivo: transformar processos reais em testes.
Inclui: teste criar atleta; teste pesquisar/filtrar; teste editar; teste eliminar; teste bulk action; teste Atleta 360; teste Saúde; teste Forms; teste Calendário; teste relatório; teste permissões.

---

# 34.23 Definition of Done deste anexo

Este anexo só está concluído quando for possível afirmar:

1. Todas as suites foram auditadas.
2. Todas as entidades principais têm CRUD verificado.
3. Todas as ações têm destino UX.
4. Todos os workflows críticos têm diagrama.
5. Todas as lacunas foram classificadas por severidade.
6. Todas as funções atuais foram mapeadas para a nova UI.
7. Todos os stubs foram identificados.
8. Todos os relatórios necessários foram listados.
9. Todos os estados vazios/erro foram definidos.
10. Todas as permissões críticas foram analisadas.
11. O processo real do cliente foi validado ponta-a-ponta.
12. Nenhuma função fica em "A validar" antes do handoff final.

Se alguma suite, workflow, ação ou relatório estiver incompleto, a refactorização não deve avançar para implementação final.

---

# 34.24 PRÉ-PREENCHIMENTO VERIFICADO NO CÓDIGO (resultado real da auditoria)

> Tal como na Secção 33, esta parte **não é template** — é o anexo 34 preenchido com o que existe mesmo no código (`apps/coach` + `packages/core`). Onde não confirmei em runtime, está marcado **(verificar)**. Base factual: API real em [packages/core/src/api](packages/core/src/api), rotas em [router.tsx](apps/coach/src/app/router.tsx).

## 34.24.1 Resposta direta à pergunta central (§34.0)

**Não — o utilizador NÃO consegue completar o processo real sem sair da app.** O ciclo macro de 17 passos (§34.5.1) está coberto em **~6 passos**. Tudo o que envolva **formulários, planos/treinos, sessões ao vivo, analítica, automações, relatórios e notificações** obriga a sair para Excel/WhatsApp/papel — esses módulos não têm sequer camada de dados.

## 34.24.2 Estado real das suites (§34.3 / §34.4)

| Suite | Estado real | Backend (core API) | Evidência |
| ----- | ----------- | ------------------ | --------- |
| S01 App Shell | **Parcial** | n/a | nav incoerente + palette morto (ver §33.1–33.3) |
| S02 Dashboard | **Mínimo** | `fetchDashboardKpis`, `fetchTodayBookings` | [dashboard.ts:26](packages/core/src/api/dashboard.ts#L26) — só KPIs + marcações do dia |
| S03 Atletas | **Construído** | create/fetch/status/archive/assign | [athletes.ts:72-358](packages/core/src/api/athletes.ts#L72) |
| S04 Atleta 360 | **Construído (parcial)** | `fetchAthleteProfile` | 7 tabs; 2 são placeholders ([Athlete360.tsx:332](apps/coach/src/pages/Athlete360.tsx#L332)) |
| S05 Grupos | **Construído (básico)** | create/fetch/membros/assign | [athletes.ts:358-501](packages/core/src/api/athletes.ts#L358) |
| S06 Grupo 360 | **Construído (3 tabs)** | `fetchGroupProfile` | só `resumo/membros/atribuicoes` ([Group360.tsx:22](apps/coach/src/pages/Group360.tsx#L22)) |
| S07 Studio | **Inexistente** (stub `<Soon>`) | nenhum | [router.tsx:43](apps/coach/src/app/router.tsx#L43) |
| S08 Forms.OS | **Inexistente** (stub) | nenhum | [router.tsx:45](apps/coach/src/app/router.tsx#L45) |
| S09 Analytics.OS | **Inexistente** (stub) | nenhum | [router.tsx:47](apps/coach/src/app/router.tsx#L47) |
| S10 Data.OS | **Inexistente** (stub) | nenhum | [router.tsx:41](apps/coach/src/app/router.tsx#L41) |
| S11 Live | **Inexistente** (stub) | nenhum (só `spike-timer`) | [router.tsx:39](apps/coach/src/app/router.tsx#L39) |
| S12 Calendário | **Construído (forte)** | bookings/conflitos/waitlist/disponibilidade/marcadores | [calendar.ts:51-301](packages/core/src/api/calendar.ts#L51) |
| S13 Settings | **Inexistente** (stub) | nenhum | [router.tsx:59](apps/coach/src/app/router.tsx#L59) |
| S14 Relatórios | **Inexistente** | nenhum | sem rota, sem API |
| S15 Notificações | **Inexistente** | nenhum | sem rota, sem API |
| S16 Auditoria/Histórico | **Inexistente** | nenhum | sem logs |

**Conclusão:** **6 de 16 suites** estão construídas; **10 estão ausentes** (das quais 6 são anunciadas na navegação — ver §33.2).

## 34.24.3 CRUD real por entidade (§34.6.1)

✅ existe · ⚠️ parcial · ❌ ausente

| Entidade | Criar | Ver | Editar | Arquivar | Eliminar | Duplicar | Exportar | Importar | Histórico |
| -------- | :---: | :-: | :----: | :------: | :------: | :------: | :------: | :------: | :-------: |
| **Atleta** | ✅ | ✅ | ⚠️ só estado¹ | ✅ | ❌ | ❌ | ⚠️ stub | ❌ | ✅ timeline |
| **Grupo** | ✅² | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ stub | ❌ | ❌ |
| **Exercício** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Treino** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Plano** | ❌³ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Formulário** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Resposta form** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Evento calendário** | ✅ | ✅ | ⚠️ só estado⁴ | n/a | ⚠️ marcador | ❌ | ❌ | ❌ | ⚠️ |
| **Regra Data.OS** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Relatório** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

¹ `updateAthleteStatus` existe ([athletes.ts:139](packages/core/src/api/athletes.ts#L139)) mas **não há edição dos campos** (nome, email, telefone, modalidade) depois de criado — só se define no `NewAthleteModal`. **Lacuna S1.**
² `createGroup` aceita só `name/description/color` ([athletes.ts:352](packages/core/src/api/athletes.ts#L352)) — **não há grupos dinâmicos/regras** apesar de o §11/§12 os assumirem. **Lacuna S2.**
³ Planos são lidos (`fetchPlans`) e atribuídos, mas **não são criados na app** — o próprio `AssignModal` diz "Cria planos no módulo Plans.OS (fase própria)" ([Athletes.tsx:1077](apps/coach/src/pages/Athletes.tsx#L1077)). **Lacuna S1.**
⁴ `setBookingStatus` permite mudar estado (cancelar) ([calendar.ts:161](packages/core/src/api/calendar.ts#L161)); remarcar com nova data **(verificar)** na UI.

## 34.24.4 Cobertura do workflow macro (§34.5.2)

| Etapa | Existe? | Onde / lacuna |
| ----- | :-----: | ------------- |
| Criar atleta | ✅ | `NewAthleteModal` |
| Importar atleta | ❌ | **não há botão Importar** (o registo B002 do §5 era aspiracional) |
| Atribuir a grupo | ✅ | Grupo 360 → + Membros ([Group360.tsx:106](apps/coach/src/pages/Group360.tsx#L106)) |
| Enviar formulário inicial | ❌ | Forms.OS inexistente; botão "Enviar form" é stub |
| Registar avaliação | ❌ | sem módulo de avaliação |
| Agendar sessão | ✅ | Calendário (`createBooking`) |
| Criar plano | ❌ | sem criação de planos na app |
| Atribuir treino/plano | ⚠️ | atribuir plano ✅; treino ❌ |
| Executar sessão Live | ❌ | Live é stub |
| Registar notas | ⚠️ | notas clínicas no 360 **(verificar)**; "Mensagem/Nota" no board é stub |
| Detetar risco | ⚠️ | há prioridade calculada na lista ([Athletes.tsx:83](apps/coach/src/pages/Athletes.tsx#L83)), mas sem motor de regras (Data.OS) |
| Criar tarefa/follow-up | ❌ | "Criar tarefa" é stub |
| Comunicar com atleta | ❌ | "Mensagem" é stub; sem email/SMS |
| Gerar relatório | ❌ | sem módulo de relatórios |
| Ver histórico | ⚠️ | timeline do atleta ✅; histórico de grupo ❌; log de auditoria ❌ |
| Arquivar atleta | ✅ | `ConfirmArchiveModal` (bem feito) |

**Cobertura ponta-a-ponta: ~6/16 etapas plenas, 4 parciais, 6 ausentes.** Os furos concentram-se no meio do ciclo (forms → plano → live → notas → tarefa → comunicação → relatório), que é precisamente o trabalho diário.

## 34.24.5 Top lacunas funcionais priorizadas

| # | Lacuna | Suite | Sev. | Prioridade |
| - | ------ | ----- | :--: | :--------: |
| 1 | **Editar dados do atleta** (só estado é editável) | Atletas | S1 | **P0** |
| 2 | **Forms.OS inexistente** — não há recolha de dados estruturada | Forms | S1 | **P0** |
| 3 | **Sem criação de planos/treinos** — só consumo | Studio | S1 | **P0** |
| 4 | **Sem relatórios/exportação real** (export é stub) | Relatórios | S1 | **P0** |
| 5 | **Sem notificações/tarefas/follow-ups** | Notificações | S1 | P1 |
| 6 | **Settings inexistente** (perfil, equipa, permissões, tema) | Settings | S1 | P1 |
| 7 | **Sem roles/permissões** — tudo é "coach" único (`coachId`) | App Shell | S1 | P1 |
| 8 | **Sem editar/arquivar grupo nem grupos dinâmicos** | Grupos | S2 | P1 |
| 9 | **Live inexistente** — sessões não são executáveis na app | Live | S2 | P2 |
| 10 | **Sem log de auditoria** — não há rastreabilidade de quem alterou o quê | Auditoria | S2 | P2 |
| 11 | **Restaurar atleta arquivado não exposto na UI** (`unarchiveAthlete` existe na API) | Atletas | S3 | P2 |
| 12 | **Sem integrações** (email/calendário/storage/SSO) | Integrações | S2 | P2 |

## 34.24.6 Permissões e dados sensíveis (§34.17) — achado de risco

A app assume **um único perfil "coach"** — todas as queries filtram por `coachId` ([coachQuery.ts:13](packages/core/src/api/coachQuery.ts#L13)). **Não existem roles** (admin, coordenador, fisioterapeuta, analista, operador). Consequências:
- Não há separação de **dados clínicos** (saúde/lesões) de dados operacionais — quem entra vê tudo. **Risco LGPD/GDPR.**
- Não há "quem pode eliminar/exportar/ver relatórios". As 8 perguntas obrigatórias do §34.17 respondem todas **"qualquer coach"**.

**Recomendação:** definir modelo de roles + RLS no Supabase antes de pôr dados clínicos reais. Verificar políticas atuais em [supabase/migrations](supabase/migrations) **(verificar)**.

## 34.24.7 O que está coberto e sólido (proteger no refactor)

- **Calendário** é a suite mais completa: marcações, **deteção de conflitos** (`hasConflict`), **lista de espera** com promoção, **disponibilidade**, marcadores de dia (férias/ausências). Não destruir.
- **Atletas**: CRUD essencial + arquivar com confirmação + atribuição de plano em massa.
- **Grupos**: criar, membros (add/remove), atribuir plano a todos.
- **Atleta 360**: tabs Principal, Saúde (com subtabs), Sessões, Métricas, Timeline com dados reais.

## 34.24.8 Veredito do anexo

> **A LUNA.OS é hoje uma boa "central de atletas + calendário", não um sistema ponta-a-ponta.** O núcleo de gestão (atletas, grupos, agenda) está funcional; mas o trabalho de **recolher (forms), prescrever (planos/treino), executar (live), automatizar (regras), provar (relatórios) e comunicar (notificações)** está ausente. Antes do refactor final, decidir explicitamente o âmbito da v1: **(a)** assumir LUNA.OS como gestor+agenda e cortar a navegação para os 6 módulos reais; ou **(b)** construir pelo menos Forms.OS + criação de planos + relatórios antes do handoff. Misturar os dois — navegação que promete 16 suites com 6 entregues — é o pior dos cenários e é o estado atual.

**Definition of Done (§34.23): NÃO cumprida.** Falham os pontos 1, 2, 7, 8, 10 e 11 — várias suites por auditar em runtime, CRUD incompleto, stubs por resolver, relatórios inexistentes, permissões por definir e workflow não fechado ponta-a-ponta.
