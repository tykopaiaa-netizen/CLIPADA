'use strict';
(() => {
 const transport=document.querySelector('.studioTimeline > .transport');
 const speed=document.createElement('label');speed.className='speedControl';speed.innerHTML='Velocidade<select id="clipSpeed" title="Velocidade da prévia e do MP4. Os marcadores continuam nos tempos do original; o áudio mantém o tom.">'+[.25,.5,.75,1,1.25,1.5,2,3,4].map(x=>`<option value="${x}" ${x===1?'selected':''}>${String(x).replace('.',',')}×</option>`).join('')+'</select>';transport.append(speed);
 const info=document.createElement('p');info.id='speedInfo';info.className='hint';$('tool-export').prepend(info);
 const fade=document.createElement('section');fade.className='nextCard';fade.innerHTML='<h3>Entrada e saída suaves</h3><div class="darkRow"><label>Entrada (s)<input id="audioFadeIn" type="number" min="0" max="5" step=".1" value="0" title="Aumenta o volume gradualmente no início do MP4."></label><label>Saída (s)<input id="audioFadeOut" type="number" min="0" max="5" step=".1" value="0" title="Reduz o volume gradualmente no final do MP4."></label></div>';$('tool-audio').append(fade);
 function sync(){video.playbackRate=clipSpeed();video.preservesPitch=true;clipaAudioEdit.fadeIn=Math.max(0,Math.min(5,Number($('audioFadeIn').value)||0));clipaAudioEdit.fadeOut=Math.max(0,Math.min(5,Number($('audioFadeOut').value)||0));const length=Math.max(0,Number($('end').value)-Number($('start').value));info.textContent=`${length.toFixed(2)} s do original → ${(length/clipSpeed()).toFixed(2)} s no MP4 · ${clipSpeed()}×. Marcadores e legendas usam os tempos do original.`;window.clipaDark?.syncAudio();window.clipaRefreshAudio?.();}
 for(const id of ['clipSpeed','audioFadeIn','audioFadeOut'])$(id).addEventListener('input',()=>{sync();refreshReady();});
 $('editor').addEventListener('input',sync);video.addEventListener('loadedmetadata',sync);
 const ready=refreshReady;refreshReady=()=>{ready();sync();};
 const stamp=projectStamp;projectStamp=()=>JSON.stringify({base:stamp(),output:{size:outputSize(),fps:outputFps(),bitrate:bitrate()},speed:clipSpeed(),fadeIn:clipaAudioEdit.fadeIn||0,fadeOut:clipaAudioEdit.fadeOut||0,narration:window.clipaDark?.stamp()||null});
 const problems=renderProblems;renderProblems=()=>{const issues=problems(),n=Number($('end').value)-Number($('start').value);if(!window.clipaDesktop?.io&&(clipSpeed()!==1||clipaAudioEdit.fadeIn||clipaAudioEdit.fadeOut||clipaAudioEdit.narration?.enabled)&&(n>600||n/clipSpeed()>600))issues.push('Velocidade, fades e narração: marque até 10 minutos na fonte e na saída. Exporte em partes.');return issues;};
 const open=openEditor;openEditor=async(...args)=>{$('clipSpeed').value='1';$('audioFadeIn').value='0';$('audioFadeOut').value='0';clipaAudioEdit.fadeIn=0;clipaAudioEdit.fadeOut=0;await open(...args);sync();};
 const copy=document.createElement('button');copy.id='copyProject';copy.textContent='Criar cópia';copy.title='Salva uma nova versão na biblioteca sem substituir o projeto atual.';copy.onclick=()=>window.clipaLibrary.saveCopy();$('tool-export').append(copy);
 const lock=setLocked;let locked=false;setLocked=value=>{if(value===locked)return;locked=value;lock(value);if(!value){window.clipaTracking?.info();window.clipaDark?.refresh();}};
 sync();
})();
