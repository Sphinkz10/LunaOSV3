import { useEffect, useState } from 'react';
import { partilharResumo, toast } from '@luna/core';
import { Botao, Janela, Nota } from '@luna/ui/v3';
import { getSupabaseClient } from '../lib/supabase';

/**
 * G-14: ao fechar a sessão, "Partilhar com o cliente?". Só esta linha chega
 * à app; as notas privadas do PT nunca saem da ficha.
 */
export function PartilharResumo({ sessaoId, cliente, aberta, onFechar, textoInicial = '' }: {
  sessaoId: string | null; cliente: string | null; aberta: boolean; onFechar: () => void; textoInicial?: string;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { if (aberta) setTexto(textoInicial); }, [aberta, textoInicial]);
  const enviar = async () => {
    const client = getSupabaseClient();
    if (!client || !sessaoId) return;
    setAGravar(true);
    try {
      await partilharResumo(client, sessaoId, texto);
      toast({ variant: 'success', title: 'Resumo partilhado', description: cliente ? `${cliente} vê-o no histórico da app.` : undefined });
      onFechar();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível partilhar', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta={aberta && !!sessaoId} onFechar={onFechar} titulo={cliente ? `Partilhar com ${cliente}?` : 'Partilhar com o cliente?'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <label className="lv-campo"><span className="lv-campo-rotulo">O que o cliente vai ler</span>
          <textarea className="lv-campo-input" rows={4} maxLength={600} placeholder="Ex.: Boa sessão. Subimos o agachamento; na quinta descansa os ombros."
            value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
        <Nota>As tuas notas privadas não são partilhadas. O cliente vê esta mensagem junto da sessão, no histórico.</Nota>
        <div className="lg-import__acoes" style={{ padding: 0 }}>
          <Botao variante="secundario" onClick={onFechar}>Agora não</Botao>
          <Botao aCarregar={aGravar} disabled={!texto.trim()} onClick={() => void enviar()}>Partilhar</Botao>
        </div>
      </div>
    </Janela>
  );
}
