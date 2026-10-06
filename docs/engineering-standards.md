# Engineering standards and verification

Requested coverage: India, United States and United Kingdom. This is an implementation and verification requirement, not a claim of existing coverage.

The current FEM national-annex engine implements Dutch parameters. Selecting another country must never silently reuse those parameters. Existing Eurocode regression results do not certify Indian or American designs, or UK national-annex values.

## Release requirements

Every engineering calculation must identify its standard, edition, amendments, national annex where applicable, design method and units. Saved projects and exported reports must preserve those selections. Unsupported combinations must stop the affected design check with an English explanation; a numerical analysis result must not be presented as code compliance.

Each implemented check needs independent reference cases, including a passing case, a failing case, boundary conditions and invalid inputs. References must verify load combinations, resistance factors, material rules and applicable limits separately. Cross-country comparisons must use equivalent geometry, units and actions without assuming equivalent design rules.

## Standard families under review

- India: BIS standards for materials, loads, seismic design and foundations. Verify published editions and amendments through the [BIS standards service](https://standards.bis.gov.in/). Consultation drafts must not become defaults.
- United States: steel design using [ANSI/AISC 360-22](https://www.aisc.org/aisc/publications/current-standards/aisc-360/), together with applicable [AISC errata](https://www.aisc.org/aisc/publications/revisions-and-errata/); loading using [ASCE/SEI 7-22](https://www.asce.org/publications-and-news/codes-and-standards/asce-sei-7-22). Concrete and seismic rules require their own implementation and reference coverage. Publication date alone does not establish local adoption.
- United Kingdom: BS EN Eurocodes with the corresponding UK national annex. [BSI documents coexistence of the two Eurocode generations](https://knowledge.bsigroup.com/categories/eurocodes); the software must identify the selected generation and avoid mixing incompatible editions.

Full normative documents are not redistributed with the software. Links and clause references identify the sources for implementation review.

## Current status

The calculation studio now provides a **steel tension cross-section** sheet using the same core engine in the browser and desktop source. It checks gross-section yielding and net-section rupture for a fully connected flat plate under concentric tension. It does not constitute a complete member or connection check.

| Method | Implemented resistance basis | Verification |
| --- | --- | --- |
| India, IS 800:2007 | Clauses 6.2/6.3.1: yielding factor 1.10, rupture factor 1.25 and plate rupture coefficient 0.90 | Independent arithmetic tests; external engineering review pending |
| US, ANSI/AISC 360-22 LRFD | D2 yielding factor 0.90 and rupture factor 0.75; fully connected plate with U = 1 | Independent arithmetic tests; external review and September 2026 errata review pending |
| US, ANSI/AISC 360-22 ASD | D2 yielding divisor 1.67 and rupture divisor 2.00; fully connected plate with U = 1 | Independent arithmetic tests; external review and September 2026 errata review pending |
| UK, first-generation BS EN 1993-1-1:2005+A1:2014 with NA+A1:2014 | Cross-section tension: yielding factor 1.00, rupture factor 1.10 and coefficient 0.90 | Independent arithmetic tests; external engineering review pending |

Eight hand-calculated reference cases and 173 assertions cover both governing limit states, overloaded cases, invalid/raw saved inputs, force/area units, method isolation and actual evaluated/exported report metadata. Evidence is in `qa/readiness/standards/steel-tension-reference-results.json`; run `npm run check` in `vision-calculation-studio` to reproduce the complete eleven-script reference gate.

The user must supply the required tension on the selected LRFD/ASD or national-code force basis, valid material strengths and a net area with the correct hole deductions. The sheet does not derive load combinations or hole deductions. Connections, block shear, shear lag, fatigue, bending/compression, serviceability, fire and seismic detailing remain excluded. Reports retain these limits and the review status.

No complete Indian, American or UK compliance package has been released. Existing NEN templates retain their own national-annex rules. Additional modules must receive separate rule implementations and independent verification before enabling a production compliance label. Windows and browser installer acceptance remains a separate release gate.
