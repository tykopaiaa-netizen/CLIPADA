'use strict';
(function(root){
 const string=x=>typeof x==='string'?x.trim():'';
 function inspect(provider,m={},asset){
  const issues=[],out={title:string(m.title),description:string(m.description),thumbnailAssetId:string(m.thumbnailAssetId),privacy:string(m.privacy),madeForKids:m.madeForKids,allowComment:m.allowComment===true,allowDuet:m.allowDuet===true,allowStitch:m.allowStitch===true,brand:m.brand===true,brandThird:m.brandThird===true,consent:m.consent===true,synthetic:m.synthetic===true,categoryId:string(m.categoryId)||'22',language:string(m.language),coverMs:Math.round(Number(m.coverMs)||0)};
  if(!['youtube','tiktok','instagram'].includes(provider))issues.push('Escolha uma rede válida.');
  if(!out.title)issues.push('Preencha o título ou a legenda.');
  out.caption=out.title+(out.description?'\n'+out.description:'');
  const rawTags=Array.isArray(m.tags)?m.tags:typeof m.tags==='string'?m.tags.split(','):[];out.tags=[...new Set(rawTags.map(string).filter(Boolean))];
  if(provider==='youtube'){
   if(Array.from(out.title).length>100)issues.push('YouTube: título até 100 caracteres.');
   if(new TextEncoder().encode(out.description).byteLength>5000)issues.push('YouTube: descrição até 5.000 bytes; acentos e emojis usam mais de um byte.');
   if(/[<>]/.test(out.title+out.description))issues.push('YouTube: remova < e > do título e da descrição.');
   if(!['private','unlisted','public'].includes(out.privacy))issues.push('Escolha a visibilidade.');
   if(typeof out.madeForKids!=='boolean')issues.push('Informe se o vídeo é para crianças.');
   if(!/^\d{1,3}$/.test(out.categoryId))issues.push('Escolha uma categoria válida.');
   const tagSize=out.tags.reduce((n,t)=>n+t.length+(t.includes(' ')?2:0),Math.max(0,out.tags.length-1));
   if(tagSize>500||out.tags.some(t=>/[<>]/.test(t)))issues.push('YouTube: tags até 500 caracteres, contando vírgulas e aspas de termos compostos, sem < ou >.');
   if(out.language&&!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(out.language))issues.push('Idioma inválido.');
  }else if(out.caption.length>2200)issues.push('Título e descrição juntos: limite de 2.200 caracteres.');
  if(provider==='tiktok'){
   if(!out.privacy||!out.consent)issues.push('Escolha a privacidade e confirme os termos de música do TikTok.');
   if(out.brandThird&&out.privacy==='SELF_ONLY')issues.push('Parceria paga não pode ser privada.');
   if(out.coverMs<0||!Number.isSafeInteger(out.coverMs)||(asset&&out.coverMs>=asset.duration*1000))issues.push('Escolha um quadro de capa dentro da duração do vídeo.');
  }
  if(asset&&['tiktok','instagram'].includes(provider)){
   if(asset.fps<23||asset.fps>60)issues.push('Use 24, 30 ou 60 fps nesta rede.');
   if(!['avc','h264'].includes(asset.codec))issues.push('Renderize com H.264 para esta rede.');
   if(provider==='tiktok'&&(asset.width<360||asset.height<360||asset.width>4096||asset.height>4096))issues.push('TikTok: largura e altura entre 360 e 4096 pixels.');
   if(provider==='instagram'&&(asset.duration<3||asset.duration>900||asset.width>1920))issues.push('Instagram: use de 3 s a 15 min, com largura até 1920 px.');
  }
  if(out.thumbnailAssetId&&provider!=='youtube')issues.push('Capa JPEG separada é usada somente no envio ao YouTube.');
  return {metadata:out,issues};
 }
 const api={inspect};root.ClipaPublicationRules=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
