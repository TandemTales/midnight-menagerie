from pathlib import Path
p=Path('docs/enemy-roster-2026-10-26/animation-production/build_hall_mirror_rig.py')
s=p.read_text(encoding='utf-8').replace("parent/'representative-v3'","parent/'representative-v4'")
s=s.replace('Signed reflection\nlayers are articulated over an empty-glass plate sampled from the source\'s own glass.', 'Explicit premultiplied character\nlayers are articulated over an empty-glass plate sampled from the source\'s own glass.')
a=s.index('residual=rgb-base');b=s.index('\ndef affine(',a)
s=s[:a]+'''# Explicit character silhouettes replace signed background subtraction. No moving
# negative residual or sampled glass texture is allowed above the head.
head_alpha=polygon([(548,564),(566,521),(591,481),(627,448),(670,427),(709,414),(730,420),(740,443),(745,478),(740,518),(724,564),(705,602),(680,620),(651,622),(628,632),(612,648),(593,654),(571,639),(552,617)],3)*glass
hand_alpha=polygon([(675,652),(669,643),(675,637),(684,642),(689,649),(692,631),(697,616),(704,616),(709,624),(706,643),(714,624),(721,625),(721,634),(715,650),(727,641),(735,644),(735,652),(725,666),(718,678),(710,688),(698,692),(685,686),(679,678)],2)*glass
body_alpha=polygon([(551,575),(574,600),(599,620),(615,641),(630,685),(642,701),(663,693),(682,678),(711,683),(714,703),(697,731),(671,749),(635,761),(595,767),(561,759),(548,713),(545,654)],5)*glass
# Overlapping neck/wrist portions are kept behind the moving head and hand.
def layer(color,matte):return np.dstack([color*matte[:,:,None],matte]).astype(np.float32)
body=layer(rgb,body_alpha);hand=layer(rgb,hand_alpha)
'''+s[b:]
s=s.replace('for c in range(3)],axis=-1)\n\ndef eyelid_patch', 'for c in range(layer.shape[2])],axis=-1)\n\ndef eyelid_patch')
a=s.index('def eyelid_patch():');b=s.index('\ndef smooth(',a)
s=s[:a]+'''# Build skin patches by harmonic interpolation from surrounding painted skin.
# Iris pixels remain fully visible until physically covered by the lid boundary.
EYES=[]
for cx,cy,rx,ry in [(617,531,34,43),(685,572,28,37)]:
 ex,ey=P(cx,cy);ang=math.radians(28);co,si=math.cos(ang),math.sin(ang)
 u=((X-ex)*co+(Y-ey)*si)/S;v=(-(X-ex)*si+(Y-ey)*co)/S
 ellipse=(u/rx)**2+(v/ry)**2
 inner=ellipse<1
 # Work only in a small crop, avoiding a full-canvas iterative fill.
 ys,xs=np.where(inner);y0,y1=max(0,ys.min()-2),min(H,ys.max()+3);x0,x1=max(0,xs.min()-2),min(W,xs.max()+3)
 field=rgb[y0:y1,x0:x1].copy();hole=inner[y0:y1,x0:x1]
 border=ndi.binary_dilation(hole)&~hole
 field[hole]=field[border].mean(axis=0)
 for iteration in range(350):
  mean=(np.roll(field,1,0)+np.roll(field,-1,0)+np.roll(field,1,1)+np.roll(field,-1,1))*.25
  field[hole]=mean[hole]
 skin=rgb.copy();skin[y0:y1,x0:x1]=field
 EYES.append((u,v,rx,ry,ellipse,skin))
def head_layer(closure):
 art=rgb.copy()
 if closure>0:
  for u,v,rx,ry,ellipse,skin in EYES:
   curve=6+5*(1-np.minimum(1,(u/rx)**2))
   upper=-ry*(1-closure)+curve*closure
   lower=ry*(1-closure)+curve*closure
   # 1.2 source-pixel antialiasing only; no uniform pupil crossfade.
   cover=np.maximum(np.clip((upper-v)/1.2+.5,0,1),np.clip((v-lower)/1.2+.5,0,1))
   edge=np.clip((1-ellipse)/.08,0,1);cover*=edge
   art=art*(1-cover[:,:,None])+skin*cover[:,:,None]
   line=np.exp(-((v-upper)/1.1)**2)*edge*min(1,closure*4)
   art=art*(1-line[:,:,None])+np.array([74,44,105])*line[:,:,None]
 return layer(art,head_alpha)
# Enlarged closure sequence documents the occluding boundary for visual review.
eye_contact=Image.new('RGB',(5*210,270),(30,30,38));ed=ImageDraw.Draw(eye_contact)
for j,closed in enumerate([0,.25,.5,.75,1]):
 l=head_layer(closed);a=l[:,:,3];c=base*(1-a[:,:,None])+l[:,:,:3]
 c=np.dstack([np.uint8(np.clip(c,0,255)),np.uint8(alpha)])
 x0,y0=P(540,405);x1,y1=P(750,650)
 f=Image.fromarray(c,'RGBA').crop((round(x0),round(y0),round(x1),round(y1))).resize((210,245),Image.Resampling.LANCZOS)
 eye_contact.paste(f,(j*210,0),f);ed.text((j*210+8,250),'Closure '+str(closed),fill='white')
eye_contact.save(OUT/'eyelid-occlusion-contact.jpg')
'''+s[b:]
a=s.index(' a=affine(body,');b=s.index('\n # Small reflection-contact',a)
s=s[:a]+''' posed=[affine(body,(620,718),dx,dy,sy=bodyheight),
        affine(head_layer(blink),(643,546),dx+hdx,dy+hdy,ha,sx=headscale,sy=headscale),
        affine(hand,(682,691),dx+wdx,dy+wdy,wa)]
 result=base.copy()
 for part in posed:
  amount=opacity*glass;pa=np.clip(part[:,:,3]*amount,0,1)
  result=result*(1-pa[:,:,None])+part[:,:,:3]*amount[:,:,None]
'''+s[b:]
s=s.replace('wdy=-17*lift;wdx=-4*lift','wdy=-25*lift;wdx=-4*lift;hdx=-4*lift')
s=s.replace('(18*math.sin((t-.34)/.38*4*math.pi)', '(24*math.sin((t-.34)/.38*4*math.pi)')
s=s.replace('Source-art 2D layered rig; static authentic gold frame, articulated reflection head/body/palm, hand-authored eyelid closure, local reflection effects.', 'Source-art 2D layered rig; static authentic gold frame, explicit alpha-composited reflection head/body/palm, physically occluding eyelids, local reflection effects. No signed background residuals.')
p.write_text(s,encoding='utf-8')
