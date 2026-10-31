'use strict';
const {spawn}=require('node:child_process'),crypto=require('node:crypto');
const number=(v,min,max)=>{if(!Number.isFinite(v)||v<min||v>max)throw Error('Configuração de decodificação inválida.');return v;};
exports.makeDecoder=({asset,ffmpeg})=>{
 const tasks=new Map();
 async function stop(id){const t=tasks.get(id);if(!t)return;tasks.delete(id);t.cancelled=true;t.child.stdout.destroy();t.child.kill('SIGKILL');await t.done.catch(()=>{});}
 async function call(d){
  if(d.action==='decode-cancel'){await stop(d.id);return true;}
  if(d.action==='decode-begin'){
   if(tasks.size)throw Error('Finalize a leitura anterior.');const source=asset(d.asset),w=number(d.width,2,8192),h=number(d.height,2,8192),fps=number(d.fps,1,120),speed=number(d.speed,.25,4),start=number(d.start,0,86400*7),count=number(d.frames,1,120*86400*7);
   if(!Number.isInteger(w)||!Number.isInteger(h)||!Number.isInteger(count)||w*h*4>40*1024*1024)throw Error('A fonte ultrapassa o limite de 10 megapixels por quadro.');
   const seek=Math.max(0,start-1),offset=start-seek;
   const filter=`setpts=(PTS-${offset}/TB)/${speed},tpad=stop_mode=clone:stop_duration=1,fps=fps=${fps}:start_time=0:round=near,scale=${w}:${h}:flags=bicubic,setsar=1`;
   const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-threads','4','-ss',String(seek),'-i',source.file,'-an','-sn','-dn','-vf',filter,'-frames:v',String(count),'-pix_fmt','rgba','-fps_mode','passthrough','-f','rawvideo','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   const t={child,iterator:child.stdout[Symbol.asyncIterator](),rest:Buffer.alloc(0),bytes:w*h*4,frames:0,reading:false,error:'',cancelled:false};
   child.stderr.on('data',b=>t.error=(t.error+b).slice(-4000));t.done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(t.cancelled?'Cancelado':'Leitura nativa: '+(t.error||code))));});t.done.catch(()=>{});
   const id=crypto.randomUUID();tasks.set(id,t);return {id,width:w,height:h};
  }
  const t=tasks.get(d.id);if(!t)throw Error('Leitura encerrada.');if(d.action!=='decode-next')throw Error('Ação de leitura inválida.');if(t.reading)throw Error('Já existe um quadro em leitura.');t.reading=true;let timer;
  try{
   timer=setTimeout(()=>{t.error='A leitura de um quadro excedeu 60 segundos.';t.child.kill('SIGKILL');},60000);
   const frame=Buffer.allocUnsafe(t.bytes);let used=0;
   while(used<frame.length){if(t.cancelled)throw Error('Cancelado');if(!t.rest.length){const next=await t.iterator.next();if(next.done){await t.done;if(used)throw Error('Quadro incompleto na fonte.');return {done:true};}t.rest=next.value;}
    const take=Math.min(t.rest.length,frame.length-used);t.rest.copy(frame,used,0,take);t.rest=t.rest.subarray(take);used+=take;
   }
   return {done:false,index:t.frames++,bytes:frame.buffer.slice(frame.byteOffset,frame.byteOffset+frame.length)};
  }finally{clearTimeout(timer);t.reading=false;}
 }
 return {call,stop,close:()=>Promise.all([...tasks.keys()].map(stop)),get busy(){return tasks.size>0;}};
};
