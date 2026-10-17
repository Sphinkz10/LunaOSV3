import { EstadoPagina } from '@luna/ui/v3';
import { CoachShell } from './CoachShell';

/**
 * Os 49 ecrãs G- do mapa (data/mapa-ecras.csv). Os já construídos têm a sua rota
 * no router; os restantes têm rota própria em /ecra/g-NN e mostram-se no tema
 * Esboço como "por construir". Nenhum aparece no menu antes de existir.
 */
export interface EcraG { id: string; ecra: string; destino: string; fase: string; rota?: string }

export const ECRAS_G: EcraG[] = [
  { id: 'G-00', ecra: 'Estrutura da app', destino: 'Todos', fase: 'F1a', rota: '/today' },
  { id: 'G-01', ecra: 'Hoje (por papel)', destino: 'Hoje', fase: 'F1a', rota: '/today' },
  { id: 'G-02', ecra: 'Inbox', destino: 'Topo', fase: 'F1a' },
  { id: 'G-03', ecra: 'Clientes', destino: 'Clientes', fase: 'F1a', rota: '/clients' },
  { id: 'G-04', ecra: 'Nova adesão', destino: 'Clientes', fase: 'F2' },
  { id: 'G-05', ecra: 'Importar clientes', destino: 'Clientes', fase: 'F1a' },
  { id: 'G-06', ecra: 'Perfil 360 do cliente', destino: 'Clientes', fase: 'F1a', rota: '/clients/:id' },
  { id: 'G-07', ecra: 'Leads e funil', destino: 'Clientes', fase: 'F3' },
  { id: 'G-08', ecra: 'Turmas e grupos', destino: 'Clientes', fase: 'F1b', rota: '/groups' },
  { id: 'G-09', ecra: 'Horário', destino: 'Horário', fase: 'F1a', rota: '/schedule' },
  { id: 'G-10', ecra: 'Aula ou sessão · criar e editar', destino: 'Horário', fase: 'F1a', rota: '/schedule' },
  { id: 'G-11', ecra: 'Disponibilidade, salas e equipamentos', destino: 'Horário', fase: 'F1a' },
  { id: 'G-12', ecra: 'Preparar aula ou sessão', destino: 'Horário', fase: 'F1a' },
  { id: 'G-13', ecra: 'Aula ou sessão ao vivo', destino: 'Horário', fase: 'F1a', rota: '/live' },
  { id: 'G-14', ecra: 'Resumo, submissão e correção', destino: 'Horário', fase: 'F1a' },
  { id: 'G-15', ecra: 'Biblioteca', destino: 'Treino', fase: 'F1a' },
  { id: 'G-16', ecra: 'Construtor de exercício', destino: 'Treino', fase: 'F1a' },
  { id: 'G-17', ecra: 'Construtor de treino, aula e WOD', destino: 'Treino', fase: 'F1a' },
  { id: 'G-18', ecra: 'Construtor de plano e programa', destino: 'Treino', fase: 'F1a' },
  { id: 'G-19', ecra: 'Publicar e atribuir', destino: 'Treino', fase: 'F1a' },
  { id: 'G-20', ecra: 'Avaliação', destino: 'Avaliação', fase: 'F1b' },
  { id: 'G-21', ecra: 'Construtor de questionário', destino: 'Avaliação', fase: 'F1b' },
  { id: 'G-22', ecra: 'Construtor de protocolo de avaliação', destino: 'Avaliação', fase: 'F1b' },
  { id: 'G-23', ecra: 'Avaliação física · aplicar', destino: 'Avaliação', fase: 'F1b' },
  { id: 'G-24', ecra: 'Enviar e agendar avaliações e check-ins', destino: 'Avaliação', fase: 'F1b' },
  { id: 'G-25', ecra: 'Respostas, resultados e check-ins', destino: 'Avaliação', fase: 'F1b' },
  { id: 'G-26', ecra: 'Worklist clínica', destino: 'Saúde', fase: 'F4' },
  { id: 'G-27', ecra: 'Ficha clínica e nutricional', destino: 'Saúde', fase: 'F4' },
  { id: 'G-28', ecra: 'Episódio', destino: 'Saúde', fase: 'F4' },
  { id: 'G-29', ecra: 'Restrição e aptidão', destino: 'Saúde', fase: 'F1a', rota: '/clients/:id/aptidao' },
  { id: 'G-30', ecra: 'Plano alimentar e hábitos', destino: 'Saúde', fase: 'F4' },
  { id: 'G-31', ecra: 'Mensagens', destino: 'Mensagens', fase: 'F1b' },
  { id: 'G-32', ecra: 'Anúncios, campanhas e automatismos', destino: 'Mensagens', fase: 'F3' },
  { id: 'G-33', ecra: 'Planos e preços', destino: 'Negócio', fase: 'F1a' },
  { id: 'G-34', ecra: 'Contrato · alterar, suspender, cancelar', destino: 'Clientes', fase: 'F2' },
  { id: 'G-35', ecra: 'Cobranças', destino: 'Negócio', fase: 'F2' },
  { id: 'G-36', ecra: 'Faturas e caixa', destino: 'Negócio', fase: 'F2' },
  { id: 'G-37', ecra: 'Loja e venda ao balcão', destino: 'Negócio', fase: 'F4' },
  { id: 'G-38', ecra: 'Acessos e entradas', destino: 'Negócio', fase: 'F2' },
  { id: 'G-39', ecra: 'Métricas e regras', destino: 'Relatórios', fase: 'F3' },
  { id: 'G-40', ecra: 'Relatórios', destino: 'Relatórios', fase: 'F3' },
  { id: 'G-41', ecra: 'Editor de relatório', destino: 'Relatórios', fase: 'F3' },
  { id: 'G-42', ecra: 'Gerar, partilhar e agendar', destino: 'Relatórios', fase: 'F3' },
  { id: 'G-43', ecra: 'Documentos', destino: 'Documentos', fase: 'F2' },
  { id: 'G-44', ecra: 'Equipa e acessos', destino: 'Definições', fase: 'F1a', rota: '/settings/equipa' },
  { id: 'G-45', ecra: 'Segurança e auditoria', destino: 'Definições', fase: 'F1a' },
  { id: 'G-46', ecra: 'Ginásio e preferências', destino: 'Definições', fase: 'F1a' },
  { id: 'G-47', ecra: 'Subscrição e lugares', destino: 'Definições', fase: 'F1b' },
  { id: 'G-48', ecra: 'Modalidades e vocabulário', destino: 'Definições', fase: 'F5' },
];

export const rotaPorConstruir = (id: string) => `/ecra/${id.toLowerCase()}`;

/** Ecrã ainda por construir: tema Esboço, nunca um ecrã em branco. */
export function EcraPorConstruir({ ecra }: { ecra: EcraG }) {
  return (
    <CoachShell headStrong={ecra.ecra} headSub={`${ecra.id} · ${ecra.destino}`} legado={false}>
      <div className="lv-root" data-tema="esboco" style={{ padding: 'var(--espaco-16)', borderRadius: 'var(--raio-cartao)' }}>
        <EstadoPagina tipo="vazio" titulo={`${ecra.ecra} ainda não está construído`}
          texto={`Este ecrã entra na fase ${ecra.fase}. Até lá, usa os destinos do menu.`} />
      </div>
    </CoachShell>
  );
}
