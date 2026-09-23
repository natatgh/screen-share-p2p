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

**Decisão:** capturar a tela com preferência de até 30 quadros por segundo e oferecer quatro perfis ajustáveis durante a transmissão: Equilibrada por padrão (até 1080p, 3 Mb/s e 30 fps), Fluidez (até 720p, 2,5 Mb/s e 30 fps), Alta (resolução original, até 6 Mb/s e 30 fps) e Economia (até 720p, 1 Mb/s e 15 fps). Fluidez sinaliza conteúdo em movimento e prefere preservar quadros; Alta sinaliza texto e prefere preservar a resolução. **Motivo:** o perfil Alta pode exigir CPU e upload excessivos e reduzir quadros em redes congestionadas. **Consequência:** o navegador ainda adapta o envio à conexão e pode ignorar parâmetros não suportados; os valores são tetos, não garantias, e cada espectador consome upload adicional.
