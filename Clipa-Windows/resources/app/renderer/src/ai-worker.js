import {pipeline,env,LogitsProcessorList} from '@huggingface/transformers';
env.allowLocalModels=true;
env.localModelPath=new URL('../models/',import.meta.url).href;
env.useBrowserCache=false;
env.backends.onnx.wasm.wasmPaths=new URL('../vendor/ort/',import.meta.url).href;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
let pipe,modelLoaded;
self.onmessage=async({data})=>{
 const {audio,model,language,id}=data;
 try{
  if(!['Xenova/whisper-tiny','Xenova/whisper-base','Xenova/whisper-small'].includes(model)||!(audio instanceof Float32Array)||audio.length>604*16000)throw new Error('Pedido de transcrição inválido.');
  if(modelLoaded!==model){if(pipe)await pipe.dispose();pipe=null;modelLoaded=null;pipe=await pipeline('automatic-speech-recognition',model,{device:'wasm',dtype:'q8',local_files_only:model!=='Xenova/whisper-small',progress_callback:p=>self.postMessage({id,type:'progress',status:p.status,file:p.file,progress:p.progress})});modelLoaded=model;}
  // Transformers.js 3.7 defaults to English when language is absent. Read the
  // language token explicitly instead of presenting that fallback as detection.
  let spoken=language;
  if(!spoken||spoken==='auto'){
   self.postMessage({id,type:'status',text:'Identificando o idioma deste bloco…'});
   const features=await pipe.processor(audio.subarray(0,30*16000));
   const languages=pipe.model.generation_config.lang_to_id,allowed=new Set(Object.values(languages));
   const processors=new LogitsProcessorList();processors.push((ids,logits)=>{for(let i=0;i<logits.data.length;i++)if(!allowed.has(i%logits.dims.at(-1)))logits.data[i]=-Infinity;return logits;});
   const token=await pipe.model.generate({inputs:features.input_features,decoder_input_ids:[pipe.model.generation_config.decoder_start_token_id],max_new_tokens:1,return_timestamps:false,return_token_timestamps:false,return_dict_in_generate:false,begin_suppress_tokens:null,suppress_tokens:null,logits_processor:processors,do_sample:false});
   const chosen=Number(token.tolist()[0].at(-1));spoken=Object.entries(languages).find(([,id])=>id===chosen)?.[0]?.replace(/^<\||\|>$/g,'');
   features.input_features.dispose?.();token.dispose?.();
   if(!spoken)throw Error('Não foi possível detectar o idioma. Selecione o idioma falado e tente novamente.');
  }
  self.postMessage({id,type:'status',text:'Transcrevendo o trecho · idioma '+spoken+'…'});
  const duration=audio.length/16000,validTiming=o=>o.chunks?.some(c=>Number.isFinite(c.timestamp?.[0])&&c.timestamp[0]<duration&&Number(c.timestamp[1]??duration)>c.timestamp[0]+.005);
  let result=await pipe(audio,{language:spoken,task:'transcribe',return_timestamps:'word',chunk_length_s:30,stride_length_s:5});
  if(result.text?.trim()&&(!validTiming(result)||(result.chunks||[]).filter(c=>!Number.isFinite(c.timestamp?.[0])||Number(c.timestamp?.[1])<=Number(c.timestamp?.[0])).length>Math.max(2,(result.chunks||[]).length*.15))){
   self.postMessage({id,type:'status',text:'Recalculando tempos das frases…'});
   result=await pipe(audio,{language:spoken,task:'transcribe',return_timestamps:true,chunk_length_s:30,stride_length_s:5});
  }
  if(result.text?.trim()&&!validTiming(result))throw Error('A IA reconheceu texto sem tempos válidos. Tente um bloco de 30 segundos e selecione o idioma falado.');
  result.chunks=(result.chunks||[]).map((c,i,items)=>({...c,timestamp:[c.timestamp?.[0],Math.min(duration,Number(c.timestamp?.[1]??items[i+1]?.timestamp?.[0]??duration))]})).filter(c=>Number.isFinite(c.timestamp[0])&&c.timestamp[0]>=0&&c.timestamp[0]<duration&&c.timestamp[1]>c.timestamp[0]);
  self.postMessage({id,type:'done',result,language:spoken});
 }catch(error){if(pipe)await pipe.dispose().catch(()=>{});pipe=null;modelLoaded=null;self.postMessage({id,type:'error',message:error.message||String(error)});}
};
