import {createRavenQa} from './src/cubism-qa.js';
const q=new URLSearchParams(location.search);
const modelUrl=q.get('model') || '/runtime/model3.json';
const shaderPath=q.get('shaderPath') || '/live2d/Framework/Shaders/WebGL/';
const coreUrl=q.get('core') || '/live2d/Core/live2dcubismcore.min.js';
const p={ParamAngleX:0,ParamAngleY:0,ParamAngleZ:0,ParamEyeBallX:0,ParamEyeBallY:0,ParamEyeLOpen:1,ParamEyeLSmile:0,ParamEyeROpen:1,ParamEyeRSmile:0,ParamMouthOpenY:0,ParamBreath:0,ParamBodyAngleZ:0};
for(const id of Object.keys(p))if(q.has(id))p[id]=Number(q.get(id));
try{
 const r=await createRavenQa(document.getElementById('capture'),e=>{if(e.kind==='error')document.getElementById('error').textContent=e.message;},{modelUrl,shaderPath,coreUrl});
 r.setParameters(p);
 r.model.renderFrame(1/60);
 document.title='Raven capture ready';
 document.body.dataset.pose=JSON.stringify(p);
 document.body.dataset.modelUrl=modelUrl;
 document.body.dataset.core=JSON.stringify(r.getReport().core);
 document.body.dataset.drawables=String(r.getReport().moc.drawableCount);
 r.stopLoop();
 window.__capture=r;
}catch(e){document.getElementById('error').textContent=String(e);document.title='Raven capture failed';}
