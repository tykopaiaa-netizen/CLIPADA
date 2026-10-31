import {pipeline,env} from '@huggingface/transformers';
env.allowLocalModels=true;env.allowRemoteModels=false;env.localModelPath=new URL('../models/',import.meta.url).href;env.useBrowserCache=true;
env.backends.onnx.wasm.wasmPaths=new URL('../vendor/ort/',import.meta.url).href;env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
let extractor,cacheKey='',queries=[];
self.onmessage=async({data})=>{const {id,texts,themes}=data;try{
 if(!Array.isArray(texts)||!texts.length||texts.length>60||texts.some(x=>typeof x!=='string'||x.length>12000)||!themes||Object.keys(themes).length>8)throw Error('Bloco de análise inválido.');
 extractor??=await pipeline('feature-extraction','Xenova/paraphrase-multilingual-MiniLM-L12-v2',{device:'wasm',dtype:'q8',progress_callback:p=>self.postMessage({id,type:'progress',text:'Preparando IA de assuntos · '+(p.file||'')+' '+Math.round(p.progress||0)+'%'})});
 const options={pooling:'mean',normalize:true,truncation:true,max_length:128},key=JSON.stringify(themes);
 if(cacheKey!==key){queries=[];for(const [name,text]of Object.entries(themes)){if(typeof text!=='string'||text.length>1000)throw Error('Tema inválido.');queries.push([name,(await extractor(text,options)).data]);}cacheKey=key;}
 const scores=[];for(let i=0;i<texts.length;i++){const words=texts[i].split(/\s+/),parts=[words.slice(0,90).join(' ')];if(words.length>90)parts.push(words.slice(-90).join(' '));const result={};for(const part of parts){const v=(await extractor(part,options)).data;for(const [name,q]of queries){let dot=0;for(let k=0;k<v.length;k++)dot+=v[k]*q[k];result[name]=Math.max(result[name]??-1,dot);}}scores.push(result);self.postMessage({id,type:'progress',progress:(i+1)/texts.length*100,text:'Interpretando falas · '+(i+1)+'/'+texts.length});}
 self.postMessage({id,type:'done',scores});
 }catch(e){self.postMessage({id,type:'error',message:e.message||String(e)});}};
