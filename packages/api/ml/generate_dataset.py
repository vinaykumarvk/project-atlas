"""Generate a diverse synthetic email-classification training set via the
OpenAI API. High temperature + varied personas/tones + Indian banking context,
with half the emails deliberately avoiding the obvious category keyword, to
prevent the template-memorization seen in the original corpus.

Usage: OPENAI_API_KEY=... python generate_dataset.py [out.jsonl]
"""
import os, sys, json, re, ssl, time, urllib.request, concurrent.futures as cf, certifi
KEY = os.environ["OPENAI_API_KEY"]
OUT = sys.argv[1] if len(sys.argv) > 1 else "dataset.jsonl"
CTX = ssl.create_default_context(cafile=certifi.where())

CATS = {
 "VALUATION_REQUEST": "a request to determine the market value / appraisal of a property offered as loan security",
 "LEGAL_OPINION": "a request for a lawyer's / legal team's written opinion on the legality, encumbrances, or disputes around a property",
 "TITLE_SEARCH": "a request to verify the ownership chain, title deeds, or encumbrance certificate of a property",
 "INSURANCE_RENEWAL": "renewing or continuing an insurance policy on a mortgaged asset (premium, expiry, coverage)",
 "RELEASE_OF_COLLATERAL": "after a loan is repaid/closed, releasing the security / lien / charge, issuing an NOC, or returning original documents",
 "SITE_VISIT": "arranging a physical inspection / field visit of a property, construction progress, or business premises",
 "DOCUMENT_COLLECTION": "chasing or collecting pending documents (KYC, income proof, property papers, bank statements) from a borrower",
 "GENERAL_INQUIRY": "a general status question, follow-up, or process query that does not clearly fit the other categories",
}
KEYWORD = {"VALUATION_REQUEST":"valuation","LEGAL_OPINION":"legal opinion","TITLE_SEARCH":"title search",
 "INSURANCE_RENEWAL":"insurance","RELEASE_OF_COLLATERAL":"release of collateral","SITE_VISIT":"site visit",
 "DOCUMENT_COLLECTION":"documents","GENERAL_INQUIRY":"inquiry"}
PERSONAS = ["a retail loan customer","a frustrated customer","a panel advocate","a property valuer",
 "an insurance agent","a branch operations officer","a relationship manager","an external vendor",
 "a builder/developer","a chartered accountant","a co-applicant","a legal clerk"]
TONES = ["formal","casual","terse one-liner","polite and detailed","annoyed","confused","very brief","rambling"]

def call(cat, batch_i):
    persona = PERSONAS[(batch_i*3) % len(PERSONAS)]
    tone = TONES[(batch_i*5) % len(TONES)]
    kw = KEYWORD[cat]
    prompt = f"""Generate 10 realistic emails received by an Indian bank's mortgage/loan operations team.
Category: {cat} — {CATS[cat]}.

Hard requirements:
- Every email must be COMPLETELY different from the others (different wording, structure, scenario).
- Lean this batch toward: sender = {persona}; tone = {tone}. But still vary within the batch.
- Use realistic Indian names, cities, loan account numbers, property references.
- In at least half, do NOT use the word "{kw}" — express the intent indirectly/naturally.
- Vary length: some one line, some a full paragraph. Include occasional typos or informal phrasing.
- All 10 must genuinely belong to category {cat}, but make a few subtly ambiguous.
Return ONLY a JSON array of objects with keys "subject" and "body". No markdown."""
    body = json.dumps({"model":"gpt-4o-mini","max_tokens":1600,"temperature":1.0,
        "messages":[{"role":"user","content":prompt}]}).encode()
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body,
        headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    for attempt in range(3):
        try:
            r = json.load(urllib.request.urlopen(req, timeout=90, context=CTX))
            txt = r["choices"][0]["message"]["content"]
            txt = re.sub(r"^```(json)?|```$", "", txt.strip(), flags=re.M).strip()
            arr = json.loads(txt)
            return [(e["subject"], e["body"], cat) for e in arr if e.get("subject") and e.get("body")]
        except Exception as e:
            if attempt==2: return []
            time.sleep(2)
    return []

BATCHES_PER_CAT = 26   # 26*10 = ~260 per category, ~2080 total
jobs = [(c, i) for c in CATS for i in range(BATCHES_PER_CAT)]
rows, done = [], 0
with cf.ThreadPoolExecutor(max_workers=10) as ex:
    futs = {ex.submit(call, c, i): (c, i) for c, i in jobs}
    for f in cf.as_completed(futs):
        rows.extend(f.result()); done += 1
        if done % 20 == 0: print(f"{done}/{len(jobs)} batches, {len(rows)} emails")

# dedupe by (subject,body)
seen=set(); uniq=[]
for s,b,c in rows:
    k=(s.strip().lower(), b.strip().lower()[:120])
    if k in seen: continue
    seen.add(k); uniq.append({"subject":s.strip(),"body":b.strip(),"label":c})
from collections import Counter
print("TOTAL unique:", len(uniq), dict(Counter(r["label"] for r in uniq)))
with open(OUT, "w") as f:
    for r in uniq: f.write(json.dumps(r)+"\n")
print("wrote", OUT)
