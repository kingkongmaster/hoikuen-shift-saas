const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Module=require('node:module');
const {musubiGeneratorInput}=require('./helpers/musubi-generator-input.cjs');
const file=path.resolve(__dirname,'../dist/application/shifts/rule-based-shift-generator.js');
const trace=[];let code=fs.readFileSync(file,'utf8');
for(const name of ['eligible','eligibleForPattern']){
 code=code.replace(new RegExp(`function ${name}\\(([^)]*)\\) \\{`),(_,args)=>`function ${name}(...args) { const result = ${name}GoldenProbe(...args); globalThis.__candidateTrace.push([${JSON.stringify(name)}, key, args[0].id, typeof args[1] === 'object' ? args[1].id : args[1], result]); return result; } function ${name}GoldenProbe(${args}) {`);
}
globalThis.__candidateTrace=trace;const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(code,file);
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const results={};
for(const [name,month,mutate] of [
 ['reassignment','2035-01-01',()=>{}],
 ['without-reassignment','2035-01-01',x=>x.options.sameWeekReassignment=false],
 ['other-month','2034-10-01',x=>x.options.sameWeekReassignment=false],
 ['requests','2035-01-01',x=>{x.options.sameWeekReassignment=false;x.requests=[{staffId:'S001',requestDate:new Date('2035-01-03'),requestType:'DAY_OFF',reason:null}];}],
]) {const x=musubiGeneratorInput();mutate(x);trace.length=0;const r=mod.exports.generateRuleBasedSchedule(new Date(month),x.staff,x.requests||[],x.options);results[name]={output:hash(r),candidateDecisions:hash(trace),decisionCount:trace.length};}
delete globalThis.__candidateTrace;
const golden=path.join(__dirname,'fixtures/candidate-extraction-golden.json');
if(process.env.CAPTURE_CANDIDATE_GOLDEN==='1'){assert.ok(!fs.existsSync(golden));fs.mkdirSync(path.dirname(golden),{recursive:true});fs.writeFileSync(golden,JSON.stringify({baseSha:'1239758172cf2968938dc1d05a085ea059148d93',results},null,2)+'\n');console.log('Golden captured',Object.keys(results).length);}else{assert.deepEqual(results,JSON.parse(fs.readFileSync(golden)).results);console.log('Golden output + candidate decision traces PASS',Object.keys(results).length);}
