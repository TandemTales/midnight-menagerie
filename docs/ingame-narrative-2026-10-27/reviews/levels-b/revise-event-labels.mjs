import fs from 'node:fs';
import {CURIOSITIES} from '../../../../game/src/data/events.js';
const copy={
 'scratching-behind-the-wall':{open:['Up to 6 Courage, or a Curse','Possible Buttons, Keepsake, or Clues'],call:['Up to 4 Courage','Clues; possibly 15 Buttons'],feed:['25 Buttons','A Keepsake and a Clue']},
 'the-collar':{take:['5 or 12 Courage','A Keepsake and a Clue']},
 'the-feeding-room':{fill:['30 Buttons','A Keepsake and a Clue'],read:['Up to 6 Courage','Clues; possibly 4 maximum Courage'],wait:['Up to 14 Courage','A Clue, plus a Keepsake or Snack']},
 'the-photograph':{photograph:['7 Courage','3 Clues and a Keepsake'],take:['Up to 10 Courage','2 Clues; possibly 5 maximum Courage'],ask:['Up to 4 Courage','Maximum Courage and a Clue; possible healing']},
 'the-house-register':{find:['Up to 6 Courage','Clues, plus maximum Courage or healing'],tear:['A Scuffle, or 8 Courage and a Curse','Possibly 4 Clues'],sign:['4 maximum Courage','A Keepsake']},
 'the-bell-pull':{ring:['A possible Big Scare','60 Buttons, or 2 Snacks and healing']},
 'the-umbrella-fort':{build:['Nothing','Healing and one Trick sharpened'],search:['Up to 9 Courage','40–70 Buttons; possibly a Clue']},
 'the-cat-flap':{look:['Up to 10 Courage','Clues; possibly healing instead'],whistle:['35 Buttons','A Keepsake, 2 Clues and healing'],reach:['Up to 6 Courage','A Keepsake and healing; or maximum Courage and a Clue']},
 'the-dumbwaiter':{'send-things':['55 Buttons','A Keepsake; or 10 Buttons and 2 Clues'],'send-toy':['Nothing','4 Clues, 8 maximum Courage and healing'],ride:['6 or 16 Courage','90 Buttons, or a Keepsake']},
 'the-lost-and-found':{grab:['13 Courage, or a Curse','45–130 Buttons'],collars:['4 Courage','3 Clues and 30 Buttons'],ring:['Up to 6 maximum Courage','A Keepsake; possibly a Clue']},
 'moths-cousin':{'buy-blind':['80 Buttons','A Rare Keepsake; or a Common Keepsake and Snack'],'ask-moth':['Up to 20 Buttons','45 Buttons and a Clue; or a Keepsake']},
 'the-open-window':{follow:['Up to 12 Courage','Buttons and Clues']},
 'the-coat-with-something-in-it':{pockets:['Up to 11 Courage','45–85 Buttons; possibly a Clue'],unbutton:['Possibly 8 Courage and a Curse','A Keepsake and Snack; or 30 Buttons']},
 'the-stair-cat':{ask:['Up to 3 Courage','Maximum Courage, plus Clues or healing']},
 'the-mended-thing':{no:['7 Courage','3 Clues and one Trick sharpened']},
 'the-nights-arithmetic':{fix:['8 maximum Courage, or one Trick','A Rare Keepsake, or 120 Buttons'],rub:['Nothing','Healing and 10 Buttons']},
};
let source=fs.readFileSync('game/src/data/events.js','utf8');
const literal=s=>s.includes('Buttons')?'`'+s.replaceAll('Buttons','${TERMS.gold}')+'`':JSON.stringify(s);
for(const [i,e]of CURIOSITIES.entries()){
 const start=source.indexOf("id: '"+e.id+"'");
 const end=i+1<CURIOSITIES.length?source.indexOf("id: '"+CURIOSITIES[i+1].id+"'",start):source.indexOf('\n];',start);
 let block=source.slice(start,end);
 for(const [j,o]of e.options.entries()){
  const edit=copy[e.id]?.[o.id];if(!edit)continue;
  const a=block.indexOf("id: '"+o.id+"'");
  const b=j+1<e.options.length?block.indexOf("id: '"+e.options[j+1].id+"'",a):block.length;
  let option=block.slice(a,b);
  for(const [k,value]of [['risk',edit[0]],['reward',edit[1]]]){
   const re=new RegExp(k+": (?:'(?:[^'\\\\]|\\\\.)*'|`[^`]*`|\"(?:[^\"\\\\]|\\\\.)*\"),");
   if(!re.test(option))throw Error('Missing '+e.id+'/'+o.id+'/'+k);
   option=option.replace(re,k+': '+literal(value)+',');
  }
  block=block.slice(0,a)+option+block.slice(b);
 }
 source=source.slice(0,start)+block+source.slice(end);
}
source=source.replace('your nerve for a moment','your Courage for a moment');
fs.writeFileSync('game/src/data/events.js',source);
