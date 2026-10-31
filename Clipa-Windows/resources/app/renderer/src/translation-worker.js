import {pipeline,env} from '@huggingface/transformers';
env.allowLocalModels=false;env.useBrowserCache=true;
env.backends.onnx.wasm.wasmPaths=new URL('../vendor/ort/',import.meta.url).href;
env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
const languages=['pt','en','es','ja','zh','fr','de','ko','it'];
self.onmessage=async({data})=>{
 let translator;const id=data.id;
 try{
  const {texts,from,to}=data;if(!languages.includes(from)||!languages.includes(to)||from===to||!Array.isArray(texts)||!texts.length||texts.length>3000||texts.some(t=>typeof t!=='string'||t.length>10000))throw Error('Pedido de tradução inválido.');
  translator=await pipeline('translation','Xenova/m2m100_418M',{device:'wasm',dtype:'q8',progress_callback:p=>self.postMessage({id,type:'progress',text:`Modelo de tradução · ${p.file||p.status||''} ${Number.isFinite(p.progress)?Math.round(p.progress)+'%':''}`})});
  const translated=[];
  for(let i=0;i<texts.length;i++){
   if(!texts[i].trim()){translated.push('');continue;}
   self.postMessage({id,type:'progress',progress:(i+1)/texts.length*100,text:`Traduzindo legenda ${i+1} de ${texts.length}…`});
   const result=await translator(texts[i],{src_lang:from,tgt_lang:to,max_new_tokens:256});
   const text=result?.[0]?.translation_text?.trim();if(!text)throw Error('O modelo retornou uma legenda vazia.');translated.push(text);
  }
  self.postMessage({id,type:'done',texts:translated});
 }catch(e){self.postMessage({id,type:'error',message:e.message||String(e)});}finally{await translator?.dispose().catch(()=>{});}
};
