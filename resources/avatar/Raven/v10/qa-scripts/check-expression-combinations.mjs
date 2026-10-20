import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const out=path.resolve('outputs/raven-lord-v10/qa/exp05-combinations');
await fs.mkdir(out,{recursive:true});
const pages=await(await fetch('http://127.0.0.1:4188/json/list')).json();
const p=pages.find(p=>p.type==='page');
const ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((a,b)=>{ws.onopen=a;ws.onerror=b});
let seq=0;const pending=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);const v=pending.get(x.id);if(v){pending.delete(x.id);x.error?v[1](x.error):v[0](x.result)}};
const rpc=(method,params={})=>new Promise((a,b)=>{const id=++seq;pending.set(id,[a,b]);ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value};
const context=await ev('({url:location.href,width:window.__capture.model.canvas.width,height:window.__capture.model.canvas.height})');
if(!context.url.startsWith('http://127.0.0.1:4196/')||context.width!==1080||context.height!==1920)throw Error('wrong_qa_context');
const local=await fs.readFile('outputs/raven-lord-v10/runtime/motions/exp_05.exp3.json');
const served=Buffer.from(await(await fetch('http://127.0.0.1:4196/runtime/motions/exp_05.exp3.json')).arrayBuffer());
const sha=b=>createHash('sha256').update(b).digest('hex');if(sha(local)!==sha(served))throw Error('served_expression_mismatch');
const blinkMultiplier=JSON.parse(local.toString('utf8')).Parameters.find(p=>p.Id==='ParamEyeLOpen').Value;
await ev('window.__capture.stopLoop();window.__capture.resetToNeutral();window.__capture.setExpression("exp_05");window.__capture.tick(0);for(let i=0;i<90;i++)window.__capture.model.update(1/60);window.__capture.tick(0);true');
const records=[];
async function capture(name,extra){
 const state=await ev('({parameters:window.__capture.getAllParameterValues(),drawables:window.__capture.getDrawableSnapshot()})');
 const shot=await rpc('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
 await fs.writeFile(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
 records.push({name,file:name+'.png',...extra,...state});
}
for(const headX of [0,-30,30]){
 for(const gx of [-1,0,1])for(const gy of [-1,0,1]){
   await ev(`for(const [id,value] of Object.entries({ParamAngleX:${headX},ParamEyeBallX:${gx},ParamEyeBallY:${gy}}))window.__capture.model.setParameter(id,value);window.__capture.tick(0);true`);
   const eyeValues=await ev('window.__capture.getAllParameterValues().filter(p=>["ParamEyeLOpen","ParamEyeROpen"].includes(p.id)).map(p=>p.value)');
   if(!eyeValues.every(v=>Math.abs(v-blinkMultiplier)<1e-5))throw Error('expression_not_active_during_gaze:'+JSON.stringify(eyeValues));
   await capture(`head${headX}-gaze${gx}-${gy}`,{kind:'gaze',headX,gaze:[gx,gy]});
 }
 for(const blink of [1,.75,.5,.25,0]){
   // Supply a known blink input BEFORE the real SDK expression manager.
   // Direct post-expression preview overrides would not test Multiply.
   const values=await ev(`{const m=window.__capture.model;m.manualOverrides.clear();m._model.loadParameters();for(const id of ['ParamEyeLOpen','ParamEyeROpen'])m._model.setParameterValueByIndex(m.parameterIndexById.get(id),${blink});m._expressionManager.updateMotion(m._model,0);m._model.setParameterValueByIndex(m.parameterIndexById.get('ParamAngleX'),${headX});m._model.update();m.renderWithoutUpdate(true);}window.__capture.getAllParameterValues().filter(p=>['ParamEyeLOpen','ParamEyeROpen'].includes(p.id)).map(p=>p.value)`);
   if(!values.every(v=>Math.abs(v-blink*blinkMultiplier)<1e-5))throw Error('multiply_blink_mismatch:'+JSON.stringify({blink,values}));
   await capture(`head${headX}-blink${blink}`,{kind:'blink',headX,inputBlink:blink,expectedOutput:blink*blinkMultiplier,actualOutput:values});
 }
}
await ev('window.__capture.resetToNeutral()');
await fs.writeFile(path.join(out,'combinations.json'),JSON.stringify({scope:'actual SDK expression after known blink input; post-expression head/gaze position control; not camera tracking QA',context,expressionSha256:sha(local),blinkMultiplier,records},null,2));
ws.close();console.log(JSON.stringify({captures:records.length,blinkMultiplyChecks:15,out}));
