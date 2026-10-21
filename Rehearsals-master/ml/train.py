"""
Trains the turn-state classifier on the synthetic dataset and exports it as
a compact JSON the browser can run with zero ML runtime - just a TF-IDF dot
product and a softmax, both trivial to port to plain JS.

Pipeline: text -> TF-IDF (word 1-2 grams, capped vocab) -> multinomial
logistic regression -> {comfortable, hesitant, defensive, shutdown}.

Usage:
    python train.py
Reads ml/data/raw_examples.jsonl, writes:
    ml/data/model.json         - exported weights for the JS port
    ml/data/eval_report.txt    - accuracy / F1 / confusion matrix
"""
import json
import os

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.model_selection import train_test_split

HERE = os.path.dirname(__file__)
DATA_PATH = os.path.join(HERE, "data", "raw_examples.jsonl")
MODEL_OUT = os.path.join(HERE, "data", "model.json")
REPORT_OUT = os.path.join(HERE, "data", "eval_report.txt")

LABELS = ["comfortable", "hesitant", "defensive", "shutdown"]
MAX_FEATURES = 700


def load_data():
    texts, labels = [], []
    with open(DATA_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            texts.append(row["text"])
            labels.append(row["label"])
    return texts, labels


def main():
    texts, labels = load_data()
    print(f"Loaded {len(texts)} examples")
    for lbl in LABELS:
        print(f"  {lbl}: {labels.count(lbl)}")

    X_train_txt, X_test_txt, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )

    vectorizer = TfidfVectorizer(
        lowercase=True,
        token_pattern=r"(?u)\b\w\w+\b",
        ngram_range=(1, 2),
        max_features=MAX_FEATURES,
        sublinear_tf=False,
        norm="l2",
        smooth_idf=True,
    )
    X_train = vectorizer.fit_transform(X_train_txt)
    X_test = vectorizer.transform(X_test_txt)

    clf = LogisticRegression(
        max_iter=2000,
        C=2.0,
        class_weight="balanced",
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred, labels=LABELS, digits=3)
    cm = confusion_matrix(y_test, y_pred, labels=LABELS)

    report_text = (
        f"Accuracy: {acc:.4f}\n\n"
        f"Classification report:\n{report}\n\n"
        f"Confusion matrix (rows=true, cols=pred), order={LABELS}:\n{cm}\n"
    )
    print(report_text)
    with open(REPORT_OUT, "w", encoding="utf-8") as f:
        f.write(report_text)

    # ── Export for the JS port ──────────────────────────────────────────
    # class order used by clf.classes_ may differ from LABELS - realign
    class_order = [str(c) for c in clf.classes_]
    vocab = {k: int(v) for k, v in vectorizer.vocabulary_.items()}  # token -> feature index
    idf = vectorizer.idf_.tolist()  # per-feature idf weight, same index space as vocab

    coef = clf.coef_.tolist()          # (n_classes, n_features)
    intercept = clf.intercept_.tolist()  # (n_classes,)

    model_export = {
        "labels": class_order,
        "vocab": vocab,          # token -> index
        "idf": idf,              # index -> idf weight
        "ngramMax": 2,
        "coef": coef,
        "intercept": intercept,
        "meta": {
            "trainedOn": len(texts),
            "accuracy": round(acc, 4),
            "note": "Trained on synthetic Groq-generated examples (see ml/generate_data.py). Text-only v1; prosody is fused with a documented rule on top, not jointly trained. Retrain on real pilot data once available.",
        },
    }
    with open(MODEL_OUT, "w", encoding="utf-8") as f:
        json.dump(model_export, f, indent=1)

    size_kb = os.path.getsize(MODEL_OUT) / 1024
    print(f"Exported model to {MODEL_OUT} ({size_kb:.1f} KB), vocab size={len(vocab)}")


if __name__ == "__main__":
    main()
