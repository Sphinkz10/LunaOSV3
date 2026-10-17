import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { aceitarTutela } from '@luna/core';
import { Botao, Interruptor, Nota } from '@luna/ui/v3';
import { getSupabaseClient } from '../lib/supabase';
import { guardarPendente, limparPendente, useSessao } from '../sessao';
import { Passo } from './Conta';

/**
 * Encarregado de educação (C-25, J31): chega pelo pedido (email ou SMS), entra
 * com a sua própria conta, autoriza e assina como encarregado e pagador, com
 * consentimentos separados. Depois vê só o que o menor partilha com ele.
 */
export function Tutela() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { sessao, aCarregar: aCarregarSessao } = useSessao();
  const [encarregado, setEncarregado] = useState(false);
  const [pagador, setPagador] = useState(true);
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);

  useEffect(() => { if (token) guardarPendente({ tutela: token }); }, [token]);

  if (aCarregarSessao) return null;
  if (!sessao) {
    return (
      <Passo titulo="Autorizar como encarregado"
        acao={<>
          <Botao fixo onClick={() => navigate('/entrar')}>Entrar com a minha conta</Botao>
          <Botao variante="secundario" fixo onClick={() => navigate('/criar-conta')}>Criar conta</Botao>
        </>}>
        <Nota>O teu educando pediu-te para autorizar a inscrição. Para isso precisas da tua própria conta, separada da dele.</Nota>
      </Passo>
    );
  }

  const autorizar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    if (!encarregado) { setErro('Para autorizar tens de confirmar que és o encarregado de educação.'); return; }
    setACarregar(true); setErro(null);
    try { await aceitarTutela(client, token, pagador); limparPendente('tutela'); setFeito(true); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível autorizar.'); }
    finally { setACarregar(false); }
  };

  return feito ? (
    <Passo titulo="Autorização feita">
      <p role="status">Obrigado. A inscrição ficou autorizada e assinada. Vais ver só o que o teu educando escolher partilhar contigo; aos 18 anos a conta passa só para ele.</p>
    </Passo>
  ) : (
    <Passo titulo="Autorizar como encarregado" acao={<Botao fixo onClick={() => void autorizar()} aCarregar={aCarregar}>Autorizar e assinar</Botao>}>
      <div className="lc-escolhas">
        <div className="lc-escolha">
          <div><b>Sou o encarregado de educação</b><p className="lv-legenda" style={{ margin: 0 }}>Autorizo a inscrição e o tratamento dos dados do meu educando.</p></div>
          <Interruptor ligado={encarregado} onMudar={setEncarregado} rotulo={encarregado ? 'Confirmado' : 'Por confirmar'} />
        </div>
        <div className="lc-escolha">
          <div><b>Sou também o pagador</b><p className="lv-legenda" style={{ margin: 0 }}>Os pagamentos e as faturas ficam em meu nome.</p></div>
          <Interruptor ligado={pagador} onMudar={setPagador} rotulo={pagador ? 'Sim' : 'Não'} />
        </div>
      </div>
      {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
    </Passo>
  );
}
