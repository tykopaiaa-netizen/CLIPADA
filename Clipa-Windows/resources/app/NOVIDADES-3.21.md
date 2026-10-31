# Clipa Studio 3.21 — evolução preservando a estrutura

A base é a versão 3.20. As quatro entradas continuam sendo Horizontal, Vertical, Câmera + fundo e Canal Dark. Projetos anteriores continuam usando seu enquadramento original até que o editor escolha uma nova composição. A gravação, áudio, biblioteca, IA, publicação e exportação existentes foram mantidos.

## O que mudou

- Biblioteca interna com 15 composições: tela inteira, câmera em cima/embaixo, duas câmeras, lateral esquerda/direita, lado a lado, três colunas, trio, câmera flutuante/circular, fundo desfocado, cenário horizontal/vertical e composição livre. Filtros por categoria e até 24 modelos pessoais.
- O modelo define posições de partida. Cada região continua sendo selecionada no vídeo original. Alterar modelos preserva a mídia original, os recortes já marcados naquele modo, os cortes da montagem, áudio e legendas.
- Transformação no Resultado: mover, redimensionar, manter/liberar proporção, coordenadas, alinhamento central, encaixe às bordas, rotação, opacidade, arredondamento, borda, ordem, ocultação e bloqueio. Alt desativa o encaixe durante o arraste.
- Inverter posições e divisória arrastável entre câmera e conteúdo nos modelos de duas áreas. A divisória é um controle de edição e não aparece no MP4. Setas ajustam a divisão pelo teclado.
- Remoção de fundo acessível no painel de composição, com o seletor e retoques existentes. Câmeras ocultas não deixam o seletor vazio.
- Formatos adicionais 1:1, 4:5, 3:4, 4:3, 21:9 e 32:9, com dimensões reais informadas. Nas proporções personalizadas, o lado maior é limitado a 3840 px; portanto a escolha de qualidade pode resultar em uma dimensão menor do que o nome do preset sugere.
- Movimento de descer/subir/pausar configurável para cada região. Prévia e exportação usam o mesmo cálculo.
- Faixas das regiões do original: dividir, mover ou aparar seus intervalos de visibilidade, excluir uma seleção, ocultar e usar os controles de nome/cor já existentes. Elas continuam sincronizadas ao mesmo vídeo original.
- Blocos importados podem ser movidos para outra faixa do mesmo tipo ou para uma nova faixa. Sobreposições na mesma faixa são recusadas com uma explicação; em faixas distintas a sobreposição continua disponível.
- Refazer com Ctrl+Shift+Z e botão próprio. Renomear/colorir uma faixa também cria um ponto de desfazer.
- Larguras ajustáveis da biblioteca/propriedades e altura manual das faixas. Avisos ficam fora da imagem e deixam as alças de seleção acessíveis.

## Fluxo recomendado

1. Abra ou grave seu vídeo. Escolha uma das quatro categorias.
2. Clique em **Modelos** dentro do editor. Escolha a composição.
3. Em **Enquadrar**, selecione Câmera 1 e use **Marcar no original**. Desenhe o retângulo sobre a câmera. Faça o mesmo com Vídeo principal e, se houver, Câmera 2.
4. Arraste as alças no Resultado. **Encaixar** preserva a área inteira; **Preencher** recorta o excesso. Ambos preservam a proporção da imagem. Use imagem de fundo ou fundo desfocado para ocupar o espaço livre.
5. Na timeline, **S** divide no cursor. **Shift + arrastar** seleciona uma área. **Delete** exclui a seleção. **I/O** delimitam dois pontos; **Ctrl+Shift+X** mantém apenas esse trecho do vídeo principal. **Ctrl+Z** desfaz.
6. Use **+ Adicionar** para mídia. Selecione um bloco importado; **Faixa do bloco** permite mudá-lo de faixa. Copiar/colar e Repetir após continuam disponíveis para reaproveitar uma música sem criar novas linhas.
7. Salve um rascunho. Em **Finalizar**, confira tamanho em pixels, FPS, intervalo e avisos; então exporte. Uma região visível sem origem marcada gera uma mensagem específica.

