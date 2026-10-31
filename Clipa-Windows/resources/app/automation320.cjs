'use strict';
// Independent implementation inspired by reviewed silence / transcription workflows.
// Every media input is a capability issued by the native media service.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const bounded=(v,a,b)=>{if(!Number.isFinite(v)||v<a||v>b)throw Error('Parâmetro de análise inválido.');return v;};
function wav(audio){const b=Buffer.alloc(44+audio.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(audio.length*2,40);for(let i=0;i<audio.length;i++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,Number.isFinite(audio[i])?audio[i]:0))*32767),44+i*2);return b;}
function makeAutomation({directory,ffmpeg,asset,safeStorage,fetcher=globalThis.fetch}){
 const jobs=new Map();let controller=null;
 const keyFile=path.join(directory,'groq-key.bin');
 async function key(){try{if(!safeStorage.isEncryptionAvailable())return '';return safeStorage.decryptString(await fs.readFile(keyFile));}catch{return '';}}
 function cancel(id){const j=jobs.get(id);if(j?.running){j.cancelled=true;j.child.kill('SIGKILL');}}
 async function call(d){
  if(d.action==='groq-status')return {configured:!!await key()};
  if(d.action==='groq-key'){if(controller)throw Error('Interrompa a transcrição antes de trocar a chave.');if(d.value===''){await fs.rm(keyFile,{force:true});return {configured:false};}if(typeof d.value!=='string'||!/^gsk_[A-Za-z0-9_-]{20,200}$/.test(d.value))throw Error('Chave Groq inválida.');if(!safeStorage?.isEncryptionAvailable())throw Error('O armazenamento criptografado do sistema está indisponível. A chave não foi salva.');await fs.mkdir(directory,{recursive:true});await fs.writeFile(keyFile,safeStorage.encryptString(d.value),{mode:0o600});return {configured:true};}
  if(d.action==='groq-cancel'){controller?.abort();return true;}
  if(d.action==='groq-transcribe'){
   if(controller)throw Error('Já existe um bloco sendo transcrito.');if(d.consent!==true)throw Error('Confirme o envio do áudio para Groq.');const secret=await key();if(!secret)throw Error('Configure sua chave Groq ou selecione IA local.');
   if(!(d.audio instanceof Float32Array)||d.audio.length<160||d.audio.length>16000*32)throw Error('Envie um bloco de áudio mono de até 32 segundos a 16 kHz.');
   if(!['whisper-large-v3','whisper-large-v3-turbo'].includes(d.model))throw Error('Modelo Groq inválido.');if(d.language!=='auto'&&!/^[a-z]{2}$/.test(d.language||''))throw Error('Escolha um idioma ISO de duas letras ou automático.');
   const form=new FormData();form.append('file',new Blob([wav(d.audio)],{type:'audio/wav'}),'clipa-bloco.wav');form.append('model',d.model);form.append('response_format','verbose_json');form.append('timestamp_granularities[]','word');form.append('timestamp_granularities[]','segment');form.append('temperature','0');if(d.language!=='auto')form.append('language',d.language);if(d.prompt)form.append('prompt',String(d.prompt).slice(0,800));
   controller=new AbortController();const current=controller,timer=setTimeout(()=>current.abort(),180000);
   try{const r=await fetcher('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+secret},body:form,signal:current.signal,redirect:'error'});if(!r.ok)throw Error(r.status===401?'Chave Groq recusada. Confira sua chave.':r.status===429?'Limite da conta Groq atingido. Os blocos prontos foram mantidos; tente mais tarde.':'Groq indisponível (HTTP '+r.status+'). Tente novamente ou use IA local.');const a=await r.json();const duration=d.audio.length/16000;const segments=Array.isArray(a.segments)?a.segments:[],words=Array.isArray(a.words)?a.words:segments.flatMap(s=>s.words||[]);const chunks=(words.length?words:segments).filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start&&w.start<duration).filter(w=>!segments.some(s=>s.no_speech_prob>.85&&s.avg_logprob<-1&&w.start>=s.start&&w.end<=s.end)).map(w=>({text:String(w.word??w.text??'').slice(0,2000),timestamp:[Math.max(0,w.start),Math.min(duration,w.end)]}));return {language:({portuguese:'pt',english:'en',spanish:'es',japanese:'ja',french:'fr',german:'de',italian:'it',korean:'ko',chinese:'zh'})[a.language]||(/^[a-z]{2}$/.test(a.language||'')?a.language:d.language),result:{text:chunks.map(w=>w.text).join(' '),chunks}};}catch(e){if(current.signal.aborted)throw Error('Transcrição interrompida ou sem resposta por 3 minutos. Retome dos blocos pendentes.');throw e;}finally{clearTimeout(timer);if(controller===current)controller=null;}
  }
  if(d.action==='silence-begin'){
   if([...jobs.values()].some(j=>j.running))throw Error('Aguarde a análise em andamento.');for(const [id,j]of jobs)if(!j.running)jobs.delete(id);
   const source=asset(d.asset),start=bounded(d.start,0,604800),end=bounded(d.end,start+.05,604800),threshold=bounded(d.threshold,-80,-10),minimum=bounded(d.minimum,.15,10),padding=bounded(d.padding,0,2),id=crypto.randomUUID();
   const j={id,running:true,cancelled:false,ranges:[],progress:0,error:null,pending:null,buffer:'',stderr:''};jobs.set(id,j);
   const child=spawn(ffmpeg,['-hide_banner','-nostdin','-loglevel','info','-ss',String(start),'-i',source.file,'-t',String(end-start),'-vn','-sn','-dn','-af',`silencedetect=noise=${threshold}dB:d=${minimum}`,'-progress','pipe:1','-f','null','-'],{windowsHide:true,stdio:['ignore','pipe','pipe']});j.child=child;
   function finishRange(t){if(j.pending===null)return;const a=Math.max(start,j.pending+start+padding),b=Math.min(end,t+start-padding);if(b>a+.02){if(j.ranges.length>=20000){j.error='Mais de 20.000 pausas. Analise em trechos menores.';child.kill();}else j.ranges.push({start:a,end:b,selected:true});}j.pending=null;}
   child.stderr.on('data',b=>{j.stderr=(j.stderr+b).slice(-4000);j.buffer+=b.toString();let n;while((n=j.buffer.indexOf('\n'))>=0){const line=j.buffer.slice(0,n);j.buffer=j.buffer.slice(n+1);const a=/silence_start:\s*([\d.-]+)/.exec(line),z=/silence_end:\s*([\d.-]+)/.exec(line);if(a)j.pending=+a[1];if(z)finishRange(+z[1]);}});
   let progressBuffer='';child.stdout.on('data',b=>{progressBuffer+=b;let n;while((n=progressBuffer.indexOf('\n'))>=0){const line=progressBuffer.slice(0,n);progressBuffer=progressBuffer.slice(n+1);if(line.startsWith('out_time_us='))j.progress=Math.min(99,Math.max(0,Number(line.slice(12))/1e6/(end-start)*100));}});
   j.done=new Promise(resolve=>{child.once('error',e=>{j.error='Não foi possível iniciar a análise: '+e.message;});child.once('close',code=>{j.running=false;if(j.cancelled)j.error='Análise cancelada. Nenhum corte foi aplicado.';else if(code!==0)j.error||='Não foi possível analisar o áudio desta fonte. '+j.stderr.slice(-600);else{finishRange(end-start);j.progress=100;}resolve();});});return {id};
  }
  if(d.action==='silence-cancel'){cancel(d.id);return true;}
  if(d.action==='silence-status'){const j=jobs.get(d.id);if(!j)throw Error('Análise não encontrada.');return {running:j.running,progress:j.progress,ranges:j.running?[]:j.ranges,error:j.error};}
  throw Error('Ação de automação não autorizada.');
 }
 return {call,close(){controller?.abort();for(const id of jobs.keys())cancel(id);},get busy(){return !!controller||[...jobs.values()].some(j=>j.running);}};
}
module.exports={makeAutomation,wav};
