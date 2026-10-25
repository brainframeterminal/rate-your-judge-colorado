# OJPE blue book extraction - Rate Your Judge Colorado

Generated 2026-10-23 from public pages of judicialperformance.colorado.gov. Data file: `bluebook.json`.

## Method and what the sources contain

- The 113 "2024 report" PDFs (`pdf/2024/*.pdf`, all downloaded) are the market-research survey reports (response counts and score charts). They contain NO commission recommendation, vote or appointment date (only a survey item "Yes, meets performance"). So they were not used for those fields.
- The recommendation, commission vote and appointment narrative are on each judge's own HTML page (e.g. `/andrews-ashley-2024-evaluation`) and on the per-year listing pages (`/2024-judicial-performance-evaluations`, `/know-your-judges/2022-...`, `2020`, `/2018-...`, `2016`). All of it was taken from those pages (HTML cached under `html/<year>/`).
- Every field carries a verbatim quote (<=25 words). `page` is null everywhere: the sources are HTML pages, not paged PDFs. Older cycles are NOT combined voter-guide PDFs; each exists as a per-judge page, so none was downloaded as a PDF.
- The `recommendation` value is the text printed in the listing row of that year (e.g. 2024 "MEETS PERFORMANCE STANDARDS", 2020/2018 "Meets Performance Standard", 2016 "Retain"/"Does Not Retain"); `recommendation_on_page` is the "Recommendation:" field of the judge page.
- `appointed.year` is read from the narrative sentence in `appointed.quote`. Where the sentence names no court ("appointed to the bench in 2016") it is recorded with a note; where the narrative gives only "has served as a ... judge since YEAR" the `basis` says "tenure statement". Where two different years competed or none was printed it is null with the candidates listed.

## Totals per recommendation per year (all judges the state lists, unique judges)

| Cycle | Judges listed | Recommendation (as printed) |
|---|---|---|
| 2024 | 116 | MEETS PERFORMANCE STANDARDS: 115; DOES NOT MEET PERFORMANCE STANDARDS: 1 |
| 2022 | 135 | Meets Performance Standards: 135 |
| 2020 | 100 | Meets Performance Standard: 97; Does Not Meet Performance Standard: 2; (blank): 1 |
| 2018 | 131 | Meets Performance Standard: 128; Does Not Meet Performance Standard: 2; (blank): 1 |
| 2016 | 108 | Retain: 106; Does Not Retain: 1; Do Not Retain: 1 |

Within bluebook.json: 447 report entries (116 judges with a 2024 report, 331 judges found only in earlier cycles), 222 matched to a judge on our site (97 of them have a 2024 report).

Note: 2024 listing has 116 judges; we had 113 PDFs. The 3 extra are the Supreme Court / Court of Appeals entries without a survey PDF in our TSV list or judges added later.

## Every "does not meet" / "does not retain" (all cycles)

- **2024 Angela M. Roff** (Ninth Judicial District - Garfield County Court Judge) - DOES NOT MEET PERFORMANCE STANDARDS; vote: 4-3; site #367 Judge Angela Roff
  - quote: "on Judicial Performance finds that Judge Angela M. Roff DOES NOT MEET PERFORMANCE STANDARDS , by a vote of 4-3 (with three members"
  - https://judicialperformance.colorado.gov/roff-angela-m-2024-evaluation
- **2020 Tomee Crespin** (Adams) - Does Not Meet Performance Standard; vote: 5-3; NOT on our site / unmatched
  - quote: "by a 5-3 vote that the Honorable Tomee Crespin DOES NOT MEET PERFORMANCE STANDARDS . Two Commission members did not participate in the"
  - https://judicialperformance.colorado.gov/crespin-tomee-2020-evaluation
- **2020 James Craig Dolezal** (Sedgwick) - Does Not Meet Performance Standard; vote: not printed; NOT on our site / unmatched
  - quote: "Judicial Performance finds that the Honorable James Craig Dolezal DOES NOT MEET PERFORMANCE STANDARDS . Five members of the Commission voted that Judge"
  - https://judicialperformance.colorado.gov/dolezal-james-2020-evaluation
- **2018 Phillip L. Douglass** (Arapahoe) - Does Not Meet Performance Standard; vote: 6-3; NOT on our site / unmatched
  - quote: "3 with one recusal, that Judge Phillip L. Douglass DOES NOT MEET PERFORMANCE STANDARDS ."
  - https://judicialperformance.colorado.gov/douglass-phillip-2018-evaluation
- **2018 Christopher Edward Acker** (El Paso) - Does Not Meet Performance Standard; vote: 4-1; NOT on our site / unmatched
  - quote: "that El Paso County Court Judge Christopher Edward Acker DOES NOT MEET PERFORMANCE STANDARDS . There was one recusal and three other members"
  - https://judicialperformance.colorado.gov/acker-christopher-2018-evaluation
