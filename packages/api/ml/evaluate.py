import sys, json, torch
from transformers import DistilBertForSequenceClassification, DistilBertTokenizerFast
from sklearn.metrics import classification_report, accuracy_score

MDIR = sys.argv[1]
EVAL = sys.argv[2]
LABELS = ["VALUATION_REQUEST","LEGAL_OPINION","TITLE_SEARCH","INSURANCE_RENEWAL",
          "RELEASE_OF_COLLATERAL","SITE_VISIT","DOCUMENT_COLLECTION","GENERAL_INQUIRY"]

tok = DistilBertTokenizerFast.from_pretrained(MDIR)
model = DistilBertForSequenceClassification.from_pretrained(MDIR).eval()

def predict(texts):
    out=[]; conf=[]
    for i in range(0,len(texts),16):
        enc = tok(texts[i:i+16], truncation=True, padding=True, max_length=256, return_tensors="pt")
        with torch.no_grad(): logits = model(**enc).logits
        p = torch.softmax(logits,1)
        out += [LABELS[j] for j in p.argmax(1).tolist()]
        conf += p.max(1).values.tolist()
    return out, conf

KW = {"VALUATION_REQUEST":["valuation","property valuation","valuation report","appraisal"],
 "LEGAL_OPINION":["legal opinion","legal","advocate","court","litigation"],
 "TITLE_SEARCH":["title","title search","title clear","title deed","ownership"],
 "INSURANCE_RENEWAL":["insurance","renewal","premium","policy renewal","coverage"],
 "RELEASE_OF_COLLATERAL":["release","collateral","noc","no objection","release of charge"],
 "SITE_VISIT":["site visit","inspection","field visit","physical verification","survey"],
 "DOCUMENT_COLLECTION":["document","collect","documents required","pending documents","submission"],
 "GENERAL_INQUIRY":["query","information","status","update","help"]}
def kw_pred(t):
    t=t.lower(); best=None; bn=0
    for lab,kws in KW.items():
        n=sum(1 for k in kws if k in t)
        if n>bn: bn=n; best=lab
    return best or "GENERAL_INQUIRY"

rows=[json.loads(l) for l in open(EVAL)]
X=[f"Subject: {r['subject']}\n\n{r['body']}" for r in rows]
y=[r["label"] for r in rows]
pm,cm=predict(X); pk=[kw_pred(x) for x in X]
print("="*70)
print(f"EVAL on human holdout (n={len(rows)})  model={MDIR.split('/')[-2]}")
print(f"  DistilBERT accuracy: {accuracy_score(y,pm):.3f}   mean conf: {sum(cm)/len(cm):.2f}")
print(f"  Keyword  accuracy:   {accuracy_score(y,pk):.3f}")
print("-"*70)
print(classification_report(y,pm,labels=LABELS,zero_division=0,digits=2))
print("Misclassified by DistilBERT:")
for t,p,c,x in zip(y,pm,cm,X):
    if t!=p: print(f"  {t:<22}-> {p:<22}({c:.2f})  {x[:55].replace(chr(10),' ')}")
