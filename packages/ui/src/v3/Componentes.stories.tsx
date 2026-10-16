import type { Meta, StoryObj } from '@storybook/react';
import { Plus } from '@luna/icons';
import { Botao, CartaoDestaque, Tema, TEMAS } from './components';
import { Galeria } from './Galeria';

const meta: Meta = { title: 'v3/Componentes base' };
export default meta;

export const TodosOsComponentes: StoryObj = { render: () => <Galeria /> };

export const Botoes: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--espaco-8)', padding: 'var(--espaco-16)' }}>
      <Botao icone={Plus}>Novo</Botao>
      <Botao variante="secundario">Ver na ficha</Botao>
      <Botao aCarregar>A gravar</Botao>
      <Botao disabled>Desativado</Botao>
    </div>
  ),
};

export const DestaqueNosQuatroTemas: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
      {TEMAS.map((t) => (
        <Tema key={t} tema={t}>
          <div style={{ padding: 'var(--espaco-16)' }}>
            <CartaoDestaque sobretitulo={t} titulo="Força A com a Ana" texto="Hoje às 09:00"
              acao={{ rotulo: 'Iniciar', onClick: () => {} }} />
          </div>
        </Tema>
      ))}
    </div>
  ),
};