- **2016 Jill-Ellyn Straus** (Adams) - Does Not Retain; vote: 8-1; NOT on our site / unmatched
  - quote: "Commission on Judicial Performance recommends that Judge Jill-Ellyn Straus NOT BE RETAINED , by a vote of 8 to 1."
  - https://judicialperformance.colorado.gov/straus-jill-ellyn-2016-evaluation
- **2016 Michael Andrew Schiferl** (Bent) - Do Not Retain; vote: 6-3; NOT on our site / unmatched
  - quote: "3, with one recusal, that Judge Michael Andrew Schiferl NOT BE RETAINED . If he is retained notwithstanding the recommendation, the"
  - https://judicialperformance.colorado.gov/schiferl-michael-2016-evaluation

## Appointment years

- 281 of 447 entries have an appointment year; 105 of 116 judges with a 2024 report; 167 of 222 matched site judges.
- 22 of those are 'served as ... judge since YEAR' / 'joined ...' statements rather than the word 'appointed': kuhn-eric, shakes-david, ankeny-charlotte, gerhart-shannon, findley-joseph, brammer-ray, brown-jaclyn, gomez-christina, romeo-karen, wheeler-tanya, taylor-david, brandenburg-dennis, kilgore-theresa, harris-elizabeth, richman-david, sierra-norma, singer-michael, hood-william, ashby-karen, berger-michael, bernard-steven, navarro-anthony.
- 2024 judges with NO appointment year (11): schutz-timothy (no appointment sentence with a year); ivey-marques (no appointment sentence with a year); jean-madoche (no appointment sentence with a year); hernandez-melina (no appointment sentence with a year); shropshire-kim (no appointment sentence with a year); lishchuk-lyudmyla (no appointment sentence with a year); kelly-jason (no appointment sentence with a year); zeerip-bough (no appointment sentence with a year); burgemeister-ashley (no appointment sentence with a year); thomasson-lane (no appointment sentence with a year); esser-allison (no appointment sentence with a year)
- Judges found only in older cycles take their appointment year from that older page (`appointed.from_cycle`).

## Unmatched 2024 reports (judge on the state list, not matched to a judge on our site)

- Gilbert M. Román - Colorado Court of Appeals: no official on our site with that last name + first name/initial
- Sharon Diane Holbrook - Seventeenth Judicial District - District Court Judge: no official on our site with that last name + first name/initial
- Courtney L. Dinnel - Seventeenth Judicial District - Adams County Court Judge: exact name match but court differs: #523 Judge Courtney L. Dinnel listed at ['mesa'] (site district ['21']); report says Seventeenth Judicial District - Adams County Court Judge
- Kimberly D. Cortez - Twelfth Judicial District - District Court Judge: no official on our site with that last name + first name/initial
- Ben L. Leutwyler III - Eighteenth Judicial District - District Court Judge: no official on our site with that last name + first name/initial
- Robert R. Lung - Eighteenth Judicial District - District Court Judge: no official on our site with that last name + first name/initial
- Michael J. Davidson - Fifteenth Judicial District - District Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #431 Judge Mike Davidson
- Milla Lishchuk - Fifteenth Judicial District - Baca County Court Judge: exact name match but court differs: #414 Judge Milla Lishchuk listed at ['morgan'] (site district ['13']); report says Fifteenth Judicial District - Baca County Court Judge
- Deni Estelle Eiring - Fifteenth Judicial District - Cheyenne County Court Judge: exact name match but court differs: #435 Judge Deni E. Eiring listed at ['bent', 'crowley', 'otero'] (site district ['16']); report says Fifteenth Judicial District - Cheyenne County Court Judge
- Andre L. Rudolph - Second Judicial District - Denver County Court Judge: no official on our site with that last name + first name/initial
- Barry A. Schwartz - Second Judicial District - Denver County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #363 Judge Jeffrey M. Schwartz
- Linda Margaret Billings-Vela - Fourth Judicial District - District Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #313 Judge Lin Billings Vela
- David L. Shakes - Fourth Judicial District - District Court Judge: no official on our site with that last name + first name/initial
- Steven Katzman - Fourth Judicial District - El Paso County Court Judge: no official on our site with that last name + first name/initial
- Ashley Burgemeister - Seventh Judicial District - Gunnison County Court Judge: no official on our site with that last name + first name/initial
- Keith Michael Goman - First Judicial District - Jefferson County Court Judge: no official on our site with that last name + first name/initial
- Justin B. Haenlein - Thirteenth Judicial District - District Court Judge: no official on our site with that last name + first name/initial
- Kraig Ecton - Eighth Judicial District - Larimer County Court Judge: no official on our site with that last name + first name/initial
- Anthony D. Edwards - Sixth Judicial District - San Juan County Court Judge: exact name match but court differs: #328 Judge Anthony Edwards listed at ['archuleta'] (site district ['6']); report says Sixth Judicial District - San Juan County Court Judge
- Frances E. Simonet - Second Judicial District - Denver County Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #241 Judge Fran Simonet

