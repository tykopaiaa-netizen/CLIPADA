// Run with NODE_PATH pointing to the build dependencies; see BUILD.md.
const esbuild=require('esbuild'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const workers={
 'media-sink.js':[['colorAlphaMergerWorkerCode','media-alpha-merge.js','mergerWorkerUrl']],
 'media-source.js':[['colorAlphaSplitterWorkerCode','media-alpha-split.js','splitterWorkerUrl'],['mediaStreamTrackProcessorWorkerCode','media-track.js','url']],
 'misc.js':[['unthrottledTimerWorkerMain','media-timer.js','workerURL']]
};
const plugin={name:'packaged-media-workers',setup(build){
 build.onLoad({filter:/aac-encoder\/dist\/bundles\/mediabunny-aac-encoder\.mjs$/},async args=>{
  let contents=fs.readFileSync(args.path,'utf8');
  const marker='return inlineWorker(',start=contents.indexOf(marker),literalStart=start+marker.length;
  if(start<0||contents[literalStart]!=='`')throw Error('AAC worker source not found');
  let stop=literalStart+1;
  for(;stop<contents.length;stop++){if(contents[stop]==='\\'){stop++;continue;}if(contents[stop]==='`')break;}
  const literal=contents.slice(literalStart,stop+1);
  const match=[contents.slice(start,stop+3)];
  const source=require('vm').runInNewContext(literal,{}, {timeout:1000});
  fs.writeFileSync(path.join(root,'vendor','aac-worker.js'),source);
  const begin=contents.indexOf('async function inlineWorker('),end=contents.indexOf('// packages/aac-encoder/src/encode.worker.ts',begin);
  if(begin<0||end<0)throw Error('AAC worker factory not found');
  contents=contents.slice(0,begin)+contents.slice(end);
  contents=contents.replace(match[0],"return Promise.resolve(new Worker(new URL('./aac-worker.js', import.meta.url)));" );
  return {contents,loader:'js'};
 });
 build.onLoad({filter:/mediabunny\/dist\/modules\/src\/(media-sink|media-source|misc)\.js$/},async args=>{
  let contents=fs.readFileSync(args.path,'utf8');
  for(const [name,file,variable] of workers[path.basename(args.path)]){
   const start=contents.indexOf('const '+name+' = () => {');
   const end=contents.indexOf('\n};',start)+3;
   if(start<0||end<3)throw Error('Worker source not found: '+name);
   const source=contents.slice(start,end)+'\n'+name+'();\n';
   fs.writeFileSync(path.join(root,'vendor',file),'// Mediabunny 1.61.1, MPL-2.0. Packaged worker.\n'+source);
   if(name==='unthrottledTimerWorkerMain'){
    const from=contents.indexOf('    const workerSource =');
    const to=contents.indexOf('\n    unthrottledTimerWorker = new Worker',from);
    contents=contents.slice(0,from)+`    const workerURL = new URL('./${file}', import.meta.url).href;`+contents.slice(to);
    contents=contents.replace('    URL.revokeObjectURL(workerURL);','');
   }else{
    const pattern=new RegExp('const blob = new Blob\\(\\[.*?'+name+'\\.toString\\(\\).*?\\n\\s*'+variable+' = URL\\.createObjectURL\\(blob\\);');
    // Track processor declares its URL with const, unlike the alpha workers.
    const track=new RegExp('const blob = new Blob\\(\\[.*?'+name+'\\.toString\\(\\).*?\\n\\s*const '+variable+' = URL\\.createObjectURL\\(blob\\);');
    const replacement=(name==='mediaStreamTrackProcessorWorkerCode'?'const ':'')+variable+` = new URL('./${file}', import.meta.url).href;`;
    const before=contents;contents=contents.replace(name==='mediaStreamTrackProcessorWorkerCode'?track:pattern,replacement);
    if(contents===before)throw Error('Worker creation not found: '+name);
   }
  }
  return {contents,loader:'js'};
 });
}};
(async()=>{for(const name of (process.env.CLIPA_BUILD_TARGETS?process.env.CLIPA_BUILD_TARGETS.split(','):['ai-worker','face-ai','exporter','semantic-worker','cut-semantic322','music-worker','translation-worker']))await esbuild.build({entryPoints:[path.join(root,'src',name+'.js')],outfile:path.join(root,'vendor',name+'.js'),bundle:true,format:'esm',platform:'browser',target:'chrome120',minify:true,nodePaths:(process.env.NODE_PATH||'').split(path.delimiter).filter(Boolean),legalComments:'linked',define:{'process.env.NODE_ENV':'"production"'},plugins:[plugin]});if(!process.env.CLIPA_BUILD_TARGETS)await esbuild.build({entryPoints:[path.join(root,'src','segment-worker.js')],outfile:path.join(root,'vendor','segment-worker.js'),bundle:true,format:'iife',platform:'browser',target:'chrome120',minify:true,nodePaths:(process.env.NODE_PATH||'').split(path.delimiter).filter(Boolean),legalComments:'linked'});})().catch(e=>{console.error(e);process.exit(1)});

fs.writeFileSync(path.join(root,'vendor','media-analysis.js'),"export {walkAudio,extractAudio,extractStereoWav,analyzeActivity,suggestClips} from './exporter.js';\n");
