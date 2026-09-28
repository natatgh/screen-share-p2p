# Roadmap

O transmissor Windows em Electron usa áudio por processo. Próximos passos: validar captura em jogos e navegadores reais, reduzir cópias de áudio entre processos, observar CPU/FPS/latência e avaliar outras plataformas. Releases desktop são versionadas no GitHub com instalador e manifesto assinado; o site segue deploy independente.

## Qualidade de transmissão

O painel de diagnóstico agora separa FPS de captura, codificação e exibição, tempo médio de codificação/decodificação, codec e motivo de limitação informado pelo WebRTC. Os dados são locais ao navegador; não são gravados no Supabase. Campos ausentes aparecem como `—`, pois o suporte varia entre navegadores.

A qualidade automática começa ligada e age por espectador. Após três amostras consecutivas (cerca de seis segundos) de pressão de CPU/banda, perda alta ou FPS codificado baixo com captura saudável, reduz a saída para até 720p/30 FPS; se persistir, 720p/15 FPS. Recupera um degrau após cerca de 30 segundos estáveis. A resolução e o FPS escolhidos manualmente continuam sendo o teto, e o usuário pode desligar a adaptação no diagnóstico. Pressão de CPU explícita também reduz a captura de origem para aliviar todos os codificadores. Problemas de rede reduzem somente a saída para o espectador afetado; a configuração manual continua sendo o teto. Um orçamento de upload opcional distribui a banda entre os espectadores.

Para validar 1080p/30 FPS no Windows 11, repetir uma cena com movimento por pelo menos dois minutos com 1, 2 e 3 espectadores. Registrar captura, codificação, exibição, tempo por quadro, `qualityLimitationReason`, RTT, perdas e congelamentos. Se a captura cair, investigar a fonte/CPU/GPU; se somente a codificação cair, testar aceleração e codecs disponíveis no equipamento; se a exibição cair, investigar o decodificador do espectador. A medição anterior em uma sala real favoreceu 720p/30 FPS; ainda não há evidência de 1080p estável em todos os equipamentos.

Uma SFU própria só deve entrar se os testes mostrarem que o upload e a codificação por espectador são o limite predominante. Isso exigirá servidor/PC disponível e avaliação da rede, além do custo operacional que o MVP gratuito evita.

1. **Confiabilidade:** testes entre navegadores/redes, telemetria de estados ICE sem registrar SDP ou mídia, reconexão de tracks após falha.
2. **Segurança de salas:** convite assinado, expiração, limite de participantes, canais privados e controle de acesso no signaling.
3. **TURN no PC do usuário:** coturn com credenciais efêmeras, DNS/TLS, instruções de rede após autorização expressa. Medir custo de upload e disponibilidade.
4. **Escala:** migrar mídia para SFU própria quando a malha não atender grupos maiores, mantendo a interface e o protocolo de sala.
5. **Experiência:** seleção de qualidade, indicação de áudio, modo tela cheia, chat opcional e acessibilidade ampliada.

## Desktop 0.3.0

Recuperação ICE, fila de sinalização com ACK, orçamento de upload opcional, redução global por CPU, diagnóstico exportável e buffer circular de áudio implementados. Codec automático continua padrão. Ver [protocolo de validação](performance.md) antes de afirmar ganho de desempenho em captura real.
