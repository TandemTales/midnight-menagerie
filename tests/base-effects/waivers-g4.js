/* Base-effect waivers, group 4 (taffy, bones, pudding, marmalade, truffle). OWNER: companion-cards.
   [id, 'why the gate's one seeded board cannot show it'] - each one is proved
   live by proofs-g4.html (python tests/base-effects/run.py g4). */
export default [
  ['marmalade/all-nine', 'Lives are seeded at 9, so restoring them to 9 changes nothing'],
  ['taffy/spit-take', 'the Belly is empty, so there is nothing to Spit Out'],
  ['taffy/sample-size', 'the hand holds only Basic Tricks, so there is no Common to copy'],
  ['taffy/chew-slowly', 'no Stretched Trick is in hand'],
  ['taffy/regurgitate', 'the Belly is empty'],
  ['taffy/taste-memory', 'the Belly is empty, so there is no Absorbed Trick to copy'],
  ['taffy/borrowed-price', 'the Belly is empty, so there is nothing to swap a cost with'],
  ['taffy/overstretch', 'no Stretched Trick is in hand'],
  ['taffy/let-it-sag', 'no Stretched Trick is in hand'],
  ['taffy/mouthfeel', 'the Belly is empty'],
  ['taffy/stretch-transfer', 'no Stretched Trick is in hand to move it from'],
  ['taffy/copycat-cannon', 'the Belly is empty, so there is no Absorbed Attack to copy'],
  ['taffy/spit-the-whole-bag', 'the Belly is empty'],
  ['taffy/perfect-replica', 'the Belly is empty, so there is no Absorbed Trick to copy'],
  ['taffy/cross-flavor', 'the Belly is empty, so there is no Absorbed Trick to copy'],
  ['taffy/keep-the-wrapper', 'no Gummy copy is in hand'],
];
