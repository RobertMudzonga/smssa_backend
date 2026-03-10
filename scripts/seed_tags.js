const db = require('../db');

// Raw tag blob provided by the user. The script will normalize, dedupe, and insert.
const raw = `Tags
PR - Spouse
Critical Skills visa
Relatives Renew
spouse visa'
spouse visa
General Work Visa
Spouse Visa
spouse PR
spouse visa
PR
spouse visa'  9
PR - Financially Independent
Retired Person Visa
General Work Visa
CSV
Retired Person Visa
Relative Visa
spouse visa'
Retired Person Visa
visa readiness
spouse visa'
Critical Skills visa
CSV + PR
spouse visa'
Retired Person Visa
spouse visa'
CSV
General Work Visa
3 Study visa plus spouse visa
POP
Relatives
Relative Visa
E-Visa
E-Visa
E-Visa
Visitors visa 11 (1) extension
Relative Visa
GWV
CSV
RELATIVE PR
Exchange Visa
spouse plus study visa
spouse visa
Relative Visa
Spouse Visa
PR - Spouse
spouse PR
Visitors visa 11 (1) extension
PR
Spouse Visa
RELATIVE PR
GWV
Spouse Visa
CSV
CSV
spouse visa'
Relative Visa
PR - Spouse
spouse PR +Renewal
CSV
Remote work visa
General Work Visa
General Work Visa
GWV
Study Visa
CSV
GWV
Study Visa
Visitors visa 11 (1) extension
PR - Financially Independent
GWV
Artist visa
RELATIVE PR
Study Visa
spouse PR
PR - Financially Independent
Waiver
CSV + PR
GWV
POP
General Work Visa
General Work Visa
Study Visa
Critical Skills visa
CSV
General Work Visa
spouse visa'
PR - CSV
GWV + Waiver
Relatives Minor
GWV
PR - CSV
Visitors visa 11 (1) extension
spouse visa'
spouse visa'
Critical Skills visa & PR
E-Visa
RELATIVE PR
POP
Spouse Visa
Visitors visa + Accompanying Spouse
PR - CSV
PR - Spouse
PR
CSV
spouse visa'
Study Visa
General Work Visa
PR-Relatives +Relative
PR - CSV
PR - CSV
Critical Skills visa PR
CSV
Retired Person PR
ICT + Dependent
Spouse Visa
spouse visa
PR - CSV
Relative Visa
spouse PR
PR - CSV
Critical Skills visa
CSV
csv
spouse visa'
GWV
Spouse Visa
CSV
Citizenship Application
spouse visa'
spouse PR -Ratification
Critical Skills visa
relatives PR
Study Visa
PR-Minor child
CSV
Artist visa
General Work Visa
Cirizenship - POP
spouse PR+Relative PR
Study Visa
CSV
GWV
General Work Visa
CSV
spouse PR
Relative Visa
General Work Visa
PR - Relatives
PR-26(a)
spouse visa'
General Work Visa
PR - Relatives
PR - CSV
CSV
Waiver
Relatives Minor
CSV
Waiver
POP
General Work Visa
Study Visa
spouse visa'
CSV
SPOUSE VISA
spouse PR
spouse visa'
POP
CSV
relatives visa child
spouse visa'
General Work Visa + accompanying dependants
Retired Person Visa
Asylum
Cirizenship - POP
relatives visa child
PR - Relatives
General Work Visa
CSV
spouse PR
ICT & Business visa
Determination of Citizenship
spouse visa'
PR - Relatives
Remote work visa
PR - CSV
spouse visa'
Study Visa
PR - CSV
PR - Spouse
Study Visa
GWV
Critical skills
GWV
PR - Relatives
General Work Visa
GWV
Retired Person/Accompanying Spouse/Dependents
RELATIVE PR
Professional Body
spouse visa'
CSV
spouse visa'
PR - CSV
Retired Person PR
spouse PR
spouse visa'
spouse visa'
Medical Visa
spouse visa'
Visitors visa 11 (1) extension
Study Visa
PR 27 (g)
RELATIVE PR
Retired Person/Accompanying Spouse/Dependents
CSV
spouse visa'
spouse PR
Study Visa
Business Visa X2
Citizenship Application
PR Business/PR Spouse
Study Visa
Cirizenship - POP
Retired Person Visa
Work Authorization
General Work Visa
Cirizenship - POP
CSV
CSV
CSV
spouse visa'
GWV
Volunteer visa
CSV
CSV
spouse PR+Relative PR
3 applications
CSV
CSV
CSV
Study Visa
POP
Study Visa
Study Visa
Waiver
Retired Person Visa
Schengen
Spouse ZIM / Relative's / MCS
CSV
PR - Spouse
CSV
General Work Visa
CSV
Retired Person Visa
CSV
Relative Visa
Critical Skills Work Visa
CSV
Spouse Visa
Study Visa
PR - CSV
Spouse Visa
Work Authorization Extension
Spouse Visa
POP
spouse visa'+Relative
Spouse Visa
spouse and relatives minor
Relative's Visa Child
Spouse Visa
Visitors visa 11(1)(b)(iv)
CSV
CSV
CSV
Relative Visa
Study Visa
Study Visa
CSV Renewal
Spousal Visa (Renewal)
ict
Study Visa
CSV
CSV
CSV
CSV
visitors visa 11 (2)
PR-Relatives
CSV
CSV
PR -26(a)
GWV + Waiver
27g
CSV
Spouse Visa
GWV
Study Visa
Spouse Visa
PR - Spouse
GWV + Waiver
spouse+relatives
Waiver
CSV
relatives visa child
Business Visa
spouse visa
Spouse Visa
Waiver
Citizenship Application
Visitors Visa extension
Waiver
General Work Visa
PR SPOUSE
Business Visa
Spousal Visa
Critical Skills Work Visa
CSV
E-Visa
Visitors visa 11 (1) extension
General Work Visa
CSV Renewal
Retired Person visa + Acc Spouse
Spouse Visa
CSV
Relative Visa
PR-Relatives
CSV
CSV
Retired Person Visa
RELATIVES VISA
Study Visa
PR
RELATIVES
Study Visa
General Work Visa
CSV
CSV
Study Visa
GWV+Minor
Spouse Visa
Relatives PR
Visitors visa 11(1)(b)(iv)
Business Visa
General Work Visa
Itra- Company Transfer
LEGALISATION
CSV
Relative's Visa Child
Relative's Visa Child
Permanent Residence
Visitors visa 11 (1) extension
PR - CSV
CSV
Retired Person Visa
PR - CSV
Spouse Visa
Study Visa
Schengen
CSV
Relative Visa
PR - Spouse
Visitors Visa 11(6)
Citizenship Application
CSV
PR - CSV
PR - CSV
Retired Person Visa
Appeal
CSV
E-Visa
Relative Visa
Waiver
CSV
Acc Spouse
Retired Person
CSV
CSV + PR
11.2
Relative Visa (Waiver)
CSV
Relative's Visa Child
Spouse Visa
General Work Visa
Spouse Visa
Spouse Visa
Spouse Visa
General Work Visa
Schengen
Spouse Visa
Relative Visa (Child)
Spouse Visa
Relative Visa
General Work Visa
Spouse Visa
Exchange Visa
CSV
PR - Spouse
Critical skills
Spouse Visa
Spouse Visa
General Work Visa
POP
Spouse Visa
CSV
CSV
Spouse Visa
Spouse Visa
CSV
GWV
CSV
Citizenship Application
PR - Spouse
Relative Visa
PR + Relatives
CSV,spouse+Relative
PR - Relatives
GWV + Waiver
Spouse PR
Spouse Visa
Spouse Visa (S18)
Spouse Visa
CSV
Waiver
Spouse Visa
PRA Appeal
CSV
Study Visa
Visitors visa 11 (1) extension
spouse visa
GWV + Waiver
waiver + critical skills work visa
Visitors Visa CAN
PR
Visitors Visa CAN
GWV + Waiver
Visitors Visa
CSV
visitors visa  extension
GWV
Spouse Visa
PRA Appeal
CSV
CSV
Business Visa
CSV
PR
Work Authorization
Business Visa
Visitors Visa
visitors visa  extension
Visitors Visa CAN
visitors visa  extension
Citizenship Application
PR - CSV
Business Visa
PR
Visitors Visa
ARTISTRY VV
Spouse Visa
Waiver
PR - CSV
CSV
Spouse Visa
Spouse Visa
Waiver
Spouse Visa
PRA Appeal
CSV
Spouse Visa
CSV
CSV
PR - CSV
CSV
CSV
CSV
CSV PR
Spousal
CSV
Retired Person Visa
CSV
Spouse ZIM / Relative's / MCS
Volunteer visa
Waiver
CSV
visotors visa ext
PR - CSV
retired + PR
PR - Spouse
PR - CSV
Study Visa
GWV + Waiver
Waiver
Spouse PR
CSV
spouse PR
CSV
Spouse Visa
Section 11 (1) - business
ICT-Zim
PR-Relatives
Spouse Visa
Spouse Visa
GWV + Waiver
Visitors Visa 11(1)(b)(iv) dependent
Spouse Visa
Citizenship Application
RELATIVES VISA
Spouse Visa
CSV
GWV
CSV
RELATIVES
Spouse Visa
Spouse Visa
Waiver
PR-26(a)
GWV + Waiver
PR - Spouse
Section 11(i)(b)(iv)
Relative's Visa Child
CSV
Spouse Visa
CSV
PR Business/PR Spouse
Waiver
PR - Financially Independent
Waiver
Citizenship Application
Shengen visa appeal
Spouse Visa
Retired Person Visa
Visa Verification
Spouse Visa
PR
Visitors Visa extension
Accompanying Spouse
CSV
CSV
Citizenship Application
Study Visa
Spouse Visa+ POP
CSV
CSV
PR - CSV
GWV + Waiver
PR - Spouse
Spouse Visa
CSV
Spouse Visa
visitors visa  extension
Retired Person Visa
Citizenship+Study visa
Retired Person Visa
CSV
Relative's Visa Parent
PR - Spouse
Retired Person PR
CSV
Relative Visa
Study Visa
Waiver
CSV
PR - CSV
CSV
CSV - CISCO
Study Visa
Spouse Visa
CSV
Relative Visa
Retired Person Visa
PR - Spouse/PR Relatives
CSV
CSV
Remote work visa
Citizenship Application
CSV
Proof of PR
Spouse Visa
CSV
PR - Spouse
Spouse Visa
CSV
Relative Visa
Retired Person Visa PR
CSV
Study Visa
Citizenship Application
CSV
CSV
RELATIVES VISA
GWV + Waiver
Relative Visa (Child)
CSV
CSV
Spouse Visa
CSV
Waiver
Waiver
Relative Visa
GWV + Waiver
Visitors visa 11 (1) extension
PR - CSV
CSV
Retired Person Visa
CSV
Spouse Visa
CSV
CSV
CSV
GWV + Waiver
CSV
LEGALISATION
Family application
Spouse Visa
Spouse Visa
PR -26(a)
CSV + PR
CSV
CSV
CSV
CSV PR
Spousal
CSV
Retired Person Visa
CSV
Spouse ZIM / Relative's / MCS
Volunteer visa
Waiver
CSV
visotors visa ext
PR - CSV
retired + PR
PR - Spouse
PR - CSV
Study Visa
GWV + Waiver
Waiver
Spouse PR
CSV
spouse PR
CSV
Spouse Visa
Section 11 (1) - business
ICT-Zim
PR-Relatives
Spouse Visa
Spouse Visa
GWV + Waiver
Visitors Visa 11(1)(b)(iv) dependent
Spouse Visa
Citizenship Application
RELATIVES VISA
Spouse Visa
CSV
GWV
CSV
RELATIVES
Spouse Visa
Spouse Visa
Waiver
PR-26(a)
GWV + Waiver
PR - Spouse
Section 11(i)(b)(iv)
Relative's Visa Child
CSV
Spouse Visa
CSV
PR Business/PR Spouse
Waiver
PR - Financially Independent
Waiver
Citizenship Application
Shengen visa appeal
Spouse Visa
Retired Person Visa
Visa Verification
Spouse Visa
PR
Visitors Visa extension
Accompanying Spouse
CSV
CSV
Citizenship Application
Study Visa
Spouse Visa+ POP
CSV
CSV
PR - CSV
GWV + Waiver
PR - Spouse
Spouse Visa
CSV
Spouse Visa
visitors visa  extension
Retired Person Visa
Citizenship+Study visa
Retired Person Visa
CSV
Relative's Visa Parent
PR - Spouse
Retired Person PR
CSV
Relative Visa
Study Visa
Waiver
CSV
PR - CSV
CSV
CSV - CISCO
Study Visa
Spouse Visa
CSV
Relative Visa
Retired Person Visa
PR - Spouse/PR Relatives
CSV
CSV
Remote work visa
Citizenship Application
CSV
Proof of PR
Spouse Visa
CSV
PR - Spouse
Spouse Visa
CSV
Relative Visa
Retired Person Visa PR
CSV
Study Visa
Citizenship Application
CSV
CSV
RELATIVES VISA
GWV + Waiver
Relative Visa (Child)
CSV
CSV
Spouse Visa
CSV
Waiver
Waiver
Relative Visa
GWV + Waiver
Visitors visa 11 (1) extension
PR - CSV
CSV
Retired Person Visa
CSV
Spouse Visa
CSV
CSV
CSV
GWV + Waiver
CSV
LEGALISATION
Family application
Spouse Visa
Spouse Visa
PR -26(a)
CSV + PR
CSV
CSV
CSV
CSV PR
Spousal
CSV
Retired Person Visa
CSV
Spouse ZIM / Relative's / MCS
Volunteer visa
Waiver
CSV
visotors visa ext
PR - CSV
retired + PR
PR - Spouse
PR - CSV
Study Visa
GWV + Waiver
Waiver
Spouse PR
CSV
spouse PR
CSV
Spouse Visa
Section 11 (1) - business
ICT-Zim
PR-Relatives
Spouse Visa
Spouse Visa
GWV + Waiver
Visitors Visa 11(1)(b)(iv) dependent
Spouse Visa
Citizenship Application
RELATIVES VISA
Spouse Visa
CSV
GWV
CSV
RELATIVES
Spouse Visa
Spouse Visa
Waiver
PR-26(a)
GWV + Waiver
PR - Spouse
Section 11(i)(b)(iv)
Relative's Visa Child
CSV
Spouse Visa
CSV
PR Business/PR Spouse
Waiver
PR - Financially Independent
Waiver
Citizenship Application
Shengen visa appeal
Spouse Visa
Retired Person Visa
Visa Verification
Spouse Visa
PR
Visitors Visa extension
Accompanying Spouse
CSV
CSV
Citizenship Application
Study Visa
Spouse Visa+ POP
CSV
CSV
PR - CSV
GWV + Waiver
PR - Spouse
Spouse Visa
CSV
Spouse Visa
visitors visa  extension
Retired Person Visa
Citizenship+Study visa
Retired Person Visa
CSV
Relative's Visa Parent
PR - Spouse
Retired Person PR
CSV
Relative Visa
Study Visa
Waiver
CSV
PR - CSV
CSV
CSV - CISCO
Study Visa
Spouse Visa
CSV
Relative Visa
Retired Person Visa
PR - Spouse/PR Relatives
CSV
CSV
Remote work visa
Citizenship Application
CSV
Proof of PR
Spouse Visa
CSV
PR - Spouse
Spouse Visa
CSV
Relative Visa
Retired Person Visa PR
CSV
Study Visa
Citizenship Application
CSV
CSV
RELATIVES VISA
GWV + Waiver
Relative Visa (Child)
CSV
CSV
Spouse Visa
CSV
Waiver
Waiver
Relative Visa
GWV + Waiver
Visitors visa 11 (1) extension
PR - CSV
CSV
Retired Person Visa
CSV
Spouse Visa
CSV
CSV
CSV
GWV + Waiver
CSV
LEGALISATION
Family application
Spouse Visa
Spouse Visa
PR -26(a)
CSV + PR
CSV
CSV
CSV
CSV PR
Spousal
CSV
Retired Person Visa
CSV
Spouse ZIM / Relative's / MCS
Volunteer visa
Waiver
CSV
visotors visa ext
PR - CSV
retired + PR
PR - Spouse
PR - CSV
Study Visa
GWV + Waiver
Waiver
Spouse PR
CSV
spouse PR
CSV
Spouse Visa
Section 11 (1) - business
ICT-Zim
PR-Relatives
Spouse Visa
Spouse Visa
GWV + Waiver
Visitors Visa 11(1)(b)(iv) dependent
Spouse Visa
Citizenship Application
RELATIVES VISA
Spouse Visa
CSV
GWV
CSV
RELATIVES
Spouse Visa
Spouse Visa
Waiver
PR-26(a)
GWV + Waiver
PR - Spouse
Section 11(i)(b)(iv)
Relative's Visa Child
CSV
Spouse Visa
CSV
PR Business/PR Spouse
Waiver
PR - Financially Independent
Waiver
Citizenship Application
Shengen visa appeal
Spouse Visa
Retired Person Visa
Visa Verification
Spouse Visa
PR
Visitors Visa extension
Accompanying Spouse
CSV
CSV
Citizenship Application
Study Visa
Spouse Visa+ POP
CSV
CSV
PR - CSV
GWV + Waiver
PR - Spouse
Spouse Visa
CSV
Spouse Visa
visitors visa  extension
Retired Person Visa
Citizenship+Study visa
Retired Person Visa
CSV
Relative's Visa Parent
PR - Spouse
Retired Person PR
CSV
Relative Visa
Study Visa
Waiver
CSV
PR - CSV
CSV
CSV - CISCO
Study Visa
Spouse Visa
CSV
Relative Visa
Retired Person Visa
PR - Spouse/PR Relatives
CSV
CSV
Remote work visa
Citizenship Application
CSV
Proof of PR
Spouse Visa
CSV
PR - Spouse
Spouse Visa
CSV
Relative Visa
Retired Person Visa PR
CSV
Study Visa
Citizenship Application
CSV
CSV
RELATIVES VISA
GWV + Waiver
Relative Visa (Child)
CSV
CSV
Spouse Visa
CSV
Waiver
Waiver
Relative Visa
GWV + Waiver
Visitors visa 11 (1) extension
PR - CSV
CSV
Retired Person Visa
CSV
Spouse Visa
CSV
CSV
CSV
GWV + Waiver
CSV
LEGALISATION
Family application
Spouse Visa
Spouse Visa
PR -26(a)
CSV + PR
CSV
CSV
CSV
CSV PR
Spousal
CSV
Retired Person Visa
CSV
Spouse ZIM / Relative's / MCS
Volunteer visa
Waiver
CSV
visotors visa ext
PR - CSV
retired + PR
PR - Spouse
PR - CSV
Study Visa
GWV + Waiver
Waiver
Spouse PR
CSV
spouse PR
CSV
Spouse Visa
Section 11 (1) - business
ICT-Zim
PR-Relatives
Spouse Visa
Spouse Visa
GWV + Waiver
Visitors Visa 11(1)(b)(iv) dependent
Spouse Visa
Citizenship Application
RELATIVES VISA
Spouse Visa
CSV
GWV
CSV
RELATIVES
Spouse Visa
Spouse Visa
Waiver
PR-26(a)
GWV + Waiver
PR - Spouse
Section 11(i)(b)(iv)
Relative's Visa Child
CSV
Spouse Visa
CSV
PR Business/PR Spouse
Waiver
PR - Financially Independent
Waiver
Citizenship Application
Shengen visa appeal
Spouse Visa
Retired Person Visa
Visa Verification
Spouse Visa
PR
Visitors Visa extension
Accompanying Spouse
CSV
CSV
Citizenship Application
Study Visa
Spouse Visa+ POP
CSV
CSV
PR - CSV
GWV + Waiver
PR - Spouse
Spouse Visa
CSV
Spouse Visa
visitors visa  extension
Retired Person Visa
Citizenship+Study visa
Retired Person Visa
CSV
Relative's Visa Parent
PR - Spouse
Retired Person PR
CSV
Relative Visa
Study Visa
Waiver
CSV
PR - CSV
CSV
CSV - CISCO
Study Visa
Spouse Visa
CSV
Relative Visa
Retired Person Visa
PR - Spouse/PR Relatives
CSV
CSV
Remote work visa
Citizenship Application
CSV
Proof of PR
Spouse Visa
CSV
PR - Spouse
Spouse Visa
CSV
Relative Visa
Retired Person Visa PR
CSV
Study Visa
Citizenship Application
CSV
CSV
RELATIVES VISA
GWV + Waiver
Relative Visa (Child)
CSV
CSV
Spouse Visa
CSV
Waiver
Waiver
Relative Visa
GWV + Waiver
Visitors visa 11 (1) extension
PR - CSV
CSV
Retired Person Visa
CSV
Spouse Visa
CSV
CSV
CSV
GWV + Waiver
CSV
LEGALISATION
Family application
Spouse Visa
Spouse Visa
PR -26(a)
CSV + PR
CSV
CSV
CSV
CSV PR
Spousal
CSV
Retired Person Visa
CSV
Spouse ZIM / Relative's / MCS
Volunteer visa
Waiver
CSV
visotors visa ext
PR - CSV
retired + PR
PR - Spouse
PR - CSV
Study Visa
GWV + Waiver
Waiver
Spouse PR
CSV
spouse PR
CSV
Spouse Visa
Section 11 (1) - business
ICT-Zim
PR-Relatives
Spouse Visa
Spouse Visa
GWV + Waiver
Visitors Visa 11(1)(b)(iv) dependent
Spouse Visa
Citizenship Application
RELATIVES VISA
Spouse Visa
CSV
GWV
CSV
RELATIVES
Spouse Visa
Spouse Visa
Waiver
PR-26(a)
GWV + Waiver
PR - Spouse
Section 11(i)(b)(iv)
Relative's Visa Child
CSV
Spouse Visa
CSV
PR Business/PR Spouse
Waiver
PR - Financially Independent
Waiver
Citizenship Application
Shengen visa appeal
Spouse Visa
Retired Person Visa
Visa Verification
Spouse Visa
PR
Visitors Visa extension
Accompanying Spouse
CSV
CSV
Citizenship Application
Study Visa
Spouse Visa+ POP
CSV
CSV
PR - CSV
GWV + Waiver
PR - Spouse
Spouse Visa
CSV
Spouse Visa
visitors visa  extension
Retired Person Visa
Citizenship+Study visa
Retired Person Visa
CSV
Relative's Visa Parent
PR - Spouse
Retired Person PR
CSV
Relative Visa
Study Visa
Waiver
CSV
PR - CSV
CSV
CSV - CISCO
Study Visa
Spouse Visa
CSV
Relative Visa
Retired Person Visa
PR - Spouse/PR Relatives
CSV
CSV
Remote work visa
Citizenship Application
CSV
Proof of PR
Spouse Visa
CSV
PR - Spouse
Spouse Visa
CSV
Relative Visa
Retired Person Visa PR
CSV
Study Visa
Citizenship Application
CSV
CSV
RELATIVES VISA
GWV + Waiver
Relative Visa (Child)
CSV
CSV
Spouse Visa
CSV
Waiver
Waiver
Relative Visa
GWV + Waiver
Visitors visa 11 (1) extension
PR - CSV
CSV
Retired Person Visa
CSV
Spouse Visa
CSV
CSV
CSV
GWV + Waiver
CSV
LEGALISATION
Family application
Spouse Visa
Spouse Visa
PR -26(a)
CSV + PR
CSV
CSV
CSV
CSV PR
Spousal
CSV
Retired Person Visa
CSV
Spouse ZIM / Relative's / MCS
Volunteer visa
Waiver
CSV
visotors visa ext
PR - CSV
retired + PR
PR - Spouse
PR - CSV
Study Visa
GWV + Waiver
Waiver
Spouse PR
CSV
spouse PR
CSV
Spouse Visa
Section 11 (1) - business
ICT-Zim
PR-Relatives
Spouse Visa
Spouse Visa
GWV + Waiver
Visitors Visa 11(1)(b)(iv) dependent
Spouse Visa
Citizenship Application
RELATIVES VISA
Spouse Visa
CSV
GWV
CSV
RELATIVES
Spouse Visa
Spouse Visa
Waiver
PR-26(a)
GWV + Waiver
PR - Spouse
Section 11(i)(b)(iv)
Relative's Visa Child
CSV
Spouse Visa
CSV
PR Business/PR Spouse
Waiver
PR - Financially Independent
Waiver
Citizenship Application
Shengen visa appeal
Spouse Visa
Retired Person Visa
Visa Verification
Spouse Visa
PR
Visitors Visa extension
Accompanying Spouse
CSV
CSV
Citizenship Application
Study Visa
Spouse Visa+ POP
CSV
CSV
PR - CSV
GWV + Waiver
PR - Spouse
Spouse Visa
CSV
Spouse Visa
visitors visa  extension
Retired Person Visa
Citizenship+Study visa
Retired Person Visa
CSV
Relative's Visa Parent
PR - Spouse
Retired Person PR
CSV
Relative Visa
Study Visa
Waiver
CSV
PR - CSV
CSV
CSV - CISCO
Study Visa
Spouse Visa
CSV
Relative Visa
Retired Person Visa
PR - Spouse/PR Relatives
CSV
CSV
Remote work visa
Citizenship Application
CSV
Proof of PR
Spouse Visa
CSV
PR - Spouse
Spouse Visa
CSV
Relative Visa
Retired Person Visa PR
CSV
Study Visa
Citizenship Application
CSV
CSV
RELATIVES VISA
GWV + Waiver
Relative Visa (Child)
CSV
CSV
Spouse Visa
CSV
Waiver
Waiver
Relative Visa
GWV + Waiver
Visitors visa 11 (1) extension
PR - CSV
CSV
Retired Person Visa
CSV
Spouse Visa
CSV
CSV
CSV
GWV + Waiver
CSV
LEGALISATION
Family application
Spouse Visa
Spouse Visa
PR -26(a)
CSV + PR
CSV
CSV
CSV
CSV PR
Spousal
CSV
Retired Person Visa
CSV
Spouse ZIM / Relative's / MCS
Volunteer visa
Waiver
CSV
visotors visa ext
PR - CSV
retired + PR
PR - Spouse
PR - CSV
Study Visa
GWV + Waiver
Waiver
Spouse PR
CSV
spouse PR
CSV
Spouse Visa
Section 11 (1) - business
ICT-Zim
PR-Relatives
Spouse Visa
Spouse Visa
GWV + Waiver
Visitors Visa 11(1)(b)(iv) dependent
Spouse Visa
Citizenship Application
RELATIVES VISA
Spouse Visa
CSV
GWV
CSV
RELATIVES
Spouse Visa
Spouse Visa
Waiver
PR-26(a)
GWV + Waiver
PR - Spouse
Section 11(i)(b)(iv)
Relative's Visa Child
CSV
Spouse Visa
CSV
PR Business/PR Spouse
Waiver
PR - Financially Independent
Waiver
Citizenship Application
Shengen visa appeal
Spouse Visa
Retired Person Visa
Visa Verification
Spouse Visa
PR
Visitors Visa extension
Accompanying Spouse
CSV
... (truncated for brevity)`;

function normalizeTag(t) {
  if (!t) return null;
  // remove stray quotes and trailing numbers/parentheses
  let s = t.replace(/["'`]+/g, '').trim();
  s = s.replace(/\s*\(.*?\)\s*$/, '');
  s = s.replace(/\s+\d+$/, '');
  // collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s;
}

async function seedTags() {
  try {
    // split by newlines and commas
    const items = raw.split(/[,\n]+/).map(x => normalizeTag(x)).filter(Boolean);
    // dedupe case-insensitive
    const map = new Map();
    for (const it of items) {
      const key = it.toLowerCase();
      if (!map.has(key)) map.set(key, it);
    }
    const tags = Array.from(map.values()).slice(0, 1000); // safety cap

    console.log('Seeding', tags.length, 'unique tags...');

    for (const tag of tags) {
      try {
        await db.query('INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [tag]);
      } catch (err) {
        console.error('Failed to insert tag', tag, err.message || err);
      }
    }

    console.log('Tag seeding completed');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding tags:', err);
    process.exit(1);
  }
}

seedTags();

