import { useState } from 'react';
import { CalendarBlank, House, Play, Plus, User, Users } from '@luna/icons';
import {
  Atalho, Avatar, BarraLotacao, Botao, BotaoFixo, Campo, CartaoDestaque, CartaoNumero, Chip, Estado, Interruptor,
  LinhaLista, LinhaTabela, MenuItem, Metrica, NavegacaoInferior, Nota, Pill,
} from './components';

/** Todos os componentes base num só ecrã: usado no Storybook, nos testes de axe e nos snapshots. */
export function Galeria() {
  const [chip, setChip] = useState('tudo');
  const [ligado, setLigado] = useState(true);
  return (
    <main style={{ display: 'grid', gap: 'var(--espaco-16)', padding: 'var(--margem-telemovel)', maxWidth: 720 }}>
      <h1 className="lv-titulo-ecra">Componentes</h1>
      <div style={{ display: 'flex', gap: 'var(--espaco-8)', flexWrap: 'wrap' }}>
        <Botao icone={Plus}>Novo</Botao>
        <Botao variante="secundario">Ver na ficha</Botao>
        <Botao aCarregar>A gravar</Botao>
        <Botao disabled>Desativado</Botao>
        <Pill>Arquivado</Pill>
      </div>
      <div style={{ display: 'flex', gap: 'var(--espaco-8)' }} role="group" aria-label="Filtros">
        <Chip ativo={chip === 'tudo'} onClick={() => setChip('tudo')}>Tudo</Chip>
        <Chip ativo={chip === 'atestados'} contagem={48} onClick={() => setChip('atestados')}>Atestados</Chip>
      </div>
      <div style={{ display: 'flex', gap: 'var(--espaco-12)', alignItems: 'center' }}>
        <Avatar nome="Ana Costa" />
        <MenuItem icone={House} ativo>Hoje</MenuItem>
        <MenuItem icone={Users}>Clientes</MenuItem>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--espaco-16)' }}>
        <Metrica rotulo="No ginásio agora" icone={Users} valor={38} de="de 120" legenda="Mais cheio às 18:30" />
        <CartaoNumero rotulo="Sessões hoje" valor={6} legenda="2 por confirmar" rodape={<Estado tom="ok">Ativa</Estado>} />
      </div>
      <div role="table" aria-label="Entradas">
        <LinhaTabela hora="09:41" nome="Rita Moura" detalhe="Ilimitado" onde="Porta 1 · app" estado={{ tom: 'ok', texto: 'Entrou' }} />
      </div>
      <Nota>O contrato permite até 2 suspensões por ano. Esta é a primeira.</Nota>
      <LinhaLista titulo="Força A" legenda="50 min · 3 exercícios" miniatura={null} onClick={() => {}} />
      <CartaoDestaque sobretitulo="Próxima sessão" titulo="Força A com a Ana" texto="Hoje às 09:00 · Sala 1"
        acao={{ rotulo: 'Iniciar', onClick: () => {} }} />
      <div style={{ display: 'flex', gap: 'var(--espaco-16)' }}>
        <Atalho icone={Plus} rotulo="Novo cliente" onClick={() => {}} />
        <Atalho icone={CalendarBlank} rotulo="Marcar" onClick={() => {}} />
      </div>
      <Interruptor ligado={ligado} onMudar={setLigado} rotulo="Lembretes por email" />
      <Campo rotulo="Nome" placeholder="Nome completo" ajuda="Como aparece na app" />
      <Campo rotulo="Email" erro="Email inválido" defaultValue="ana@" />
      <BarraLotacao ocupados={9} lotacao={10} />
      <div style={{ display: 'flex', gap: 'var(--espaco-12)' }}>
        <Estado tom="ok">Ativa</Estado><Estado tom="aviso">Em risco</Estado><Estado tom="erro">Em atraso</Estado>
      </div>
      <NavegacaoInferior estatica itens={[
        { id: 'hoje', rotulo: 'Hoje', icone: House, ativo: true, onClick: () => {} },
        { id: 'clientes', rotulo: 'Clientes', icone: User, onClick: () => {} },
        { id: 'treino', rotulo: 'Treino', icone: Play, onClick: () => {} },
      ]} />
      <BotaoFixo estatico>Guardar</BotaoFixo>
    </main>
  );
}
