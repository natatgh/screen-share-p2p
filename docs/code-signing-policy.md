# Code signing policy

**Status:** candidatura ao programa gratuito para projetos open source da SignPath Foundation em preparação. Nenhuma assinatura de código Authenticode está configurada. As releases até `v0.2.2` são executáveis não assinados e podem ser bloqueadas pelo Smart App Control do Windows. A assinatura Ed25519 do manifesto de atualização verifica o download feito pelo Lumen, mas não autentica o executável perante o Windows.

O projeto não solicita que usuários desativem o Smart App Control nem instalem certificados locais para executar uma release. A assinatura via SignPath depende da aceitação da candidatura e da configuração do projeto. Nenhum download será descrito como assinado antes de verificarmos sua assinatura Authenticode.

Se a candidatura for aprovada, o serviço gratuito será fornecido por [SignPath.io](https://signpath.io/), usando certificado da [SignPath Foundation](https://signpath.org/). A equipe só solicitará assinatura para binários produzidos a partir do repositório público em uma build verificável. Cada solicitação de assinatura será aprovada manualmente pelo mantenedor antes de publicar a release. A chave privada Authenticode permanecerá sob controle da SignPath Foundation; o projeto não terá acesso a ela.

## Responsáveis e processo

- Autor, revisor e aprovador das releases: [natatgh](https://github.com/natatgh).
- Código, builds e Action de releases: [natatgh/screen-share-p2p](https://github.com/natatgh/screen-share-p2p).
- A conta do mantenedor no GitHub e a futura conta no SignPath deverão usar autenticação multifator.

## Dados e distribuição

Consulte a [política de privacidade](../PRIVACY.md). O Lumen envia presença e sinalização ao Supabase e consulta releases no GitHub; a mídia segue por WebRTC entre participantes quando possível. Instaladores e ZIPs são distribuídos nas releases do GitHub. O instalador NSIS inclui desinstalador; o standalone pode ser removido apagando sua pasta depois de encerrar o aplicativo.
