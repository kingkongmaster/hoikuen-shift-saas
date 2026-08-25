const ExcelJS=require('exceljs'); const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto');
const {normalizeText,normalizeTimeRange,parseDateCell,classifyFreeCondition}=require('./normalization.cjs');

async function analyze(source,targetYear,targetMonth){
  const workbook=new ExcelJS.Workbook(); await workbook.xlsx.readFile(source); const sheet=workbook.worksheets[0];
  if(!sheet) throw new Error('Workbook has no worksheet.');
  const headers={}; for(let c=2;c<=12;c++) headers[normalizeText(sheet.getCell(4,c).value)]=c;
  const required=['正職','クラス','固定勤務時間','固定シフト','固定の希望','行事担当(③以降のシフト入れない)','希望','早退','有給','土曜日休み希望','土曜シフト希望'];
  const missing=required.filter((x)=>!headers[x]); if(missing.length) throw new Error(`Required columns missing: ${missing.join(', ')}`);
  let employment='FULL_TIME',department='CHILDCARE'; const staff=[]; const issues=[];
  for(let row=5;row<=sheet.rowCount;row++){
    const name=normalizeText(sheet.getCell(row,2).value); if(!name) continue;
    if(name==='パート'){employment='PART_TIME';continue;} if(name==='子育て支援センター'){department='CHILDCARE_SUPPORT';continue;} if(name==='給食室'){department='FOOD_SERVICE';continue;}
    if(normalizeText(sheet.getCell(row,4).value)==='固定勤務時間') continue;
    if(row>=35) continue;
    const importKey=`S${String(staff.length+1).padStart(3,'0')}`; const rawName=sheet.getCell(row,2).value;
    const record={importKey,sourceRow:row,identity:{displayName:normalizeText(rawName)},employmentType:employment,departmentCode:department,classOrRole:normalizeText(sheet.getCell(row,3).value)||null,autoGenerate:department==='CHILDCARE',fixedWorkTime:null,fixedPattern:normalizeText(sheet.getCell(row,5).value)||null,conditions:[],requests:[]};
    const fixed=sheet.getCell(row,4).value; if(fixed) record.fixedWorkTime=normalizeTimeRange(fixed);
    for(const column of ['固定の希望','行事担当(③以降のシフト入れない)','希望']){const cell=sheet.getCell(row,headers[column]);const v=cell.value;if(v){const parsed=classifyFreeCondition(v);record.conditions.push({column,...parsed,raw:v});if(parsed.status!=='READY')issues.push({importKey,cell:cell.address,column,status:parsed.status,issue:parsed.notes.map(x=>x.text).join(' / ')||'勤務条件の構造化内容を確認してください。'});}}
    for(const [column,type] of [['早退','EARLY_DEPARTURE'],['有給','PAID_LEAVE'],['土曜日休み希望','SATURDAY_OFF'],['土曜シフト希望','SATURDAY_WORK']]){const cell=sheet.getCell(row,headers[column]);if(cell.value!=null){const parsed=parseDateCell(cell.value,targetYear,targetMonth);record.requests.push({column,type,cell:cell.address,...parsed,raw:cell.value instanceof Date?cell.value.toISOString():cell.value});if(parsed.status!=='READY')issues.push({importKey,cell:cell.address,column,status:parsed.status,issue:parsed.issue});}}
    if(record.fixedWorkTime?.status==='REVIEW')issues.push({importKey,cell:sheet.getCell(row,4).address,column:'固定勤務時間',status:'REVIEW',issue:record.fixedWorkTime.issue});
    staff.push(record);
  }
  const summary={sheetCount:workbook.worksheets.length,sheetName:sheet.name,staffCount:staff.length,employmentCounts:Object.fromEntries(['FULL_TIME','PART_TIME'].map(x=>[x,staff.filter(s=>s.employmentType===x).length])),departmentCounts:Object.fromEntries(['CHILDCARE','CHILDCARE_SUPPORT','FOOD_SERVICE'].map(x=>[x,staff.filter(s=>s.departmentCode===x).length])),readyForDatabase:issues.length===0,issueCount:issues.length};
  return {version:1,source:{fileName:path.basename(source),sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),readOnly:true},targetMonth:`${targetYear}-${String(targetMonth).padStart(2,'0')}`,stage:'VALIDATED_NOT_APPROVED',summary,issues,staff};
}

async function main(){const [source,output,target='2026-09']=process.argv.slice(2);if(!source||!output)throw new Error('Usage: node analyze-workbook.cjs <source.xlsx> <private-output.json> [YYYY-MM]');const workspaceRoot=path.resolve(__dirname,'../../../..');for(const candidate of [source,output])if(path.resolve(candidate).startsWith(`${workspaceRoot}${path.sep}`))throw new Error('Source and private output must remain outside the Git workspace.');const [year,month]=target.split('-').map(Number);const report=await analyze(source,year,month);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(report.summary));}
if(require.main===module)main().catch((e)=>{console.error(`Importer failed: ${e.message}`);process.exitCode=1;});
module.exports={analyze};
