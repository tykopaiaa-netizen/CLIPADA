import {pipeline,env} from '@huggingface/transformers';
env.allowLocalModels=true;env.localModelPath=new URL('../models/',import.meta.url).href;env.useBrowserCache=true;
env.backends.onnx.wasm.wasmPaths=new URL('../vendor/ort/',import.meta.url).href;
env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
let extractor;
self.onmessage=async({data})=>{const {id,texts,query}=data;try{
 if(!Array.isArray(texts)||!texts.length||texts.length>180||texts.some(x=>typeof x!=='string'||x.length>30000)||typeof query!=='string'||!query.trim()||query.length>1000)throw Error('Escolha um assunto e até 180 candidatos por análise.');
 extractor??=await pipeline('feature-extraction','Xenova/paraphrase-multilingual-MiniLM-L12-v2',{device:'wasm',dtype:'q8',progress_callback:p=>self.postMessage({id,type:'progress',text:`Baixando modelo de assuntos · ${p.file||''} ${Math.round(p.progress||0)}%`})});
 const options={pooling:'mean',normalize:true,truncation:true,max_length:128};const question=(await extractor(query,options)).data;const scores=[];
 for(let i=0;i<texts.length;i++){
  // Score several portions so a long candidate is not represented only by its opening.
  const words=texts[i].split(/\s+/),parts=[];for(let j=0;j<words.length&&parts.length<3;j+=65)parts.push(words.slice(j,j+85).join(' '));
  let best=-1;for(const part of parts){const vector=(await extractor(part,options)).data;let score=0;for(let k=0;k<vector.length;k++)score+=vector[k]*question[k];best=Math.max(best,score);}scores.push(best);
  self.postMessage({id,type:'progress',progress:(i+1)/texts.length*100,text:`Comparando assunto · ${i+1}/${texts.length}`});
 }
 self.postMessage({id,type:'done',scores});
 }catch(e){self.postMessage({id,type:'error',message:e.message||String(e)});}};
