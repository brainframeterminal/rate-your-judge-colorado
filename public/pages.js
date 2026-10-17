import { $, h } from './common.js';
import { LANG, onLang } from './i18n.js';
import { captchaHeader, prefetchCaptcha } from './captcha.js';
// Long-form pages (About, How it works, Our method, Security). Content is data: [kind, ...args] blocks, EN + ES.
// Kinds: h2 · p · ul · rows (stacked "title / text" pairs, phone-friendly instead of tables) · src (source links) · note
const SRC = {
  voter: ['State of Colorado, 2024 voter survey report (OJPE)', 'https://judicialperformance.colorado.gov/sites/judicialperformance/files/documents/CO%20Judicial%20Voter%20Survey%20%282024%20Election%29%20Report%20FINAL%201%208%202025.pdf'],
  kuhn: ['A 2024 district judge retention report (OJPE) — Table 1 and “Response Rates”', 'https://judicialperformance.colorado.gov/sites/judicialperformance/files/documents/23%20-%2038083%20-%20Judge%20W.%20Eric%20Kuhn_0.pdf'],
  elliff: ['A 2017 interim report for one judge (OJPE) — Table 4 “Response Rates”', 'https://judicialperformance.colorado.gov/sites/judicialperformance/files/documents/16844%20-%20Judge%20J.%20Eric%20Elliff.pdf'],
  ojpe: ['Colorado Office of Judicial Performance Evaluation', 'https://judicialperformance.colorado.gov/'],
  mdr: ['Market Decisions Research, Portland, Maine (the firm named on the state’s 2024 survey reports)', 'https://www.marketdecisions.com/'],
  ccjd24: ['Colorado Commission on Judicial Discipline, 2024 Annual Report', 'https://ccjd.colorado.gov/sites/ccjd/files/documents/2024%20CCJD%20Annual%20Report-UA.pdf'],
  ccjd23: ['Colorado Commission on Judicial Discipline, 2023 Annual Report', 'https://ccjd.colorado.gov/sites/ccjd/files/documents/2023%20Annual%20Report_2-UA.pdf'],
  iaals: ['ABA Black Letter Guidelines for the Evaluation of Judicial Performance (summary by IAALS)', 'https://iaals.du.edu/node/4014'],
  ri: ['Rhode Island Judiciary, 2023 Access and Fairness Survey (uses the NCSC CourTools Measure 1 items)', 'https://courts.ri.gov/News/Documents/ReportOnThe2023AccessAndFairnessSurvey.pdf'],
  az: ['Arizona Supreme Court Administrative Order 2010-22 (juror and litigant evaluation questions)', 'https://dev-legacy.azcourts.gov/portals/22/admorder/orders10/2010-22.pdf'],
  stanford: ['Stanford Law School, “Rate My District Attorney” (2018)', 'https://law.stanford.edu/wp-content/uploads/2018/01/Rate_My_District_Attorney__January_2018.pdf'],
  ppi: ['Prosecutorial Performance Indicators project', 'https://www.apainc.org/prosecutorial-performance-indicators/'],
  aba: ['ABA Criminal Justice Standards for the Prosecution Function', 'https://www.americanbar.org/groups/criminal_justice/resources/standards/prosecution-function/'],
};
const S = k => SRC[k];

