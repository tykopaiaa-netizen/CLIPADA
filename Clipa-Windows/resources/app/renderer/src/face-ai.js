import {FaceDetector} from '@mediapipe/tasks-vision';
let detector;
export async function detectFaces(source){
 if(!detector){
  const root=new URL('../vendor/vision/',import.meta.url).href;
  const modelURL=new URL('../models/face/blaze-face.tflite',import.meta.url).href;
  const response=await fetch(modelURL,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Modelo local de rostos ausente. Extraia novamente todos os arquivos do app.');
  detector=await FaceDetector.createFromOptions({wasmLoaderPath:root+'vision_wasm_internal.js',wasmBinaryPath:root+'vision_wasm_internal.wasm'},{baseOptions:{modelAssetBuffer:new Uint8Array(await response.arrayBuffer()),delegate:'CPU'},runningMode:'IMAGE',minDetectionConfidence:0.5});
 }
 const w=source.width,h=source.height,regions=[{x:0,y:0,w,h}];
 // Multi-scale windows keep small webcam faces large enough for BlazeFace.
 for(const x of [0,w*.45])regions.push({x,y:0,w:w*.55,h});
 for(const x of [0,w*.45])for(const y of [0,h*.45])regions.push({x,y,w:w*.55,h:h*.55});
 // Small corner webcams need tighter context than the original half-frame tiles.
 if(w>600||h>600)for(const x of [0,.23,.46,.70])for(const y of [0,.23,.46,.70])regions.push({x:w*x,y:h*y,w:w*.30,h:h*.30});
 const tile=document.createElement('canvas'),ctx=tile.getContext('2d');const found=[];
 for(const region of regions){
  tile.width=Math.round(region.w);tile.height=Math.round(region.h);ctx.drawImage(source,region.x,region.y,region.w,region.h,0,0,tile.width,tile.height);
  for(const d of detector.detect(tile).detections){const b=d.boundingBox;found.push({box:{originX:b.originX+region.x,originY:b.originY+region.y,width:b.width,height:b.height},score:d.categories[0]?.score||0});}
 }
 const unique=[];
 for(const face of found.sort((a,b)=>b.score-a.score)){
  const b=face.box,cx=b.originX+b.width/2,cy=b.originY+b.height/2;
  if(!unique.some(f=>{const a=f.box;return Math.abs(cx-a.originX-a.width/2)<Math.max(a.width,b.width)*.5&&Math.abs(cy-a.originY-a.height/2)<Math.max(a.height,b.height)*.5;}))unique.push(face);
 }
 return unique;
}
