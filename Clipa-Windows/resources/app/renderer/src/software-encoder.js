import {LocalWorker} from './local-worker.js';
import {CustomVideoEncoder,registerEncoder,Input,ALL_FORMATS,BufferSource,EncodedPacketSink} from 'mediabunny';
let registered=false,enabled=false,cancelled=()=>false;
export function registerSoftwareEncoder(use=true,cancel=()=>false){enabled=use;cancelled=cancel;if(!use||registered)return;registerEncoder(LocalH264Encoder);registered=true;}
class LocalH264Encoder extends CustomVideoEncoder{
 static supports(codec,config){return enabled&&codec==='avc'&&config.width%2===0&&config.height%2===0;}
 async init(){
  this.local=new LocalWorker(cancelled);
  this.canvas=new OffscreenCanvas(this.config.width,this.config.height);this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});this.parts=[];this.times=[];this.maxFrames=Math.max(1,Math.min(30,Math.floor(32*1024*1024/(this.config.width*this.config.height*4))));
  await this.call({type:'init'});
 }
 call(data,transfer=[]){return this.local.call(data,transfer);}
 async encode(sample){sample.draw(this.ctx,0,0,this.canvas.width,this.canvas.height);this.parts.push(this.ctx.getImageData(0,0,this.canvas.width,this.canvas.height).data);this.times.push({timestamp:sample.timestamp,duration:sample.duration});if(this.parts.length>=this.maxFrames)await this.batch();}
 async batch(){
  if(!this.parts.length)return;
  const bytes=this.parts[0].length,rgba=new Uint8Array(bytes*this.parts.length);this.parts.forEach((p,i)=>rgba.set(p,i*bytes));const times=this.times;this.parts=[];this.times=[];
  const result=await this.call({type:'encode',buffer:rgba.buffer,width:this.config.width,height:this.config.height,fps:this.config.framerate||30,bitrate:this.config.bitrate||12000000},[rgba.buffer]);
  const input=new Input({source:new BufferSource(result.buffer),formats:ALL_FORMATS});
  try{const track=await input.getPrimaryVideoTrack(),decoderConfig=await track.getDecoderConfig(),sink=new EncodedPacketSink(track);let i=0;for await(const packet of sink.packets()){const time=times[i++];if(!time)throw Error('Renderizador retornou quadros a mais.');await this.onPacket(packet.clone({timestamp:time.timestamp,duration:time.duration}),{decoderConfig});}if(i!==times.length)throw Error('Renderizador não devolveu todos os quadros.');}finally{input.dispose();}
 }
 async flush(){await this.batch();}
 close(){this.local?.close();this.parts=[];this.times=[];}
}
