# Privacidade do Lumen

O Lumen não cria contas nem grava tela ou áudio. Os controles de diagnóstico usam estatísticas WebRTC locais; o aplicativo não as envia para um servidor de telemetria.

Ao entrar em uma sala, o aplicativo envia o código da sala, um identificador aleatório temporário e a hora de entrada ao Supabase Realtime para sinalização e presença. Mensagens SDP/ICE passam pelo mesmo serviço para estabelecer as conexões. Depois da conexão, vídeo e áudio seguem entre participantes por WebRTC quando a rede permite. Outros participantes recebem as informações de conexão necessárias à sessão.

O Desktop consulta a API pública do GitHub para verificar releases e, quando há atualização, baixa arquivos do GitHub. O site é servido pela Vercel. Esses provedores podem processar dados de conexão, como endereço IP e registros operacionais, segundo suas próprias políticas: [Supabase](https://supabase.com/privacy), [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) e [Vercel](https://vercel.com/legal/privacy-policy).

O Lumen não adiciona rastreamento, publicidade ou persistência de salas. Use códigos de sala apenas com pessoas de confiança; quem possui o código pode entrar na sala atual.
