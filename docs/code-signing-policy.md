# Code signing policy

**Status:** candidatura à assinatura de código da SignPath Foundation em preparação. As releases até `v0.2.2` não têm assinatura Authenticode e podem ser bloqueadas pelo Smart App Control do Windows. Não trate a assinatura Ed25519 do manifesto de atualização como assinatura do executável.

Após a aprovação, a atribuição exigida pela SignPath será: **Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).** A emissão e a configuração do certificado dependem da SignPath; esta frase não indica que as releases atuais já estejam assinadas.

## Responsáveis e processo

- Autor, mantenedor e revisor de contribuições externas: [natatgh](https://github.com/natatgh).
- Aprovador das solicitações de assinatura e da publicação das releases: [natatgh](https://github.com/natatgh).
- O código-fonte, a build e a Action de releases são públicos em [natatgh/screen-share-p2p](https://github.com/natatgh/screen-share-p2p). As builds de release usam runners hospedados pelo GitHub e tags SemVer.
- Nenhuma release assinada será publicada antes de uma aprovação manual e da verificação do artefato recebido. As configurações de SignPath e o fluxo de assinatura serão adicionados após a aprovação da candidatura.

## Dados e distribuição

Consulte a [política de privacidade](../PRIVACY.md). O Lumen envia presença e sinalização ao Supabase e consulta releases no GitHub; a mídia segue por WebRTC entre participantes quando possível. Instaladores e ZIPs são distribuídos nas releases do GitHub. O instalador NSIS inclui desinstalador; o standalone pode ser removido apagando sua pasta depois de encerrar o aplicativo.
