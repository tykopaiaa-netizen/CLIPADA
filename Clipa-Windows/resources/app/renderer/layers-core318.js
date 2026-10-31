'use strict';
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.ClipaLayers=api;})(globalThis,()=>{
  const sources=['source:content','source:cam1','source:cam2'];
  function normalize(order,items){
    const valid=[...sources,...items.filter(a=>a.kind==='image'||a.kind==='video').map(a=>'media:'+a.id)];
    const allowed=new Set(valid),seen=new Set(),result=[];
    for(const id of [...(Array.isArray(order)?order:[]),...valid])if(allowed.has(id)&&!seen.has(id)){seen.add(id);result.push(id);}
    return result;
  }
  function visible(state,keys){const active=new Set(keys.map(k=>'source:'+k));return normalize(state.order,state.items).filter(id=>id.startsWith('media:')||active.has(id));}
  function move(state,keys,id,action){
    const order=normalize(state.order,state.items),shown=visible(state,keys),at=shown.indexOf(id);
    if(at<0)return false;
    const target=action==='back'?0:action==='front'?shown.length-1:at+(action==='down'?-1:1);
    if(target<0||target>=shown.length||target===at)return false;
    const peer=shown[target];order.splice(order.indexOf(id),1);
    order.splice(order.indexOf(peer)+(target>at?1:0),0,id);state.order=order;return true;
  }
  return {normalize,visible,move};
});
