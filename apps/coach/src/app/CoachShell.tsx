import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { hasModule, switchOrg, toast, useAuthStore, wallClock } from '@luna/core';
import { Avatar, BarraSemRede, Botao, MenuItem, NavegacaoInferior, iniciais } from '@luna/ui/v3';
import { CaretRight, DotsThree, List, ListChecks, MagnifyingGlass, Plus, Question, SignOut, UserCircle, UsersThree } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';
import { signOutEverywhere } from './session';
import { navItems } from './CoachNav';
import { Procura } from './Procura';
import { Notificacoes } from './Notificacoes';
import { SessaoExpirada } from './SessaoExpirada';
import { Atalhos } from './Atalhos';
import { GravacoesPorConfirmar } from './Estados';
import { AvisoSubscricao } from './AvisoSubscricao';
import './gestao.css';

const ORG_TIPO: Record<string, string> = {
  solo_coach: 'PT independente', studio: 'Estúdio', box: 'Box', gym: 'Ginásio', club: 'Clube', online: 'Online',
};
const PAPEL: Record<string, string> = {
  owner: 'Dono', manager: 'Gerente', coach: vocab.responsavel(), reception: 'Receção', clinician: 'Clínico',
};
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Fecha um menu suspenso com Esc ou clique fora. */
function usePop() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  return { aberto, setAberto, ref };
}

/** Ações do botão + (G-00): só as do plano e dos direitos ligados. */
function useNovoAcoes() {
  const modules = useAuthStore((s) => s.modules);
  return [
    hasModule(modules, 'schedule') && { rotulo: `Nova ${vocab.sessao()}`, to: '/schedule?nova=1' },
    hasModule(modules, 'clients') && { rotulo: `Novo ${vocab.pessoa()}`, to: '/clients?novo=1' },
    hasModule(modules, 'training') && { rotulo: `Iniciar ${vocab.sessao()}`, to: '/live' },
    hasModule(modules, 'training') && { rotulo: 'Novo treino', to: '/training/biblioteca?novo=treino' },
    hasModule(modules, 'clients') && { rotulo: 'Vender pack', to: '/business/packs' },
    hasModule(modules, 'clients') && { rotulo: 'Registar pagamento', to: '/business/dinheiro' },
  ].filter(Boolean) as { rotulo: string; to: string }[];
}

/**
 * Estrutura da Gestão por papel (G-00): menu só com os destinos do papel e dos
 * direitos, seletor de organização, procura (Ctrl/⌘K), botão + e conta.
 */
