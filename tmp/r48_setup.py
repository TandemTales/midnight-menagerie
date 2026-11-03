from pathlib import Path
import os, subprocess, json
repo=Path.cwd(); root=Path('D:/UILOOP/r48-20261029')
root.mkdir(exist_ok=False)
def git(*args,env=None):
 return subprocess.check_output(['git','-C',str(repo),*args],env=env).decode().strip()
env=os.environ.copy();env['GIT_INDEX_FILE']=str(root/'baseline.index')
git('read-tree','HEAD',env=env)
git('add','-u',env=env)
git('add','--','game/src','game/assets',env=env)
tree=git('write-tree',env=env); parent=git('rev-parse','HEAD')
sha=git('commit-tree',tree,'-p',parent,'-m','Round 48 isolated baseline: preserve current game and user changes',env=env)
git('update-ref','refs/heads/codex/r48-current-baseline',sha)
(root/'manifest.json').write_text(json.dumps({'repo':str(repo),'base':sha,'parent':parent,'baseline':'ONYX','builders':{'a':'AMETRINE','b':'HELIODOR','c':'IOLITE'},'ports':{'baseline':9480,'a':9481,'b':9482,'c':9483}},indent=2))
env2=os.environ.copy();env2['GIT_LFS_SKIP_SMUDGE']='1'
for slot in ['base','a','b','c']:
 dest=root/slot
 args=['git','-C',str(repo),'worktree','add']
 if slot=='base':args+=['--detach',str(dest),sha]
 else:args+=['-b','codex/r48-'+slot,str(dest),sha]
 subprocess.run(args,env=env2,check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'root':str(root),'base':sha,'worktrees':[str(root/x) for x in ['base','a','b','c']]}))
