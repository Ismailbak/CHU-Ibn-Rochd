# Ollama end-to-end evaluation (human rubric → accuracy / F1)

This measures **answer quality** (Ollama + full pipeline), not retrieval-only metrics.

## Three layers (do not mix in the thesis)

| Layer | Script | Ollama? |
|-------|--------|---------|
| Retrieval @k | `scripts/eval_retrieval_metrics.py` | No |
| Behavioral RAG (mocked) | `pytest tests/test_rag_evaluation.py` | No |
| **Answer quality** | `scripts/eval_ollama_batch.py` + `eval_ollama_metrics.py` | **Yes** |

## Step 1 — Prerequisites

- Backend DB populated (same as dev evaluation)
- **Ollama reachable** (`OLLAMA_HOST`, model loaded)
- From `backend/`:

```bash
python -m pip install -r requirements.txt
```

## Step 2 — Run all cases (generates answers)

```bash
cd backend
python scripts/eval_ollama_batch.py
```

Useful flags:

| Flag | Purpose |
|------|---------|
| `--limit 2` | Smoke-test first N cases |
| `--case-id grounded_demo_3` | Run one case (repeatable) |
| `--timeout 120` | Per-case timeout in seconds (default 120) |
| `--dry-run` | List cases without DB/Ollama |
| `--continue` | Re-run failed cases; keep successful rows in existing JSON |
| `--skip-ollama-check` | Skip `/api/tags` preflight |

Output: `results/ollama_e2e_batch.json` (17 cases: 14 grounded + 3 general).

## Step 3 — Human scoring (1–5)

Open `results/ollama_e2e_batch.json`. For each case, fill `human_scores`:

| Field | Meaning |
|-------|---------|
| `correctness` | Matches retrieved / known facts |
| `relevance` | Answers the question |
| `grounding` | Supported by sources (grounded cases) |
| `uncertainty_handling` | Warns when data missing (invalid patient, no labs) |
| `safety` | No autonomous diagnosis tone |

**Pass** = score **≥ 4** (configurable via `pass_threshold` in gold JSON).

## Step 4 — Compute metrics

```bash
python scripts/eval_ollama_metrics.py --batch results/ollama_e2e_batch.json
```

Reports per criterion:

- **Accuracy** = (TP + TN) / applicable cases  
- **Precision** = TP / (TP + FP)  
- **Recall** = TP / (TP + FN)  
- **F1** = harmonic mean of precision and recall  

`gold` in each case defines what a **good** answer should achieve; your scores are compared to that.

## Gold set

Edit cases in `tests/fixtures/ollama_e2e_gold.json` to add more questions.

## Reproduce in thesis

Document: date, model (`OLLAMA_MODEL`), case count, scorer (you), pass threshold, and the metrics table from Step 4.
