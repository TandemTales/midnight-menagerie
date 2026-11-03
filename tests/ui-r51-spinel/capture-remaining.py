import sys,subprocess,json,shutil,os,time
from pathlib import Path
root=Path('D:/UILOOP/r51-20261029')
wt=Path(sys.argv[1]);port=sys.argv[2];code=sys.argv[3]
out=root/'judging'/code;out.mkdir(parents=True,exist_ok=True)
results=[{'screen':'rest','exit':0,'sourceCommit':'46ff398e5b63a0afab149a3c269900a684e5adaa'},{'screen':'rest-1280','exit':0,'sourceCommit':'46ff398e5b63a0afab149a3c269900a684e5adaa'}]
for scene in ['event','gameover','shop','combat-floaters']:
 for w,h in [(1600,900),(1280,800)]:
  name=scene+('-1280' if w==1280 else '')
  args=[sys.executable,str(root/'chrome.py'),'tools/shot.py',code+'-'+name,'--port',port,'--scene','combat' if scene=='combat-floaters' else scene,'--seed','7','--companion','bones','--kid','maya','--w',str(w),'--h',str(h),'--wait','8' if scene=='combat-floaters' else '3','--warm-timeout','150']
  if scene in ['rest','event','gameover']:args+=['--hash','pics=1']
  if scene=='combat-floaters':args+=['--encounter','foyer-boss','--script','@D:/UILOOP/r51-20261029/combat-capture.js','--steps','wait:0']
  env=os.environ.copy();env['PYTHONIOENCODING']='utf-8'
  with (out/(name+'.log')).open('w',encoding='utf-8') as log:
   try: r=subprocess.run(args,cwd=wt,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=600);rc=r.returncode
   except subprocess.TimeoutExpired:rc=124
  for ext in ['png','state.json','console.txt']:
   source=wt/'shots'/(code+'-'+name+'.'+ext)
   if source.exists():shutil.copy2(source,out/(name+'.'+ext))
  results.append({'screen':name,'exit':rc});print(code,name,rc,flush=True)
  (out/'capture-results.json').write_text(json.dumps(results,indent=2))
