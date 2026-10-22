import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PASSOS_INICIO } from '@luna/core';
import { Botao, Campo } from '@luna/ui/v3';
import { CoachShell } from '../app/CoachShell';
import { t } from '../lib/vocab';

/**
 * Ajuda (G-01): perguntas do dia a dia do PT, com o caminho para cada coisa.
 * Sem chat nem vídeos nesta fase; a procura filtra as perguntas.
 */
export function Ajuda() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const S = t('sessao'); const SS = t('sessao', { plural: true });
  const perguntas: { p: string; r: string; rota?: string; acao?: string }[] = [
    { p: 'Como trago os meus clientes do Excel?', r: 'Em Clientes › Importar escolhes o ficheiro, confirmas as colunas (incluindo as sessões por usar) e vês tudo antes de gravar.', rota: '/clients/importar', acao: 'Importar' },
    { p: 'Como vendo um pack de sessões?', r: `Cria o pack em Negócio › Packs e vende-o na ficha do cliente. Cada ${S} feita, falta ou desmarcação fora do prazo desconta sozinha.`, rota: '/business/packs', acao: 'Packs' },
    { p: 'O cliente pode marcar sozinho?', r: 'Sim, nas janelas em que aceitas marcações. Em Regras e lembretes ligas ou desligas, e defines o máximo por semana e o prazo para desmarcar.', rota: '/schedule/regras', acao: 'Regras' },
    { p: 'Como vejo as sessões no Google Calendar ou no iPhone?', r: 'Em Regras e lembretes geras a tua ligação de calendário e colas no Google (A partir do URL) ou no iPhone (Juntar calendário subscrito).', rota: '/schedule/regras', acao: 'Ligar calendário' },
    { p: 'O cliente recebe lembretes?', r: `Sim: 24 h e 2 h antes da ${S}, nunca entre as 22h e as 8h. Por SMS só se ligares e o cliente não tiver a app.`, rota: '/schedule/regras', acao: 'Lembretes' },
    { p: 'Como dou um treino a um cliente?', r: 'Escolhe um treino ou plano na Biblioteca e usa Atribuir. Vês antes as datas, as marcações que cria e as restrições de saúde.', rota: '/training/biblioteca', acao: 'Biblioteca' },
    { p: 'O que o cliente vê das minhas notas?', r: `Nada. As notas da ficha são só tuas. Ao fechar a ${S} podes partilhar uma mensagem curta, e só essa chega à app.` },
    { p: 'Um PT vai sair. O que faço aos clientes dele?', r: 'Em Definições › Equipa, no menu da pessoa, usa Passar os clientes. Fica registado em cada ficha.', rota: '/settings/equipa', acao: 'Equipa' },
    { p: 'Perdi o acesso à minha conta.', r: 'Usa um código de recuperação ou pede a quem gere a equipa que gere um código novo para ti.', rota: '/conta', acao: 'A minha conta' },
    { p: `Fiquei sem rede a meio de uma ${S}.`, r: `Continua a registar. As séries ficam guardadas no aparelho e seguem quando a rede voltar. Não feches a ${S} antes disso.` },
  ];
  const filtro = q.trim().toLocaleLowerCase('pt-PT');
  const visiveis = filtro ? perguntas.filter((x) => `${x.p} ${x.r}`.toLocaleLowerCase('pt-PT').includes(filtro)) : perguntas;
  return (
    <CoachShell headStrong="Ajuda" headSub={`Respostas rápidas sobre clientes, ${SS} e packs`} legado={false}>
      <div className="lv-root lg-ficha__grelha">
        <div className="lg-ficha__coluna">
          <Campo rotulo="Procurar" type="search" placeholder="Ex.: pack, lembrete, calendário" value={q} onChange={(e) => setQ(e.target.value)} />
          <section className="lv-lista" aria-label="Perguntas">
            {visiveis.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Nada encontrado. Tenta outra palavra.</p> : visiveis.map((x) => (
              <details key={x.p} className="lv-linha-lista" style={{ display: 'block', cursor: 'default' }}>
                <summary className="lv-linha-lista__titulo" style={{ cursor: 'pointer' }}>{x.p}</summary>
                <p style={{ margin: 'var(--espaco-8) 0' }}>{x.r}</p>
                {x.rota && <Botao variante="secundario" onClick={() => navigate(x.rota!)}>{x.acao}</Botao>}
              </details>
            ))}
          </section>
        </div>
        <aside className="lg-ficha__coluna">
          <section className="lv-lista" aria-label="Primeiros passos">
            <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Primeiros passos</h3>
            {PASSOS_INICIO.map((s) => (
              <button key={s.id} type="button" className="lv-linha-lista" onClick={() => navigate(s.rota)}>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{s.titulo}</span><span className="lv-legenda">{s.texto}</span></span>
              </button>
            ))}
          </section>
          <p className="lv-legenda">Atalhos de teclado: carrega em ? em qualquer ecrã.</p>
        </aside>
      </div>
    </CoachShell>
  );
}
