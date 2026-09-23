# Candidatura à SignPath Foundation

O programa gratuito é destinado a projetos open source aceitos pela SignPath Foundation. A candidatura do Lumen Desktop foi enviada em 23/09/2026 e o site confirmou o recebimento; a análise ainda está pendente. Cada solicitação de assinatura estará sujeita à aprovação da fundação; não há assinatura Authenticode configurada neste momento.

## Dados públicos do projeto

- Nome: Lumen Desktop.
- Repositório e código-fonte: https://github.com/natatgh/screen-share-p2p
- Licença: MIT, em `LICENSE`.
- Download já publicado: https://github.com/natatgh/screen-share-p2p/releases/tag/v0.2.1
- Versão em rascunho, ainda sem assinatura: `v0.2.2`.
- Página de downloads: https://github.com/natatgh/screen-share-p2p/blob/master/docs/downloads.md
- Política de assinatura: https://github.com/natatgh/screen-share-p2p/blob/master/docs/code-signing-policy.md
- Privacidade: https://github.com/natatgh/screen-share-p2p/blob/master/PRIVACY.md
- Mantenedor, autor, revisor e aprovador: https://github.com/natatgh
- Build: GitHub Actions, `.github/workflows/desktop.yml`, em runner Windows hospedado pelo GitHub.

## Descrição sugerida para a candidatura

> Lumen Desktop is a free and open-source Windows 11 application for joining temporary screen-sharing rooms as a viewer or broadcaster. It captures a selected window or monitor and sends video, and optional application audio for windows, to other participants over WebRTC peer-to-peer connections. The application uses Supabase Realtime for room presence and WebRTC signaling. The public GitHub repository contains the source code, build workflow, MIT license, privacy policy, code signing policy and published Windows release. We seek the free SignPath Foundation program to sign our Windows installer and executable so users can verify their origin.

## Passos que exigem a conta do mantenedor

1. Conferir que a conta GitHub usa autenticação multifator.
2. Candidatura enviada em https://signpath.org/apply.html usando os links acima. Configurar a conta SignPath com autenticação multifator quando solicitado.
3. Aguardar a análise da SignPath Foundation. A aprovação não é automática e pode depender da reputação verificável do projeto.
4. Após a aceitação, configurar o projeto, a integração com o GitHub e a política de aprovação no SignPath. Só então integrar os identificadores e o token de API ao workflow de release.
5. Aprovar manualmente cada pedido de assinatura e conferir a assinatura Authenticode dos artefatos antes de publicar a release.

Não envie senha, códigos de autenticação ou token de API em mensagens ou commits. O token de CI, quando disponibilizado, deve ficar em GitHub Actions Secrets.