## Unmatched earlier-cycle-only judges: 205

172 have no judge of that name on our site (state judges we do not list). 33 have a same-last-name or same-name-wrong-court candidate (needs human check, NOT matched):
- MaryAnn Vielma - Honorable: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #445 Judge Mariana Vielma
- Jeffrey R. Wilson - Sixth Judicial District - District Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #423 Judge Erin Wilson
- Andy McCallin - Second Judicial District - District Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #267 Judge Andrew P. McCallin
- Pax Moultrie - Second Judicial District - Juvenile Court Judge: exact name match but court differs: #599 Judge Pax L. Moultrie listed at ['appellate'] (site district []); report says Second Judicial District - Juvenile Court Judge
- Clarisse Gonzales - Second Judicial District - Denver County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #405 Judge Michael A. Gonzales
- Tanya E. Wheeler - Second Judicial District - Denver County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #213 Judge Kristan Wheeler
- Anthony Nathaniel Baca - Twenty-Second Judicial District - Dolores County Court Judge: exact name match but court differs: #332 Judge A. Nathaniel Baca listed at ['archuleta', 'la', 'san'] (site district ['6']); report says Twenty-Second Judicial District - Dolores County Court Judge
- Sam Burney - Fourth Judicial District - El Paso County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #282 Judge Samorreyan Burney
- David C. Taylor - First Judicial District - Gilpin County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #506 Judge Todd Taylor
- Stephanie M. G. Gagliano - Thirteenth Judicial District - District Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #417 Judge Stevie M.G. Gagliano
- JenniLynn E. Lawrence - Twenty-Second Judicial District - Montezuma County Court Judge: exact name match but court differs: #531 Judge JenniLynn E. Lawrence listed at ['mesa'] (site district ['21']); report says Twenty-Second Judicial District - Montezuma County Court Judge
- Curtis Lane Porter - Fifteenth Judicial District - Prowers County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #430 Judge Lane Porter
- Larry Schwartz - Tenth Judicial District - District Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #363 Judge Jeffrey M. Schwartz
- Steven B. Fieldman - Tenth Judicial District - Pueblo County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #373 Judge Steve Fieldman
- W. Troy Hause - Nineteenth Judicial District - District Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #499 Judge Troy Hause
- Meghan Patrice Saleebey - Nineteenth Judicial District - District Court Judge: exact name match but court differs: #456 Judge Meghan P. Saleebey listed at ['adams'] (site district ['17']); report says Nineteenth Judicial District - District Court Judge
- Chantel E. Contiguglia - Eighteenth Judicial District - Arapahoe County Judge: exact name match but court differs: #215 Judge Chantel Contiguglia listed at ['jefferson'] (site district ['1']); report says Eighteenth Judicial District - Arapahoe County Judge
- Denise K. Lynch - Ninth Judicial District - District Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #352 Judge Thomas L. Lynch
- Susan Blanco - Eighth Judicial District - District Judge: exact name match but court differs: #580 Justice Susan Blanco listed at ['appellate'] (site district []); report says Eighth Judicial District - District Judge
- Zachary D. Martin - Seventh Judicial District - Ouray County Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #451 Judge Brett Martin; #512 Judge Jonathon P. Martin
- Brian Thomas Campbell - Second Judicial District - Denver County Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #205 Judge Nicholas Campbell
- Monica J. Gomez - Eighteenth Judicial District - Douglas County Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #259 Judge Lisa Gomez; #593 Judge Christina F. Gomez
- Lawrence D. Martin - Fourth Judicial District - El Paso County Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #451 Judge Brett Martin; #512 Judge Jonathon P. Martin
- Cindy Wilson - Eighth Judicial District - Jackson County Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #423 Judge Erin Wilson
- Martin A. Gonzales - Twelfth Judicial District - District Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #405 Judge Michael A. Gonzales
- Jeffery Raymond Wilson - Sixth Judicial District - District Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #423 Judge Erin Wilson
- Sandra K. Miller - Seventh Judicial District - Delta County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #308 Judge Chad Miller
- Gary M. Jackson - Second Judicial District - Denver County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #343 Judge D. Cory Jackson
- Katherine T. Sullivan - Fifth Judicial District - Eagle County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #401 Judge Tamara Sullivan; #600 Judge Grant T. Sullivan
- G. David Miller - Fourth Judicial District - District Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #308 Judge Chad Miller
- Karla J. Hansen - Fourth Judicial District - El Paso County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #410 Judge Kelly S. Hansen
- Honroable Daniel S. Wilson - Fourth Judicial District - El Paso County Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #423 Judge Erin Wilson
- Jeffery Ralph Pilkington - First Judicial District - District Court Judge: no official on our site with that last name + first name/initial; same last name only (not matched, different first name): #221 Judge Jeffrey R. Pilkington

