# O que tens de fazer (tu, humano) — atualizado 2026-06-13

O agente já implementou: Supabase ligado, login, dashboard real, Calendário (F3) visualmente fiel, **Atletas phase3 HTML** (◐ sign-off visual pendente) e **Grupos CONCLUÍDA** (lista + Grupo 360 + gestão de membros + atribuir plano).
Build/testes/lint = tudo verde. Abaixo está **só o que depende de ti**, por prioridade.

### Novo para testar — Atletas + Grupos
- **/athletes (phase3):** abrir [`docs/referencia/PROTOHTML_Fase5E1_1_Atletas_Grupos.html`](docs/referencia/PROTOHTML_Fase5E1_1_Atletas_Grupos.html) lado-a-lado com a app. Verificar: título «Quem precisa de atenção?», 5 stats phase3, chips de filtro, linhas `.phase3-ath-row` com mini-badges, board «Hoje exige atenção». **Mobile:** 320px e ~672px — textos truncados (sem overflow nos cartões); `.mobile-actions` acima da bottom nav.
- **/athletes**: lista real (avatar/iniciais, estado, plano, problema/conteúdo phase3), **stats clicáveis** (Total/Sem plano/Pendências/Bloqueios/RTP), pesquisa + ordenação, filtros (chips; Forms/Docs/Pendentes desactivados — sem dados no core), **seleção** (checkbox → painel lateral phase3), **+ Atleta** / **Atribuir conteúdo**.
- **/groups**: grelha de cartões com **seleção** (checkbox), stats clicáveis (Grupos/Com membros/Vazios/Membros), filtros (chips), pesquisa + ordenação, **+ Criar Grupo**, **Atribuir plano** (modal → escolhe plano → atribui a todos os membros do grupo).
- **/groups/:id (Grupo 360)**: clica **Abrir** num cartão → dossier coletivo com abas **Resumo / Membros / Atribuições** (dados reais). **+ Membros** (adiciona atletas), **Remover** membro, **Atribuir plano** a todo o grupo. **← Voltar a Grupos** no topo.
- **Página Grupos = CONCLUÍDA.** Forms/Relatórios/Saúde agregados fictícios do HTML **não** foram replicados — entram quando existirem os módulos próprios.
- **/athletes/:id (Atleta 360)**: clica **Abrir** numa linha → dossier com abas **Principal / Saúde / Métricas / Sessões / Atribuições**, todas com **dados reais** (perfil, alergias, documentos, métricas, marcações, atribuições). Onde ainda não há dados, mostra estado honesto. **Voltar ao plantel** no topo.
  - Nota: gráficos/readiness/sono do HTML original **não** foram replicados porque eram fictícios — entram quando existirem os módulos DataOS/Live.
- **Atribuir (real)**: seleciona 1+ atletas → **+ Atribuir** (cabeçalho ou painel lateral) → escolhe um **plano** → atribui (cria `assignments` e atualiza o plano atual). Se não houver planos ainda, o modal avisa (criam-se no Plans.OS, fase própria).
- **Modais consistentes**: Criar Atleta, Criar Grupo e Atribuir usam agora **o mesmo modal** (mesmo estilo/tamanho, fecho por ESC/clique fora). Será o padrão de todas as páginas.
- **Página Atletas = ◐ (phase3 implementado).** Extras já feitos:
  - **Mais filtros** (toolbar): combina Estado + Plano + Modalidade + Grupo.
  - **Ações por linha** phase3 (`Rever bloqueio` / `Atribuir plano` / `Abrir 360`) + **Alterar estado** (BD real).
  - **Sign-off visual pendente:** comparar HTML vs app em 320 / 672 / 1440 px.
- **Grupo 360** — concluído (ver `/groups/:id` acima).

---

## A. Testar o que já existe (~10 min) — FAZER JÁ

1. Arrancar a app:
   ```powershell
   cd "c:\Users\ruida\Desktop\Nova pasta\luna-os-F2-cliente\luna-os"
   npx pnpm dev
   ```
