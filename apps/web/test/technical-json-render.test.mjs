import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
globalThis.document={querySelector:()=>null};
globalThis.window={innerWidth:390,innerHeight:844};
globalThis.localStorage={getItem:()=>null};
const session={role:'ADMIN',accessToken:'',tenant:{id:'isolated',name:'Test tenant'},user:{id:'test'}};
const previous=process.env.VITE_RELEASE_CHANNEL;
try {
 for(const channel of ['musubi-beta','standard']) {
  process.env.VITE_RELEASE_CHANNEL=channel;
  const server=await createServer({server:{middlewareMode:true},appType:'custom'});
  try {
   const {DataExportManagement}=await server.ssrLoadModule('/src/features/exports/DataExportManagement.tsx');
   const {FeedbackManagement}=await server.ssrLoadModule('/src/features/support/FeedbackManagement.tsx');
   const {PublicInfoPage}=await server.ssrLoadModule('/src/features/info/PublicInfoPage.tsx');
   const help=renderToStaticMarkup(React.createElement(PublicInfoPage,{route:'help'}));
   assert.equal(help.includes('JSON'),channel==='standard');
   const exported=renderToStaticMarkup(React.createElement(DataExportManagement,{session}));
   const feedback=renderToStaticMarkup(React.createElement(FeedbackManagement,{session}));
   assert.equal(exported.includes('バックアップを保存'),channel==='standard');
   assert.equal(exported.includes('type="file"'),channel==='standard');
   assert.equal(feedback.includes('報告ファイルを保存'),channel==='standard');
   for(const text of ['月間シフトCSV','希望休CSV','職員一覧CSV','監査ログCSV','印刷／PDF','B4','横']) assert.ok(exported.includes(text));
   if(channel==='musubi-beta') assert.ok(!exported.includes('<pre'));
  } finally {await server.close();}
 }
 console.log('technical JSON rendered UI PASS: Beta hidden / standard retained / CSV and B4 print retained');
} finally {if(previous===undefined) delete process.env.VITE_RELEASE_CHANNEL;else process.env.VITE_RELEASE_CHANNEL=previous;}
