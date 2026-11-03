from pathlib import Path
p=Path('docs/enemy-roster-2026-10-26/animation-production/build_hall_mirror_rig.py');s=p.read_text()
s=s.replace("parent/'representative-v4'","parent/'representative-v5'")
s=s.replace('(705,602),(680,620),(651,622),(628,632),(612,648),(593,654)', '(707,595),(689,606),(668,612),(648,615),(631,622),(619,632),(610,641),(593,648)')
s=s.replace('body=layer(rgb,body_alpha);hand=layer(rgb,hand_alpha)', '''# The torso is translucent source paint. Reject dark inter-arm glass rather
# than carrying it as an opaque patch when the wrist/head move.
brightness=(rgb[:,:,0]+rgb[:,:,1])*.5
body_strength=np.clip((brightness-58)/80,0,1);body_strength=body_strength*body_strength*(3-2*body_strength)
body_alpha*=body_strength
body=layer(rgb,body_alpha);hand=layer(rgb,hand_alpha)''')
s=s.replace('[(617,531,34,43),(685,572,28,37)]','[(617,531,40,49),(685,572,33,42)]')
s=s.replace('inner=ellipse<1','mouth_guard=(((X-TX)/S>615)&((X-TX)/S<665)&((Y-TY)/S>574)&((Y-TY)/S<604))\n inner=(ellipse<1)&~mouth_guard')
s=s.replace('EYES.append((u,v,rx,ry,ellipse,skin))','EYES.append((u,v,rx,ry,ellipse,skin,mouth_guard))')
s=s.replace('for u,v,rx,ry,ellipse,skin in EYES:','for u,v,rx,ry,ellipse,skin,mouth_guard in EYES:')
s=s.replace('edge=np.clip((1-ellipse)/.08,0,1);cover*=edge','edge=np.clip((1-ellipse)/.08,0,1)*(~mouth_guard);cover*=edge')
s=s.replace('line=np.exp(-((v-upper)/1.1)**2)*edge*min(1,closure*4)','line=np.exp(-((v-upper)/1.1)**2)*edge*min(1,closure*4)*np.clip((rx*.78-np.abs(u))/2,0,1)')
p.write_text(s,encoding='utf-8')
