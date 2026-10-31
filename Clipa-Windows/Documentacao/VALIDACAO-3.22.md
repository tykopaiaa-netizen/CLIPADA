# Clipa Studio 3.22 — cortes em coleção

A estrutura da 3.21 foi preservada. A mudança acrescenta uma área de geração e revisão de cortes após gravar/importar, além de um acesso dentro do editor. Os quatro modos e os quinze modelos continuam disponíveis. O motor de gravação foi mantido.

## Fluxo entregue

1. Definir intervalo, duração aproximada, quantidade, prioridade e contexto.
2. Transcrever a fonte em blocos de 24 segundos, com progresso, cancelamento e retomada. Base e Tiny estão incluídos; Small continua opcional por download.
3. Comparar semanticamente as falas com temas como humor, surpresa, histórias e dicas. O modelo multilíngue MiniLM quantizado está incluído no pacote. A alternativa contextual online é opcional, usa a chave do usuário e exige consentimento para enviar o texto.
4. Rever cards, renomear, selecionar, filtrar, excluir e desfazer. Cada card tem seu próprio estado de edição, legendas, fundo e capa.
5. Aplicar ajustes escolhidos a outros cards: layout, enquadramento, aparência das legendas, cor, efeitos, fundo, mídias e master. Tempos da fonte, falas, narração e cortes internos do destino são preservados. Efeitos e mídias transferidos usam posições relativas ao início do corte; sons não são esticados além da duração do arquivo.
6. Opcionalmente, usar o modelo de rostos para conferir três instantes da região de câmera em cada destino. A transferência de propriedades é determinística; a adaptação facial usa IA. Não há uma promessa de que uma IA generativa compreenda qualquer decisão de montagem.
7. Gerar capa local ou usar a geração online já existente, com contexto do card. As capas ficam vinculadas aos respectivos cortes.
8. Exportar os cards selecionados, um por vez. Um corte abre Salvar como; vários criam uma pasta nova com nome escolhido e arquivos numerados com os títulos dos cards. Colisões de pasta recebem sufixo. Capas são convertidas a JPEG e salvas ao lado do MP4.

## Verificações executadas

Ambiente: Linux com tela virtual, Electron 44.7.0, Playwright e FFmpeg nativo. Testes UI usam perfis e pastas isolados.

| Verificação | Evidência |
| --- | --- |
| Vídeo real completo de 64,551 s | Whisper Base percorreu 3 blocos, gerou 23 legendas e a análise semântica local produziu 4 cards. Nenhum bloco falhou ou ficou com som sem texto nesse teste. |
| Modelo semântico real | Um texto de tutorial teve maior semelhança com dicas; um relato humorístico teve maior semelhança com humor. Isso valida inferência e integração, não acurácia geral. |
| Edições independentes | Alterar o primeiro card não mudou o segundo. Aplicar a edição copiou o formato/estilo e manteve as falas do destino. |
| Continuidade | Salvar/reabrir via IndexedDB recuperou os cards. Cortes antigos da fonte permaneceram no projeto base. |
| Exportação seletiva | Dois MP4 verticais de 480 × 854 e outro lote com dois MP4 de 1080 × 1920; 30 fps, 12 quadros cada, com AAC. Um terceiro item não selecionado permaneceu aguardando na fila. |
| Validação antes de gravar | Área de vídeo ausente bloqueou o lote antes de reservar destinos. Cancelar o seletor não criou trabalhos. |
| Cancelamento | A análise interrompida liberou a interface, manteve o registro de retomada e permitiu criar um corte manual em seguida. |
| Capas | Capa local gerada e associada ao card; não vazou para o próximo corte. Um lote real salvou a capa JPEG ao lado do MP4 correto. Validação nativa rejeitou destino desconhecido e JPEG inválido. |
| Adaptação facial real | O modelo reconheceu e reajustou uma câmera no vídeo fornecido. |
| Responsividade | Inspeção e teste em 1440 × 900, 1024 × 768 e 390 × 844. Na largura estreita, os ajustes podem ser recolhidos e os cards permanecem acessíveis com ações de exportação fixas. Não equivale a testar um dispositivo móvel. |
| Regressão da 3.21 | Inversão, desfazer/refazer, transformação no preview, faixas de câmera, troca de modelo e reabertura continuaram passando. |
| Regressão de exportação | Cancelar uma exportação na fila limpou os recursos nativos; tentar novamente gerou o arquivo. O teste nativo de 60 fps mediu 193 quadros distintos em 193 quadros. |
| Núcleo e segurança | Geometria, limites, montagem, capacidades nativas, cancelamento, nomes de arquivo/pasta e contratos da API passaram. Respostas online foram simuladas sem gastar créditos nem enviar o vídeo. |

Os logs e JSONs estão no pacote de código. Os testes de fluxo usam uma transcrição de controle para separar problemas de interface da variação da IA; o teste `ai-board322` usa o áudio real completo e os dois modelos locais reais.

## Limites e pontos que precisam de revisão humana

- Não houve execução do `.exe` em hardware Windows real nesta sessão. Captura GDI, microfone físico, áudio do sistema, DPI e drivers continuam dependendo de teste no computador de destino.
- A análise principal interpreta texto transcrito. Humor visual, ironia, contexto fora da fala e erros de reconhecimento podem mudar os resultados. Ela não prevê viralização ou resultados de monetização.
- Os testes de modelo não constituem uma avaliação estatística de precisão. Tiny perdeu o texto de um bloco nesse vídeo; por isso Base é o padrão detalhado, e blocos com som sem fala reconhecida são sinalizados.
- Até 60 sugestões por análise/exportação, 120 cards por coleção e 64 trabalhos na fila. Cortes sugeridos de 5 a 600 segundos. O original longo é processado em blocos; uma execução de horas não foi feita nesta entrega.
- Reaplicação de estilo preserva a semântica temporal de cada destino, mas deve ser conferida. Enquadramentos variam se a câmera muda de posição. A análise facial procura dentro da região selecionada, e não recompõe automaticamente qualquer mudança de cena.
- IA de contexto e geração de capas online exigem credenciais, internet e consentimento; não foram chamadas com uma conta paga. A montagem de capa e as duas etapas locais foram testadas.
- O armazenamento da coleção depende de espaço disponível. Preserve os arquivos originais e use Salvar coleção antes de encerrar o aplicativo.

## Referências de produto e tecnologia

A implementação usa os modelos e os recursos do próprio Clipa. A consulta pública inspirou revisão por cards, edição de cada sugestão e reutilização de ajustes; não houve cópia de código de produtos fechados.

- Riverside, [Magic Clips](https://support.riverside.com/hc/en-us/articles/12124048765981-About-Magic-Clips) e [preferências de geração](https://support.riverside.com/hc/en-us/articles/23649885908381-Set-default-preferences-for-Magic-Clips).
- OpusClip, [aplicação de layouts](https://help.opus.pro/docs/article/apply-the-layouts).
- Klap, [fluxo de geração de shorts](https://docs.klap.app/usecases/generate-shorts).
- [MiniLM multilíngue original](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) e [conversão ONNX de Xenova](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2). Licença Apache 2.0 incluída e atribuição preservada.

Consulta: 28 de outubro de 2026.
