# Decisões técnicas

## ADR 001 — Mídia P2P em malha

**Decisão:** WebRTC nativo com uma conexão de saída por espectador. **Motivo:** custo de infraestrutura de mídia zero para salas pequenas e suporte direto a `getDisplayMedia()`. **Consequência:** upload e CPU do transmissor crescem com o número de espectadores; redes que exigem TURN podem falhar.

## ADR 002 — Supabase Realtime no deploy

**Decisão:** Broadcast + Presence com chave publishable e sala por código. **Motivo:** estado de presença compartilhado entre instâncias, sem servidor próprio ou conta obrigatória para participantes. **Consequência:** é necessário criar/configurar um projeto Supabase gratuito; os canais públicos não protegem conteúdo confidencial.

## ADR 003 — Signaling local separado

**Decisão:** WebSocket pequeno na porta 3001, iniciado junto com Next.js. **Motivo:** MVP funciona localmente sem credenciais externas. **Consequência:** o servidor local não é distribuído na Vercel; produção seleciona Supabase pelas variáveis de ambiente.

## ADR 004 — Sem TURN/SFU no MVP

**Decisão:** somente STUN público. **Motivo:** TURN/SFU exigiriam recursos de rede e operação fora da Vercel Hobby; não há autorização para configurar o PC ou roteador do usuário. **Consequência:** algumas redes corporativas, móveis ou NAT simétrico não conectarão.
