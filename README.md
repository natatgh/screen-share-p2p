# Lumen — compartilhamento de tela P2P

MVP de salas temporárias para compartilhar tela, janela ou monitor pelo navegador. Qualquer participante pode transmitir; os demais podem assistir. Sem conta, sem gravação, sem LiveKit ou coturn.

## Rodar localmente

Requisitos: Node.js 20.9+ e npm.

```bash
npm install
npm run dev
```

Abra http://localhost:3000, crie uma sala e abra o link em outra aba ou navegador. `npm run dev` inicia o site na porta 3000 e o servidor de signaling na 3001. A captura de tela exige contexto seguro: localhost funciona; para acessar por outro dispositivo use HTTPS.

Na sala, escolha a qualidade antes ou durante o compartilhamento: **Alta** preserva a resolução capturada, **Equilibrada** limita a até 1080p e **Economia** limita a até 720p. O limite de envio é aplicado por espectador; a qualidade efetiva depende da rede, do navegador e da resolução da tela de origem.

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

## Limitações do MVP

- WebRTC em malha: cada transmissor envia uma cópia por espectador. Recomendado para grupos pequenos.
- STUN público pode falhar em NAT simétrico ou redes restritas; TURN futuro resolverá parte desses casos.
- Áudio do sistema depende do navegador e do sistema operacional.
- Não há autenticação, moderação, criptografia ponta a ponta adicional, persistência ou gravação. WebRTC cifra a mídia em trânsito.
