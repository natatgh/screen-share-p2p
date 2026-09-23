# Arquitetura

O aplicativo Windows em `apps/desktop` reaproveita `useRoom` e `signaling.ts` com um adaptador de captura. Entrar na sala estabelece presença e recebe as transmissões dos participantes, sem iniciar captura. O botão de compartilhar abre um modal para escolher fonte e qualidade. O Electron lista fontes e seleciona o vídeo; o auxiliar C++ usa o HWND da janela para localizar o processo e capturar PCM somente da árvore desse processo. Um AudioWorklet converte PCM em trilha de áudio WebRTC. O sinal e a mídia seguem o mesmo protocolo P2P usado pelo navegador. O desktop não adiciona servidores à Vercel nem ao Supabase.

O painel de diagnóstico consulta `RTCPeerConnection.getStats()` a cada dois segundos em cada ligação ativa. Calcula banda e perda a partir da diferença entre amostras, mostra RTT/jitter P2P, FPS e contadores de quadros descartados/congelamentos quando disponíveis. O estado do Supabase é mostrado separadamente; não há medição de latência até o servidor de sinalização. As amostras ficam somente na memória do participante, sem envio para outro serviço.

```text
Navegador A ── SDP / ICE / presença ── signaling ── SDP / ICE / presença ── Navegador B
     └──────────────────── mídia WebRTC P2P ────────────────────────────────┘
```

`getDisplayMedia()` captura a tela. Para cada espectador, o transmissor abre um `RTCPeerConnection` com os tracks da captura. O espectador recebe uma conexão por transmissor. Qualquer participante pode ser transmissor simultaneamente. Ao encerrar captura, o transmissor fecha suas conexões e envia `stop`. ICE usa inicialmente `stun:stun.l.google.com:19302`.

Signaling e presença são abstraídos em `src/lib/signaling.ts`:

- Local: servidor WebSocket em `scripts/signaling.ts`; presença por lista de conexões, mensagens endereçadas.
- Deploy: Supabase Realtime Broadcast para offer/answer/ICE e Presence para participantes. Isso funciona entre instâncias da Vercel sem estado em memória na Function.

Não há banco de dados. A sala existe enquanto pelo menos uma pessoa está conectada. O código tem oito caracteres de um alfabeto de 32 símbolos (aproximadamente 40 bits); qualquer pessoa com o código pode entrar. A chave publishable do Supabase é pública por natureza e o canal também. Não trate os códigos como autenticação robusta. Um sistema futuro para conteúdo sensível precisará de autorização no servidor, canais privados e regras de acesso.

## Limitações reais da Vercel Hobby

Em junho de 2026, a Vercel [documentou suporte nativo a WebSockets em Functions](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections). Porém, a conexão dura no máximo o tempo da Function, e conexões futuras podem cair em outras instâncias. Memória local da Function não serve como estado compartilhado para salas. A [duração máxima Hobby com Fluid Compute é de 300 s](https://vercel.com/docs/functions/limitations). O [plano Hobby é gratuito dentro de cotas](https://vercel.com/docs/plans/hobby), e ao excedê-las o serviço pode ficar indisponível até o próximo período. A documentação geral de [limites](https://vercel.com/docs/limits) ainda contém uma seção antiga que diz que Functions não atuam como servidor WebSocket; essa página conflita com a KB mais recente. Por isso, o MVP não depende de WebSockets da Vercel para presença persistente.

O Supabase Realtime Free oferece [200 conexões simultâneas e 2 milhões de mensagens mensais](https://supabase.com/docs/guides/realtime/pricing), com [100 mensagens por segundo](https://supabase.com/docs/guides/realtime/limits). O tráfego de vídeo não passa por Supabase nem Vercel, somente sinalização. Cotas podem mudar; confira antes de uso amplo.

## Fallback futuro no PC do usuário

O ponto de extensão é a configuração `iceServers` em `src/lib/use-room.ts`: adicionar URL e credenciais TURN temporárias obtidas de um endpoint seguro. Um servidor coturn no PC exigirá IP público ou encaminhamento de portas e aprovação explícita para qualquer alteração de firewall/roteador. Se a malha P2P não escalar, uma SFU própria pode substituir a distribuição dos tracks; o protocolo de sala e a interface podem permanecer. Nenhuma porta foi aberta por este projeto.
