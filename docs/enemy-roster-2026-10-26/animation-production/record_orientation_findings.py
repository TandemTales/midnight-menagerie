from pathlib import Path
import json,datetime
P=Path(__file__).resolve().parent;D=P/'orientation-audit';audit=json.loads((D/'orientation-audit.json').read_text())
observed={
 'butler':'Profile, serving hand and cast point left in inspected runtime poses; no renderer flip.',
 'patchwork-soldier':'Three-quarter left ready stance and sword thrust left; no renderer flip; preserve sword/shield handedness.',
 'coatrack-crawler':'Leading coat/sleeve projects left in rest and attack; rack is not treated as directionless.',
 'slipper-skitter':'Renderer already reflects every clip; toes/eyes and attack read left in the resulting contacts. Do not double-flip.',
 'blanket-hydra':'Renderer already reflects every clip; leading heads and breath effect read left. Do not double-flip.'}
specific={
 'dust-bunny':'Frontal gaze and mouth burst; needs leftward gaze/action staging.',
 'lost-luggage':'Frontal opening mouth. Tags and stamp-like marks require preservation; do not blanket-flip text.',
 'red-carpet-runner':'Roll opens upward/frontally; redirect curl and forward action left.',
 'door-greeter':'Frontal carved face and rotating door; needs left-directed look/swing while retaining hinges and lock.',
 'button-baby':'Frontal doll and rightward reaching pose; requires pose work, not symmetry claim.',
 'jack-in-the-box':'Frontal face and rightward extended hand; preserve box crank position in directional pose work.',
 'blanket-blob':'Frontal eyes and centered glow; require leftward gaze/effect.',
 'patchwork-giant':'Frontal collection of faces and a rightward punch; require directional body/arm work.',
 'toy-chest':'Frontal face/opening and centered burst; preserve contents while directing action left.',
 'governess':'Mixed direction: leftward attack gesture but rightward cast/scissors. Whole-clip mirroring would invert the other action; author each state coherently.',
 'wardrobe-guest':'Frontal glowing eyes and right door/hand opening; needs leftward gaze/reach without reversing door construction.',
 'blanket-creeper':'Frontal grasping hands/face; requires leftward pose design.',
 'the-wardrobe':'Frontal cabinet with arms/effects on both sides; needs an explicit leftward action cue.',
 'dough-blob':'Frontal faces and non-directional reaching; needs leftward gaze/gesture.',
 'candy-clump':'Frontal face and forward-centered mouth light; needs leftward staging.',
 'jam-jar':'Frontal eyes and rightward goo arm. Preserve tag marks; selective pose correction is needed.',
 'pantry-mimic':'Frontal eyes/opening mouth; preserve label-like decoration and direct the action left.',
 'sugar-golem':'Frontal face with bilateral fists/effects; needs leftward gaze and committed gesture.',
 'oven-maw':'Mouth flame visibly travels right. Unlettered mechanical appliance can use a framewise reflected derivative; existing renderer does not flip this ID.',
 'confectioner':'Attack pastry effect travels right. Preserve unique held utensils and art identity; needs state-specific pose correction.',
 'creeping-ivy':'Frontal face and center/right vine reach; needs leftward gaze and leading tendril.',
 'compost-colossus':'Frontal face and bilateral glowing fists; needs leftward gaze and directional attack.',
 'ancient-topiary':'Body reads near-front/three-quarter; a leftward leading gaze and fist are not established in all sampled states. Detailed pose work/review required.',
 'carnivorous-conservatory':'Frontal central mouth and mixed side mouths; needs a consistent left-directed main mouth/action.'}
decisions={}
for e in audit['legacy_enemies']:
 eid=e['enemy'];decisions[eid]={'status':'left_in_sampled_runtime_poses' if eid in observed else 'left_derivative_or_pose_correction_required','evidence':observed.get(eid,specific.get(eid,'Detailed direction review required.'))+' Contacts: orientation-audit/'+e['contact_page'],'limits':'Eight selected poses reviewed, not every temporal frame or full-speed runtime. No original asset or gameplay changed.','runtime_mirrored':e['runtime_mirrored']}
for eid,note in {'hall-mirror':'Source pupils already look left; new palm extension and glints must travel left.','crib-curtains':'Symmetric opening does not suffice; panels must gather right then sweep left.','foyer-chandelier':'Resting fixture requires a leftward flame/lean cue; attack must swing left.','hanging-pots':'Bowls need to open left and the staggered strikes must travel left.','garden-shears':'Blade ready stance, snip and closed recovery must point left without reversing tool handedness.'}.items():
 decisions[eid]={'status':'left_orientation_correction_in_progress','evidence':note,'limits':'No final orientation approval yet.'}
(D/'orientation-decisions.json').write_text(json.dumps(decisions,indent=2),encoding='utf-8')
lines=['SCREEN-LEFT ORIENTATION AUDIT',datetime.datetime.now(datetime.timezone.utc).isoformat(),'', '29 retained enemies / 118 actions inspected through sampled decoded runtime contacts.','Only Slipper Skitter and Blanket Hydra among these 29 are already mirrored by the renderer.','Five identities show left staging in the sampled poses; 24 identities need directional derivatives or pose correction.','These are sampled orientation findings, not final all-frame/full-speed approval.','The previous renderer comment allowed frontal poses; the latest requirement explicitly does not.','No legacy original or gameplay file has been changed.','']
for eid,d in decisions.items():lines += [eid+' — '+d['status'],d['evidence'],'']
lines+=['INTEGRATION RULE','Any prepared legacy derivative must keep the original enemy ID mapping unchanged until a separately authorized integration. Point the loader/asset manifest at the derivative location; do not add a second runtime reflection for IDs already in DRAWN_FACING_RIGHT. Keep original source sheets, atlases and indexes recoverable.','No full-speed browser test: the denied browser URL route remains unused.']
(D/'ORIENTATION-REPORT.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('Recorded 29 legacy findings, 5 sampled-left and 24 requiring correction; all 5 new rigs under orientation correction.')
