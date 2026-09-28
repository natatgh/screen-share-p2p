# Lumen — compartilhamento de tela P2P

MVP de salas temporárias para compartilhar tela, janela ou monitor pelo navegador. Qualquer participante pode transmitir; os demais podem assistir. Sem conta, sem gravação, sem LiveKit ou coturn.

O **Lumen Desktop para Windows 11** fica em `apps/desktop`. Ele entra nas mesmas salas para assistir ou transmitir, sem iniciar captura ao entrar. A transmissão pode incluir vídeo de uma janela ou monitor áudio do processo do aplicativo para janelas e áudio do sistema para monitores (excluindo o Lumen). Espectadores também podem usar a página web. Veja [as instruções do desktop](apps/desktop/README.md).

Em cada sala, o painel **Diagnóstico** acompanha a sinalização e, durante uma transmissão P2P, mostra banda de envio/recebimento, RTT, jitter, perda de pacotes, FPS e indicadores de congelamento. As métricas são locais e não ficam gravadas.

## Rodar localmente

Requisitos: Node.js 20.9+ e npm.

```bash
npm install
npm run dev
```

Abra http://localhost:3000, crie uma sala e abra o link em outra aba ou navegador. `npm run dev` inicia o site na porta 3000 e o servidor de signaling na 3001. A captura de tela exige contexto seguro: localhost funciona; para acessar por outro dispositivo use HTTPS.

Na sala, abra **Qualidade** para escolher a preferência de codificação (Equilibrado, Vídeo mais fluido ou Texto mais nítido), a resolução (720p, 1080p ou Original) e os quadros por segundo (15, 30 ou 60). O padrão é Equilibrado, 1080p e 30 FPS. É possível mudar os ajustes durante a transmissão; o app tenta atualizar a captura e os envios ativos. O navegador pode limitar a qualidade efetiva. Cada espectador consome upload adicional, especialmente em 60 FPS.

No site, o seletor do navegador pode compartilhar áudio da aba ou do sistema ao escolher um monitor. Habilite a opção de som no seletor; o suporte depende do navegador/Windows. Para janela com áudio isolado do aplicativo, use o Desktop: no navegador, janelas continuam sem áudio para evitar capturar o sistema por engano. No Desktop, o áudio da janela corresponde à árvore do processo e pode incluir outras janelas/abas do mesmo aplicativo; não há isolamento garantido por janela.

## Deploy gratuito

1. Crie um projeto no plano gratuito do Supabase e copie a URL e a chave **publishable** no painel Connect.
2. Importe este repositório pessoal na Vercel Hobby.
3. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` como variáveis de ambiente na Vercel. Não use chave secret/service role.
4. Faça deploy. O build é o padrão Next.js; o servidor local da porta 3001 não é usado no deploy.

O projeto Vercel `screen-share-p2p` está conectado ao repositório `natatgh/screen-share-p2p`, com `master` como branch de produção. Cada merge nessa branch inicia o deploy web pela integração Git da Vercel. O fluxo do Desktop é independente: quando a versão em `apps/desktop/package.json` avança, a Action Windows publica uma nova release após as verificações.

Os canais Realtime são públicos e o código é a única barreira de entrada. O MVP é adequado para compartilhamento casual com pessoas de confiança, não para conteúdo confidencial. O Supabase gratuito pode pausar projetos inativos e tem cotas; veja [Arquitetura](docs/architecture.md).

## Scripts

- `npm run dev`: interface + signaling local
- `npm run dev:web`: interface apenas, para uso com Supabase configurado
- `npm run dev:signal`: signaling local apenas
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`: verificações
- `npm run test:e2e`: vídeo sintético P2P com três espectadores, renegociação e parada
- `npm run test:realtime`: verifica Presence e Broadcast no projeto Supabase configurado em `.env.local`

## Documentação

- [Desempenho, diagnóstico e comparação de codecs](docs/performance.md)
- [Arquitetura e limites](docs/architecture.md)
- [Decisões técnicas](docs/decisions.md)
- [Roadmap](docs/roadmap.md)
- [Code signing policy](docs/code-signing-policy.md)
- [Candidatura à SignPath Foundation](docs/signpath-application.md)
- [Downloads do Desktop](docs/downloads.md)
- [Privacidade](PRIVACY.md)
- [Licença MIT](LICENSE)

## Assinatura do aplicativo Windows

O Lumen enviou uma candidatura ao programa gratuito para projetos open source da SignPath Foundation e aguarda análise. As builds atuais ainda não têm assinatura Authenticode. Veja a [Code signing policy](docs/code-signing-policy.md) e os [downloads](docs/downloads.md). Após a aprovação e a primeira build assinada, o crédito exigido pelo programa será: **Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/)**.

## Limitações do MVP

- WebRTC em malha: cada transmissor envia uma cópia por espectador. Recomendado para grupos pequenos.
- STUN público pode falhar em NAT simétrico ou redes restritas; TURN futuro resolverá parte desses casos.
- Áudio do sistema depende do navegador e do sistema operacional.
- Não há autenticação, moderação, criptografia ponta a ponta adicional, persistência ou gravação. WebRTC cifra a mídia em trânsito.
