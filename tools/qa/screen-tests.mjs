// Comment screen regression cases (audit 2026-10-16). Run: node tools/qa/screen-tests.mjs
import { screen } from '../../screen.js';
const cases = [
  ['he said Mr. Smith was lying about everything in the hearing', 'hold'],
  ['Ms. Johnson was the clerk and she lost my paperwork twice', 'hold'],
  ['Dr. Patel testified for over an hour and the judge cut him off', 'hold'],
  ['the prosecutor Smith lied to the court about the evidence', 'hold'],
  ['My neighbor Karen reported me and the judge believed her story', 'hold'],
  ['call me at 555-1234 if you want to talk about this judge', 'block'],
  ['I live at 123 main street and the judge ignored my evidence', 'block'],
  ['write to jane dot doe at gmail dot com for details on this case', 'block'],
  ['see bit.ly/abc123 for the recording of the whole hearing', 'block'],
  ['this judge is a s.h.i.t person and should not be on the bench', 'block'],
  ['what an ass this judge was to everyone in the courtroom today', 'block'],
  ['Conozco a la jueza y fue justa con todos en la sala de audiencias', 'ok'],
  ['Es un juez conocido por escuchar a las dos partes con calma', 'ok'],
  ['A pigeon flew into the courtroom and the judge handled it calmly', 'ok'],
  ['The judge explained every step and let both sides speak fully', 'ok'],
  ['Judge Ernst denied the motion to try the juvenile as an adult', 'ok'],
  ['The hearing started 40 minutes late and nobody told us why', 'ok'],
  ['we tried getting her back because her foster parents abuse her and nobody listened', 'hold'],
  ['the foster dad was let go as an EMT and he molested kids in his care', 'hold'],
  ['El padrastro abusa de la niña y el juez no quiso escuchar a nadie', 'hold'],
  ['The judge abused his discretion and ignored the evidence we brought', 'ok'],
  ['I am a domestic violence victim and the abuse was ignored at the hearing', 'ok'],
  ['we had witnesses to the abuse and files of complaints from other parents', 'ok'],
  ['El juez violó mis derechos y no me dejó hablar en la audiencia', 'ok'],
];
let bad = 0;
for (const [txt, want] of cases) { const got = screen(txt, 'Judge Allison P. Ernst').verdict; const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${want.padEnd(5)} got ${got.padEnd(5)}  ${txt}`); }
console.log(bad ? `${bad} FAILED` : 'ALL PASSED'); process.exitCode = bad ? 1 : 0;
