#!/usr/bin/env python3
"""
DistilBERT fine-tuning for email classification.

Loads labeled emails from the benchmark database, fine-tunes
distilbert-base-uncased on the 8-class classification task,
evaluates on a held-out test set, and exports to ONNX format.

Usage:
    python train.py --db-url "postgresql://..." --batch-id training-v1
    python train.py --db-url "postgresql://..." --batch-id training-v1 --epochs 5 --output-dir ./model
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import psycopg2
import torch
import torch.nn as nn
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Dataset
from transformers import (
    DistilBertForSequenceClassification,
    DistilBertTokenizerFast,
    get_linear_schedule_with_warmup,
)

# ── Label Mapping ──────────────────────────────────────────────────
LABELS = [
    "VALUATION_REQUEST",
    "LEGAL_OPINION",
    "TITLE_SEARCH",
    "INSURANCE_RENEWAL",
    "RELEASE_OF_COLLATERAL",
    "SITE_VISIT",
    "DOCUMENT_COLLECTION",
    "GENERAL_INQUIRY",
]
LABEL2ID = {label: idx for idx, label in enumerate(LABELS)}
ID2LABEL = {idx: label for idx, label in enumerate(LABELS)}
NUM_LABELS = len(LABELS)


# ── Dataset ────────────────────────────────────────────────────────
class EmailDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_length=256):
        self.encodings = tokenizer(
            texts,
            truncation=True,
            padding="max_length",
            max_length=max_length,
            return_tensors="pt",
        )
        self.labels = torch.tensor(labels, dtype=torch.long)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        return {
            "input_ids": self.encodings["input_ids"][idx],
            "attention_mask": self.encodings["attention_mask"][idx],
            "labels": self.labels[idx],
        }


# ── Data Loading ───────────────────────────────────────────────────
def load_emails(db_url: str, batch_id: str | None = None, source: str = "app",
                data_file: str | None = None):
    """Load labeled emails.

    data_file set: a JSONL file of {"subject","body","label"} objects.
    source="benchmark": synthetic corpus in the test_emails table.
    source="app": real ingested emails joined to their confirmed case type
                  (email_ingests x cases) — used when the benchmark corpus
                  is unavailable.
    """
    if data_file:
        rows = []
        with open(data_file) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                rows.append((obj["subject"], obj["body"], obj["label"]))
    else:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        params = []
        if source == "app":
            query = (
                "SELECT e.subject, e.body_text, c.case_type "
                "FROM cases c JOIN email_ingests e ON e.id = c.email_ingest_id "
                "WHERE e.subject IS NOT NULL AND e.body_text IS NOT NULL "
                "AND c.case_type IS NOT NULL"
            )
        else:
            query = "SELECT subject, body, ground_truth_label FROM test_emails"
            if batch_id:
                query += " WHERE generation_batch = %s"
                params.append(batch_id)

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()

    texts = []
    labels = []
    skipped = 0

    for subject, body, label in rows:
        if label not in LABEL2ID:
            skipped += 1
            continue
        text = f"Subject: {subject}\n\n{body}"
        texts.append(text)
        labels.append(LABEL2ID[label])

    print(f"Loaded {len(texts)} emails ({skipped} skipped due to unknown labels)")
    return texts, labels


# ── Training ───────────────────────────────────────────────────────
def train_model(
    texts,
    labels,
    output_dir: str,
    epochs: int = 4,
    batch_size: int = 16,
    learning_rate: float = 2e-5,
    max_length: int = 256,
    test_size: float = 0.2,
):
    device = torch.device("mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # Split data
    train_texts, test_texts, train_labels, test_labels = train_test_split(
        texts, labels, test_size=test_size, random_state=42, stratify=labels
    )
    print(f"Train: {len(train_texts)}, Test: {len(test_texts)}")

    # Tokenizer
    tokenizer = DistilBertTokenizerFast.from_pretrained("distilbert-base-uncased")

    # Datasets
    train_dataset = EmailDataset(train_texts, train_labels, tokenizer, max_length)
    test_dataset = EmailDataset(test_texts, test_labels, tokenizer, max_length)

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=batch_size)

    # Model
    model = DistilBertForSequenceClassification.from_pretrained(
        "distilbert-base-uncased",
        num_labels=NUM_LABELS,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )
    model.to(device)

    # Optimizer & scheduler
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=0.01)
    total_steps = len(train_loader) * epochs
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=int(0.1 * total_steps), num_training_steps=total_steps
    )

    # Training loop
    best_f1 = 0.0
    for epoch in range(epochs):
        model.train()
        total_loss = 0
        correct = 0
        total = 0

        for batch in train_loader:
            batch = {k: v.to(device) for k, v in batch.items()}
            outputs = model(**batch)
            loss = outputs.loss

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()

            total_loss += loss.item()
            preds = outputs.logits.argmax(dim=-1)
            correct += (preds == batch["labels"]).sum().item()
            total += len(batch["labels"])

        train_acc = correct / total
        avg_loss = total_loss / len(train_loader)

        # Evaluate
        metrics = evaluate(model, test_loader, device)
        print(
            f"Epoch {epoch + 1}/{epochs} | "
            f"Loss: {avg_loss:.4f} | "
            f"Train Acc: {train_acc:.3f} | "
            f"Val Acc: {metrics['accuracy']:.3f} | "
            f"Val Macro F1: {metrics['macro_f1']:.3f}"
        )

        # Save best model
        if metrics["macro_f1"] > best_f1:
            best_f1 = metrics["macro_f1"]
            save_dir = Path(output_dir) / "best"
            save_dir.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(save_dir)
            tokenizer.save_pretrained(save_dir)
            print(f"  -> Saved best model (F1: {best_f1:.3f})")

    # Final evaluation with full report
    print("\n" + "=" * 60)
    print("FINAL EVALUATION ON TEST SET")
    print("=" * 60)
    metrics = evaluate(model, test_loader, device, verbose=True)

    # Save label mapping
    label_map = {"labels": LABELS, "label2id": LABEL2ID, "id2label": {str(k): v for k, v in ID2LABEL.items()}}
    label_map_path = Path(output_dir) / "label_map.json"
    label_map_path.parent.mkdir(parents=True, exist_ok=True)
    with open(label_map_path, "w") as f:
        json.dump(label_map, f, indent=2)

    return model, tokenizer, metrics


def evaluate(model, dataloader, device, verbose=False):
    model.eval()
    all_preds = []
    all_labels = []

    with torch.no_grad():
        for batch in dataloader:
            batch = {k: v.to(device) for k, v in batch.items()}
            outputs = model(**batch)
            preds = outputs.logits.argmax(dim=-1)
            all_preds.extend(preds.cpu().numpy())
            all_labels.extend(batch["labels"].cpu().numpy())

    all_preds = np.array(all_preds)
    all_labels = np.array(all_labels)

    accuracy = (all_preds == all_labels).mean()
    report = classification_report(
        all_labels, all_preds, target_names=LABELS, output_dict=True, zero_division=0
    )

    if verbose:
        print(classification_report(all_labels, all_preds, target_names=LABELS, zero_division=0))
        print("\nConfusion Matrix:")
        cm = confusion_matrix(all_labels, all_preds)
        # Header
        print(f"{'':>25s}", end="")
        for label in LABELS:
            print(f" {label[:8]:>8s}", end="")
        print()
        for i, label in enumerate(LABELS):
            print(f"{label:>25s}", end="")
            for j in range(NUM_LABELS):
                print(f" {cm[i][j]:>8d}", end="")
            print()

    return {
        "accuracy": accuracy,
        "macro_f1": report["macro avg"]["f1-score"],
        "macro_precision": report["macro avg"]["precision"],
        "macro_recall": report["macro avg"]["recall"],
        "weighted_f1": report["weighted avg"]["f1-score"],
    }


# ── ONNX Export ────────────────────────────────────────────────────
def export_onnx(model_dir: str, output_path: str, max_length: int = 256):
    """Export the fine-tuned model to ONNX format."""
    print(f"\nExporting ONNX model to {output_path}...")

    tokenizer = DistilBertTokenizerFast.from_pretrained(model_dir)
    model = DistilBertForSequenceClassification.from_pretrained(model_dir)
    model.eval()

    # Create dummy input
    dummy_input = tokenizer(
        "Subject: Test email\n\nThis is a test.",
        truncation=True,
        padding="max_length",
        max_length=max_length,
        return_tensors="pt",
    )

    # Export
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model,
        (dummy_input["input_ids"], dummy_input["attention_mask"]),
        str(output_file),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size"},
        },
        opset_version=14,
        do_constant_folding=True,
    )

    # Verify
    import onnx
    onnx_model = onnx.load(str(output_file))
    onnx.checker.check_model(onnx_model)

    file_size_mb = output_file.stat().st_size / (1024 * 1024)
    print(f"ONNX model exported: {output_file} ({file_size_mb:.1f} MB)")

    # Also save tokenizer alongside ONNX model
    tokenizer.save_pretrained(output_file.parent)
    print(f"Tokenizer saved to {output_file.parent}")

    return str(output_file)


# ── Main ───────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Train DistilBERT email classifier")
    parser.add_argument("--db-url", default=None, help="PostgreSQL connection URL (not needed with --data-file)")
    parser.add_argument("--data-file", default=None, help="JSONL file of {subject,body,label} to train from instead of the DB")
    parser.add_argument("--batch-id", default=None, help="Filter emails by generation batch")
    parser.add_argument("--source", choices=["app", "benchmark"], default="app",
                        help="Data source: 'app' (email_ingests x cases) or 'benchmark' (test_emails)")
    parser.add_argument("--epochs", type=int, default=4, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size")
    parser.add_argument("--lr", type=float, default=2e-5, help="Learning rate")
    parser.add_argument("--max-length", type=int, default=256, help="Max token length")
    parser.add_argument("--test-size", type=float, default=0.2, help="Test split ratio")
    parser.add_argument("--output-dir", default="./model", help="Model output directory")
    parser.add_argument("--onnx-path", default=None, help="ONNX export path (default: <output-dir>/onnx/model.onnx)")
    args = parser.parse_args()

    # Load data
    if not args.db_url and not args.data_file:
        parser.error("one of --db-url or --data-file is required")
    texts, labels = load_emails(args.db_url, args.batch_id, args.source, args.data_file)
    if len(texts) < 10:
        print("ERROR: Not enough training data. Need at least 10 emails.")
        sys.exit(1)

    # Print label distribution
    print("\nLabel distribution:")
    for label_name in LABELS:
        count = sum(1 for l in labels if l == LABEL2ID[label_name])
        print(f"  {label_name}: {count}")

    # Train
    model, tokenizer, metrics = train_model(
        texts,
        labels,
        output_dir=args.output_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        max_length=args.max_length,
        test_size=args.test_size,
    )

    # Export ONNX
    onnx_path = args.onnx_path or os.path.join(args.output_dir, "onnx", "model.onnx")
    best_model_dir = os.path.join(args.output_dir, "best")
    export_onnx(best_model_dir, onnx_path, max_length=args.max_length)

    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)
    print(f"  Best Macro F1: {metrics['macro_f1']:.3f}")
    print(f"  ONNX model:    {onnx_path}")
    print(f"  Tokenizer:     {Path(onnx_path).parent}")
    print(f"  Label map:     {args.output_dir}/label_map.json")


if __name__ == "__main__":
    main()
