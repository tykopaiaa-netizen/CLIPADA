const assert=require('node:assert/strict'),T=require('../renderer/tracking-core.js');
const base={x:.2,y:.2,w:.4,h:.4},bounds={x:0,y:0,w:1,h:1},track={enabled:true,signature:T.signature(base),base,bounds,start:0,end:4,points:[{t:0,x:.4,y:.4},{t:1,x:.7,y:.7},{t:3,x:.7,y:.7},{t:4,x:.5,y:.4}]};
assert.deepEqual(T.sample(track,-1,base),base);assert.deepEqual(T.sample(track,5,base),base);assert.deepEqual(T.sample({...track,enabled:false},2,base),base);assert.deepEqual(T.sample(track,2,{...base,w:.3}),{...base,w:.3});
assert.deepEqual(T.sample(track,1.5,base),T.sample(track,2.5,base),'Lost face holds last position');
const shuffled=[3.5,.4,2.5,1.5,0];for(const t of shuffled){const a=T.sample(track,t,base);assert.deepEqual(a,T.sample(track,t,base));assert(a.x>=0&&a.x+a.w<=1&&a.y>=0&&a.y+a.h<=1);}
assert.equal(T.choose([{x:.9,y:.9,score:.8}],{x:.2,y:.2},bounds,.25),null);assert.equal(T.choose([{x:.1,y:.1,score:.2}],null,bounds,.25),null);assert.equal(Object.keys(T.validate({'wide:content':track})).length,1);assert.equal(Object.keys(T.validate({'wide:content':{...track,points:[{t:0,x:NaN,y:.5}]}})).length,0);assert.equal(T.validRect({x:-1,y:0,w:1,h:1}),false);
console.log('PASS: deterministic frame sampling, arbitrary seeks, crop invalidation, boundary clamping, face loss hold, nearest target, invalid saved tracks.');
