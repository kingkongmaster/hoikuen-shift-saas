import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve(import.meta.dirname,'../dist');
const config=await readFile(resolve(import.meta.dirname,'../nginx.conf'),'utf8');
const policies=[...config.matchAll(/add_header Content-Security-Policy "([^"]+)" always;/g)].map(m=>m[1]);
if(policies.length!==2)throw new Error('Review server requires both production CSP policies.');
const port=Number(process.env.PORT||4176);
http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Content-Security-Policy',path.startsWith('/training/')?policies[1]:policies[0]);
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD'].includes(req.method)||path.startsWith('/api/')){res.writeHead(405);res.end('Local review: no API');return;}
 try{
  let file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep)&&file!==root)throw new Error('Invalid path');
  let info=await stat(file).catch(()=>null);if(info?.isDirectory())file=resolve(file,'index.html');
  if(!info&&!path.startsWith('/training/'))file=resolve(root,'index.html');
  const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.writeHead(200);res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Training review: http://127.0.0.1:${port}/training/ (static only; no API)`));
