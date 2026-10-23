import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardText, MapPin, Palette, Plug, ShieldCheck, Sliders, UsersThree, Wallet } from '@luna/icons';
import { useScope } from './ModuleLayout';

interface Item { rotulo: string; to: string; icone: typeof MapPin; perm: string[]; nota?: string }

// Ordem do Figma (G-46, G-47: 79:628, 102:820); as secções do ginásio são separadores da mesma página
const ITENS: Item[] = [
  { rotulo: 'Unidades e salas', to: '/settings/ginasio?sep=unidades', icone: MapPin, perm: ['org.manage'] },
  { rotulo: 'Equipa e acessos', to: '/settings/equipa', icone: UsersThree, perm: ['team.manage'] },
  { rotulo: 'Subscrição e lugares', to: '/settings/subscricao', icone: Wallet, perm: ['org.manage', 'team.manage'] },
  { rotulo: 'Horários de abertura', to: '/settings/ginasio?sep=horarios', icone: ClipboardText, perm: ['org.manage'] },
  { rotulo: 'Marca da app', to: '/settings/ginasio?sep=marca', icone: Palette, perm: ['org.manage'] },
  { rotulo: 'Pagamentos', to: '/settings/ginasio?sep=pagamentos', icone: Wallet, perm: ['org.manage'], nota: 'Por ligar' },
  { rotulo: 'Módulos', to: '/settings/ginasio?sep=modulos', icone: Sliders, perm: ['org.manage'] },
  { rotulo: 'Integrações', to: '/settings/ginasio?sep=integracoes', icone: Plug, perm: ['org.manage'] },
  { rotulo: 'Segurança e auditoria', to: '/settings/seguranca', icone: ShieldCheck, perm: ['org.manage'] },
];

/** Definições com o menu da esquerda, como no Figma: cada página de definições fica ao lado do mesmo menu. */
export function ComMenuDefinicoes({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const scope = useScope();
  const atual = pathname === '/settings/ginasio' ? `${pathname}?sep=${new URLSearchParams(search).get('sep') ?? 'unidades'}` : pathname;
  const itens = ITENS.filter((i) => i.perm.some((p) => scope.permissions.includes(p)));
  return (
    <div className="lg-gin">
      <nav className="lg-gin__menu" aria-label="Definições">
        {itens.map((i) => (
          <button key={i.to} type="button" aria-current={atual === i.to ? 'page' : undefined} onClick={() => navigate(i.to)}>
            <i.icone size={16} aria-hidden /><span style={{ flex: 1 }}>{i.rotulo}</span>{i.nota && <span className="lg-gin__nota">{i.nota}</span>}
          </button>
        ))}
      </nav>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