export function CoachShell({
  headStrong, headSub, topActions, children, board, pageActions, legado = true,
}: {
  headStrong: string;
  headSub?: string;
  topActions?: ReactNode;
  children: ReactNode;
  board?: ReactNode;
  pageActions?: ReactNode;
  /** Página ainda no visual antigo: fica num painel escuro próprio até ser redesenhada. */
  legado?: boolean;
  mainClassName?: string;
  layoutClassName?: string;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const orgs = useAuthStore((s) => s.orgs);
  const scope = useAuthStore((s) => s.scope);
  const modules = useAuthStore((s) => s.modules);
  const me = useAuthStore((s) => s.me);
  const [procura, setProcura] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const orgPop = usePop();
  const contaPop = usePop();
  const novoPop = usePop();
  const maisPop = usePop();
  const novo = useNovoAcoes();
  const itens = navItems(modules, scope?.permissions);
  const ativo = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  // Tema em toda a página (data-tema no <html>): o pessoal, se a pessoa escolheu, senão o da organização
  useEffect(() => {
    const tema = me?.tema ?? scope?.theme;
    if (tema) document.documentElement.dataset.tema = tema;
    document.documentElement.dataset.densidade = me?.densidade === 'compact' ? 'compacta' : 'normal';
  }, [scope, me?.tema, me?.densidade]);

  // Esc fecha o menu aberto por cima (tablet)
  useEffect(() => {
    if (!menuAberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAberto(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuAberto]);

  // Ctrl/⌘K abre a procura
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setProcura(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const abrirProcura = useCallback(() => setProcura(true), []);

  const trocarOrg = (orgId: string) => {
    orgPop.setAberto(false);
    const client = getSupabaseClient();
    if (!client) return;
    void switchOrg(client, orgId).then(() => navigate('/today')).catch((e) =>
      toast({ variant: 'danger', title: 'Não foi possível mudar de organização', description: e instanceof Error ? e.message : undefined }));
  };
  const sair = () => void signOutEverywhere(getSupabaseClient());

  const w = wallClock(new Date(), scope?.timezone ?? 'Europe/Lisbon');
  const diaSemana = DIAS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()];
  const data = `${diaSemana}, ${w.day} de ${MESES[w.month - 1]}`;
  const papeis = scope?.roles.map((r) => PAPEL[r] ?? r).join(' · ') ?? '';
  const nome = me?.name ?? '';

  const botaoNovo = novo.length > 0 && (
    <div className="lg-pop" ref={novoPop.ref}>
      <Botao icone={Plus} aria-haspopup="menu" aria-expanded={novoPop.aberto} onClick={() => novoPop.setAberto((v) => !v)}>
        Novo
      </Botao>
      {novoPop.aberto && (
        <div className="lg-pop__lista lg-pop__lista--baixo" role="menu">
          {novo.map((a) => (
            <button key={a.to} type="button" role="menuitem" className="lg-pop__item"
              onClick={() => { novoPop.setAberto(false); navigate(a.to); }}>{a.rotulo}</button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="lg-app">
      {menuAberto && <button type="button" className="lg-scrim" aria-label="Fechar o menu" onClick={() => setMenuAberto(false)} />}
      <aside className={`lg-side${menuAberto ? ' lg-side--aberto' : ''}`} aria-label="Menu">
        {/* Tablet (X-05): a barra de ícones abre o menu inteiro por cima */}
        <button type="button" className="lg-logo-botao" aria-label="Abrir o menu" aria-expanded={menuAberto}
          onClick={() => setMenuAberto(true)}>L</button>
        <Link to="/today" className="lg-logo" aria-label="LunaOS, voltar a Hoje" onClick={() => setMenuAberto(false)}>
          <span className="lg-logo__lua" aria-hidden /><span className="lg-logo__texto">LunaOS</span>
        </Link>

        {scope && (
          <div className="lg-pop" ref={orgPop.ref}>
            <button type="button" className="lg-org" disabled={orgs.length < 2}
              aria-haspopup={orgs.length > 1 ? 'menu' : undefined} aria-expanded={orgs.length > 1 ? orgPop.aberto : undefined}
              aria-label={`Organização: ${scope.orgName}${orgs.length > 1 ? ', mudar' : ''}`}
              onClick={() => orgPop.setAberto((v) => !v)}>
              <span className="lg-org__foto" aria-hidden>{iniciais(scope.orgName)}</span>
              <span className="lg-org__corpo">
                <span className="lg-org__nome">{scope.orgName}</span>
                <span className="lg-org__sub">{ORG_TIPO[scope.orgType] ?? scope.orgType}{orgs.length > 1 ? ` · ${orgs.length} organizações` : ''}</span>
              </span>
              {orgs.length > 1 && <CaretRight size={16} aria-hidden />}
            </button>
            {orgPop.aberto && (
              <div className="lg-pop__lista lg-pop__lista--org" role="menu">
                {orgs.map((o) => (
                  <button key={o.org_id} type="button" role="menuitem" className="lg-pop__item"
                    aria-current={o.org_id === scope.orgId} onClick={() => trocarOrg(o.org_id)}>{o.name}</button>
                ))}
              </div>
            )}
          </div>
        )}

        <nav className="lg-menu" aria-label="Destinos">
          {itens.map((i) => (
            <MenuItem key={i.to} icone={i.icone} ativo={ativo(i.to)} rotulo={i.label}
              onClick={() => { setMenuAberto(false); navigate(i.to); }}>{i.label}</MenuItem>
          ))}
        </nav>

        <div className="lg-pop lg-eu" ref={contaPop.ref}>
          <Avatar nome={nome || '?'} foto={me?.avatarUrl} />
          <span className="lg-eu__corpo">
            <span className="lg-eu__nome">{nome}</span>
            <span className="lg-eu__papel">{papeis}</span>
          </span>
          <button type="button" className="lv-btn lv-btn--secundario" style={{ padding: 0, width: 44 }}
            aria-label="Conta" aria-haspopup="menu" aria-expanded={contaPop.aberto} onClick={() => contaPop.setAberto((v) => !v)}>
            <DotsThree size={16} aria-hidden />
          </button>
          {contaPop.aberto && (
            <div className="lg-pop__lista lg-pop__lista--cima" role="menu">
              <button type="button" role="menuitem" className="lg-pop__item" onClick={() => { contaPop.setAberto(false); navigate('/conta'); }}><UserCircle size={18} aria-hidden />A minha conta</button>
              {scope?.permissions.includes('team.manage') && (
                <button type="button" role="menuitem" className="lg-pop__item" onClick={() => { contaPop.setAberto(false); navigate('/settings/equipa'); }}><UsersThree size={18} aria-hidden />Equipa e acessos</button>
              )}
              <button type="button" role="menuitem" className="lg-pop__item" onClick={() => { contaPop.setAberto(false); navigate('/ajuda'); }}><Question size={18} aria-hidden />Ajuda</button>
              <button type="button" role="menuitem" className="lg-pop__item" onClick={sair}><SignOut size={18} aria-hidden />Sair</button>
            </div>
          )}
        </div>
      </aside>

      <div className="lg-coluna">
        <BarraSemRede />
        <GravacoesPorConfirmar />
        <header className="lg-topo">
          <div style={{ minWidth: 0 }}>
            <span className="lg-topo__data">{headSub ?? data}</span>
            <h1 className="lg-topo__titulo">{headStrong}</h1>
          </div>
          <div className="lg-topo__acoes">
            <button type="button" className="lg-procura" onClick={() => setProcura(true)} aria-label="Procurar (Ctrl+K)">
              <MagnifyingGlass size={16} aria-hidden />Procurar {vocab.pessoa()}<span className="lg-procura__kbd" aria-hidden>Ctrl K</span>
            </button>
            <span className="lg-desktop-only">{topActions}</span>
            {scope && (
              <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Inbox" title="Inbox" onClick={() => navigate('/inbox')}>
                <ListChecks size={18} aria-hidden />
              </button>
            )}
            {scope && <Notificacoes />}
            {/* Como no Figma: uma página com ação própria (Importar, Novo cliente…) não repete o + Novo */}
            {!topActions && botaoNovo}
          </div>
        </header>

        <div className="lg-corpo">
          <main className="lg-conteudo">
            {scope && <AvisoSubscricao />}
            {legado ? <div className="lg-legado">{children}</div> : children}
          </main>
          {board != null && <aside className="lg-lateral" aria-label="Resumo">{board}</aside>}
        </div>
      </div>

      {pageActions}

      {/* Telemóvel: navegação inferior em pílula; o resto vai para "Mais" */}
      <div className="lg-mobile-only">
        <NavegacaoInferior itens={[
          ...itens.slice(0, 4).map((i) => ({
            id: i.to, rotulo: i.label, icone: i.icone, ativo: ativo(i.to), onClick: () => navigate(i.to),
          })),
          { id: 'mais', rotulo: 'Mais', icone: List, ativo: maisPop.aberto, onClick: () => maisPop.setAberto((v) => !v) },
        ]} />
        {maisPop.aberto && (
          <div ref={maisPop.ref} className="lg-pop__lista" role="menu"
            style={{ position: 'fixed', right: 'var(--margem-telemovel)', bottom: 'calc(var(--altura-navegacao) + 32px)', zIndex: 30 }}>
            {itens.slice(4).map((i) => (
              <button key={i.to} type="button" role="menuitem" className="lg-pop__item" onClick={() => { maisPop.setAberto(false); navigate(i.to); }}>{i.label}</button>
            ))}
            {modules.includes('clients') && (
              <button type="button" role="menuitem" className="lg-pop__item" onClick={() => { maisPop.setAberto(false); navigate('/groups'); }}>Grupos</button>
            )}
            <button type="button" role="menuitem" className="lg-pop__item" onClick={() => { maisPop.setAberto(false); setProcura(true); }}>Procurar</button>
            <button type="button" role="menuitem" className="lg-pop__item" onClick={() => { maisPop.setAberto(false); navigate('/conta'); }}>A minha conta</button>
            <button type="button" role="menuitem" className="lg-pop__item" onClick={() => { maisPop.setAberto(false); navigate('/ajuda'); }}>Ajuda</button>
            {orgs.length > 1 && orgs.filter((o) => o.org_id !== scope?.orgId).map((o) => (
              <button key={o.org_id} type="button" role="menuitem" className="lg-pop__item" onClick={() => { maisPop.setAberto(false); trocarOrg(o.org_id); }}>Mudar para {o.name}</button>
            ))}
            <button type="button" role="menuitem" className="lg-pop__item" onClick={sair}><SignOut size={18} aria-hidden />Sair</button>
          </div>
        )}
      </div>

      <Procura aberta={procura} onFechar={() => setProcura(false)} />
      <Atalhos onProcurar={abrirProcura} novo={novo[0]?.to ?? null} pessoas={vocab.pessoa({ plural: true, maiuscula: true })} />
      <SessaoExpirada />
    </div>
  );
}
