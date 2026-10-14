// Parent only handles bounded, anonymous progress. No auth/business storage or API access.
const frame=document.getElementById('practice');
const key='aen.training.progress.v2';
const counts={admin:38,practical:20,staff:6};
let lastProgress=null;
function valid(p){return p&&Object.keys(p).length===2&&Object.hasOwn(counts,p.course)&&Number.isInteger(p.index)&&p.index>=0&&p.index<counts[p.course];}
function route(p){return p?`/training/#/${p.course}/${p.index+1}`:'/training/';}
function record(p,replace=false){
  if(!replace&&JSON.stringify(lastProgress)===JSON.stringify(p))return;
  history[replace?'replaceState':'pushState']({training:p},'',route(p));lastProgress=p;
}
window.addEventListener('popstate',event=>{
  const p=event.state?.training;
  if(p===null||valid(p)){lastProgress=p;frame.contentWindow.postMessage({type:'aen-training:navigate',progress:p},'*');}
});
document.getElementById('guide-back').addEventListener('click',()=>frame.contentWindow.postMessage({type:'aen-training:back'},'*'));
function storageFailure(){document.getElementById('storage-status').textContent='この端末では進捗を保存できません。練習は続けられます。';}
window.addEventListener('message',event=>{
  if(event.source!==frame.contentWindow||event.origin!=='null')return;
  const message=event.data;
  if(!message||typeof message!=='object')return;
  if(message.type==='aen-training:ready'){
    let progress=null;try{const raw=localStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(valid(parsed))progress=parsed;}}catch{storageFailure();}
    record(null,true);frame.contentWindow.postMessage({type:'aen-training:restore',progress},'*');
  }else if(message.type==='aen-training:top'){
    record(null);
  }else if(message.type==='aen-training:progress'&&valid(message.progress)){
    record(message.progress);
    try{localStorage.setItem(key,JSON.stringify(message.progress));}catch{storageFailure();}
  }else if(message.type==='aen-training:clear'){
    try{localStorage.removeItem(key);}catch{storageFailure();}
  }else if(message.type==='aen-training:exit'){
    window.location.assign('/');
  }
});
frame.srcdoc=practiceDocument;
