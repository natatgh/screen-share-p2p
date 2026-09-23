# Lumen — compartilhamento de tela P2P

MVP de salas temporárias para compartilhar tela, janela ou monitor pelo navegador. Qualquer participante pode transmitir; os demais podem assistir. Sem conta, sem gravação, sem LiveKit ou coturn.

O **Lumen Desktop para Windows 11** fica em `apps/desktop`. Ele entra nas mesmas salas para assistir ou transmitir, sem iniciar captura ao entrar. A transmissão pode incluir vídeo de uma janela ou monitor e, para janelas, áudio do processo do aplicativo. Espectadores também podem usar a página web. Veja [as instruções do desktop](apps/desktop/README.md).

Em cada sala, o painel **Diagnóstico** acompanha a sinalização e, durante uma transmissão P2P, mostra banda de envio/recebimento, RTT, jitter, perda de pacotes, FPS e indicadores de congelamento. As métricas são locais e não ficam gravadas.

## Rodar localmente

Requisitos: Node.js 20.9+ e npm.

```bash
npm install
npm run dev
```

Abra http://localhost:3000, crie uma sala e abra o link em outra aba ou navegador. `npm run dev` inicia o site na porta 3000 e o servidor de signaling na 3001. A captura de tela exige contexto seguro: localhost funciona; para acessar por outro dispositivo use HTTPS.

Na sala, abra **Qualidade** para escolher a preferência de codificação (Equilibrado, Vídeo mais fluido ou Texto mais nítido), a resolução (720p, 1080p ou Original) e os quadros por segundo (15, 30 ou 60). O padrão é Equilibrado, 1080p e 30 FPS. É possível mudar os ajustes durante a transmissão; o app tenta atualizar a captura e os envios ativos. O navegador pode limitar a qualidade efetiva. Cada espectador consome upload adicional, especialmente em 60 FPS.

Na captura, o app sugere a seleção de uma janela, mas compartilha áudio **somente quando uma aba do navegador é selecionada**. O áudio de janelas e monitores é desativado, mesmo se o navegador devolver uma trilha de áudio, pois Chrome e Edge ainda não oferecem uma forma confiável de limitar a captura de áudio a uma janela específica. A sala mostra quando não há áudio compartilhado.

## Deploy gratuito

1. Crie um projeto no plano gratuito do Supabase e copie a URL e a chave **publishable** no painel Connect.
2. Importe este repositório pessoal na Vercel Hobby.
3. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` como variáveis de ambiente na Vercel. Não use chave secret/service role.
4. Faça deploy. O build é o padrão Next.js; o servidor local da porta 3001 não é usado no deploy.

Os canais Realtime são públicos e o código é a única barreira de entrada. O MVP é adequado para compartilhamento casual com pessoas de confiança, não para conteúdo confidencial. O Supabase gratuito pode pausar projetos inativos e tem cotas; veja [Arquitetura](docs/architecture.md).

## Scripts

- `npm run dev`: interface + signaling local
- `npm run dev:web`: interface apenas, para uso com Supabase configurado
- `npm run dev:signal`: signaling local apenas
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`: verificações
- `npm run test:realtime`: verifica Presence e Broadcast no projeto Supabase configurado em `.env.local`

## Documentação

- [Arquitetura e limites](docs/architecture.md)
- [Decisões técnicas](docs/decisions.md)
- [Roadmap](docs/roadmap.md)
- [Code signing policy](docs/code-signing-policy.md)
- [Candidatura à SignPath Foundation](docs/signpath-application.md)
- [Downloads do Desktop](docs/downloads.md)
- [Privacidade](PRIVACY.md)
- [Licença MIT](LICENSE)

## Assinatura do aplicativo Windows

O Lumen prepara uma candidatura ao programa gratuito para projetos open source da SignPath Foundation. As builds atuais ainda não têm assinatura Authenticode. Veja a [Code signing policy](docs/code-signing-policy.md) e os [downloads](docs/downloads.md). Após a aprovação e a primeira build assinada, o crédito exigido pelo programa será: **Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/)**.

## Limitações do MVP

- WebRTC em malha: cada transmissor envia uma cópia por espectador. Recomendado para grupos pequenos.
- STUN público pode falhar em NAT simétrico ou redes restritas; TURN futuro resolverá parte desses casos.
- Áudio do sistema depende do navegador e do sistema operacional.
- Não há autenticação, moderação, criptografia ponta a ponta adicional, persistência ou gravação. WebRTC cifra a mídia em trânsito.
