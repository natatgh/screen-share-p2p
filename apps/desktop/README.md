# Lumen Desktop (Windows 11)

Aplicativo Electron para assistir e compartilhar nas salas do Lumen. Entrar numa sala não inicia captura: as pessoas e transmissões aparecem no painel central. O botão **Compartilhar tela** abre o seletor de fonte e qualidade. Vídeo é capturado da janela/monitor selecionado pelo Electron. O áudio de janela é capturado do processo do aplicativo e seus filhos por um auxiliar C++ que usa WASAPI Application Loopback. Um navegador ou aplicativo com várias janelas pode produzir áudio de todas elas; o seletor avisa sobre isso. Monitor transmite somente vídeo. Se o áudio falhar, a transmissão continua com vídeo.

## Desenvolver

1. Na raiz, crie `.env.local` com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` para entrar nas mesmas salas do deploy. Sem essas variáveis, `npm run dev` da raiz inicia o servidor local de signaling na porta 3001.
2. Execute `npm ci` na raiz e em `apps/desktop`.
3. No Windows com Visual Studio C++ e Windows SDK: `cmake -S apps/desktop/native -B apps/desktop/native/build -A x64` e `cmake --build apps/desktop/native/build --config Release`. Sem o auxiliar, o vídeo funciona, mas o app mostra que o áudio nativo está indisponível.
4. Em `apps/desktop`, execute `npm run dev`. Os controles de qualidade podem ser alterados durante a transmissão; para trocar a fonte ou ligar/desligar áudio, pare e reinicie.

O app suporta Windows 11 x64; as versões do Windows sem Process Loopback não têm áudio por aplicativo. A captura usa STUN e a mesma malha P2P do site: algumas redes exigirão TURN e cada espectador adiciona carga de upload/CPU.

A barra superior usa o conteúdo do app com os controles nativos do Windows sobrepostos pelo Electron. Arraste a faixa superior para mover a janela ou dê dois cliques para maximizar/restaurar.

## Identidade visual

O ícone do aplicativo fica em `assets/lumen-icon.png`. O arquivo `assets/lumen-icon.ico` contém os tamanhos usados pelo Windows no executável e no instalador. Depois de alterar o PNG, execute `powershell -File scripts/build-icon.ps1` em `apps/desktop` para atualizar o ICO antes de empacotar.

## Releases e atualização

`apps/desktop/package.json` é a versão do desktop. PRs que alteram o aplicativo precisam avançá-la e sincronizar `package-lock.json`; a Action verifica isso no PR e no push. Após o merge em `master`, a Action valida o site e o desktop, compila o auxiliar nativo, gera o instalador NSIS por usuário e o ZIP portátil, assina o manifesto Ed25519 e publica automaticamente a release `vX.Y.Z` se ela ainda não existir. Os arquivos são anexados enquanto a release está em rascunho e só depois ela é publicada, para o atualizador não encontrar uma release incompleta. Para usar o standalone, extraia o ZIP inteiro e execute `Lumen Desktop.exe` dentro da pasta `Lumen Desktop`; ele não precisa de instalação. Teste vídeo, áudio, instalação e atualização manualmente no Windows 11 após a publicação. Só releases publicadas são consultadas pelo app.

Na instalação NSIS, o app baixa uma versão nova em segundo plano, verifica a assinatura do manifesto e o SHA-256 do instalador, e instala na próxima abertura. No standalone, **Verificar** informa quando há uma versão publicada e o botão **Releases** abre o ZIP portátil para atualização manual; ele não tenta instalar o NSIS. A versão standalone 0.1.0 ainda usa o fluxo antigo: atualize-a manualmente para 0.2.1 ou superior antes de usar Verificar. A chave pública fica no aplicativo; a chave privada deve ser guardada no secret `LUMEN_UPDATE_PRIVATE_KEY_B64` do GitHub em formato PEM codificado em Base64. Se a chave privada for perdida, usuários instalados precisarão reinstalar manualmente para confiar numa chave nova.

**Bloqueio no Windows 11:** as releases atuais não têm assinatura de código Authenticode. O manifesto Ed25519 verifica a atualização baixada pelo Lumen, mas não autentica o executável perante o Windows. O SmartScreen pode avisar e o Smart App Control ativo pode bloquear a execução (evento Code Integrity 3077), inclusive de ZIPs extraídos sem marca de download. Não desligue o Smart App Control para instalar o Lumen: essa mudança nas Configurações do Windows pode não ser reversível sem redefinir o sistema. A candidatura ao programa gratuito da SignPath Foundation aguarda análise; enquanto o executável permanecer sem assinatura confiável, não há garantia de execução em sistemas com Smart App Control ativo.

Veja a [Code signing policy](../../docs/code-signing-policy.md), a [política de privacidade](../../PRIVACY.md) e a [licença MIT](../../LICENSE).

O repositório usa as variáveis do GitHub Actions `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` na build do desktop. A chave Supabase é publishable e fica no binário. O site da Vercel continua com deploy independente.