2. Abrir **http://localhost:5173/login** e entrar com `coach@luna.os` + a tua password.
3. Verificar **/dashboard** — KPIs (Hoje / Pendentes / Atletas) devem ter números > 0.
4. Verificar **/calendar**:
   - Alternar vistas **Mês / Semana / Dia / Agenda / Disponibilidade / Lista de espera**
   - Navegar meses (← Anterior / Seguinte →)
   - Clicar num dia → ver marcações
   - **+ Nova marcação** → escolher tipo e (opcional) **atleta** → criar (fica "pendente")
   - **NOVO — Aula**: tipo **Aula** → preencher **Lotação** → criar (várias aulas no mesmo horário são permitidas)
   - Criar duas **treinos** no mesmo horário → a 2ª deve **dar erro de conflito** (é o esperado)
   - Clicar numa marcação → **modal de detalhe** → **Confirmar** ou **Cancelar marcação**
   - **Disponibilidade/férias**: clicar num dia → **Marcar dia (folga/férias…)** → escolher tipo → o dia passa a mostrar o ícone/estado; **Remover marcador** volta a libertar
   - **Disponibilidade semanal**: aba **Disponibilidade** → ver horários (seed: Seg–Sex 08–19) → **+ Adicionar horário** / **Remover**
   - **Vista Dia**: aba **Dia** → vê marcações do dia + blocos disponíveis
   - **Lista de espera**: aba **Lista de espera** → **+ Adicionar à lista** (atleta + horário opcional + prioridade). Para testar a **auto-promoção**: adiciona um atleta com a data/hora de uma marcação existente, depois **cancela essa marcação** no detalhe → a entrada deve passar a **Promovido**

> Se os KPIs/calendário aparecerem a zero: os seeds não entraram. No **SQL Editor** do Supabase corre `select count(*) from public.athletes;` (deve dar ≥ 3). Se der 0, confirma o user `coach@luna.os` em Authentication e volta a correr `seed_base.sql` + `seed_extended.sql`.

---

## B. Gate G-DB — produção da base de dados (~10 min)

No dashboard Supabase ([supabase.com/dashboard](https://supabase.com/dashboard) → teu projeto):

- [ ] **Settings → Database → Backups**: confirmar backups automáticos + ativar **PITR** (se o plano permitir)
- [ ] Fazer **1 restore de teste** (confirmar que recuperas)
- [ ] **Settings → Database → Connection pooling**: ativar (modo Transaction)
- [ ] (Opcional) SQL Editor: `alter database postgres set statement_timeout = '30s';`

---

## C. Gate G1 — sign-off visual (~5 min)

- [ ] Abrir **http://localhost:5173/poc**
- [ ] F12 → modo responsivo → testar a **320px** e a **1440px**
- [ ] Confirmar que está legível e utilizável → dar OK (ou enviar screenshot do que estiver mal)

---

## D. Gate G2 — fechar a Fase 2

- [ ] Depois de A + B + C, confirmar: "dashboard com dados reais aceitável" → **dizes OK ao agente**

---

## E. Só na tua máquina (quando quiseres, não bloqueia)

- [ ] **Chromatic**: criar conta, copiar token, meter em GitHub Secrets como `CHROMATIC_PROJECT_TOKEN` (ver [docs/chromatic-setup.md](docs/chromatic-setup.md))
- [ ] **Spikes em device**: testar timer em background e offline num telemóvel (ver [docs/spikes/device-measurement.md](docs/spikes/device-measurement.md))
- [ ] **Nativo** (precisa de Android Studio / Xcode):
   ```powershell
   cd apps/coach
   npx pnpm build
   npx cap sync
   ```

---

## F. Decisões que só tu podes tomar (para o agente continuar a F3)

✅ Já decidido/implementado:
- **Visual** → **fidelidade ao teu HTML**: portado o CSS real (fundo, fontes, topbar, sidebar, botões, `.dash-*`); só wireframes/tamanhos mudam por responsividade. **Dashboard** já 100% fiel e ligada a dados reais.
- **Navegação mobile** → barra inferior por ícones (Início · Atletas · FAB · Studio · Definições) + FAB radial (Novo atleta / Nova marcação / Iniciar treino); retorno visível ao Início pela marca.
- **Lista de espera / auto-promoção** → **feito** (aba + adicionar/cancelar; promoção automática ao cancelar).
- **Disponibilidade/férias (marcadores de dia)** → **feito** (marcar/remover dias como folga/férias/feriado/etc.).
- **Disponibilidade semanal recorrente** → **feito** (aba Disponibilidade + CRUD horários).
- **Aulas com capacidade** → **feito** (campo lotação ao criar tipo Aula).
- **Vista Dia** → **feito** (aba dedicada).

Falta esta decisão para o próximo passo:

1. **Live (treino ao vivo)**: avanço já para timer + registo de sets + RPE, ou preferes primeiro polish visual (Atletas/Grupos conforme o HTML de referência)?
2. **Vista por defeito** do calendário: **Mês** (atual) ou **Agenda** (lista) ao abrir?

---

## Resumo de prioridades

| Ordem | O quê | Tempo |
|-------|-------|-------|
| 1 | **A** — testar login + dashboard + calendário | 10 min |
| 2 | **B** — backups/PITR/pooler no Supabase | 10 min |
| 3 | **C** — validar /poc 320/1440 | 5 min |
| 4 | **D** — dar OK para fechar G2 | 1 min |
| 5 | **F** — responder às 3 decisões da F3 | 5 min |
| — | **E** — Chromatic/nativo/spikes (sem pressa) | depois |
