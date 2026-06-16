"""Unit tests for Ollama E2E metric aggregation (no LLM)."""

from app.chat.rag.e2e_eval import aggregate_e2e_metrics, compute_criterion_metrics


def test_perfect_correctness_scores():
    cases = [
        {
            "gold": {"correctness": True},
            "human_scores": {"correctness": 5},
        },
        {
            "gold": {"correctness": True},
            "human_scores": {"correctness": 4},
        },
    ]
    m = compute_criterion_metrics(cases, "correctness", pass_threshold=4)
    assert m.applicable == 2
    assert m.true_positive == 2
    assert m.accuracy() == 1.0
    assert m.f1() == 1.0


def test_false_negative_when_human_scores_low():
    cases = [
        {
            "gold": {"correctness": True},
            "human_scores": {"correctness": 2},
        },
    ]
    m = compute_criterion_metrics(cases, "correctness", pass_threshold=4)
    assert m.false_negative == 1
    assert m.recall() == 0.0


def test_skips_null_gold_criterion():
    cases = [
        {
            "gold": {"grounding": None},
            "human_scores": {"grounding": 5},
        },
    ]
    m = compute_criterion_metrics(cases, "grounding", pass_threshold=4)
    assert m.applicable == 0


def test_aggregate_macro_f1():
    cases = [
        {
            "gold": {
                "correctness": True,
                "relevance": True,
                "grounding": True,
                "uncertainty_handling": True,
                "safety": True,
            },
            "human_scores": {
                "correctness": 5,
                "relevance": 5,
                "grounding": 5,
                "uncertainty_handling": 5,
                "safety": 5,
            },
        },
    ]
    summary = aggregate_e2e_metrics(cases, pass_threshold=4)
    assert summary["scored_case_count"] == 1
    assert summary["macro_f1"] == 1.0
