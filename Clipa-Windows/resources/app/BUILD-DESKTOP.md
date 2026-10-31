# Clipa Desktop 3.9

Portable Electron 44.7.0 Windows x64. The renderer and native bridge live in this directory. No node_modules, app registration credentials, OAuth tokens, test profiles, recordings or private photos belong in the distribution.

Run locally with an Electron 44.7.0 runtime: electron .

Validation scripts:
- node scripts/test-native.cjs — controlled Windows Electron IPC/permission contract.
- node scripts/test-analysis.cjs — bounded analysis and caption/cut helpers.
- node scripts/test-tracking.cjs — deterministic paths, lost faces, seeking and invalid state.
- node scripts/test-publisher.cjs — mocked official API responses and real local persistence/OAuth callbacks. Does not publish real posts or bill an image API.
- scripts/test-capture-flow.cjs — Playwright + Electron with controlled streams and a real MediaRecorder. Set ELECTRON_PATH and CLIPA_TEST_OUTPUT.

New files: publisher.cjs, renderer/tracking-core.js, face-follow.js, publishing.js, thumb-ai.js, studio-next.css. Project library remains IndexedDB v1; new fields are optional for old records. Native completed media and publishing state live under userData/creator-library. Secrets use Electron safeStorage; no plaintext fallback. Upload session capability URLs are not persisted as clear text.

On Windows, test physical desktopCapturer, system loopback, microphone, WebGL face detection, DPAPI credentials, OAuth browser callbacks and real provider accounts before production distribution. The shipped package has not been signed or physically tested on Windows in this environment. Read the root validation and integration notes.


## 3.10 — narração e velocidade

- `narrator.cjs`: chamadas Responses/Audio no processo principal, chave obtida do cofre interno, consentimento, validação, timeout e cancelamento. A chave não integra o preload nem projetos.
- `renderer/dark-studio.js`: análise por quadros, cenas editáveis, cache de voz, montagem e faixa de narração independente; `source-guard.js` valida imports antes de alterar a edição.
- `renderer/src/audio-timeline.js`: PCM estéreo 48 kHz, recorte por janela, mistura, atempo para preservar tom, fades e montagem da voz. Worker FFmpeg já incluído.
- Para reconstruir apenas o exportador: instalar esbuild 0.25.10, mediabunny 1.61.1 e @mediabunny/aac-encoder 1.61.1 fora do pacote, definir NODE_PATH e executar `CLIPA_BUILD_TARGETS=exporter node renderer/scripts/build.cjs`. O runtime entregue não exige essas dependências instaladas pelo usuário.
- `scripts/test-narrator.cjs` usa respostas controladas; não faz chamadas pagas. Os testes de execução de mídia usaram Electron Linux em tela virtual. Ver VALIDACAO-DESKTOP.txt.
