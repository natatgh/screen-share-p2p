# Desempenho e validação — Desktop 0.3.0

## O que mudou

- Oferta/ICE esperam assinatura do canal; a fila expira em 10 segundos, limita 128 mensagens e verifica o ACK do servidor (não é confirmação do espectador).
- O transmissor reinicia ICE após falha ou cinco segundos desconectado. Duas tentativas de 12 segundos sem conexão levam à recriação do peer. Sair da sala ou parar cancela as tentativas. O receptor reaproveita seu peer para uma renegociação, e ignora candidatos com ufrag antigo. Não há mudança no envelope offer/answer/ice/stop.
- Pressão persistente de CPU pode reduzir a captura de origem para todos; congestionamento do espectador reduz apenas seu envio. Dados ausentes não contam como estabilidade. O ajuste manual continua sendo o teto.
- A capacidade de upload por conexão não é a capacidade total do PC. O campo Upload total é opcional: se preenchido, reserva 20% para áudio/retransmissões e divide o restante entre os espectadores conectados. Sem limite explícito, cada envio respeita a estimativa do próprio transporte e os tetos do perfil; não inventamos uma medição de upload global.
- O áudio usa um buffer circular fixo de 200 ms, sem arrays crescentes na thread de áudio. Em transbordamento descarta amostras antigas; falta de áudio gera silêncio. O relatório mostra buffer, descartes e underruns. A cópia redundante no renderer foi removida.

## Diagnóstico

O painel mostra captura/codificação/exibição, codec, bitrate, RTT e limitação. A exibição usa requestVideoFrameCallback quando há um player visível; transmissões sem player podem não ter esse dado. CPU é a soma dos processos Electron e pode variar conforme a contabilização do Windows. Memória é working set dos processos, não memória exclusiva. GPU não é medida.

Exportar diagnóstico salva localmente até 150 amostras, em intervalos de dois segundos (cerca de cinco minutos). O JSON tem schemaVersion 1, perfil solicitado, estado e métricas anônimas por direção; inclui CPU/memória e áudio no Desktop. Não contém sala, ID de pessoa, título da janela, SDP, ICE ou mídia. Não é enviado ao Supabase.

## Comparação no Windows 11

1. Registrar modelo de CPU/GPU, versão do app e upload disponível separadamente.
2. Repetir a mesma cena com movimento durante dois minutos em 720p/30 e 1080p/30, com 1, 2 e 3 espectadores. Também testar uma cena de texto.
3. Exportar relatórios do transmissor e de um espectador. Comparar FPS de captura, codificação e exibição, tempo por quadro, congelamentos e upload total.
4. Meta para qualificar 1080p/30: >=27 FPS codificados/exibidos em pelo menos 90% das amostras válidas após aquecimento, e nenhum congelamento >1 segundo no teste. Isso é critério de teste, não garantia em qualquer PC/rede.
5. No diagnóstico, comparar Automático, H.264 e VP9. A seleção é uma preferência: browsers sem suporte mantêm o fallback. Confirmar o codec efetivamente negociado nos detalhes. Não trocar o padrão global até obter >=15% de ganho em CPU ou banda, sem regressão de FPS/congelamentos ou nitidez.
6. Testar aplicativo comum, jogo, navegador e monitor; dois aplicativos tocando som simultaneamente; somente a árvore do processo escolhido deve transmitir áudio. Monitor continua sem áudio. Testar parada, falha do auxiliar e troca de fonte.

O teste Playwright usa uma fonte sintética em movimento com três navegadores receptores e exercita offer/answer, ICE restart por injeção de falha, mudança de qualidade/codec, reconexão da sinalização e parada. Ele não mede captura de jogo, aceleração GPU, áudio WASAPI real ou qualidade visual perceptual. Esses testes permanecem manuais no Windows 11.

## Limite do P2P

Três espectadores continuam exigindo três envios. A otimização não elimina o limite físico de CPU/upload. Sem TURN, redes restritas ainda podem não conectar. Se a meta continuar inviável após comparação real, a próxima decisão é uma SFU; nenhum servidor de mídia ou porta foi configurado nesta etapa.
