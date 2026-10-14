import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'.training-build');
const dist=resolve(root,'dist/training');
const auditedModules=[];
const trainingIcon='data:image/png;base64,'+(await readFile(resolve(root,'public/icons/icon-192.png'))).toString('base64');
await build({configFile:false,root,publicDir:false,plugins:[react(),{
  name:'training-no-production-transport',enforce:'pre',
  resolveId(source,importer){if(importer&&/\/api\/client(?:\.ts)?$/.test(source))return resolve(root,'src/training/mock-client.ts');},
  transform(code,id){
    if(id.endsWith('/shift-print-layout.ts'))code=code.replace("paper: 'B4'","paper: 'A4'").replace(/export function openPrintWindow\(html: string\) \{[\s\S]*?\n\}/, `export function openPrintWindow(html: string) { window.dispatchEvent(new CustomEvent('training:print',{detail:html})); }`);
    if(id.endsWith('/WorkforceReviewStep.tsx'))code=code.replaceAll('DBの曜日制約','登録された曜日条件');
    if(id.endsWith('/LoginPage.tsx')||id.endsWith('/FirstLoginExperience.tsx'))code=code.replaceAll('/icons/icon-192.png',trainingIcon).replaceAll('autoComplete="username"','autoComplete="off"').replaceAll('autoComplete="current-password"','autoComplete="off"');
    if(id.endsWith('/ShiftSettings.tsx'))code=code.replaceAll('むすび保育園','練習用の園');
    // Training-only Back handling; the original component source is not modified.
    if(id.endsWith('/FirstLoginExperience.tsx'))code=code.replace('useState, type ReactNode','useState, useEffect, type ReactNode').replace('  const complete = () => {', `  useEffect(()=>{const back=(event:Event)=>{if(stage==='welcome')return;event.preventDefault();if(stage==='complete'){setStage('tutorial');setLesson(2);}else if(lesson>0)setLesson(lesson-1);else setStage('welcome');};window.addEventListener('training:back',back);return()=>window.removeEventListener('training:back',back);},[stage,lesson]);
  const complete = () => {`);
    if(id.endsWith('/StaffingRequirementManagement.tsx'))code=code.replace('HARDは必須条件、SOFTは優先条件、INFOは確認用条件です。','必須条件・優先条件・確認項目を使い分けます。').replace('>{row.constraintLevel}</td>', ">{({HARD:'必須条件',SOFT:'優先条件',INFO:'確認項目'})[row.constraintLevel]}</td>").replace('>{v}</option>', ">{({HARD:'必須条件',SOFT:'優先条件',INFO:'確認項目'})[v as 'HARD'|'SOFT'|'INFO']}</option>");
    if(id.endsWith('/TenantCalendarManagement.tsx'))code=code.replaceAll('generatorは','自動作成は').replaceAll('HARD条件','必須条件').replaceAll('HARD業務条件','必須の業務条件');
    if(id.endsWith('/ShiftManagement.tsx'))code=code.replace('生成前チェックでERROR 0を確認してください。','生成前チェックで修正が必要な項目がないことを確認してください。').replace('／HARD {summary.hardViolationCount}／WARNING {summary.warningCount}', '／必須違反 {summary.hardViolationCount}／確認事項 {summary.warningCount}');
    return {code,map:null};
  },
  generateBundle(){for(const id of this.getModuleIds()){if(id.includes('/src/'))auditedModules.push(id.slice(root.length+1));if(id.endsWith('/src/api/client.ts')||id.endsWith('/src/App.tsx')||/firebase|axios/.test(id))throw new Error(`Forbidden training import: ${id}`);}}
}],define:{'process.env.NODE_ENV':JSON.stringify('production'),__AEN_RELEASE_METADATA__:JSON.stringify({product:'AeN Shift',releaseId:'training-review',buildId:'training-review',gitSha:'000000000000',builtAt:'1970-01-01T00:00:00Z'})},build:{outDir:output,emptyOutDir:true,lib:{entry:resolve(root,'src/training/entry.tsx'),name:'AeNTraining',formats:['iife'],fileName:()=> 'practice.js',cssFileName:'practice'},sourcemap:false}});
const js=await readFile(resolve(output,'practice.js'),'utf8');
const css=await readFile(resolve(output,'practice.css'),'utf8');
const scriptHash=createHash('sha256').update(js).digest('base64');
const inner=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src data:; frame-src about:; form-action 'none'; base-uri 'none'; object-src 'none'"><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
await mkdir(dist,{recursive:true});
const shell=await readFile(resolve(root,'src/training/shell.js'),'utf8');
await writeFile(resolve(dist,'shell.js'),`const practiceDocument=${JSON.stringify(inner)};\n${shell}`);
await writeFile(resolve(dist,'index.html'),`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'self' about:; form-action 'none'; base-uri 'none'; object-src 'none'"><title>AeN Shift 操作練習ガイド</title><style>*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#193f32}body{display:flex;flex-direction:column}header{background:#fff3cf;border-bottom:1px solid #d6b75d;padding:10px 18px;display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap}strong{display:block}small{display:block;margin-top:3px}button{font:inherit;background:white;border:1px solid #d8dfda;border-radius:10px;padding:8px;min-height:44px;cursor:pointer}a{font-size:12px;color:#214e41;padding:8px;min-height:40px}iframe{width:100%;flex:1;border:0;min-height:0}#storage-status{font-size:11px}@media print{header a,header button{display:none}iframe{height:100vh}}</style></head><body><header><div><strong>練習モード</strong><small>実際のデータは変更されません</small><span id="storage-status"></span></div><button id="guide-back" type="button">← 練習ガイドへ戻る</button><a href="/">練習を終了してAeN Shiftへ戻る</a></header><iframe id="practice" title="AeN Shift 操作練習ガイド" sandbox="allow-scripts allow-modals allow-forms" referrerpolicy="no-referrer"></iframe><script src="./shell.js"></script></body></html>`);
await writeFile(resolve(dist,'build-audit.json'),JSON.stringify({productionTransportModules:0,modules:auditedModules.sort()},null,2));
await rm(output,{recursive:true,force:true});
