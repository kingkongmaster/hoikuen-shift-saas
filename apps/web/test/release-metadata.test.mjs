import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const metadata={product:'AeN Shift',releaseId:'musubi-ui-test',buildId:'20260914-ui-test',gitSha:'8f78fa9120d6',builtAt:'2026-09-14T00:00:00Z'};
process.env.AEN_RELEASE_METADATA=JSON.stringify(metadata);
globalThis.document={querySelector:()=>null};
globalThis.window={innerWidth:390,innerHeight:844};
globalThis.localStorage={getItem:()=>null};
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
 const {PublicInfoPage}=await server.ssrLoadModule('/src/features/info/PublicInfoPage.tsx');
 const html=renderToStaticMarkup(React.createElement(PublicInfoPage,{route:'about'}));
 for(const value of [metadata.product,metadata.releaseId,metadata.buildId,metadata.gitSha,'2026-09-14']) assert.ok(html.includes(value),`Missing UI metadata ${value}`);
 assert.ok(!html.includes('20260723.11A-RC1'));
 console.log('About rendered release metadata PASS');
} finally {await server.close();}
