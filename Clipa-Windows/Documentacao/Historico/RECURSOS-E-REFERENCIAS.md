# Clipa 3.12 — referências e decisões

Consulta às documentações públicas em 19/10/2026. As implementações são próprias;
não houve extração de código proprietário ou acesso a contas dos outros editores.

| Referência | Ideia útil | Situação no Clipa |
|---|---|---|
| VEGAS Pro: marcadores e regiões | Localizar pontos e trabalhar em intervalos nomeados |  bandeiras, intervalos, nomes e atalhos; permanecem no projeto. |
| VEGAS Pro: edição por eventos | Aparar, dividir e organizar material | Arraste de bordas/intervalos, divisão, lista ordenável e duplicação; múltiplas fontes ainda pendentes. |
| CapCut: reenquadramento | Adaptar uma fonte para diferentes proporções | Três modelos verticais, recortes independentes e rastreamento de rosto já existentes. |
| After Effects: interpolação e Easy Ease | Suavizar mudanças entre enquadramentos |  pontos de recorte normalizados, curva suave, linear ou mudança direta. |
| Editores de áudio: ducking | Manter a narração inteligível com o fundo presente |  envelope de redução/retorno baseado nos intervalos da narração. Não separa voz e música. |
| Fluxos de finalização | Evitar combinações de saída confusas |  presets e estimativa; H.264/AAC, CPU e motor nativo existentes. |
| Fluxos de revisão assistida | Reduzir o trabalho de corrigir texto |  propostas de revisão com antes/depois e aplicação explícita por frase. |
| Ferramentas de voz | Controlar interpretação e reutilizar voz autorizada |  seis interpretações e ID de voz personalizada aprovada. Importação de voz existente. |

## Evolução na 3.12

- Navegação de timeline inspirada em fluxos profissionais: zoom, quadro a quadro,
  repetição, encaixe, miniaturas, recorte por bordas e ações no botão direito.
- Entrada de áudio explícita, medidores, escolha de canal, perfis de tratamento
  e teste que libera o dispositivo ao terminar.
- Trabalho por blocos, uma tarefa pesada por vez, tempo decorrido e estimativa
  somente com progresso disponível. Preview leve sem reduzir a saída final.
- Biblioteca separada, modelos ilustrados e seleção visual da plataforma.

## Tecnologias presentes

- **Electron com isolamento de contexto e sandbox:** janela própria, chamadas
  nativas restritas, cofre do sistema para chaves e tokens.
- **WebCodecs + MediaBunny:** exportação quadro a quadro, timestamps constantes,
  áudio AAC e multiplexação MP4; FFmpeg em WebAssembly como alternativa por CPU.
- **Whisper local quantizado:** fala para legendas e sugestões de cortes. Tiny e
  Base incluídos; Small opcional. Qualidade depende do idioma e áudio; revisão é necessária.
- **Detecção/segmentação local:** rastreamento de rosto e recorte de câmera já
  disponíveis, com resultados dependentes da imagem e dos modelos.
- **Automação determinística:** os mesmos recortes e tempos são usados na prévia
  e no render; velocidade com preservação de tom e mixagem por amostras.
- **Respostas estruturadas de IA online:** roteiro e revisão recebem limites de
  tamanho/intervalo, validação de esquema, cancelamento e tratamento de erros.
- **APIs oficiais de publicação:** OAuth, envio em blocos, estado do processamento,
  preflight de metadados, agenda local e prevenção de repetição após envio incerto.

## Recursos avançados que ainda precisam de outro motor

Proxies, composição de várias fontes numa timeline, cache de render em disco,
motion blur vetorial, optical flow, super-resolução neural, separação de fontes
de áudio e alinhamento forçado de palavras ainda não estão implementados.
Não são anunciados como disponíveis nesta versão. Essas funções exigem modelos,
controle de memória, validação de qualidade e processamento adicionais.

## Documentação consultada

- [Premiere — navegação, quadros, zoom e encaixe](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/navigate-sequences-in-the-timeline.html)
- [VEGAS — gravação, escolha de entrada e medidores](https://help.magix-hub.com/video/vegas/en/content/topics/recording.htm)


- [VEGAS — marcadores e regiões](https://help.magix-hub.com/video/vegas/23/en/content/topics/7-edit/using_markersregionscommands.htm)
- [VEGAS — seleções e cursor](https://help.magix-hub.com/video/vegas/23/en/content/topics/7-edit/selectingevents.htm)
- [CapCut — reenquadramento automático](https://www.capcut.com/pt-br/tools/auto-reframe)
- [CapCut — ferramentas de voz](https://www.capcut.com/tools/voice-enhancer)
- [After Effects — interpolação](https://helpx.adobe.com/br/after-effects/desktop/animate-in-after-effects/animation-keyframes/keyframe-interpolation.html)
- [YouTube — metadados de vídeos](https://developers.google.com/youtube/v3/docs/videos)
- [YouTube — envio de thumbnail](https://developers.google.com/youtube/v3/docs/thumbnails/set)
- [TikTok — Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post/)
- [OpenAI — fala sintética](https://developers.openai.com/api/docs/guides/text-to-speech)
- [OpenAI — vozes personalizadas](https://developers.openai.com/api/docs/guides/custom-voices)

Os limites e a aprovação das plataformas podem mudar. A interface trata erros
do serviço e mostra a situação real do envio. Os testes de integração desta
entrega usaram respostas controladas, sem publicação em contas reais.