const PAGES = {
  about: {
    en: { h1: ['Why this site ', 'exists'], lead: 'Colorado voters are asked every two years whether judges should keep their jobs. The people who actually watch judges work (people in the case, jurors, observers, attorneys) rarely get a simple way to say what they saw. And voters rarely get a simple way to read it.', blocks: [
      ['h2', 'The problem in three minutes'],
      ['video', 's54P6zUTJQ4', 'Colorado spends ~$800K to rate its judges. We built a better one for $0', 'img/video-about.webp', 'Recorded on 13 October 2026. Since then the site lists real Colorado judges and prosecutors instead of the made-up demo people in the video, and a new comment shows at once, marked “not reviewed yet”, until a moderator approves or removes it.'],
      ['h2', 'What the state does today'],
      ['p', 'Colorado’s Office of Judicial Performance Evaluation (OJPE) and its commissions evaluate judges using surveys, courtroom observation, interviews and public reports. That work matters, and the results are published online.'],
      ['ul', [
        'The surveys are run by a private research firm outside Colorado. The state’s 2024 survey reports name it on the cover: Market Decisions Research of Portland, Maine.',
        'Invitations go out by email. The reports count the emails sent, not the emails that reached an inbox rather than a spam folder.']],
      ['h2', 'What the state’s own numbers show'],
      ['ul', [
        'In the state’s 2024 voter survey (423 voters), 53% knew that judges are evaluated, and only 23% knew the commissions exist. 33% said most voters do not have the information they need.',
        'In the 2024 cycle, 117,355 members of the public were invited by email to evaluate judges. 6,614 responded: 6%.',
        'Jurors and citizens are not sampled evenly. The state’s own report says their response rate “cannot be calculated”, because court staff choose which judges are evaluated and citizens choose to take part.',
        'The number of people behind one judge’s score can be small. One district judge’s 2024 report rests on 42 people, and in it 18 of 1,072 invited attorneys responded. A 2017 report for another judge counts 5 completed juror surveys out of 13 sent.']],
      ['p', 'These are the state’s own published figures. They are not accusations. They are the reason a second, simpler and open way to share what you saw in court is useful.'],
      ['h2', 'Three examples from the state’s own reports'],
      ['p', 'Every official 2024 survey report opens with a table like these, showing how many invitations were sent and how many people answered. The pictures are cropped straight from the state’s PDFs. Tap one to open the whole report.'],
      ['fig', 'img/ojpe-2024-cortez-rodriguez-kimberly.webp', 'Table from the state’s 2024 survey report for Judge Kimberly D. Cortez-Rodriguez, District Court: attorney email invite 174 sent, 16 responses; non-attorney email invite 97 sent, 0 responses; court staff 13; citizen feedback 0; juror survey 0; 30 responses in total.', 'Judge Kimberly D. Cortez-Rodriguez, District Court: 97 email invitations to people other than attorneys, 0 responses.', 'https://judicialperformance.colorado.gov/sites/judicialperformance/files/documents/12%20-%2041608%20-%20Judge%20Kimberly%20D.%20Cortez-Rodriguez-UA%20%282%29.pdf', [1047, 756], '/archive/ojpe/ojpe-2024-cortez-rodriguez-kimberly.pdf', '(our saved copy)'],
      ['fig', 'img/ojpe-2024-eiring-deni.webp', 'Table from the state’s 2024 survey report for Judge Deni E. Eiring, County Court: attorney email invite 96 sent, 2 responses; non-attorney email invite 139 sent, 1 response; court staff 3; citizen feedback 0; juror survey 0; 6 responses in total.', 'Judge Deni E. Eiring, County Court: the whole report rests on 6 people. 96 emails to attorneys brought 2 answers, 139 emails to other people brought 1.', 'https://judicialperformance.colorado.gov/sites/judicialperformance/files/documents/15%20-%2045748%20-%20Judge%20Deni%20E.%20Eiring-UA.pdf', [1047, 756], '/archive/ojpe/ojpe-2024-eiring-deni.pdf', '(our saved copy)'],
      ['fig', 'img/ojpe-2024-schutte-anita.webp', 'Table from the state’s 2024 survey report for Judge Anita M. Schutte, District Court: attorney email invite 574 sent, 14 responses; non-attorney email invite 1,575 sent, 21 responses; court staff 2; citizen feedback 0; juror survey 0; 37 responses in total.', 'Judge Anita M. Schutte, District Court: 1,575 email invitations to people other than attorneys, 21 responses (1.3%).', 'https://judicialperformance.colorado.gov/sites/judicialperformance/files/documents/2%20-%2036476%20-%20Judge%20Anita%20M.%20Schutte-UA.pdf', [1047, 756], '/archive/ojpe/ojpe-2024-schutte-anita.pdf', '(our saved copy)'],
      ['callout', 'These three are not the exception. We read every 2024 report that uses this table: 96 trial-court judges.', [
        'Half of the reports rest on 33 people or fewer. 20 of them rest on 20 people or fewer.',
        'The juror survey row shows 0 in 82 of the 96 reports. Citizen feedback shows 0 in 89.',
        'Across all 96, 37,501 email invitations to people other than attorneys brought 1,234 answers (3.3%). 40,276 email invitations to attorneys brought 1,749 (4.3%).']],
      ['note', 'These numbers describe how the information was collected. They say nothing about the judges themselves.'],
      ['h2', 'What we do differently'],
      ['ul', [
        'You can rate in about 30 seconds, on your phone, in English or Spanish, right after you leave the courtroom.',
        'No account and no name. The site is built to know as little about you as possible.',
        'The questions ask about what people can actually see, not about legal outcomes.',
        'Results are public right away, split by who was rating, and every moderator decision is on the record.',
        'It is an independent, open-source public project made for the residents of Colorado. Anyone can read the code, test it and suggest changes, and the code belongs to the public, not to a company or an agency. Our rule: moderators and maintainers must be verified Colorado residents (the verification process will be published here). Everything is done in the open so that anyone can check it.']],
      ['h2', 'A public record, not only a scorecard'],
      ['p', 'This is not only a scorecard for voters. It is a standing public record, and a record changes behavior on its own: officials act differently when the people they serve can see and compare their work.'],
      ['h2', 'What this site is not'],
      ['ul', [
        'It is independent. It is not part of, endorsed by, or connected to the State of Colorado, its courts or any commission.',
        'It is not an official evaluation and not legal advice. It does not replace the commissions’ work.',
        'Ratings are opinions about conduct in a courtroom. They are not findings of fact.',
        'Comments are the personal opinions of the people who wrote them. We collect them so that anyone who was in court can be heard. A moderator checks that a comment follows our rules, not whether what it says is true. Verify anything important yourself.',
        'The judges and prosecutors here are public officials. Honest opinions about how public officials conduct themselves are protected speech. False statements of fact are not, which is why we ask only about what people saw.',
        'The judges and prosecutors listed are real Colorado officials, taken from the official lists of the Colorado Judicial Branch and the district attorneys’ offices. Every rating comes from a person who used this site.']],
      ['h2', 'Join in'],
      ['p', 'Want to help as a volunteer, programmer, tester, translator, lawyer or by spreading the word? Use the “Get involved” form in the footer. The code will be published as open source before launch, and the repository address will be posted here.'],
      ['src', ['voter', 'kuhn', 'elliff', 'ojpe', 'mdr']]] },
    es: { h1: ['Por qué existe ', 'este sitio'], lead: 'Cada dos años se pregunta a los votantes de Colorado si los jueces deben conservar su cargo. Las personas que realmente ven trabajar a los jueces (partes del caso, jurados, observadores, abogados) casi nunca tienen una forma sencilla de contar lo que vieron. Y los votantes casi nunca tienen una forma sencilla de leerlo.', blocks: [
      ['h2', 'El problema en tres minutos'],
      ['video', 's54P6zUTJQ4', 'Colorado spends ~$800K to rate its judges. We built a better one for $0', 'img/video-about.webp', 'Video en inglés, grabado el 13 de octubre de 2026. Desde entonces el sitio muestra jueces y fiscales reales de Colorado en lugar de las personas inventadas del video, y un comentario nuevo se ve al instante, marcado «aún sin revisar», hasta que un moderador lo aprueba o lo retira.'],
      ['h2', 'Lo que hace hoy el estado'],
      ['p', 'La Oficina de Evaluación del Desempeño Judicial de Colorado (OJPE) y sus comisiones evalúan a los jueces con encuestas, observación en la sala, entrevistas e informes públicos. Ese trabajo importa y los resultados se publican en línea.'],
      ['ul', [
        'Las encuestas las realiza una empresa privada de investigación de fuera de Colorado. Los informes de encuestas del estado de 2024 la nombran en la portada: Market Decisions Research, de Portland, Maine.',
        'Las invitaciones se envían por correo electrónico. Los informes cuentan los correos enviados, no los que llegaron a la bandeja de entrada en lugar de la carpeta de spam.']],
      ['h2', 'Lo que muestran las cifras del propio estado'],
      ['ul', [
        'En la encuesta de votantes de 2024 del estado (423 votantes), el 53% sabía que se evalúa a los jueces y solo el 23% sabía que existen las comisiones. El 33% dijo que la mayoría de los votantes no tiene la información que necesita.',
        'En el ciclo de 2024 se invitó por correo electrónico a 117,355 personas del público a evaluar a jueces. Respondieron 6,614: el 6%.',
        'A los jurados y ciudadanos no se les muestrea de forma pareja. El propio informe del estado dice que su tasa de respuesta “no se puede calcular”, porque el personal del tribunal elige qué jueces se evalúan y los ciudadanos deciden si participan.',
        'La cantidad de personas detrás de la nota de un juez puede ser pequeña. El informe de 2024 de un juez de distrito se basa en 42 personas, y en él respondieron 18 de 1,072 abogados invitados. Un informe de 2017 de otro juez cuenta 5 encuestas de jurados completadas de 13 enviadas.']],
      ['p', 'Estas son cifras publicadas por el propio estado. No son acusaciones. Son la razón por la que sirve una segunda vía, más sencilla y abierta, para contar lo que viste en el tribunal.'],
      ['h2', 'Tres ejemplos de los propios informes del estado'],
      ['p', 'Cada informe oficial de encuestas de 2024 empieza con una tabla como estas, que muestra cuántas invitaciones se enviaron y cuántas personas respondieron. Las imágenes están recortadas directamente de los PDF del estado. Tócalas para abrir el informe completo.'],
      ['fig', 'img/ojpe-2024-cortez-rodriguez-kimberly.webp', 'Tabla del informe de encuestas de 2024 del estado sobre Kimberly D. Cortez-Rodriguez, Tribunal de Distrito: invitaciones por correo a abogados 174, 16 respuestas; a personas que no son abogados 97, 0 respuestas; personal judicial 13; comentarios de ciudadanos 0; encuesta de jurados 0; 30 respuestas en total.', 'Informe sobre Kimberly D. Cortez-Rodriguez, Tribunal de Distrito: 97 invitaciones por correo a personas que no son abogados, 0 respuestas.', 'https://judicialperformance.colorado.gov/sites/judicialperformance/files/documents/12%20-%2041608%20-%20Judge%20Kimberly%20D.%20Cortez-Rodriguez-UA%20%282%29.pdf', [1047, 756], '/archive/ojpe/ojpe-2024-cortez-rodriguez-kimberly.pdf', '(nuestra copia guardada)'],
      ['fig', 'img/ojpe-2024-eiring-deni.webp', 'Tabla del informe de encuestas de 2024 del estado sobre Deni E. Eiring, Tribunal de Condado: invitaciones por correo a abogados 96, 2 respuestas; a personas que no son abogados 139, 1 respuesta; personal judicial 3; comentarios de ciudadanos 0; encuesta de jurados 0; 6 respuestas en total.', 'Informe sobre Deni E. Eiring, Tribunal de Condado: todo el informe se basa en 6 personas. 96 correos a abogados trajeron 2 respuestas y 139 correos a otras personas, 1.', 'https://judicialperformance.colorado.gov/sites/judicialperformance/files/documents/15%20-%2045748%20-%20Judge%20Deni%20E.%20Eiring-UA.pdf', [1047, 756], '/archive/ojpe/ojpe-2024-eiring-deni.pdf', '(nuestra copia guardada)'],
      ['fig', 'img/ojpe-2024-schutte-anita.webp', 'Tabla del informe de encuestas de 2024 del estado sobre Anita M. Schutte, Tribunal de Distrito: invitaciones por correo a abogados 574, 14 respuestas; a personas que no son abogados 1,575, 21 respuestas; personal judicial 2; comentarios de ciudadanos 0; encuesta de jurados 0; 37 respuestas en total.', 'Informe sobre Anita M. Schutte, Tribunal de Distrito: 1,575 invitaciones por correo a personas que no son abogados, 21 respuestas (1.3%).', 'https://judicialperformance.colorado.gov/sites/judicialperformance/files/documents/2%20-%2036476%20-%20Judge%20Anita%20M.%20Schutte-UA.pdf', [1047, 756], '/archive/ojpe/ojpe-2024-schutte-anita.pdf', '(nuestra copia guardada)'],
      ['callout', 'Estos tres no son la excepción. Leímos todos los informes de 2024 que usan esta tabla: 96 jueces de primera instancia.', [
        'La mitad de los informes se basa en 33 personas o menos. 20 de ellos se basan en 20 personas o menos.',
        'La fila de la encuesta de jurados muestra 0 en 82 de los 96 informes. La de comentarios de ciudadanos, 0 en 89.',
        'En los 96, 37,501 invitaciones por correo a personas que no son abogados trajeron 1,234 respuestas (3.3%). 40,276 invitaciones por correo a abogados trajeron 1,749 (4.3%).']],
      ['note', 'Estas cifras describen cómo se reunió la información. No dicen nada sobre los jueces.'],
      ['h2', 'Lo que hacemos distinto'],
      ['ul', [
        'Puedes calificar en unos 30 segundos, desde el teléfono, en inglés o español, justo al salir de la sala.',
        'Sin cuenta y sin nombre. El sitio está hecho para saber lo menos posible sobre ti.',
        'Las preguntas tratan de lo que la gente realmente puede ver, no de resultados legales.',
        'Los resultados son públicos al instante, separados por quién califica, y cada decisión de los moderadores queda registrada.',
        'Es un proyecto público, independiente y de código abierto, hecho para los residentes de Colorado. Cualquiera puede leer el código, probarlo y proponer cambios, y el código pertenece al público, no a una empresa ni a una agencia. Nuestra regla: las personas moderadoras y quienes mantienen el sitio deben ser residentes de Colorado verificados (el proceso de verificación se publicará aquí). Todo se hace a la vista de todos para que cualquiera pueda comprobarlo.']],
      ['h2', 'Un registro público, no solo una calificación'],
      ['p', 'Esto no es solo una calificación para votantes. Es un registro público permanente, y un registro cambia la conducta por sí mismo: los funcionarios actúan distinto cuando las personas a las que sirven pueden ver y comparar su trabajo.'],
      ['h2', 'Lo que este sitio no es'],
      ['ul', [
        'Es independiente. No es parte del Estado de Colorado, de sus tribunales ni de ninguna comisión, ni cuenta con su respaldo ni tiene relación con ellos.',
        'No es una evaluación oficial ni asesoría legal. No sustituye el trabajo de las comisiones.',
        'Las calificaciones son opiniones sobre la conducta en una sala. No son conclusiones de hecho.',
        'Los comentarios son opiniones personales de quienes los escriben. Los reunimos para que cualquier persona que estuvo en la sala pueda ser escuchada. Una persona moderadora comprueba que el comentario cumple nuestras reglas, no si lo que dice es verdad. Verifica por tu cuenta lo que sea importante.',
        'Los jueces y fiscales que aparecen aquí son funcionarios públicos. Las opiniones honestas sobre cómo se comportan los funcionarios públicos son expresión protegida. Las afirmaciones falsas de hechos no lo son, y por eso solo preguntamos por lo que la gente vio.',
        'Los jueces y fiscales que aparecen son funcionarios reales de Colorado, tomados de las listas oficiales de la Rama Judicial de Colorado y de las fiscalías de distrito. Cada calificación viene de una persona que usó este sitio.']],
      ['h2', 'Participa'],
      ['p', '¿Quieres ayudar como voluntario/a, programador/a, probador/a, traductor/a, abogado/a o difundiendo el proyecto? Usa el formulario «Participa» al pie de la página. El código se publicará como código abierto antes del lanzamiento y aquí pondremos la dirección del repositorio.'],
      ['src', ['voter', 'kuhn', 'elliff', 'ojpe', 'mdr']]] },
  },

  how: {
    en: { h1: ['How it ', 'works'], lead: 'From leaving the courtroom to seeing the result takes about a minute. Here is every step, and what happens behind it.', blocks: [
      ['h2', '1. Tell us who you were'],
      ['p', 'Choose one: part of the case (defendant, victim, witness, family), watching, juror, or attorney or court staff. A defendant, a juror and an observer see different things, so we show their ratings side by side and never blend them.'],
      ['h2', '2. Pick the courthouse'],
      ['p', 'Your phone can suggest the nearest courthouse, or you can search. If you allow location, it is used once to check that you were near the courthouse (within 1,000 feet). We keep only “near” or “not near”, never where you were.'],
      ['h2', '3. Pick the judge or prosecutor'],
      ['p', 'Choose the courthouse, then the judges or the prosecutors tab, then the person.'],
      ['h2', '4. Answer five short questions'],
      ['ul', [
        'Each question is a tap from 1 to 5. If you did not see something, tap “I didn’t see this”. You need to answer at least three of the five.',
        'Add an overall star rating.',
        'Optional: how it went for you (I won, I lost, mixed, I only watched). This helps readers see whether low scores come from the process or only from losing.',
        'Optional comment, typed or spoken. A spoken comment is turned into text and the recording is deleted right away.',
        'If you were a victim or witness and are rating a prosecutor, two extra optional questions appear. Their answers are shown separately.']],
      ['h2', '5. See the result right away'],
      ['p', 'You see the overall score, each question, the scores by group, a note on how people who lost their case rated, and the trend over recent weeks.'],
      ['h2', 'How scores are counted'],
      ['ul', [
        'Each question’s score is the plain average of the 1 to 5 answers, counting only people who answered that question.',
        'Every rating counts the same. We mark the ratings made near the courthouse and show how many there are, so you can judge for yourself.',
        'No average score is shown until a person has at least 5 ratings. Each single rating is shown with its answers and the rater’s role in the case, never with a name or anything that identifies the person who left it.',
        'Scores are shown by group (in the case, watching, jurors, attorneys and staff). We do not hide a secret formula that mixes them.',
        'One phone can rate the same judge or prosecutor once every 30 days.']],
      ['h2', 'How comments and moderation work'],
      ['ul', [
        'A comment appears right away, marked “Not reviewed yet”. A moderator then approves it or removes it. Comments with insults, swearing, contact details, case numbers or links are not accepted at all; comments that may name private people, threaten anyone or accuse someone of a crime are held, visible only to their author, until a moderator reads them.',
        'Once a moderator approves it, it is marked “Reviewed”.',
        'People who have rated someone can report a published comment. When two different people report it, it is hidden until a moderator decides again.',
        'Moderators remove insults, threats, private details, accusations of crimes and things that are not about the courtroom. They do not remove harsh but factual criticism.',
        'Every moderator decision is public, with the moderator’s name and the reason, on the moderation log.']],
      ['h2', 'Every situation'],
      ['rows', [
        ['You were a defendant or family member', 'Choose “part of the case”, then “Defendant or family”. You answer the five questions. Say if you won or lost.'],
        ['You were a victim or witness and are rating a prosecutor', 'Two extra optional questions appear: whether the prosecutor listened and kept you informed, and whether you felt safe and treated with dignity. They are shown separately.'],
        ['You were a juror or just watching', 'Pick that role. Skip anything you did not see.'],
        ['You are an attorney or court staff', 'You are counted as your own group. You know the most, and you may also have a stake, so your scores are shown on their own.'],
        ['You saw only part of the hearing', 'Tap “I didn’t see this” on what you missed. Answer at least three.'],
        ['You lost and you are upset', 'You can say so. Your rating counts, and readers can see how people who lost rated the judge.'],
        ['Your phone’s location is off, or you rate later from home', 'It works. Your rating just isn’t marked as made near the courthouse.'],
        ['You already rated this person recently', 'It is blocked for 30 days from your last rating of that person. You can rate other people right away.'],
        ['You see a published comment that is wrong or abusive', 'Tap Report and choose a reason. Two reports hide it until a moderator decides again.'],
        ['You want to send a profile to someone', 'Tap Share on the profile. The link opens that profile with a preview.'],
        ['You prefer Spanish', 'Tap EN/ES at the top right. The site also follows your phone’s language.'],
        ['Your connection drops', 'You see a clear message and a Try again button. Nothing is sent twice.']]],
    ] },
    es: { h1: ['Cómo ', 'funciona'], lead: 'Desde que sales de la sala hasta ver el resultado pasa más o menos un minuto. Aquí está cada paso y lo que ocurre detrás.', blocks: [
      ['h2', '1. Cuéntanos quién eras'],
      ['p', 'Elige una opción: parte del caso (acusado, víctima, testigo, familiar), observador, jurado, o abogado o personal del tribunal. Un acusado, un jurado y un observador ven cosas distintas, así que mostramos sus calificaciones lado a lado y nunca las mezclamos.'],
      ['h2', '2. Elige el tribunal'],
      ['p', 'Tu teléfono puede sugerir el tribunal más cercano, o puedes buscarlo. Si permites la ubicación, se usa una sola vez para comprobar que estabas cerca del tribunal (a menos de 1,000 pies). Solo guardamos “cerca” o “no cerca”, nunca dónde estabas.'],
      ['h2', '3. Elige al juez o fiscal'],
      ['p', 'Elige el tribunal, luego la pestaña de jueces o de fiscales, y después a la persona.'],
      ['h2', '4. Responde cinco preguntas cortas'],
      ['ul', [
        'Cada pregunta es un toque del 1 al 5. Si no viste algo, toca “No lo vi”. Debes responder al menos tres de las cinco.',
        'Agrega una calificación general con estrellas.',
        'Opcional: cómo te fue a ti (gané, perdí, mixto, solo observé). Ayuda a los lectores a ver si las notas bajas vienen del trato recibido o solo de haber perdido.',
        'Comentario opcional, escrito o hablado. Un comentario hablado se convierte en texto y la grabación se borra de inmediato.',
        'Si fuiste víctima o testigo y calificas a un fiscal, aparecen dos preguntas extra opcionales. Sus respuestas se muestran aparte.']],
      ['h2', '5. Mira el resultado al instante'],
      ['p', 'Ves la nota general, cada pregunta, las notas por grupo, una nota sobre cómo calificaron quienes perdieron su caso y la tendencia de las últimas semanas.'],
      ['h2', 'Cómo se cuentan las notas'],
      ['ul', [
        'La nota de cada pregunta es el promedio simple de las respuestas del 1 al 5, contando solo a quienes respondieron esa pregunta.',
        'Todas las calificaciones valen lo mismo. Marcamos las hechas cerca del tribunal y mostramos cuántas hay, para que tú juzgues.',
        'No se muestra ninguna nota media hasta que una persona tiene al menos 5 calificaciones. Cada calificación se muestra con sus respuestas y el papel de quien la dejó en el caso, nunca con un nombre ni nada que identifique a esa persona.',
        'Las notas se muestran por grupo (en el caso, observando, jurados, abogados y personal). No escondemos una fórmula secreta que los mezcle.',
        'Un teléfono puede calificar al mismo juez o fiscal una vez cada 30 días.']],
      ['h2', 'Cómo funcionan los comentarios y la moderación'],
      ['ul', [
        'Un comentario aparece enseguida, marcado “Aún sin revisar”. Después una persona moderadora lo aprueba o lo quita. No se aceptan comentarios con insultos, groserías, datos de contacto, números de caso o enlaces; los que puedan nombrar a personas privadas, amenazar o acusar a alguien de un delito quedan retenidos, visibles solo para su autor, hasta que un moderador los lea.',
        'Cuando una persona moderadora lo aprueba, queda marcado “Revisado”.',
        'Quienes ya han calificado a alguien pueden reportar un comentario publicado. Cuando dos personas distintas lo reportan, se oculta hasta que un moderador decida de nuevo.',
        'Los moderadores eliminan insultos, amenazas, datos personales, acusaciones de delitos y lo que no trate de la sala. No eliminan críticas duras pero basadas en hechos.',
        'Cada decisión de los moderadores es pública, con el nombre del moderador y el motivo, en el registro de moderación.']],
      ['h2', 'Cada situación'],
      ['rows', [
        ['Fuiste acusado o familiar', 'Elige “parte del caso” y luego “Acusado o familiar”. Respondes las cinco preguntas. Di si ganaste o perdiste.'],
        ['Fuiste víctima o testigo y calificas a un fiscal', 'Aparecen dos preguntas extra opcionales: si la fiscalía te escuchó y te mantuvo al tanto, y si sentiste seguridad y recibiste un trato digno. Se muestran aparte.'],
        ['Fuiste jurado o solo observabas', 'Elige ese papel. Omite lo que no viste.'],
        ['Eres abogado o personal del tribunal', 'Cuentas como grupo propio. Sabes más, pero también puedes tener un interés, así que tus notas se muestran por separado.'],
        ['Viste solo una parte de la audiencia', 'Toca “No lo vi” en lo que te perdiste. Responde al menos tres.'],
        ['Perdiste y estás molesto', 'Puedes decirlo. Tu calificación cuenta y los lectores ven cómo calificaron al juez quienes perdieron.'],
        ['Tu ubicación está apagada, o calificas después desde casa', 'Funciona. Tu calificación simplemente no se marca como hecha cerca del tribunal.'],
        ['Ya calificaste recientemente a esta persona', 'Queda bloqueado durante 30 días desde tu última calificación a esa persona. A otras personas puedes calificarlas de inmediato.'],
        ['Ves un comentario publicado que es falso o abusivo', 'Toca Reportar y elige un motivo. Dos reportes lo ocultan hasta que un moderador decida de nuevo.'],
        ['Quieres enviar un perfil a alguien', 'Toca Compartir en el perfil. El enlace abre ese perfil con una vista previa.'],
        ['Prefieres español', 'Toca EN/ES arriba a la derecha. El sitio también sigue el idioma de tu teléfono.'],
        ['Se corta tu conexión', 'Ves un mensaje claro y un botón Reintentar. Nada se envía dos veces.']]],
    ] },
  },

  method: {
    en: { h1: ['Our ', 'method'], lead: 'The questions come from published standards and research on how courts should be judged by the people who use them. Here is what we used, why, and what the result cannot tell you.', blocks: [
      ['h2', 'The rules we followed'],
      ['ul', ['Ask about what people can see (the process), not about legal correctness or the verdict.', 'One idea per question.', 'Plain language, at about an 8th-grade level.', 'Give an honest way out: “I didn’t see this”. Require at least three answers.', 'Ask whether the person won or lost, and show it, because losing colors how people rate.', 'Show groups of raters separately instead of blending them.']],
      ['h2', 'The five judge questions'],
      ['rows', [
        ['Did the judge let each side be heard?', 'Measures “voice”. Based on the court-user survey of the National Center for State Courts (“I had a chance to tell my side of the story”), the Arizona juror survey, and research by Lind, Tyler and Huo on what makes people feel a court treated them fairly.'],
        ['Did the judge treat both sides the same?', 'Measures neutrality, the best everyday stand-in for impartiality. Based on NCSC (“I was treated the same as everyone else”) and the Arizona survey.'],
        ['Was the judge respectful to everyone?', 'Measures respect and temperament. Based on NCSC (“courtesy and respect”), the Arizona survey, and the temperament criterion of the ABA guidelines.'],
        ['Was it clear what the judge decided, and why?', 'Measures understanding. Based on NCSC (“I could follow what was happening”, “I know what to do next”) and the communication criterion of the ABA guidelines.'],
        ['Did the judge run things on time?', 'Measures time and organization. Based on NCSC (“a reasonable amount of time”), the Arizona survey, and the case-management category used by Colorado’s own evaluations. In Rhode Island’s 2023 survey, time was one of the lowest-scoring areas.']]],
      ['h2', 'The five prosecutor questions'],
      ['p', 'No official questionnaire for prosecutors exists. These are a careful first draft built from the ABA prosecution standards, the same procedural-justice research, and the Stanford “Rate My District Attorney” report.'],
      ['rows', [
        ['Was the prosecutor respectful to everyone in the courtroom?', 'Respect. Same research as above.'],
        ['Did the prosecutor seem prepared?', 'The duty to prepare. Visible in court.'],
        ['Did the prosecutor stick to the facts?', 'Candor and the standard against inflammatory argument. It asks about conduct a person can see, not whether the facts were true.'],
        ['Could you follow what the prosecutor was saying and doing?', 'Understanding, one of the elements of procedural justice.'],
        ['Did the prosecutor treat witnesses and the defendant fairly?', 'Fair conduct toward people in the room. We ask about behavior, not about motives.'],
        ['Only for victims and witnesses (optional): Did the prosecutor listen to you and keep you informed? Did you feel safe and treated with dignity?', 'Based on research on victims’ and witnesses’ experience, where being informed and listened to matters most. Shown separately and never merged into the main score.']]],
      ['h2', 'What we deliberately do not ask'],
      ['ul', ['Whether a verdict, sentence or plea was fair, or whether a judge got the law right. People in the room cannot judge that, and answers would mostly reflect who won.', 'Whether someone is “good”, “honest” or “corrupt”. We ask about things people did that others can see.', 'About charging decisions, plea deals or evidence disclosure. These happen where the public cannot see them.', 'About looks, politics or personal life.']],
      ['h2', 'Where the questions come from'],
      ['src', ['iaals', 'ri', 'az', 'aba', 'ppi', 'stanford']],
      ['p', 'Also: Lind, Tyler and Huo (1997) and Tyler and Huo, “Trust in the Law”, on how people judge courts by fair treatment more than by outcome.'],
      ['h2', 'The appeals record on judge profiles'],
      ['ul', ['Source: the Colorado Court of Appeals’ own weekly announcements of its decisions, from June 2023. Each entry opens the announcement it came from, on the right page.', 'We keep our own copy of every announcement we link to. Next to each entry, “our saved copy” opens it, so it can still be checked if the court’s file is moved or removed. The official link always comes first.', 'A decision is listed under a judge only when the announcement names that judge as the trial judge and the name matches exactly one judge on our list in that court district (or the same full name, once in the whole state, for judges who changed courts). Magistrates are not included.', 'The outcome uses the court’s own wording. “Partly affirmed” means part of the ruling was reversed or vacated and the rest stands. When the court only declined to hear part of an appeal, that is not counted against the judge.', 'We do not name the people in the case, only the type of case.', 'We show the list, not a reversal rate: there is no public count of every case a judge decides, and some kinds of cases are appealed far more often than others.', 'A denied petition, including a denied C.A.R. 21 petition, is not an endorsement of the lower court’s ruling. We list decisions only, and never count a denial in a judge’s favor.', 'Updated every week. If you see a mistake, tell us on the Corrections page.']],
      ['h2', 'Judicial discipline in Colorado, statewide'],
      ['p', 'The Colorado Commission on Judicial Discipline reviews complaints about judges (it calls them Requests for Evaluation). Its annual reports give statewide numbers only, never per judge, so these figures say nothing about any single judge on this site.'],
      ['ul', ['2024: 368 requests received. 318 were dismissed at the first review. The Commission considered 65 matters and dismissed 29 of them. 3 formal proceedings, each ending in public censure. 12 private disciplinary actions, all for missed financial-disclosure filings. 2 diversion plans and 1 temporary suspension.', '2023: 344 requests received. 251 were dismissed at the first review.', 'Most complaints never become public. Since Amendment H (2024), a case becomes public when the Commission starts formal proceedings; informal proceedings, where most complaints end, stay confidential (Colorado Constitution, art. VI, § 23(3)(g)).']],
      ['src', ['ccjd24', 'ccjd23']],
      ['h2', 'How the state’s surveys are collected'],
      ['p', 'For comparison, this is how the official surveys work, taken from the state’s own 2024 survey reports.'],
      ['ul', [
        'They are conducted by a private research firm outside Colorado. The reports name it on the cover: Market Decisions Research, 511 Congress Street, Portland, Maine.',
        'Invitations go out by email, in quarterly batches with email reminders: to attorneys, to other people who appeared in court, and to court staff. Jurors are also invited by email, and anyone can answer through a public link.',
        'The invitation can come months after the hearing: attorneys who appeared in court from January to June 2023 were first emailed on September 10, 2023.',
        'The reports count invitations sent, not invitations delivered. Whether an email reached an inbox, landed in a spam folder or went to an old address is not reported.',
        '119,479 email invitations to attorneys produced 5,682 evaluations. 117,355 people other than attorneys were invited by email, and 6,614 of them responded (6%).']],
      ['p', 'Three real tables, cropped from individual judges’ reports, are on the About page.'],
      ['src', ['kuhn', 'mdr']],
      ['h2', 'The limits, honestly'],
      ['ul', ['These questions are drafted from standards and research. They have not yet been tested with real users, so we do not claim they are a validated scientific instrument.', 'People who choose to rate are not a random sample of everyone who goes to court.', 'A score summarizes opinions about conduct in a courtroom. It is not a finding about a judge’s legal skill.', 'We could confirm some of our sources only through summaries. We will replace them with the primary documents as we read them.']],
      ['h2', 'How we will check and improve them (planned)'],
      ['ul', ['A pilot with real courtroom visitors in Colorado.', 'Checking that people understand each question the same way and that the answers hang together.', 'Review by independent judicial-performance researchers, survey methodologists and practicing Colorado attorneys.', 'Review of the Spanish by native speakers.', 'Publishing every change to a question and the reason.']],
    ] },
    es: { h1: ['Nuestro ', 'método'], lead: 'Las preguntas salen de normas publicadas e investigaciones sobre cómo deben juzgar a los tribunales las personas que los usan. Aquí está lo que usamos, por qué y lo que el resultado no puede decirte.', blocks: [
      ['h2', 'Las reglas que seguimos'],
      ['ul', ['Preguntar por lo que la gente puede ver (el proceso), no por si la ley se aplicó bien ni por el veredicto.', 'Una idea por pregunta.', 'Lenguaje sencillo, de nivel de secundaria.', 'Dar una salida honesta: “No lo vi”. Exigir al menos tres respuestas.', 'Preguntar si la persona ganó o perdió y mostrarlo, porque perder influye en cómo se califica.', 'Mostrar los grupos de quienes califican por separado en lugar de mezclarlos.']],
      ['h2', 'Las cinco preguntas sobre jueces'],
      ['rows', [
        ['¿El juez o la jueza dejó que cada parte fuera escuchada?', 'Mide la “voz”. Se basa en la encuesta a usuarios de tribunales de NCSC CourTools (“tuve la oportunidad de contar mi versión”), la encuesta a jurados de Arizona y la investigación sobre justicia procesal de Lind, Tyler y Huo.'],
        ['¿El juez o la jueza trató a ambas partes por igual?', 'Mide la neutralidad, el mejor sustituto cotidiano de la imparcialidad. Se basa en NCSC (“me trataron igual que a todos”) y en la encuesta de Arizona.'],
        ['¿El juez o la jueza trató a todas las personas con respeto?', 'Mide el respeto y el temperamento. Se basa en NCSC (“cortesía y respeto”), la encuesta de Arizona y el criterio de temperamento de las guías de la ABA.'],
        ['¿Quedó claro qué decidió el juez o la jueza, y por qué?', 'Mide la comprensión. Se basa en NCSC (“pude seguir lo que pasaba”, “sé qué hacer ahora”) y en el criterio de comunicación de las guías de la ABA.'],
        ['¿El juez o la jueza llevó la audiencia a tiempo?', 'Mide el tiempo y la organización. Se basa en NCSC (“un tiempo razonable”), la encuesta de Arizona y la categoría de manejo de casos que usan las evaluaciones del propio Colorado. En la encuesta de Rhode Island de 2023, el tiempo fue una de las áreas con peor nota.']]],
      ['h2', 'Las cinco preguntas sobre fiscales'],
      ['p', 'No existe un cuestionario oficial para fiscales. Estas son un primer borrador cuidadoso, hecho con las normas de la ABA sobre la función fiscal, la misma investigación de justicia procesal y el informe de Stanford “Rate My District Attorney”.'],
      ['rows', [
        ['¿La fiscalía fue respetuosa con todos en la sala?', 'Respeto. La misma investigación de arriba.'],
        ['¿La fiscalía pareció preparada?', 'El deber de prepararse. Se nota en la sala.'],
        ['¿La fiscalía se ciñó a los hechos?', 'Franqueza y la norma contra los argumentos inflamatorios. Pregunta por una conducta que se ve, no por si los hechos eran ciertos.'],
        ['¿Pudiste seguir lo que decía y hacía la fiscalía?', 'Comprensión, uno de los elementos de la justicia procesal.'],
        ['¿La fiscalía trató con justicia a los testigos y al acusado?', 'Trato justo hacia las personas en la sala. Preguntamos por conducta, no por motivos.'],
        ['Solo para víctimas y testigos (opcional): ¿La fiscalía te escuchó y te mantuvo al tanto? ¿Sentiste seguridad y recibiste un trato digno en la sala?', 'Se basa en investigaciones sobre la experiencia de víctimas y testigos, donde importa sobre todo que los informen y los escuchen. Se muestra aparte y nunca se mezcla con la nota principal.']]],
      ['h2', 'Lo que deliberadamente no preguntamos'],
      ['ul', ['Si un veredicto, una sentencia o un acuerdo de culpabilidad fue justo, ni si el juez aplicó bien la ley. Quien está en la sala no puede juzgarlo y las respuestas reflejarían sobre todo quién ganó.', 'Si alguien es “bueno”, “honesto” o “corrupto”. Preguntamos por cosas que la persona hizo y que otros pueden ver.', 'Sobre decisiones de acusación, acuerdos o entrega de pruebas. Ocurren donde el público no ve.', 'Sobre aspecto, política o vida personal.']],
      ['h2', 'De dónde salen las preguntas'],
      ['src', ['iaals', 'ri', 'az', 'aba', 'ppi', 'stanford']],
      ['p', 'Además: Lind, Tyler y Huo (1997) y Tyler y Huo, “Trust in the Law”, sobre cómo la gente juzga a los tribunales más por el trato justo que por el resultado.'],
      ['h2', 'El historial de apelaciones en los perfiles de jueces'],
      ['ul', ['Fuente: los anuncios semanales de decisiones del propio Tribunal de Apelaciones de Colorado, desde junio de 2023. Cada entrada abre el anuncio del que proviene, en la página correcta.', 'Guardamos nuestra propia copia de cada anuncio que enlazamos. Junto a cada entrada, «nuestra copia guardada» lo abre, para que se pueda comprobar aunque el tribunal mueva o retire su archivo. El enlace oficial siempre va primero.', 'Una decisión aparece bajo un juez solo cuando el anuncio lo nombra como juez de primera instancia y el nombre coincide con exactamente un juez de nuestra lista en ese distrito judicial (o con el mismo nombre completo, una sola vez en todo el estado, para jueces que cambiaron de tribunal). No se incluyen magistrados.', 'El resultado usa las palabras del propio tribunal. “Confirmado en parte” significa que una parte del fallo se revocó o anuló y el resto se mantiene. Cuando el tribunal solo se negó a revisar una parte de la apelación, eso no cuenta en contra del juez.', 'No nombramos a las personas del caso, solo el tipo de caso.', 'Mostramos la lista, no un porcentaje de revocaciones: no existe un recuento público de todos los casos que decide un juez, y algunos tipos de casos se apelan mucho más que otros.', 'Una petición denegada, incluida una petición C.A.R. 21 denegada, no es un respaldo al fallo del tribunal inferior. Solo listamos decisiones y nunca contamos una denegación a favor de un juez.', 'Se actualiza cada semana. Si ves un error, dínoslo en la página de Correcciones.']],
      ['h2', 'Disciplina judicial en Colorado, en todo el estado'],
      ['p', 'La Comisión de Disciplina Judicial de Colorado revisa las quejas sobre jueces (las llama Solicitudes de Evaluación). Sus informes anuales dan solo cifras de todo el estado, nunca por juez, así que no dicen nada sobre ningún juez concreto de este sitio.'],
      ['ul', ['2024: 368 solicitudes recibidas. 318 se desestimaron en la primera revisión. La Comisión estudió 65 asuntos y desestimó 29. 3 procedimientos formales, cada uno terminado en censura pública. 12 medidas disciplinarias privadas, todas por no presentar declaraciones financieras. 2 planes de desvío y 1 suspensión temporal.', '2023: 344 solicitudes recibidas. 251 se desestimaron en la primera revisión.', 'La mayoría de las quejas nunca se hacen públicas. Desde la Enmienda H (2024), un caso se hace público cuando la Comisión inicia un procedimiento formal; los procedimientos informales, donde termina la mayoría de las quejas, siguen siendo confidenciales (Constitución de Colorado, art. VI, § 23(3)(g)).']],
      ['src', ['ccjd24', 'ccjd23']],
      ['h2', 'Cómo se recogen las encuestas del estado'],
      ['p', 'Para comparar, así funcionan las encuestas oficiales, según los propios informes de encuestas del estado de 2024.'],
      ['ul', [
        'Las realiza una empresa privada de investigación de fuera de Colorado. Los informes la nombran en la portada: Market Decisions Research, 511 Congress Street, Portland, Maine.',
        'Las invitaciones se envían por correo electrónico, en tandas trimestrales y con recordatorios por correo: a abogados, a otras personas que comparecieron ante el tribunal y al personal judicial. A los jurados también se les invita por correo, y cualquier persona puede responder mediante un enlace público.',
        'La invitación puede llegar meses después de la audiencia: a los abogados que comparecieron entre enero y junio de 2023 se les escribió por primera vez el 10 de septiembre de 2023.',
        'Los informes cuentan las invitaciones enviadas, no las entregadas. No se informa si un correo llegó a la bandeja de entrada, cayó en la carpeta de spam o fue a una dirección antigua.',
        '119,479 invitaciones por correo a abogados dieron 5,682 evaluaciones. Se invitó por correo a 117,355 personas que no son abogados, y respondieron 6,614 (6%).']],
      ['p', 'En la página «Por qué existe este sitio» hay tres tablas reales, recortadas de informes de jueces concretos.'],
      ['src', ['kuhn', 'mdr']],
      ['h2', 'Los límites, con honestidad'],
      ['ul', ['Estas preguntas se redactaron a partir de normas e investigaciones. Aún no se han probado con usuarios reales, así que no afirmamos que sean un instrumento científico validado.', 'Quienes eligen calificar no son una muestra aleatoria de todos los que van a un tribunal.', 'Una nota resume opiniones sobre la conducta en una sala. No es un hallazgo sobre la capacidad legal de un juez.', 'Algunas fuentes solo pudimos confirmarlas por resúmenes. Las reemplazaremos por los documentos originales a medida que los leamos.']],
      ['h2', 'Cómo las revisaremos y mejoraremos (planeado)'],
      ['ul', ['Una prueba piloto con visitantes reales de salas en Colorado.', 'Comprobar que la gente entiende cada pregunta de la misma forma y que las respuestas son coherentes.', 'Revisión por investigadores independientes de desempeño judicial, especialistas en encuestas y abogados de Colorado en ejercicio.', 'Revisión del español por hablantes nativos.', 'Publicar cada cambio en una pregunta y el motivo.']],
    ] },
  },

  security: {
    en: { h1: ['Security and ', 'trust'], lead: 'A public rating site is only worth something if people can trust the numbers. Here is how we protect against bots and fake ratings, what we store, what we never store, and what is still a risk.', blocks: [
      ['h2', 'Protections that work today'],
      ['rows', [
        ['One rating per phone per official every 30 days', 'Each phone gets a random anonymous token that our server signs, so nobody can invent one. A second rating of the same person within 30 days is blocked.'],
        ['Rate limits', 'Every action (rating, report, voice note, suggestion, feedback) is limited per phone and per network each hour, and new tokens are limited per network each day. Bursts from one source get slowed down.'],
        ['Courthouse check', 'If you allow location, we check your phone is within 1,000 feet of the courthouse and keep only yes or no. Ratings made near the courthouse are marked, and every profile shows how many are. It is a signal, not proof.'],
        ['Every comment is checked twice', 'First by automatic rules the moment it is sent (no insults, contact details, links, or names of private people), then by a human moderator, who approves or removes it.'],
        ['Reports', 'Only phones that have rated someone can report a comment. When two different phones report one, it is hidden until a moderator decides. A report can never overturn a moderator’s approval.'],
        ['Moderators on the record', 'Every decision is public with the moderator’s name and the reason. The moderator tools are not on the public site. They live at a separate address that needs a personal sign-in with a password (a one-time code is planned).'],
        ['Cleaned text', 'Comments are plain text only. Markup, scripts and control characters are stripped. They are limited in length.'],
        ['Our own server only', 'No ads, no trackers or analytics from other companies, no outside fonts or scripts. Everything loads from our own server, so no outside company learns who visits. The one exception is the video on About: it plays from YouTube in its privacy-enhanced mode, and nothing loads from YouTube until you press play.'],
        ['A puzzle instead of an outside captcha', 'Before a rating or other submission the phone solves a small puzzle by itself. It is hosted by us, so no outside company is involved, and it slows down bots.'],
        ['Hardened server', 'Encrypted connection, a strict browser rule that blocks any outside code, no embedding in other sites, no referrer sent, same-site-only requests, and protection against fake form posts from other websites.'],
        ['Hidden until it is safe', 'No average score is shown until at least 5 people have rated, and group results appear only when each group is large enough. Each single rating is shown with its answers and the rater’s role only: no name, no location, and the time rounded to the hour.']]],
      ['h2', 'What we store, and what we never store'],
      ['ul', [
        'We store: your ratings and optional comment; whether you said you won or lost; your role; whether your phone was near the courthouse (yes or no); the time rounded to the hour; and the random token of your phone.',
        'We never store: your name, email, phone number, exact location, or your IP address. Your network address is held only in the server’s memory for a short time to slow down bursts, and is never written to the database.',
        'Voice recordings are turned into text and deleted immediately. They are never kept.',
        'The token on your phone is random and tied to nothing about you, but it does link your own ratings to each other. After 30 days we cut that link. Clear your browser data and the token disappears from your phone.']],
      ['h2', 'What can still go wrong, honestly'],
      ['ul', [
        'A determined person with many phones, different networks or a location-faking tool could still stuff the ballot box.',
        'Clearing your browser data, or using another phone, gets a new anonymous token, so the one-rating-every-30-days rule is a speed bump, not a wall.',
        'The courthouse check can be fooled by a phone that fakes its location. That is why we show how many ratings were made near the courthouse instead of pretending it is proof.',
        'People who are angry, or who are supporters, are more likely to take part. Any open rating site has this bias, which is why we show whether raters won or lost.',
        'Rating a real, named official carries a risk of unfair or false statements. We reduce it with fact-only questions, moderation and a correction process (see below), but we cannot remove it.']],
      ['h2', 'Planned before public launch'],
      ['ul', [
        'A harder puzzle when activity looks unusual.',
        'Automatic alerts for unusual bursts: many ratings from one network or in a few minutes.',
        'An independent security review (a test where experts try to break in). To report a weak spot now, write to security@rateyourjudgecolorado.com.',
        'A right of reply and a correction process for officials who believe something is false.',
        'Publishing the code so anyone can verify these claims, and a public audit of the moderation log.',
        'Terms of use, a privacy policy and a corrections and takedown process, reviewed by a lawyer, and a legal review of publishing ratings about named public officials.']],
      ['note', 'This page lists what is built and what is planned. We will update it as things change, and we will say so when a protection is not there yet.'],
    ] },
    es: { h1: ['Seguridad y ', 'confianza'], lead: 'Un sitio público de calificaciones solo vale algo si la gente puede confiar en los números. Aquí está cómo nos protegemos de bots y calificaciones falsas, qué guardamos, qué nunca guardamos y qué sigue siendo un riesgo.', blocks: [
      ['h2', 'Protecciones que funcionan hoy'],
      ['rows', [
        ['Una calificación por teléfono por funcionario cada 30 días', 'Cada teléfono recibe un código anónimo al azar que firma nuestro servidor, así que nadie puede inventar uno. Una segunda calificación a la misma persona en menos de 30 días se bloquea.'],
        ['Límites de uso', 'Cada acción (calificación, reporte, nota de voz, sugerencia, opinión) tiene un límite por teléfono y por red cada hora, y los códigos nuevos tienen un límite por red cada día. Los picos desde una misma fuente se frenan.'],
        ['Comprobación del tribunal', 'Si permites la ubicación, comprobamos que tu teléfono esté a menos de 1,000 pies del tribunal y guardamos solo sí o no. Las calificaciones hechas cerca del tribunal se marcan y cada perfil muestra cuántas hay. Es una señal, no una prueba.'],
        ['Cada comentario se revisa dos veces', 'Primero con reglas automáticas en el momento en que se envía (sin insultos, datos de contacto, enlaces ni nombres de personas privadas) y después por una persona moderadora, que lo aprueba o lo quita.'],
        ['Reportes', 'Solo los teléfonos que ya han calificado a alguien pueden reportar un comentario. Cuando dos teléfonos distintos lo reportan, queda oculto hasta que un moderador decida. Un reporte nunca puede anular la aprobación de un moderador.'],
        ['Moderadores a la vista', 'Cada decisión es pública, con el nombre del moderador y el motivo. Las herramientas de moderación no están en el sitio público. Viven en una dirección aparte que exige un acceso personal con contraseña (un código de un solo uso está planeado).'],
        ['Texto limpio', 'Los comentarios son solo texto simple. Se eliminan el formato, los scripts y los caracteres de control. Tienen un límite de longitud.'],
        ['Solo nuestro servidor', 'Sin anuncios, sin rastreadores ni analíticas de otras empresas, sin fuentes ni scripts externos. Todo carga desde nuestro propio servidor, así que ninguna empresa externa se entera de quién nos visita. La única excepción es el video de Acerca de: se reproduce desde YouTube en su modo de privacidad mejorada, y no se carga nada de YouTube hasta que pulses reproducir.'],
        ['Un rompecabezas en lugar de un captcha externo', 'Antes de una calificación u otro envío, el teléfono resuelve por sí solo un pequeño rompecabezas. Lo alojamos nosotros, así que no interviene ninguna empresa externa, y frena a los bots.'],
        ['Servidor reforzado', 'Conexión cifrada, una regla estricta del navegador que bloquea cualquier código externo, sin incrustación en otros sitios, sin envío de referencia, solo solicitudes del mismo sitio y protección contra formularios falsos enviados desde otras páginas.'],
        ['Oculto hasta que sea seguro', 'No se muestra ninguna nota media hasta que al menos 5 personas hayan calificado, y los resultados por grupo aparecen solo cuando cada grupo es lo bastante grande. Cada calificación se muestra solo con sus respuestas y el papel de quien la dejó: sin nombre, sin ubicación y con la hora redondeada.']]],
      ['h2', 'Qué guardamos y qué nunca guardamos'],
      ['ul', [
        'Guardamos: tus calificaciones y tu comentario opcional; si dijiste que ganaste o perdiste; tu papel; si tu teléfono estaba cerca del tribunal (sí o no); la hora redondeada; y el código aleatorio de tu teléfono.',
        'Nunca guardamos: tu nombre, correo, número de teléfono, ubicación exacta ni tu dirección IP. Tu dirección de red se guarda solo en la memoria del servidor durante poco tiempo para frenar picos y nunca se escribe en la base de datos.',
        'Las grabaciones de voz se convierten en texto y se borran de inmediato. Nunca se conservan.',
        'El código de tu teléfono es aleatorio y no se vincula a nada sobre ti, pero sí enlaza tus propias calificaciones entre sí. A los 30 días cortamos ese enlace. Si borras los datos del navegador, el código desaparece de tu teléfono.']],
      ['h2', 'Qué puede salir mal, con honestidad'],
      ['ul', [
        'Una persona decidida con muchos teléfonos, redes distintas o una herramienta para falsear la ubicación aún podría llenar las urnas.',
        'Borrar los datos del navegador, o usar otro teléfono, da un código anónimo nuevo, así que la regla de una calificación cada 30 días es un freno, no un muro.',
        'La comprobación del tribunal se puede engañar con un teléfono que falsea su ubicación. Por eso mostramos cuántas calificaciones se hicieron cerca del tribunal en lugar de fingir que es una prueba.',
        'Las personas enojadas, o las que apoyan al funcionario, tienen más probabilidad de participar. Todo sitio abierto de calificaciones tiene ese sesgo; por eso mostramos si quien califica ganó o perdió.',
        'Calificar a un funcionario real y con nombre conlleva el riesgo de afirmaciones injustas o falsas. Lo reducimos con preguntas basadas en hechos, moderación y un proceso de corrección (ver abajo), pero no podemos eliminarlo.']],
      ['h2', 'Planeado antes del lanzamiento público'],
      ['ul', [
        'Un rompecabezas más difícil cuando la actividad parece inusual.',
        'Alertas automáticas por ráfagas inusuales: muchas calificaciones desde una red o en pocos minutos.',
        'Una revisión de seguridad independiente (una prueba en la que expertos intentan entrar). Para avisar de una debilidad ahora, escribe a security@rateyourjudgecolorado.com.',
        'Un derecho de réplica y un proceso de corrección para funcionarios que crean que algo es falso.',
        'Publicar el código para que cualquiera verifique estas afirmaciones, y una auditoría pública del registro de moderación.',
        'Términos de uso, política de privacidad y un proceso de correcciones y retiro, revisados por un abogado, y una revisión legal de la publicación de calificaciones sobre funcionarios públicos con nombre.']],
      ['note', 'Esta página enumera lo que ya está hecho y lo que está planeado. La actualizaremos cuando algo cambie y diremos claramente cuando una protección aún no exista.'],
    ] },
  },
  terms: {
    en: { h1: ['Terms of ', 'use'], lead: 'The simple rules for using this site. Rate Your Judge Colorado belongs to the Colorado community: its code is open source and public, anyone can check or reuse it, and the community helps moderate it. Last updated: October 16, 2026.', blocks: [
      ['h2', 'What this site is'],
      ['p', 'Rate Your Judge Colorado is an independent public project. It lets people share their own experience of a judge or prosecutor in a Colorado courtroom. It is not part of the State of Colorado, its courts or any commission, and it gives no legal advice.'],
      ['h2', 'What you agree to when you rate'],
      ['ul', [
        'You were really there and you are describing your own experience.',
        'You write facts and behavior you saw, not insults, threats, rumors or guesses about why someone did something.',
        'You do not post private details: names of minors, victims, case numbers, addresses, or anything sealed or confidential.',
        'You rate a person once per hearing and do not try to rig results with extra phones or help from others.',
        'You are 18 or older.',
        'You are responsible for what you write. Your comment is your own statement, not a statement by this project.']],
      ['h2', 'What we do with comments'],
      ['ul', [
        'Moderation is technology-assisted review (TAR): every comment first passes an automated screen that refuses insults, contact details, links and case numbers, and holds back possible private names, threats and accusations of crimes. The screen is rules only, runs on our own server, and its code is public.',
        'Then people review it. A rotating group of volunteers from the community reviews the site and flags problems, and a moderator approves or removes each comment. Every decision is logged in public with the moderator’s display name and the reason.',
        'Comments appear right away, marked “Not reviewed yet”, until a moderator decides. Moderators may refuse, shorten or remove a comment.',
        'Scores and comments are opinions of the people who wrote them, not statements by this project.',
        'We may remove anything that breaks these rules, and may block abuse of the site.']],
      ['h2', 'The law this site rests on'],
      ['p', 'Talking about how public officials do their jobs is protected speech. These are the main rules we rely on. They are listed so anyone can check them; they are not legal advice.'],
      ['ul', [
        'The First Amendment to the U.S. Constitution, and Article II, Section 10 of the Colorado Constitution: “every person shall be free to speak, write or publish whatever he will on any subject, being responsible for all abuse of that liberty.”',
        'New York Times Co. v. Sullivan, 376 U.S. 254 (1964): a public official who sues over criticism of official conduct must prove “actual malice”, meaning the statement was false and was made knowing it was false or with reckless disregard of whether it was.',
        'Diversified Management, Inc. v. Denver Post, Inc., 653 P.2d 1103 (Colo. 1982): Colorado applies the same actual-malice standard to statements on matters of public concern.',
        'Milkovich v. Lorain Journal Co., 497 U.S. 1 (1990), and Keohane v. Stewart, 882 P.2d 1293 (Colo. 1994): an opinion is protected unless it implies a provably false statement of fact. Ratings and comments here are opinions about what people saw in a courtroom.',
        '47 U.S.C. § 230(c): a website is not treated as the publisher or speaker of what its users write, and may moderate in good faith without becoming liable for it. See also Zeran v. America Online, Inc., 129 F.3d 327 (4th Cir. 1997).',
        'C.R.S. § 13-20-1101, Colorado’s anti-SLAPP law (2019): a lawsuit over speech on a public issue is dismissed early unless the person suing shows a reasonable likelihood of winning, and a defendant who wins that motion can generally recover attorney fees.']],
      ['p', 'These protections have limits. They do not cover threats, harassment, or false statements of fact made knowingly or recklessly, and each author answers for their own words. What we publish ourselves (the scores we calculate, the appeals record, the text of these pages) is our responsibility; that is why every number links to its source and we correct errors quickly (see Corrections and removal).'],
      ['h2', 'Governing law and legal requests'],
      ['p', 'These terms are governed by the laws of the State of Colorado and of the United States. We keep as little as we can: no names, and no IP addresses in our database. We respond to legal demands for information only when they are valid court orders, and then only with what we actually keep.'],
      ['h2', 'Limits'],
      ['p', 'The site is a pilot and is provided as it is, without promises that it is always available or that every score is accurate. The people listed are real public officials; ratings and comments are the opinions of the people who wrote them. During the pilot we collect feedback to improve the service. Do not use it to decide a legal matter.'],
      ['h2', 'Questions and corrections'],
      ['p', 'If something about you or a ruling is wrong, see Corrections and removal. Contact: hello@rateyourjudgecolorado.com.'],
    ] },
    es: { h1: ['Términos de ', 'uso'], lead: 'Las reglas sencillas para usar este sitio. Rate Your Judge Colorado pertenece a la comunidad de Colorado: su código es abierto y público, cualquiera puede revisarlo o reutilizarlo, y la comunidad ayuda a moderarlo. Última actualización: 16 de octubre de 2026.', blocks: [
      ['h2', 'Qué es este sitio'],
      ['p', 'Rate Your Judge Colorado es un proyecto público e independiente. Permite compartir tu propia experiencia con un juez o fiscal en un tribunal de Colorado. No es parte del Estado de Colorado, de sus tribunales ni de ninguna comisión, y no da asesoría legal.'],
      ['h2', 'Qué aceptas al calificar'],
      ['ul', [
        'Estuviste allí de verdad y describes tu propia experiencia.',
        'Escribes hechos y conductas que viste, no insultos, amenazas, rumores ni suposiciones sobre por qué alguien hizo algo.',
        'No publicas datos privados: nombres de menores o víctimas, números de caso, direcciones, ni nada sellado o confidencial.',
        'Calificas a una persona una vez por audiencia y no intentas manipular los resultados con más teléfonos o con ayuda de otros.',
        'Tienes 18 años o más.',
        'Eres responsable de lo que escribes. Tu comentario es tu propia declaración, no una declaración de este proyecto.']],
      ['h2', 'Qué hacemos con los comentarios'],
      ['ul', [
        'La moderación es una revisión asistida por tecnología (TAR, por sus siglas en inglés): cada comentario pasa primero por un filtro automático que rechaza insultos, datos de contacto, enlaces y números de caso, y retiene posibles nombres de particulares, amenazas y acusaciones de delitos. El filtro son solo reglas, funciona en nuestro propio servidor y su código es público.',
        'Después lo revisan personas. Un grupo rotativo de voluntarios de la comunidad revisa el sitio y señala problemas, y una persona moderadora aprueba o quita cada comentario. Cada decisión queda registrada en público con el nombre visible de quien modera y el motivo.',
        'Los comentarios aparecen enseguida, marcados “Aún sin revisar”, hasta que alguien de moderación decide. Los moderadores pueden rechazar, acortar o quitar un comentario.',
        'Las notas y los comentarios son opiniones de quienes los escribieron, no declaraciones de este proyecto.',
        'Podemos quitar lo que incumpla estas reglas y bloquear el abuso del sitio.']],
      ['h2', 'La ley en que se apoya este sitio'],
      ['p', 'Hablar de cómo los funcionarios públicos hacen su trabajo es expresión protegida. Estas son las reglas principales en las que nos apoyamos. Las citamos para que cualquiera pueda comprobarlas; no son asesoría legal.'],
      ['ul', [
        'La Primera Enmienda de la Constitución de EE. UU. y el Artículo II, Sección 10 de la Constitución de Colorado: toda persona es libre de hablar, escribir o publicar lo que quiera sobre cualquier tema, respondiendo por el abuso de esa libertad.',
        'New York Times Co. v. Sullivan, 376 U.S. 254 (1964): un funcionario público que demanda por críticas a su conducta oficial debe probar “actual malice”, es decir, que la afirmación era falsa y se hizo sabiendo que lo era o con desprecio temerario por si lo era.',
        'Diversified Management, Inc. v. Denver Post, Inc., 653 P.2d 1103 (Colo. 1982): Colorado aplica el mismo estándar a las afirmaciones sobre asuntos de interés público.',
        'Milkovich v. Lorain Journal Co., 497 U.S. 1 (1990), y Keohane v. Stewart, 882 P.2d 1293 (Colo. 1994): una opinión está protegida salvo que implique una afirmación de hecho que se pueda probar falsa. Las calificaciones y comentarios de este sitio son opiniones sobre lo que la gente vio en una sala.',
        '47 U.S.C. § 230(c): un sitio web no se trata como editor ni autor de lo que escriben sus usuarios, y puede moderar de buena fe sin volverse responsable por ello. Véase también Zeran v. America Online, Inc., 129 F.3d 327 (4th Cir. 1997).',
        'C.R.S. § 13-20-1101, la ley anti-SLAPP de Colorado (2019): una demanda por expresiones sobre un asunto público se desestima al inicio salvo que quien demanda muestre una probabilidad razonable de ganar, y el demandado que gana esa moción en general recupera los honorarios de abogado.']],
      ['p', 'Estas protecciones tienen límites. No cubren amenazas, acoso ni afirmaciones de hecho falsas hechas a sabiendas o con desprecio temerario, y cada autor responde por sus propias palabras. Lo que publicamos nosotros (las puntuaciones que calculamos, el historial de apelaciones, el texto de estas páginas) es nuestra responsabilidad; por eso cada número enlaza a su fuente y corregimos los errores rápido (ver Correcciones y retiro).'],
      ['h2', 'Ley aplicable y solicitudes legales'],
      ['p', 'Estos términos se rigen por las leyes del Estado de Colorado y de Estados Unidos. Guardamos lo menos posible: ni nombres ni direcciones IP en nuestra base de datos. Solo respondemos a pedidos legales de información cuando son órdenes judiciales válidas, y solo con lo que realmente guardamos.'],
      ['h2', 'Límites'],
      ['p', 'El sitio es un piloto y se ofrece tal cual, sin promesas de que siempre esté disponible ni de que cada nota sea exacta. Las personas que aparecen son funcionarios públicos reales; las calificaciones y comentarios son opiniones de quienes los escribieron. Durante el piloto recopilamos opiniones para mejorar el servicio. No lo uses para decidir un asunto legal.'],
      ['h2', 'Preguntas y correcciones'],
      ['p', 'Si algo sobre ti o una resolución es incorrecto, mira Correcciones y retiro. Contacto: hello@rateyourjudgecolorado.com.'],
    ] },
  },
  privacy: {
    en: { h1: ['Privacy ', 'policy'], lead: 'What we keep, why, and for how long. Last updated: October 16, 2026.', blocks: [
      ['h2', 'What we keep'],
      ['ul', [
        'Your ratings, optional comment, role, and optional outcome (won, lost, mixed, watching).',
        'Whether your phone was near the courthouse (yes or no). Your exact location is never stored.',
        'The time of your rating, rounded to the hour.',
        'A random token for your phone that our server signs. It is not tied to your name. After 30 days we cut the link between the token and your ratings.',
        'If you use “Get involved”: the interests, message and contact you type. We delete these after 6 months.',
        'If you use the feedback form: your answers, with no name. What you write in it is shown publicly on the home page, without your name; a moderator can remove it.']],
      ['h2', 'What we never keep'],
      ['ul', [
        'Your name, email or phone number (unless you type them in “Get involved”).',
        'Your IP address on disk. It lives briefly in memory to slow down abuse. It is never written to the database.',
        'Voice recordings. They are turned into text on our own server and deleted at once.',
        'Ads, trackers or analytics from other companies. Fonts are on our own server too. The video on About loads YouTube only after you press play.']],
      ['h2', 'Who sees it'],
      ['p', 'Approved moderators see comments waiting for review. Published ratings and comments are public without any name. We do not sell or share data.'],
      ['h2', 'Legal requests'],
      ['p', 'Because we keep so little, there is little to hand over. If we are legally required to share something we will share only what exists, and tell you here when the law allows.'],
      ['h2', 'Your choices'],
      ['p', 'You can clear your browser data at any time; the token on your phone disappears. To ask us to remove something you wrote, use Corrections and removal. Contact: privacy@rateyourjudgecolorado.com.'],
      ['h2', 'Children'],
      ['p', 'This site is for people 18 or older.'],
    ] },
    es: { h1: ['Política de ', 'privacidad'], lead: 'Qué guardamos, por qué y por cuánto tiempo. Última actualización: 16 de octubre de 2026.', blocks: [
      ['h2', 'Qué guardamos'],
      ['ul', [
        'Tus calificaciones, comentario opcional, tu papel y el resultado opcional (gané, perdí, mixto, solo observé).',
        'Si tu teléfono estaba cerca del tribunal (sí o no). Tu ubicación exacta nunca se guarda.',
        'La hora de tu calificación, redondeada a la hora.',
        'Un código aleatorio de tu teléfono que firma nuestro servidor. No está ligado a tu nombre. A los 30 días cortamos el enlace entre el código y tus calificaciones.',
        'Si usas «Participa»: los intereses, el mensaje y el contacto que escribas. Los borramos a los 6 meses.',
        'Si usas el formulario de opinión: tus respuestas, sin nombre. Lo que escribas se muestra públicamente en la página principal, sin tu nombre; una persona moderadora puede retirarlo.']],
      ['h2', 'Qué nunca guardamos'],
      ['ul', [
        'Tu nombre, correo o teléfono (salvo que los escribas en «Participa»).',
        'Tu dirección IP en disco. Vive brevemente en memoria para frenar abusos. Nunca se escribe en la base de datos.',
        'Grabaciones de voz. Se convierten en texto en nuestro propio servidor y se borran de inmediato.',
        'Anuncios, rastreadores ni analíticas de otras empresas. Las fuentes también están en nuestro servidor. El video de Acerca de carga YouTube solo después de que pulses reproducir.']],
      ['h2', 'Quién lo ve'],
      ['p', 'Las personas moderadoras aprobadas ven los comentarios pendientes de revisión. Las calificaciones y comentarios publicados son públicos y sin nombre. No vendemos ni compartimos datos.'],
      ['h2', 'Solicitudes legales'],
      ['p', 'Como guardamos tan poco, hay poco que entregar. Si la ley nos obliga a compartir algo, compartiremos solo lo que exista y lo diremos aquí cuando la ley lo permita.'],
      ['h2', 'Tus opciones'],
      ['p', 'Puedes borrar los datos de tu navegador cuando quieras; el código de tu teléfono desaparece. Para pedir que quitemos algo que escribiste, usa Correcciones y retiro. Contacto: privacy@rateyourjudgecolorado.com.'],
      ['h2', 'Menores'],
      ['p', 'Este sitio es para personas de 18 años o más.'],
    ] },
  },
  corrections: {
    en: { h1: ['Corrections and ', 'removal'], lead: 'If something here is wrong or unfair, tell us. Last updated: October 16, 2026.', blocks: [
      ['h2', 'Who can ask'],
      ['p', 'Any judge, prosecutor or other person named on the site, or anyone who wrote a comment, can ask for a correction, a reply or a removal.'],
      ['h2', 'How it works'],
      ['ul', [
        'Write to the contact address below and say which page or comment, and what is wrong.',
        'A moderator reads it within a few days and removes anything that is false, private, or breaks the Terms.',
        'Planned: officials will be able to add a short public reply of up to 500 characters, shown next to their scores.',
        'We keep a public record of what was changed and why, without personal details.']],
      ['h2', 'What we cannot do'],
      ['p', 'We cannot remove honest opinions about public behavior in court just because they are unflattering. Scores are never changed by hand.'],
      ['p', 'Contact: corrections@rateyourjudgecolorado.com.'],
    ] },
    es: { h1: ['Correcciones y ', 'retiro'], lead: 'Si algo aquí es incorrecto o injusto, avísanos. Última actualización: 16 de octubre de 2026.', blocks: [
      ['h2', 'Quién puede pedirlo'],
      ['p', 'Cualquier juez, fiscal u otra persona mencionada en el sitio, o quien escribió un comentario, puede pedir una corrección, una réplica o un retiro.'],
      ['h2', 'Cómo funciona'],
      ['ul', [
        'Escribe a la dirección de contacto de abajo e indica qué página o comentario y qué está mal.',
        'Una persona moderadora lo lee en pocos días y quita lo que sea falso, privado o incumpla los Términos.',
        'Planeado: los funcionarios podrán añadir una réplica pública breve, de hasta 500 caracteres, junto a sus notas.',
        'Guardamos un registro público de lo que se cambió y por qué, sin datos personales.']],
      ['h2', 'Lo que no podemos hacer'],
      ['p', 'No podemos quitar opiniones honestas sobre la conducta pública en el tribunal solo por ser poco halagadoras. Las notas nunca se cambian a mano.'],
      ['p', 'Contacto: corrections@rateyourjudgecolorado.com.'],
    ] },
  },
  join: {
    en: { h1: ['Get ', 'involved'], lead: 'This is a public project for the people of Colorado. Tell us how you would like to help. A real person reads every message.', blocks: [
      ['h2', 'How can you help?'],
      ['form', {
        interests: [['volunteer', 'Volunteer'], ['developer', 'Programmer'], ['tester', 'Tester'], ['promoter', 'Spread the word'], ['legal', 'Lawyer or legal help'], ['translator', 'Translator'], ['other', 'Something else']],
        pick: 'Pick any that fit', msg: 'Anything you want to tell us (optional)', contact: 'How can we reach you? Email or phone (optional)', send: 'Send', thanks: 'Thank you! We will get back to you if you left a way to reach you.', err: 'Could not send. Please try again in a minute.',
        note: 'We use this only to contact you about the project and delete it after 6 months. Do not write anything about a court case here.' }],
    ] },
    es: { h1: ['Participa', ''], lead: 'Este es un proyecto público para la gente de Colorado. Cuéntanos cómo te gustaría ayudar. Una persona real lee cada mensaje.', blocks: [
      ['h2', '¿Cómo puedes ayudar?'],
      ['form', {
        interests: [['volunteer', 'Voluntariado'], ['developer', 'Programación'], ['tester', 'Pruebas'], ['promoter', 'Difundir el proyecto'], ['legal', 'Ayuda legal'], ['translator', 'Traducción'], ['other', 'Otra cosa']],
        pick: 'Elige las que apliquen', msg: 'Lo que quieras contarnos (opcional)', contact: '¿Cómo te contactamos? Correo o teléfono (opcional)', send: 'Enviar', thanks: '¡Gracias! Te responderemos si dejaste una forma de contactarte.', err: 'No se pudo enviar. Inténtalo de nuevo en un minuto.',
        note: 'Usamos esto solo para contactarte sobre el proyecto y lo borramos a los 6 meses. No escribas aquí nada sobre un caso judicial.' }],
    ] },
  },
};

