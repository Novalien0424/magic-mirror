import fs from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('outputs/raven-lord-v10/qa/eye-design-candidates');
await fs.mkdir(out,{recursive:true});
const pages=await(await fetch('http://127.0.0.1:4188/json/list')).json();
const p=pages.find(p=>p.type==='page');
const ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((a,b)=>{ws.onopen=a;ws.onerror=b});
let seq=0;const pending=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);const v=pending.get(x.id);if(v){pending.delete(x.id);x.error?v[1](x.error):v[0](x.result)}};
const rpc=(method,params={})=>new Promise((a,b)=>{const id=++seq;pending.set(id,[a,b]);ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{const r=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value};
const context=await ev('({url:location.href,width:window.__capture.model.canvas.width,height:window.__capture.model.canvas.height})');
if(!context.url.startsWith('http://127.0.0.1:4197/')||context.width!==1080||context.height!==1920)throw Error('wrong_qa_context');
await ev('window.__capture.stopLoop()');
const designs=[{name:'attentive-eyes',open:.92,smile:1},{name:'old-exp05-eyes',open:.65,smile:.95},{name:'candidate-A',open:.65,smile:0},{name:'candidate-B',open:.55,smile:0}];
const records=[];
for(const d of designs)for(const x of [0,-30,30]){
 const values={ParamAngleX:x,ParamEyeLOpen:d.open,ParamEyeROpen:d.open,ParamEyeLSmile:d.smile,ParamEyeRSmile:d.smile};
 await ev(`window.__capture.resetToNeutral();window.__capture.setParameters(${JSON.stringify(values)});window.__capture.tick(0);true`);
 const state=await ev('({parameters:window.__capture.getAllParameterValues(),drawables:window.__capture.getDrawableSnapshot()})');
 const file=d.name+'-x'+x+'.png';
 const shot=await rpc('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
 await fs.writeFile(path.join(out,file),Buffer.from(shot.data,'base64'));
 records.push({...d,angleX:x,file,values,...state});
}
await ev('window.__capture.resetToNeutral()');
await fs.writeFile(path.join(out,'candidates.json'),JSON.stringify({scope:'same-head-pose direct controls; not expression timeline',context,records},null,2));
ws.close();console.log(JSON.stringify({captures:records.length,out}));
