# Clipa Desktop 3.15 — build desta revisão

O pacote Windows contém o runtime e os modelos locais. O ZIP de código contém
as fontes, sem duplicar os arquivos grandes vendor/models.

Dependências usadas para os bundles alterados nesta revisão:
- Node.js 24; Electron 44.7.0
- esbuild 0.25.10
- mediabunny e @mediabunny/aac-encoder 1.61.1
- @huggingface/transformers 3.7.2
- @mediapipe/tasks-vision 0.10.32

Instale em diretório de build separado, usando --ignore-scripts. Execute
CLIPA_BUILD_TARGETS=exporter,ai-worker,face-ai e NODE_PATH apontando para o
node_modules desse build: node scripts/build.cjs.
Mantenha vendor/ort, vendor/vision, vendor/ffmpeg, vendor/separation, modelos
e arquivos de licença que vêm no app. Não carregue scripts/WASM de CDN.
As demais dependências/bundles locais foram preservados da versão 3.14.

A interface usa CommonJS no processo principal e scripts locais no renderer.
Não há nodeIntegration no renderer; contextIsolation, sandbox e CSP permanecem.
A detecção de idioma chama explicitamente o token de idioma do Whisper;
Transformers.js 3.7.2 sem idioma informado assume inglês.
Os cortes usam edit-core315.js em prévia, exportação, áudio e SRT.
As exclusões não mudam a fonte: o relógio da timeline é o da gravação original.

Os testes portáveis estão em app/scripts. Os testes de integração desta revisão
estão em tests no ZIP de código. launch.cjs requer Electron/Playwright e um Xvfb
em Linux; ajuste os caminhos para seu ambiente. Não use --no-sandbox no app
Windows distribuído; essa flag pertence somente à VM de testes Linux.
