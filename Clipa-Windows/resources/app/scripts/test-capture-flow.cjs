'use strict';
const {_electron}=require('playwright');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');
const output=process.env.CLIPA_TEST_OUTPUT||path.join(os.tmpdir(),'clipa-capture-tests-'+Date.now());fs.mkdirSync(output,{recursive:true});
const executablePath=process.env.ELECTRON_PATH||require('electron');
let app,page;const errors=[];
async function fixture(options={}){
 await page.reload();await page.locator('#record').waitFor();
 await page.evaluate(options=>{
  const test=window.captureTest={mode:options.mode||'ok',calls:[],streams:[],contexts:[],intervals:[]};
  async function tone(frequency){const context=new AudioContext({sampleRate:48000});test.contexts.push(context);await context.resume();const osc=context.createOscillator(),gain=context.createGain(),dest=context.createMediaStreamDestination();osc.frequency.value=frequency;gain.gain.value=.15;osc.connect(gain);gain.connect(dest);osc.start();return dest.stream;}
  async function screen(){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');let frame=0;const paint=()=>{ctx.fillStyle='#20334a';ctx.fillRect(0,0,640,360);ctx.fillStyle='#87e2c4';ctx.fillRect(frame++%600,80,40,100);ctx.fillStyle='white';ctx.font='26px sans-serif';ctx.fillText('Gravação de teste · '+frame,40,260);};paint();test.intervals.push(setInterval(paint,16));const stream=canvas.captureStream(60);if(test.mode!=='missingSystem'){const audio=await tone(440);stream.addTrack(audio.getAudioTracks()[0]);}test.streams.push(stream);return stream;}
  test.resolveScreen=async()=>{const stream=await screen();test.lateStream=stream;test.resolveDeferred(stream);};
  navigator.mediaDevices.enumerateDevices=()=>options.enumerationHangs?new Promise(()=>{}):Promise.resolve([]);
  navigator.mediaDevices.getDisplayMedia=()=>{test.calls.push('display');return test.mode==='displayPending'?new Promise(resolve=>test.resolveDeferred=resolve):screen();};
  navigator.mediaDevices.getUserMedia=async()=>{test.calls.push('microphone');if(test.mode==='microphoneError')throw new DOMException('Dispositivo ocupado no teste.','NotReadableError');if(test.mode==='microphonePending')return new Promise(()=>{});const stream=await tone(1320);test.streams.push(stream);return stream;};
 },options);
}
async function choose(){await page.locator('#record').click();await page.locator('.desktopSource').first().click();}
async function recording(){await page.waitForFunction(()=>recorder?.state==='recording'&&!capturePending,{},{timeout:15000});}
(async()=>{
 app=await _electron.launch({executablePath,args:[...JSON.parse(process.env.CLIPA_TEST_ELECTRON_ARGS||'[]'),'--user-data-dir='+path.join(output,'profile'),path.resolve(__dirname,'..')],timeout:20000});
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await app.evaluate(({desktopCapturer,nativeImage})=>{desktopCapturer.getSources=async()=>[{id:'screen:test',name:'Tela de teste',thumbnail:nativeImage.createEmpty()}];});
 // Device inventory must not block the picker. A screen click must start, with both audio sources.
 await fixture({enumerationHangs:true});await choose();await recording();
 assert.deepEqual(await page.evaluate(()=>captureTest.calls),['display','microphone']);
 assert.equal(await page.locator('.desktopPicker').count(),0,'No second hidden Start button');
 await page.waitForFunction(()=>$('captureSystemMeter').value>0&&$('captureMicMeter').value>0);
 await page.waitForFunction(()=>chunks.length>=3,{},{timeout:10000});
 await page.locator('#stop').click();await page.waitForFunction(()=>!!lastSaved?.blob?.size);await page.locator('#modelPicker[open]').waitFor();
 const bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await lastSaved.blob.arrayBuffer())));fs.writeFileSync(path.join(output,'mixed-audio.webm'),Buffer.from(bytes));
 console.log('PASS one click starts real MediaRecorder, display before microphone, stalled enumeration ignored, both meters active, stop opens editor; '+bytes.length+' bytes');
 // Cancellation remains active while the browser request is pending; late streams are stopped.
 await fixture({mode:'displayPending'});await choose();await page.waitForFunction(()=>captureTest.calls.includes('display'));
 await page.locator('#captureSetupCancel').click();await page.waitForFunction(()=>!capturePending);
 await page.evaluate(()=>captureTest.resolveScreen());await page.waitForFunction(()=>captureTest.lateStream.getTracks().every(t=>t.readyState==='ended'));
 assert.equal(await page.locator('#record').isEnabled(),true);console.log('PASS cancel pending capture; late video and audio tracks released; record button restored');
 // A device failure names the failed stage, cleans the partial stream, and can retry in the same picker.
 await fixture({mode:'microphoneError'});await choose();await page.locator('#captureSetupStatus.captureError').waitFor();
 assert.match(await page.locator('#captureSetupStatus').textContent(),/Microfone.*NotReadableError/s);
 assert(await page.evaluate(()=>captureTest.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 await page.evaluate(()=>captureTest.mode='ok');await page.getByRole('button',{name:'Tentar iniciar novamente'}).click();await recording();
 await page.waitForFunction(()=>chunks.length>=1);await page.locator('#stop').click();await page.waitForFunction(()=>!!lastSaved?.blob?.size);await page.locator('#modelPicker[open]').waitFor();console.log('PASS microphone failure explains cause; partial screen stopped; retry succeeds without reopening');
 // Requested system sound cannot silently disappear.
 await fixture({mode:'missingSystem'});await choose();await page.locator('#captureSetupStatus.captureError').waitFor();
 assert.match(await page.locator('#captureSetupStatus').textContent(),/Áudio do computador/);assert.equal(await page.locator('#captureSetupCancel').isEnabled(),true);await page.locator('#captureSetupCancel').click();console.log('PASS missing system audio is reported, not silently discarded');
 // Real 15-second microphone timeout must return control, not leave an eternal spinner.
 await fixture({mode:'microphonePending'});await choose();await page.locator('#captureSetupStatus.captureError').waitFor({timeout:19000});
 assert.match(await page.locator('#captureSetupStatus').textContent(),/TimeoutError.*15 segundos/s);
 assert(await page.evaluate(()=>captureTest.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 await page.screenshot({path:path.join(output,'capture-device-error.png')});await page.locator('#captureSetupCancel').click();console.log('PASS microphone timeout at 15 seconds releases the screen and keeps cancellation available');
 assert.deepEqual(errors,[]);console.log('PASS no unhandled renderer errors');
})().catch(async e=>{console.error(e);if(page){console.log(await page.locator('#captureSetupStatus').textContent({timeout:1000}).catch(()=>''));console.log(await page.locator('#status').textContent());await page.screenshot({path:path.join(output,'capture-flow-error.png')}).catch(()=>{});}process.exitCode=1;}).finally(async()=>{if(app)await app.evaluate(({app})=>app.exit()).catch(()=>{});});
