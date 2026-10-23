import { g, eFeminino } from '@luna/modalidades';
import { useRef, useState } from 'react';
import { estadoCamara, marcarPedidoAvisos, pedirAvisos } from '@luna/core';
import { Botao, Janela } from '@luna/ui/v3';
import { Bell, CalendarBlank, ChatCircle, Gear, Lock } from '@luna/icons';
import { t } from '../vocab';

/**
 * P-09 · "Avisamos-te?": pede-se na primeira vez que faz falta (depois de
 * marcar com o PT, na F1a), nunca no arranque. "Agora não" não bloqueia nada.
 */
export function PedirAvisos({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const agoraNao = () => { marcarPedidoAvisos('agora_nao'); onFechar(); };
  return (
    <Janela aberta={aberta} onFechar={agoraNao} titulo="Avisamos-te?" sub="Só quando é sobre ti.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <span className="lc-permissao__icone" aria-hidden><Bell size={28} /></span>
        <ul className="lc-permissao__lista">
          <li><CalendarBlank size={18} aria-hidden />Lembrete antes {g(t('sessao'), 'da tua', 'do teu')}</li>
          <li><CalendarBlank size={18} aria-hidden />{g(t('sessao'), 'A tua', 'O teu')} {eFeminino(t('sessao')) ? 'mudou ou foi cancelada' : 'mudou ou foi cancelado'}</li>
          <li><ChatCircle size={18} aria-hidden />O teu {t('responsavel')} respondeu</li>
        </ul>
        <p className="lv-legenda" style={{ margin: 0 }}>Publicidade, só se pedires. Mudas em Eu › Definições › Avisos.</p>
        <Botao onClick={() => { void pedirAvisos().finally(onFechar); }}>Permitir avisos</Botao>
        <Botao variante="secundario" onClick={agoraNao}>Agora não</Botao>
      </div>
    </Janela>
  );
}

/**
 * P-09 · Fotos com a câmara, ou da galeria. Se a câmara estiver desligada,
 * a folha explica como ligar e deixa sempre escolher da galeria (o passo
 * nunca fica bloqueado). Pronto para o check-in com fotos (C-08, F1b).
 */
export function EscolherFoto({ rotulo, privado, onFoto }: { rotulo: string; privado?: string; onFoto: (f: File) => void }) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [recusada, setRecusada] = useState(false);
  const tirar = async () => {
    if ((await estadoCamara()) === 'recusada') { setRecusada(true); return; }
    camara.current?.click();
  };
  const escolher = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) onFoto(f); e.target.value = ''; };
  return (
    <>
      <Botao variante="secundario" onClick={() => void tirar()}>{rotulo}</Botao>
      <input ref={camara} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={escolher} />
      <input ref={galeria} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={escolher} />
      <Janela aberta={recusada} onFechar={() => setRecusada(false)} titulo="A câmara está desligada" sub={privado ? `Para ${privado}` : undefined}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
          <ul className="lc-permissao__lista">
            {privado && <li><Lock size={18} aria-hidden />Só o teu {t('responsavel')} vê estas fotos</li>}
            <li><Gear size={18} aria-hidden />Liga em Definições do telemóvel › LunaOS › Câmara</li>
          </ul>
          <Botao onClick={() => setRecusada(false)}>Já liguei</Botao>
          <Botao variante="secundario" onClick={() => { setRecusada(false); galeria.current?.click(); }}>Escolher da galeria</Botao>
        </div>
      </Janela>
    </>
  );
}
