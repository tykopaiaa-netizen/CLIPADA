'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function safeName(value,fallback='Corte') {let s=String(value||'').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/g,'').slice(0,100).replace(/[. ]+$/g,'');if(!s||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))s=fallback;return s;}
function makeCollectionOutput({destinations,dialog,window,downloads}){
 return {async call(d){
  if(d.action==='collection-reserve'){
   if(!Array.isArray(d.names)||!d.names.length||d.names.length>60||d.names.some(n=>typeof n!=='string'||n.length>200))throw Error('Selecione de 1 a 60 cortes com nomes válidos.');
   if(destinations.size+d.names.length>64)throw Error('Libere destinos na fila de exportação antes de iniciar outro lote.');
   const names=d.names.map((n,i)=>safeName(n,'Corte '+(i+1)));let folder,paths=[];
   if(names.length===1){const r=await dialog.showSaveDialog(window(),{title:'Salvar corte',defaultPath:path.join(downloads,names[0]+'.mp4'),filters:[{name:'Vídeo MP4',extensions:['mp4']}]});if(r.canceled)return {cancelled:true};paths=[r.filePath];folder=path.dirname(r.filePath);}
   else {const r=await dialog.showOpenDialog(window(),{title:'Escolha onde criar a pasta dos cortes',defaultPath:downloads,properties:['openDirectory','createDirectory']});if(r.canceled||!r.filePaths?.[0])return {cancelled:true};const base=safeName(d.folder,'Meus cortes');let created=false;for(let i=0;i<1000;i++){folder=path.join(r.filePaths[0],base+(i?' ('+(i+1)+')':''));try{await fs.mkdir(folder,{recursive:false});created=true;break;}catch(e){if(e.code!=='EEXIST')throw e;}}if(!created)throw Error('Não foi possível criar uma pasta exclusiva. Escolha outro nome.');paths=names.map((n,i)=>path.join(folder,String(i+1).padStart(2,'0')+' - '+n+'.mp4'));}
   const outputs=paths.map(p=>{const id=crypto.randomUUID();destinations.set(id,p);return {id,path:p};});return {folder,outputs};
  }
  if(d.action==='collection-cover'){
   const file=destinations.get(d.id);if(!file)throw Error('Destino não autorizado ou expirado.');const b=d.bytes;if(!(b instanceof ArrayBuffer)&&!ArrayBuffer.isView(b))throw Error('Capa inválida.');const bytes=Buffer.from(b instanceof ArrayBuffer?b:b.buffer,b.byteOffset||0,b.byteLength);if(bytes.length<4||bytes.length>8*1024*1024||bytes[0]!==255||bytes[1]!==216)throw Error('Use uma capa JPEG até 8 MB.');const base=file.replace(/\.mp4$/i,'')+' - capa';for(let i=0;i<1000;i++){const p=base+(i?' ('+(i+1)+')':'')+'.jpg';try{await fs.writeFile(p,bytes,{flag:'wx'});return {saved:true,path:p};}catch(e){if(e.code!=='EEXIST')throw e;}}throw Error('Não foi possível salvar a capa.');
  }
  throw Error('Ação de coleção inválida.');
 }};
}
module.exports={safeName,makeCollectionOutput};