function joinForm(F) {
  prefetchCaptcha();
  const sel = new Set(), msg = h('textarea', { id: 'jmsg', maxlength: 500, rows: 4 }), con = h('input', { id: 'jcon', type: 'text', maxlength: 120, autocomplete: 'off' });
  const hp = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', style: 'position:absolute;left:-9999px' });
  const err = h('div', { class: 'err', role: 'alert', hidden: true }, F.err), ok = h('p', { class: 'fbthanks', role: 'status', hidden: true }, '✅ ' + F.thanks);
  const chips = F.interests.map(([k, label]) => h('button', { type: 'button', class: 'chipbtn', 'aria-pressed': 'false', onclick: e => { sel.has(k) ? sel.delete(k) : sel.add(k); e.currentTarget.setAttribute('aria-pressed', sel.has(k)); } }, label));
  const send = h('button', { class: 'btn', type: 'button', onclick: async () => {
    send.disabled = true; err.hidden = true;
    try {
      const r = await fetch('/api/join', { method: 'POST', headers: { 'content-type': 'application/json', 'x-captcha': await captchaHeader() }, body: JSON.stringify({ interests: [...sel], message: msg.value, contact: con.value, website: hp.value, lang: LANG }) });
      if (!r.ok) throw new Error(); ok.hidden = false; send.hidden = true;
    } catch { err.hidden = false; send.disabled = false; }
  } }, F.send);
  return h('div', { class: 'joinform' }, h('div', { class: 'q', id: 'jpick' }, F.pick), h('div', { class: 'chips', role: 'group', 'aria-labelledby': 'jpick' }, chips),
    h('label', { class: 'q', for: 'jmsg' }, F.msg), msg, h('label', { class: 'q', for: 'jcon' }, F.contact), con, hp,
    h('p', { class: 'muted' }, F.note), err, ok, h('div', { style: 'margin-top:12px' }, send));
}

