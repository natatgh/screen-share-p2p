# Code signing policy

**Status:** nenhuma assinatura de código Authenticode está configurada. As releases até `v0.2.2` são executáveis não assinados e podem ser bloqueadas pelo Smart App Control do Windows. A assinatura Ed25519 do manifesto de atualização verifica o download feito pelo Lumen, mas não autentica o executável perante o Windows.

O projeto não solicita que usuários desativem o Smart App Control nem instalem certificados locais para executar uma release. O mantenedor não se cadastrará em um serviço de assinatura neste momento. Caso a política mude, o fornecedor, o certificado e o fluxo de aprovação serão documentados antes de distribuir builds assinadas.

## Responsáveis e processo

- Mantenedor e aprovador das releases: [natatgh](https://github.com/natatgh).
- Código, builds e Action de releases: [natatgh/screen-share-p2p](https://github.com/natatgh/screen-share-p2p).

## Dados e distribuição

Consulte a [política de privacidade](../PRIVACY.md). O Lumen envia presença e sinalização ao Supabase e consulta releases no GitHub; a mídia segue por WebRTC entre participantes quando possível. Instaladores e ZIPs são distribuídos nas releases do GitHub. O instalador NSIS inclui desinstalador; o standalone pode ser removido apagando sua pasta depois de encerrar o aplicativo.
