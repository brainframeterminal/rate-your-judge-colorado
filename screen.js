// Comment screen, run before a comment is stored. Three outcomes:
//   'block' → not stored; the person is asked to rewrite (insults/swearing, contact details, links, case numbers, too short)
//   'hold'  → stored hidden; only the author and moderators see it until a moderator decides (possible private names,
//             threats, accusations of crimes, shouting)
//   'ok'    → shown right away, marked "Not reviewed yet"; a moderator later approves or removes it
// Rules only, EN + ES. Deliberately strict on 'hold': a moderator releasing a held comment costs a click; a private name
// on a public page costs a person.

const norm = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[@4]/g, 'a').replace(/[3]/g, 'e').replace(/[1!|]/g, 'i').replace(/[0]/g, 'o').replace(/[$5]/g, 's').replace(/[*#]/g, '');

// swearing, slurs and insulting slang (stems; matched at word start after normalisation)
const PROFANE = ['fuck', 'fuk', 'fck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cunt', 'piss', 'crap', 'damn', 'douche', 'jackass',
  'motherf', 'retard', 'moron', 'idiot', 'stupid', 'dumbass', 'scum', 'pig$', 'pigs$', 'clown', 'ass$', 'asses$', 'cocksuck', 'cock$', 'nazi', 'whore', 'slut', 'fag', 'nigg', 'spic',
  'wetback', 'chink', 'kike', 'tranny', 'wtf', 'stfu', 'lmao', 'lmfao', 'bs ',
  'puta', 'puto', 'mierda', 'pendej', 'cabron', 'chinga', 'joder', 'cono$', 'culero', 'verga', 'maric', 'estupid', 'idiota', 'imbecil', 'pinche', 'mamon'];
const THREAT = ['kill', 'shoot', 'murder', 'bomb', 'hurt him', 'hurt her', 'find you', 'watch your back', 'deserves to die', 'should die', 'hang him', 'hang her',
  'matar', 'te voy a', 'muerte a'];
const CRIME = ['corrupt', 'bribe', 'bribed', 'took money', 'paid off', 'crook', 'fraud', 'racist', 'cocaine', 'drunk', 'on drugs',   // not 'criminal'/'illegal': 'my criminal case', 'an illegal search' are ordinary court talk
  'corrupto', 'soborno', 'sobornado', 'fraude', 'racista', 'borracho', 'drogado'];

const RX = {
  email: /[\w.+-]+@[\w-]+\.[\w.-]+|\b(at|arroba)\s+\w+\s+(dot|punto)\s+(com|net|org|edu|gov|us)\b/i,   // also "jane dot doe at gmail dot com"
  phone: /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\b\d{3}[\s.-]\d{4}\b/,                  // also the 7-digit local "555-1234"
  link: /\b(https?:\/\/|www\.)\S+|\b[\w-]+\.(com|net|org|gov|us|info|io|co)\b|\b[\w-]+\.(ly|me|gl|link|app|site|xyz|tv|to)\/\S*/i,   // also bit.ly/…
  caseNo: /\b(19|20)?\d{2}\s?(CR|CV|DR|JV|JD|M|T|PR|C|D|J|CA|SC|SA)\s?-?\d{3,6}\b|\bcase\s*(no\.?|number|#)\s*\S+/i,
  address: /\b\d{2,6}\s+[A-Z][a-z]+(\s[A-Z][a-z]+)*\s(St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane|Ct|Way|Pl)\b|\b\d{2,6}\s+[a-z]+(\s[a-z]+)?\s(street|avenue|road|boulevard|drive|lane)\b/,   // also "123 main street"
};
// capitalised words that are not personal names
const NOT_NAMES = new Set(('I Judge Justice Court Courtroom County District Attorney Deputy DA Colorado Denver Mr Mrs Ms Dr The A An This That He She They We It ' +
  'My Our His Her Their When Then After Before During Today Yesterday Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March ' +
  'April May June July August September October November December Spanish English Honor Your Prosecutor Defense Public Defender Jury Sheriff Police ' +
  'El La Los Las Un Una Juez Jueza Fiscal Corte Tribunal Sala Condado Distrito Mi Su Hoy Ayer Lunes Martes Miercoles Jueves Viernes Sabado Domingo ' +
  'Adams Alamosa Arapahoe Archuleta Baca Bent Boulder Broomfield Chaffee Cheyenne Clear Creek Conejos Costilla Crowley Custer Delta Dolores Douglas Eagle ' +
  'Elbert El Paso Fremont Garfield Gilpin Grand Gunnison Hinsdale Huerfano Jackson Jefferson Kiowa Kit Carson Lake Plata Larimer Animas Lincoln Logan ' +
  'Mesa Mineral Moffat Montezuma Montrose Morgan Otero Ouray Park Phillips Pitkin Prowers Pueblo Rio Blanco Grande Routt Saguache San Juan Miguel ' +
  'Sedgwick Summit Teller Washington Weld Yuma Springs Grand Junction Aurora Lakewood Golden Brighton Castle Rock Littleton Centennial').split(/\s+/));

// a trailing '$' means whole word only ('cono$' must not catch 'conozco', 'pig$' not 'pigeon')
const hasStem = (t, list) => list.find(w => { const whole = w.endsWith('$'), b = (whole ? w.slice(0, -1) : w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z])' + b + (whole ? '([^a-z]|$)' : '')).test(t); });

export function screen(text, officialName = '') {
  const s = String(text || '').trim(), t = norm(s);
  if (s.length < 15) return { verdict: 'block', reason: 'short' };
  const tj = t.replace(/\b(?:[a-z][.\-_]){2,}[a-z]\b/g, m => m.replace(/[.\-_]/g, ''));   // "s.h.i.t" / "s-h-i-t" → "shit"
  const p = hasStem(t, PROFANE) || hasStem(tj, PROFANE); if (p) return { verdict: 'block', reason: 'language' };
  for (const k of ['email', 'phone', 'link', 'caseNo', 'address']) if (RX[k].test(s)) return { verdict: 'block', reason: k === 'link' ? 'link' : 'contact' };
  if (hasStem(t, THREAT)) return { verdict: 'hold', reason: 'threat' };
  if (hasStem(t, CRIME)) return { verdict: 'hold', reason: 'accusation' };
  const letters = s.replace(/[^A-Za-z]/g, ''); if (letters.length > 20 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) return { verdict: 'hold', reason: 'shouting' };
  // possible private names: a capitalised word that is not a known non-name and not part of the official's own name,
  // next to another capitalised word or after a naming phrase ("my son", "named", "Mr."...)
  const own = new Set(String(officialName).split(/\s+/).map(w => w.replace(/\W/g, '')).filter(Boolean));
  const words = s.split(/\s+/).map(w => w.replace(/[^\p{L}'’-]/gu, ''));
  const cap = w => /^\p{Lu}\p{Ll}+$/u.test(w) && !NOT_NAMES.has(w) && !own.has(w);
  for (let i = 0; i < words.length; i++) {
    const prev = (words[i - 1] || '').toLowerCase(), prev2 = ((words[i - 2] || '') + ' ' + prev).toLowerCase();
    const prevRaw = s.split(/\s+/)[i - 1] || '';
    const sentenceStart = i === 0 || (/[.!?]$/.test(prevRaw) && !/^(mr|mrs|ms|dr|sr|sra|srta)\.$/i.test(prevRaw));   // "Mr. Smith": the dot is not a sentence end
    if (cap(words[i]) && (cap(words[i + 1] || '') || /^(mr|mrs|ms|miss|dr|named|called|llamado|llamada|senor|senora|sr|sra|neighbor|neighbour|prosecutor|attorney|lawyer|officer|deputy|detective|caseworker|clerk|counselor|abogado|abogada|vecino|vecina|oficial|fiscal)$/.test(prev) ||
        /(my|our|his|her|the) (son|daughter|wife|husband|brother|sister|mother|father|child|kid|friend|ex|victim|witness)|mi (hijo|hija|esposa|esposo|hermano|hermana|madre|padre)/.test(prev2)) && !(sentenceStart && !cap(words[i + 1] || '')))
      return { verdict: 'hold', reason: 'name' };
  }
  return { verdict: 'ok' };
}

export const SCREEN_MESSAGES = {     // shown to the person (server → client; client translates via i18n SRV map)
  short: 'Please add a sentence about what happened in the courtroom.',
  language: 'Please rewrite this without insults or swear words. Harsh but factual criticism is fine.',
  contact: 'Please remove phone numbers, e-mails, addresses and case numbers.',
  link: 'Please remove links from your comment.',
};
