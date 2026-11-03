async function(id,prompt,args={}){
const base="C:\\Users\\Josh\\OneDrive\\Desktop\\Tandem Tales\\Midnight Menagerie\\docs\\enemy-roster-2026-10-26\\art-production\\";
async function run(cmd){let r=await tools.exec_command({cmd,max_output_tokens:150});while(r.session_id&&r.exit_code===undefined){r=await tools.write_stdin({session_id:r.session_id,chars:"",yield_time_ms:1000,max_output_tokens:150});}if(r.exit_code!==0)throw new Error(JSON.stringify(r));return r;}
const safePrompt=prompt.replace(/[\u2018\u2019]/g,"'").replaceAll("'","''");
await run("if (Test-Path -LiteralPath '"+base+id+"-original.png') { throw 'Refuse overwrite' }; [System.IO.File]::WriteAllText('"+base+id+"-prompt.txt','"+safePrompt+"')");
const r=await tools.image_gen__imagegen({prompt,transparent_background:true,...args});store(id,r);generatedImage(r);
const data=r.image_url.split(",")[1];
for(let i=0;i<data.length;i+=16000){await run("[System.IO.File]::"+(i===0?"WriteAllText":"AppendAllText")+"('"+base+id+"-original.b64','"+data.slice(i,i+16000)+"')");}
text(await run('python -c "from pathlib import Path; import base64; p=Path(\'docs/enemy-roster-2026-10-26/art-production/'+id+'-original.b64\'); q=p.with_suffix(\'.png\'); assert not q.exists(); q.write_bytes(base64.b64decode(p.read_text())); print(\''+id+': original saved\')"'));
return {id,saved:true};
}
