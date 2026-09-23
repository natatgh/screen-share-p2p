# Decisões técnicas

## ADR 001 — Mídia P2P em malha

**Decisão:** WebRTC nativo com uma conexão de saída por espectador. **Motivo:** custo de infraestrutura de mídia zero para salas pequenas e suporte direto a `getDisplayMedia()`. **Consequência:** upload e CPU do transmissor crescem com o número de espectadores; redes que exigem TURN podem falhar.

## ADR 002 — Supabase Realtime no deploy

**Decisão:** Broadcast + Presence com chave publishable e sala por código. **Motivo:** estado de presença compartilhado entre instâncias, sem servidor próprio ou conta obrigatória para participantes. **Consequência:** é necessário criar/configurar um projeto Supabase gratuito; os canais públicos não protegem conteúdo confidencial.

## ADR 003 — Signaling local separado

**Decisão:** WebSocket pequeno na porta 3001, iniciado junto com Next.js. **Motivo:** MVP funciona localmente sem credenciais externas. **Consequência:** o servidor local não é distribuído na Vercel; produção seleciona Supabase pelas variáveis de ambiente.

## ADR 004 — Sem TURN/SFU no MVP

**Decisão:** somente STUN público. **Motivo:** TURN/SFU exigiriam recursos de rede e operação fora da Vercel Hobby; não há autorização para configurar o PC ou roteador do usuário. **Consequência:** algumas redes corporativas, móveis ou NAT simétrico não conectarão.

## ADR 005 — Priorizar a nitidez de texto

**Decisão:** capturar a tela com preferência de até 30 quadros por segundo, marcar o vídeo como texto e oferecer três perfis ajustáveis durante a transmissão: Alta (resolução original, até 6 Mb/s e 30 fps), Equilibrada (até 1080p, 3 Mb/s e 30 fps) e Economia (até 720p, 1 Mb/s e 15 fps). O perfil Alta prefere manter a resolução quando a rede estiver congestionada. **Motivo:** a leitura de interfaces e texto é o uso principal do compartilhamento de tela, mas cada pessoa pode escolher o consumo de rede. **Consequência:** o navegador ainda adapta o envio à conexão e pode ignorar parâmetros não suportados; os valores são tetos, não garantias, e cada espectador consome upload adicional.
