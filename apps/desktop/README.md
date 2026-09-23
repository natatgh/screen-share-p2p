# Lumen Desktop (Windows 11)

Aplicativo Electron para assistir e compartilhar nas salas do Lumen. Entrar numa sala não inicia captura: as pessoas e transmissões aparecem no painel central. O botão **Compartilhar tela** abre o seletor de fonte e qualidade. Vídeo é capturado da janela/monitor selecionado pelo Electron. O áudio de janela é capturado do processo do aplicativo e seus filhos por um auxiliar C++ que usa WASAPI Application Loopback. Um navegador ou aplicativo com várias janelas pode produzir áudio de todas elas; o seletor avisa sobre isso. Monitor transmite somente vídeo. Se o áudio falhar, a transmissão continua com vídeo.

## Desenvolver

1. Na raiz, crie `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` para entrar nas mesmas salas do deploy. Sem essas variáveis, `npm run dev` da raiz inicia o servidor local de signaling na porta 3001.
2. Execute `npm ci` na raiz e em `apps/desktop`.
3. No Windows com Visual Studio C++ e Windows SDK: `cmake -S apps/desktop/native -B apps/desktop/native/build -A x64` e `cmake --build apps/desktop/native/build --config Release`. Sem o auxiliar, o vídeo funciona, mas o app mostra que o áudio nativo está indisponível.
4. Em `apps/desktop`, execute `npm run dev`. Os controles de qualidade podem ser alterados durante a transmissão; para trocar a fonte ou ligar/desligar áudio, pare e reinicie.

O app suporta Windows 11 x64; as versões do Windows sem Process Loopback não têm áudio por aplicativo. A captura usa STUN e a mesma malha P2P do site: algumas redes exigirão TURN e cada espectador adiciona carga de upload/CPU.

## Releases e atualização

`apps/desktop/package.json` é a versão do desktop. Uma tag `vX.Y.Z` que corresponde a ela inicia a Action Windows: testes, build nativo, instalador NSIS por usuário, manifesto e assinatura Ed25519. O resultado é uma **release em rascunho**. Publique-a depois de testar manualmente vídeo, áudio, instalação e atualização em Windows 11. Só releases publicadas são consultadas pelo app.

O app baixa uma versão nova em segundo plano, verifica a assinatura do manifesto e o SHA-256 do instalador, e instala na próxima abertura. A chave pública fica no aplicativo; a chave privada deve ser guardada no secret `LUMEN_UPDATE_PRIVATE_KEY_B64` do GitHub em formato PEM codificado em Base64. Se a chave privada for perdida, usuários instalados precisarão reinstalar manualmente para confiar numa chave nova. O instalador não usa certificado Authenticode pago, então o SmartScreen pode exibir aviso.

O repositório usa as variáveis do GitHub Actions `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` na build do desktop. A chave Supabase é publishable e fica no binário. O site da Vercel continua com deploy independente.
