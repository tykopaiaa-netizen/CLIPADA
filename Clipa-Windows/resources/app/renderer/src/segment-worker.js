import {ImageSegmenter} from '@mediapipe/tasks-vision';
let segmenter,loadedQuality,verifier;
const create=async quality=>{const root=new URL('./vision/',self.location.href).href;return ImageSegmenter.createFromOptions({wasmLoaderPath:root+'vision_wasm_internal.js',wasmBinaryPath:root+'vision_wasm_internal.wasm'},{baseOptions:{modelAssetPath:new URL(quality==='precise'?'./models/selfie_multiclass.tflite':'./models/selfie_segmenter.tflite',self.location.href).href,delegate:'CPU'},runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false});};
self.onmessage=async({data})=>{const {id,bitmap}=data;try{
 const quality=data.quality==='precise'?'precise':'fast';if(!segmenter||loadedQuality!==quality){segmenter?.close();segmenter=await create(quality);loadedQuality=quality;}if(quality==='precise'&&!verifier)verifier=await create('fast');
 if(data.type==='init'){self.postMessage({id,ready:true});return;}
 let output;
 segmenter.segment(bitmap,result=>{const masks=result.confidenceMasks,m=quality==='precise'?masks[0]:masks.length>1?masks[1]:masks[0],values=m.getAsFloat32Array().slice();output={id,width:m.width,height:m.height,values};if(quality==='precise'){
  const human=new Float32Array(values.length),detail=new Float32Array(values.length),head={x:m.width,y:m.height,right:0,bottom:0};
  for(let k=1;k<=4;k++){const channel=masks[k].getAsFloat32Array();for(let i=0;i<values.length;i++){human[i]+=channel[i];if(k<=3)detail[i]+=channel[i];if((k===1||k===3)&&channel[i]>.6){const x=i%m.width,y=Math.floor(i/m.width);head.x=Math.min(head.x,x);head.y=Math.min(head.y,y);head.right=Math.max(head.right,x);head.bottom=Math.max(head.bottom,y);}}}
  for(let i=0;i<values.length;i++)values[i]=Math.max(0,Math.min(1,1-values[i]));Object.assign(output,{human,detail,head});
 }});
 if(quality==='precise'){
  verifier.segment(bitmap,result=>{const masks=result.confidenceMasks,m=masks.length>1?masks[1]:masks[0],v=m.getAsFloat32Array(),strict=new Float32Array(output.values.length),head=output.head,hw=head.right-head.x,hh=head.bottom-head.y;
   for(let y=0;y<output.height;y++)for(let x=0;x<output.width;x++){const i=y*output.width+x,j=Math.min(m.height-1,Math.floor((y+.5)*m.height/output.height))*m.width+Math.min(m.width-1,Math.floor((x+.5)*m.width/output.width));const near=hw>0&&hh>0&&x>=head.x-hw*.35&&x<=head.right+hw*.35&&y>=head.y-hh*.3&&y<=head.bottom+hh*.2;strict[i]=Math.min(output.values[i],Math.max(output.detail[i],Math.min(near?output.values[i]:output.human[i],v[j])));}output.strict=strict;
  });delete output.human;delete output.detail;delete output.head;
 }
 self.postMessage(output,[output.values.buffer,...(output.strict?[output.strict.buffer]:[])]);
 }catch(e){self.postMessage({id,error:e.message||String(e)});}finally{bitmap?.close();}};