// A video without YouTube watching every visitor: our own copy of the cover image, and the player (privacy-enhanced
// youtube-nocookie.com) is created only when someone presses play. CSP frame-src allows that one host.
function videoFig(id, title, poster, note) {
  const es = LANG === 'es', fig = h('figure', { class: 'docvid' });
  const play = () => fig.querySelector('.vidbtn').replaceWith(h('iframe', { src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, title, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '', referrerpolicy: 'strict-origin-when-cross-origin' }));
  fig.append(h('button', { type: 'button', class: 'vidbtn', 'aria-label': (es ? 'Reproducir el video: ' : 'Play the video: ') + title, onclick: play },
      h('img', { src: poster, alt: '', width: 1280, height: 720, loading: 'lazy', decoding: 'async' }), h('span', { class: 'vidplay', 'aria-hidden': 'true' }), h('span', { class: 'vidyt' }, es ? 'Se reproduce desde YouTube' : 'Plays from YouTube')),
    h('figcaption', {}, note, ' ', h('a', { href: 'https://www.youtube.com/watch?v=' + id, target: '_blank', rel: 'noopener noreferrer' }, es ? 'Ver en YouTube' : 'Watch on YouTube')));
  return fig;
}
const page = document.body.dataset.page, app = $('#app');
function draw() {
  const P = (PAGES[page] || {})[LANG] || PAGES[page].en;
  document.documentElement.lang = LANG; document.title = P.h1.join('') + ' — Rate Your Judge Colorado'; document.body.dataset.title = 'custom';
  const kids = [h('h1', {}, P.h1[0], h('em', {}, P.h1[1])), h('p', { class: 'lead' }, P.lead)];
  const cards = [], toc = [];                                                   // desktop: a section list beside the text (hidden on phones)
  let cur = null; const card = () => { cur = h('div', { class: 'card doc' }); cards.push(cur); return cur; };
  for (const [k, a] of P.blocks.map(b => [b[0], b.slice(1)])) {
    if (k === 'h2') { const id = 's-' + (toc.length + 1); card().append(h('h2', { id }, a[0])); toc.push(h('li', {}, h('a', { href: '#' + id }, a[0]))); continue; }
    if (!cur) card();
    if (k === 'p') cur.append(h('p', {}, a[0]));
    else if (k === 'note') cur.append(h('p', { class: 'doc-note' }, a[0]));
    else if (k === 'ul') cur.append(h('ul', {}, a[0].map(x => h('li', {}, x))));
    else if (k === 'rows') cur.append(h('div', { class: 'docrows' }, a[0].map(([t, d]) => h('div', { class: 'docrow' }, h('b', {}, t), h('p', {}, d)))));
    else if (k === 'callout') cur.append(h('div', { class: 'callout' }, h('p', { class: 'callout-h' }, a[0]), h('ul', {}, a[1].map(x => h('li', {}, x)))));
    else if (k === 'fig') cur.append(h('figure', { class: 'docfig' }, h('a', { href: a[3], target: '_blank', rel: 'noopener noreferrer' }, h('img', { src: a[0], alt: a[1], width: (a[4] || [1100, 584])[0], height: (a[4] || [1100, 584])[1], loading: 'lazy', decoding: 'async' })), h('figcaption', {}, a[2], a[5] ? [' ', h('a', { href: a[5], target: '_blank', rel: 'noopener' }, a[6] || '(saved copy)')] : null)));
    else if (k === 'video') cur.append(videoFig(...a));
    else if (k === 'form') cur.append(joinForm(a[0]));
    else if (k === 'src') cur.append(h('ul', { class: 'srcs' }, a[0].map(key => h('li', {}, h('a', { href: S(key)[1], target: '_blank', rel: 'noopener noreferrer', lang: 'en' }, S(key)[0])))));
  }
  const nav = toc.length > 2 ? h('nav', { class: 'doc-toc', 'aria-label': LANG === 'es' ? 'En esta página' : 'On this page' }, h('p', {}, LANG === 'es' ? 'En esta página' : 'On this page'), h('ul', {}, toc)) : null;
  app.replaceChildren(...kids, h('div', { class: 'doc-grid' + (nav ? '' : ' notoc') }, nav, h('div', { class: 'doc-body' }, cards)));
}
if (PAGES[page]) { draw(); onLang(draw); }   // a page without an entry here (the /judges directory) is rendered by the server and stays as sent
