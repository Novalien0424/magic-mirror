from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib

base=Path(__file__).resolve().parents[2]/'outputs'
job=base/'raven-lord-v10';qa=job/'qa'
caps=qa/'expression-captures';oldcaps=base.parent/'work/raven-lord-v10/prior-v09-qa/semantic-audit-20260908/expression-captures'
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',20)
def panel(p,size,head=False):
    im=Image.open(p).convert('RGBA')
    if head: im=im.crop((0,150,1080,950))
    bg=Image.new('RGBA',im.size,'#d7dce1');bg.alpha_composite(im)
    return bg.convert('RGB').resize(size,Image.Resampling.LANCZOS)

s=Image.new('RGB',(1500,930),'#f1f3f5');d=ImageDraw.Draw(s)
cases=[(oldcaps/'expressions/exp_01-t1.500.png','Attentive / unchanged'),
       (oldcaps/'expressions/exp_05-t1.500.png','v09 exp_05 / smile 0.95'),
       (caps/'expressions/exp_05-t1.500.png','v10 exp_05 / smile 0, eye 0.85')]
for i,(p,label) in enumerate(cases):
    s.paste(panel(p,(500,889)),(i*500,40));d.text((i*500+8,8),label,font=font,fill='#111')
s.save(qa/'exp05-before-after.jpg',quality=95)

comparison={}
for n in ['controls/neutral.png']+[f'expressions/exp_0{i}-t1.500.png' for i in range(1,5)]:
    a=Image.open(oldcaps/n).convert('RGBA');b=Image.open(caps/n).convert('RGBA')
    comparison[n]=a.size==b.size and a.tobytes()==b.tobytes()
assert all(comparison.values()),comparison
(qa/'unchanged-expression-check.json').write_text(json.dumps({'method':'all RGBA bytes','checks':comparison},indent=2))

p=qa/'exp05-combinations';combo=json.loads((p/'combinations.json').read_text());records=combo['records']
exp=(job/'runtime/motions/exp_05.exp3.json').read_bytes()
assert combo['expressionSha256']==hashlib.sha256(exp).hexdigest()
assert combo['blinkMultiplier']==.85 and len(records)==42
for r in records:
    assert (p/r['file']).exists()
    if r['kind']=='blink':assert all(abs(v-r['inputBlink']*.85)<1e-5 for v in r['actualOutput'])
for x in [0,-30,30]:
    rows=[r for r in records if r['kind']=='gaze' and r['headX']==x]
    s=Image.new('RGB',(1380,1110),'#f1f3f5');d=ImageDraw.Draw(s)
    for i,r in enumerate(rows):
        s.paste(panel(p/r['file'],(460,340),True),(i%3*460,i//3*370+30))
        d.text((i%3*460+8,i//3*370+6),f'Head {x} gaze {r["gaze"]}',font=font,fill='#111')
    s.save(p/f'gaze-head{x}.jpg',quality=95)
s=Image.new('RGB',(1500,810),'#f1f3f5');d=ImageDraw.Draw(s)
for row,x in enumerate([0,-30,30]):
    for col,r in enumerate([r for r in records if r['kind']=='blink' and r['headX']==x]):
        s.paste(panel(p/r['file'],(300,222),True),(col*300,row*270+45))
        d.text((col*300+8,row*270+5),f'Head {x} blink {r["inputBlink"]}',font=font,fill='#111')
        d.text((col*300+8,row*270+24),f'Eye {r["actualOutput"][0]:.4f}',font=font,fill='#111')
s.save(p/'blink-comparison.jpg',quality=95)

assets=[]
# v09 model files were removed at the user's request; use the recorded SHA baseline.
baseline={r['relative']:r['sha256'].lower() for r in json.loads((qa/'baseline-v09.json').read_text())['files']}
for p in sorted((job/'runtime').rglob('*')):
    if p.is_file():
        rel=p.relative_to(job/'runtime');sha=lambda x:hashlib.sha256(x.read_bytes()).hexdigest()
        assets.append({'file':rel.as_posix(),'v09':baseline[rel.as_posix()],'v10':sha(p),'changed':sha(p)!=baseline[rel.as_posix()]})
assert [r['file'] for r in assets if r['changed']]==['motions/exp_05.exp3.json']
(qa/'asset-change-manifest.json').write_text(json.dumps({'changed':['motions/exp_05.exp3.json'],'files':assets},indent=2))
print(json.dumps({'expressionFrames':35,'combinationFrames':len(records),'blinkChecks':15,'rgbaUnchanged':comparison,'changedFiles':['motions/exp_05.exp3.json']},indent=2))