## Judges on our site with no 2024 report

- 280 of 377 judges (type judge, demo=0, unique ids) have no matched 2024 report; 155 have no report in any cycle.
- Sample of 10: Elizabeth Kelley; Judge A. Bruce Jones; Judge A. Nathaniel Baca; Judge A.Danielle Touart; Judge Adam Kendall; Judge Alexander Haynes; Judge Alexandra Robak; Judge Allison P. Ernst; Judge Amanda C. Hopkins; Judge Amanda Hunter

## Ambiguous / worth a human look

- 2018 row 'Honorable Jaclyn Brown' (Adams, https://judicialperformance.colorado.gov/brown-jaclyn-2018-evaluation): name matches an entry but district/court differs; not attached
- 2018 row 'Honorable Larry Edward Schwartz' (El Paso, https://judicialperformance.colorado.gov/schwartz-larry-2018-evaluation): name matches an entry but district/court differs; not attached
- 2018 row 'Honorable Ryan James Stuart' (Jefferson, https://judicialperformance.colorado.gov/stuart-ryan-2018-evaluation): name matches an entry but district/court differs; not attached
- 2018 row 'Honorable Timothy Schutz' (Teller, https://judicialperformance.colorado.gov/schutz-timothy-2018-evaluation): name matches an entry but district/court differs; not attached
- 2016 row 'Honorable Patrick T. Murphy' (Adams, https://judicialperformance.colorado.gov/murphy-patrick-2016-evaluation): name matches an entry but district/court differs; not attached
- 2016 row 'Honorable Carlos Armando Samour Jr.' (Arapahoe, https://judicialperformance.colorado.gov/samour-jr-carlos-2016-evaluation): name matches an entry but district/court differs; not attached
- 2016 row 'Honorable Kimbra Leigh Killin' (Park, https://judicialperformance.colorado.gov/killin-kimbra-2016-evaluation): name matches an entry but district/court differs; not attached
- official #355: reports 'brinegar-carroll' and 'brinegar-caroll' merged (same person, name spelled differently on the state site)
- Judges listed under many courts on our site (a district judge appears once per county) were matched on district (and on county for county-court judges); the site has several people where the court listed on our site differs from the state report (see unmatched list above) - these are real data discrepancies or nickname differences, not matched automatically.
- 2016 listing says "Do Not Retain"/"Does Not Retain" while the judge page field says "Does Not Meet Performance Standards" and the narrative says "NOT BE RETAINED" (both preserved).
- Some 2020/2018 listing rows are blank (Villasenor 2020; Moss, Quick, Rotolo 2018); recommendation is null unless the judge page was fetched.
- District numbering: our site (courts.json) lists Douglas County as the 23rd district (created 2025 out of the 18th); the 2024 reports say Eighteenth. A report in the 18th district was therefore allowed to match a site judge listed in district 23, and county-court judges were additionally required to match on county.
- Statewide judges (Supreme Court, Court of Appeals) appear under every county on the 2024 listing; de-duplicated by URL.
- Vote is null for 4 judges whose narrative gives no numeric vote (e.g. "unanimously").

## 2026 cycle, survey tables, appointing governor (added 2026-10-23)

- 2026 list: `/know-your-judges/2026-judicial-performance-evaluations` has one accordion per county; the same 123 judges are listed by district at `/2026-judicial-performance-evaluations-full-list` (plain HTML table, no JS call). Judge pages are `/<last>-<first>-<initial>-2026-evaluation` (the listing slug often 301s to a longer slug; the final URL is stored in the cycle). Pages cached in `html/2026/`, redirect map in `html/2026/_fetch-log.txt`. Script: `build2026.py` (idempotent; reads `html/`, rewrites `bluebook.json`; log in `_report2026.json`).
- Christiansen (13th): listing says MEETS with a footnote; the State Commission issued its own narrative (8-0 Meets) over the district commission's 5-2 Does Not Meet (stored as `district_commission`).
- `appointed.by` / `by_quote` / `by_url` / `by_cycle`: only where a page prints "appointed ... by Governor X" (never inferred). "The Governor appointed ..." without a name is skipped.
- Survey tables: `surveys.json` (script `surveys.py`, PDFs in `pdf/<year>/<slug>.pdf`, links in `pdf-jobs.tsv`; interim report links only in `surveys-interim-links.json`, not downloaded). Numbers are copied as printed; `snippet` is the printed row with whitespace collapsed.
- Population: `district-population.json` (script `district-population.py`).
