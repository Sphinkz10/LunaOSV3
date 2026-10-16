import { useEffect, useState } from 'react';
import { useAuthStore } from '@luna/core';
import { EstadoPagina, Esqueleto, AvisoSecao, TEMAS, type TemaId } from '@luna/ui/v3';
import { Users } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';

/**
 * Só em desenvolvimento: a estrutura da Gestão (G-00) e os estados (X-02) sem
 * servidor, com uma sessão de exemplo. /dev/estrutura?tema=limao
 */
export function DemoEstrutura() {
  const [pronto, setPronto] = useState(false);
  const tema = (new URLSearchParams(window.location.search).get('tema') ?? 'oceano') as TemaId;
  useEffect(() => {
    const s = useAuthStore.getState();
    s.signIn('demo', [
      { org_id: 'o1', name: 'Estúdio Luna', type: 'studio', theme: TEMAS.includes(tema) ? tema : 'oceano', timezone: 'Europe/Lisbon',
        membership_id: 'm1', roles: ['owner'], subscription_status: 'trial',
        permissions: ['org.manage', 'team.manage', 'clients.read_all', 'clients.read_own', 'clients.write', 'schedule.read_all', 'schedule.write', 'training.write', 'health.read'] },
      { org_id: 'o2', name: 'Rui Dantas PT', type: 'solo_coach', theme: 'ouro', timezone: 'Europe/Lisbon',
        membership_id: 'm2', roles: ['owner'], subscription_status: 'trial', permissions: ['org.manage'] },
    ], 'o1', ['today', 'clients', 'schedule', 'training', 'settings']);
    s.setMe({ name: 'Marta Lopes', avatarUrl: null });
    setPronto(true);
  }, [tema]);
  if (!pronto) return null;
  return (
    <CoachShell headStrong="Hoje" legado={false}>
      <div className="lv-root" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--espaco-16)', padding: 'var(--espaco-16)', borderRadius: 'var(--raio-cartao)' }}>
        <EstadoPagina tipo="vazio" icone={Users} titulo="Ainda não há clientes" texto="Os clientes que acrescentares aparecem aqui." acao={{ rotulo: 'Novo cliente', onClick: () => {} }} />
        <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto="Os pagamentos não responderam. O resto do ecrã continua a funcionar." acao={{ rotulo: 'Tentar de novo', onClick: () => {} }} />
        <EstadoPagina tipo="sem-rede" titulo="Sem rede" texto="3 presenças guardadas neste tablet. Enviam assim que a rede voltar." nota="A aguardar rede" />
        <EstadoPagina tipo="sem-permissao" titulo="Sem permissão" texto="O teu papel não dá acesso a esta área." />
        <div className="lv-estado-pagina"><Esqueleto /></div>
        <AvisoSecao tipo="desatualizado" texto="Dados de há 5 min" acao={{ rotulo: 'Atualizar', onClick: () => {} }} />
      </div>
    </CoachShell>
  );
}
