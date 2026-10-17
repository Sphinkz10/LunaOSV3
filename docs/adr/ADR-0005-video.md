# ADR-0005 · Alojamento e entrega de vídeo (biblioteca e vídeos do PT)

Estado: proposta (tarefa 27, F1a) · decisão final de fornecedor com o Dantas (N-pendente)

## Contexto

A biblioteca base do LunaOS (tarefa 27) e os vídeos que o PT carrega em G-16 precisam do mesmo caminho: armazenar na UE, transcodificar, servir em streaming adaptativo com miniaturas, funcionar sem rede quando o treino foi descarregado e ter custo previsível por minuto visto. Cada vídeo ou imagem da biblioteca só entra com licença registada (D11); a base de dados já recusa o contrário (`media_licenses`, prova B4).

## Opções

| Opção | UE | Transcodificação e HLS | Miniaturas | Custo | Notas |
|---|---|---|---|---|---|
| A. Supabase Storage (UE) + transcodificação própria (FFmpeg numa função) | Sim | Nós | Nós | Baixo em armazenamento; computação nossa | Mais trabalho e manutenção |
| B. Bunny Stream (região UE) | Sim | Sim, HLS | Sim | Baixo por minuto entregue | Assinatura de URL; simples |
| C. Mux | Dados nos EUA por omissão | Sim | Sim | Mais alto por minuto | Muito bom, mas a residência na UE é um extra |
| D. Cloudflare Stream | Global | Sim | Sim | Por minuto armazenado e visto | Residência UE não garantida |

## Proposta

**B. Bunny Stream na região UE**, com o mesmo serviço para a biblioteca e para os vídeos do PT:

- Carregamento direto do aparelho para o Bunny com um URL assinado gerado numa Edge Function (a chave nunca vai para a app).
- A base de dados guarda só o identificador do vídeo, a duração, a miniatura e, para a biblioteca, a licença.
- Reprodução por HLS adaptativo; na app (Capacitor) o treino descarregado guarda a versão de 480p de cada exercício para ver sem rede (tarefa 08, fila sem rede), apagada quando o treino sai do aparelho.
- Vídeos do PT ficam privados da organização (URL assinado com validade curta); os da biblioteca são públicos.
- Custo: medir minutos vistos por organização (tarefa 28) para o preço do plano.

## Consequências

- Até à escolha final, `video_url` aceita um URL HLS de qualquer origem com licença registada; a app mostra a miniatura ou o nome quando não há vídeo.
- Mudar de fornecedor é mudar a Edge Function de carregamento e o leitor; os dados não mudam.
