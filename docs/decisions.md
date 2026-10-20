# Decisões técnicas

## ADR 001 — Mídia P2P em malha

**Decisão:** WebRTC nativo com uma conexão de saída por espectador. **Motivo:** custo de infraestrutura de mídia zero para salas pequenas e suporte direto a `getDisplayMedia()`. **Consequência:** upload e CPU do transmissor crescem com o número de espectadores; redes que exigem TURN podem falhar.

## ADR 002 — Supabase Realtime no deploy

**Decisão:** Broadcast + Presence com chave publishable e sala por código. **Motivo:** estado de presença compartilhado entre instâncias, sem servidor próprio ou conta obrigatória para participantes. **Consequência:** é necessário criar/configurar um projeto Supabase gratuito; os canais públicos não protegem conteúdo confidencial.

## ADR 003 — Signaling local separado

**Decisão:** WebSocket pequeno na porta 3001, iniciado junto com Next.js. **Motivo:** MVP funciona localmente sem credenciais externas. **Consequência:** o servidor local não é distribuído na Vercel; produção seleciona Supabase pelas variáveis de ambiente.

## ADR 004 — Sem TURN/SFU no MVP

**Decisão:** somente STUN público. **Motivo:** TURN/SFU exigiriam recursos de rede e operação fora da Vercel Hobby; não há autorização para configurar o PC ou roteador do usuário. **Consequência:** algumas redes corporativas, móveis ou NAT simétrico não conectarão.

## ADR 005 — Perfis de qualidade ajustáveis

**Decisão:** oferecer preferência de codificação (Equilibrado, Vídeo mais fluido, Texto mais nítido), resolução (720p, 1080p, Original) e taxa de quadros (15, 30, 60 FPS) como controles independentes. O padrão é Equilibrado, 1080p e 30 FPS. Os tetos de bitrate variam com resolução e FPS (1,2 a 8 Mb/s por espectador). Ao mudar durante a transmissão, atualizar as restrições da captura e os parâmetros dos envios WebRTC; avisar quando o navegador rejeitar um ajuste. **Motivo:** permitir escolher nitidez ou fluidez conforme o conteúdo e a capacidade do computador. **Consequência:** os valores são pedidos ao navegador, não garantias; 60 FPS e resolução Original podem aumentar CPU e upload proporcionalmente ao número de espectadores.

## ADR 006 — Áudio limitado à fonte compartilhada (substituída pelo ADR 008 para janelas)

**Decisão:** solicitar `systemAudio: "exclude"` e `windowAudio: "exclude"` na captura e descartar qualquer trilha de áudio devolvida quando a fonte não for uma aba do navegador. **Motivo:** Chrome e Edge ainda não ofereciam suporte confiável a `windowAudio: "window"`; uma janela podia vir acompanhada de áudio do sistema. **Consequência:** abas podiam compartilhar áudio; janelas e monitores compartilhavam apenas vídeo até existir uma captura de áudio por aplicativo confiável. Ver ADR 008: essa limitação não existe mais no Chrome/Edge 141+.

## ADR 007 — Áudio por fonte (0.3.1, substitui ADR 006 para monitores)

Desktop: janela inclui somente a árvore de processos do aplicativo; monitor inclui áudio de todos os processos, exceto a árvore do Lumen, com WASAPI Process Loopback em modo EXCLUDE. Isso evita retransmitir o som recebido na própria sala. O áudio do sistema não está ligado ao monitor físico. Não há fallback de janela para sistema; falha mantém somente vídeo. Não é possível garantir isolamento de duas janelas do mesmo processo.

Web (histórico, substituído pelo ADR 008): solicitar systemAudio include e windowAudio exclude; conservar áudio autorizado de abas e monitores, descartar áudio de janelas ou fonte desconhecida. Para janela com som do aplicativo, usar o Desktop.

## ADR 008 — Áudio de janela na web via windowAudio: "window" (substitui o trecho web do ADR 006/007)

**Decisão:** solicitar `windowAudio: "window"` (em vez de `"exclude"`) e parar de descartar o áudio quando a fonte capturada é uma janela; o descarte continua existindo apenas como rede de segurança para superfícies desconhecidas. **Motivo:** Chrome e Edge 141 (lançado em 30/09/2025) passaram a oferecer suporte nativo a `windowAudio: "window"`, escopando o áudio capturado à janela escolhida (ex.: compartilhar a janela do Spotify agora traz apenas o áudio do Spotify), semelhante ao isolamento por processo já feito no Desktop. **Consequência:** navegadores que ignoram o hint (Firefox não implementa áudio em `getDisplayMedia`; Safari não suporta) simplesmente não retornam trilha de áudio, sem regressão de privacidade. Em Chrome/Edge atualizados, janela, aba e monitor agora podem compartilhar áudio na web; o aviso de "use o Desktop para áudio de janela" deixou de ser necessário no caminho comum.

## ADR 009 — Recuperação imediata ao retomar a aba e Screen Wake Lock

**Decisão:** ao a aba voltar a ficar visível (`visibilitychange`), forçar uma leitura de stats imediata e chamar `PeerRecovery.retryNow()` em cada conexão de saída pendente, pulando qualquer espera agendada. Além disso, pedir `navigator.wakeLock.request("screen")` enquanto a transmissão está ativa, reatribuindo o lock quando a aba volta a ficar visível (o navegador libera o lock sozinho quando a aba fica oculta). **Motivo:** o Chrome limita `setTimeout`/`setInterval` de abas em segundo plano (podendo cair a 1 disparo por minuto após alguns minutos ocultas); isso atrasa a recuperação de ICE do `PeerRecovery` exatamente quando o apresentador troca de janela/aba durante a transmissão, dando a impressão de que a transmissão "parou". O Wake Lock evita que o sistema suspenda a tela e interrompa a captura durante uma apresentação longa. **Consequência:** a recuperação ainda depende do evento `connectionstatechange` ter sido entregue (também sujeito ao mesmo throttling, porém o navegador processa a fila assim que a aba volta ao primeiro plano); Wake Lock não tem suporte universal (ex. Firefox desktop) e falha é tratada como best-effort, sem bloquear a transmissão.