## Verificação realizada

Ambiente: Linux com área de trabalho virtual, Electron 44.7.0, Playwright e FFmpeg. O aplicativo Windows foi empacotado com o runtime existente, sem trocar o executável de captura nem desativar as proteções do aplicativo.

- Modelos: inversão, seleção por ponteiro, divisória, desfazer/refazer, exclusão de trecho de câmera, preservação de legendas/cortes, favoritos e salvamento/reabertura real no IndexedDB.
- Layout em 1440×900, 1024×768 e viewport estreito de 390×844. Isto verifica o comportamento da interface; não certifica um aplicativo móvel instalado.
- 9 exportações dos novos modelos em 480p/720p/1080p, 30/60 fps: H.264 + AAC, dimensões e número de quadros conferidos. A comparação de quadros da prévia e do MP4 teve erro médio de 1,7 a 2,6 níveis por canal (escala 0–255), compatível com compressão e conversão de cor.
- 13 exportações de regressão: modos antigos horizontal, vertical com 0/1/2 câmeras, composição horizontal/vertical e Canal Dark horizontal/vertical; 240p, 720p, 1080p, 1440p e 4K; velocidades 0,5×, 1× e 2×. O caso de 4 segundos a 60 fps produziu 240 quadros distintos.
- Áudio copiado/repetido em seis blocos: nível RMS consistente, reabertura, divisão e exportação AAC.
- Remoção de fundo real no vídeo enviado: duas máscaras locais, refinamento, pincéis apagar/restaurar, desfazer, cancelamento e preservação da área externa à webcam selecionada.
- Testes nativos de permissões, origem das chamadas, bloqueio de navegação, autorização de tela de uso único, cancelamento, ordenação de blocos e exportação com áudio. Análise de silêncio, captura sintética e tratamento de credenciais em testes locais.
- Exemplos e guia produzidos na interface real desta versão. O guia tem narração sintética de voz padrão. O exemplo Canal Dark usa roteiro revisado manualmente e voz importada; não representa uma análise visual online executada.

Resultados detalhados e scripts estão no pacote de código. Testes não demonstram ausência absoluta de falhas.

## Limites e próximos passos

- Não houve execução em um PC Windows físico nesta sessão. Microfones, áudio de aplicativos, múltiplos monitores, drivers e codificação por GPU precisam de teste nesse ambiente. Comece com 10–20 segundos antes de uma gravação importante.
- A atualização não reconstrói quadros ausentes do original nem aumenta o detalhe real de uma câmera pequena. Exportar uma fonte de 22 fps em 60 fps repete quadros.
- Estes modelos recortam até duas câmeras e um conteúdo do mesmo original. Outros vídeos/imagens/sons continuam como mídia importada (limite existente de 128 blocos). Não foi implementado um mosaico arbitrário de muitas fontes nem sincronização automática entre gravações independentes.
- As faixas de regiões controlam quando cada região aparece. Aparar uma câmera não muda seu tempo de origem independentemente do conteúdo. A montagem principal continua definindo os trechos removidos do MP4.
- A altura individual das faixas é um ajuste da sessão; uma reconstrução da timeline pode restaurá-la. As larguras dos painéis ficam salvas no dispositivo.
- Remoção de fundo é uma estimativa: cabelo, cadeira e movimento podem precisar dos retoques. Não se promete recorte perfeito.
- APIs de publicação, análise visual, narração online e outras funções que já dependiam de credenciais continuam exigindo configuração e autorização. Não foram validadas com contas reais nesta entrega. Favoritos de composição guardam o desenho, não cópias dos arquivos.
- Keyframes avançados para todas as propriedades, multicâmera ilimitada, efeitos de terceiros e os demais itens amplos do documento são evolução futura. Esta entrega prioriza as composições e a edição existentes, sem substituir o editor.
