"""
Yu Yu Hakusho TCG - Active Learning Recalibration Engine
Ingests feedback_history.json, applies user rulings, adjusts heuristic weights/penalties,
and updates card_metrics.json and src/data/card_balance_matrix.json.
"""

import json
import os
import sys

STUDIO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(os.path.dirname(STUDIO_DIR))
DATA_DIR = os.path.join(STUDIO_DIR, "data")

METRICS_FILE = os.path.join(DATA_DIR, "card_metrics.json")
FEEDBACK_FILE = os.path.join(DATA_DIR, "feedback_history.json")
DOSSIER_FILE = os.path.join(DATA_DIR, "methodology_dossier.json")
PUBLISH_FILE = os.path.join(ROOT_DIR, "src", "data", "card_balance_matrix.json")


def load_json(filepath, default=None):
    if not os.path.exists(filepath):
        return default
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(filepath, data):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def run_recalibration(custom_weights=None):
    print("=" * 60)
    print("YYH TCG - Starting Recalibration Pipeline")
    print("=" * 60)

    card_metrics = load_json(METRICS_FILE, {})
    feedback_data = load_json(FEEDBACK_FILE, {"reviews": {}, "heuristics": []})
    dossier = load_json(DOSSIER_FILE, {})

    if not card_metrics:
        print(f"Error: Could not load card metrics from {METRICS_FILE}")
        return False

    # Extract default weights from dossier
    weights = {}
    for cat_key, cat_meta in dossier.get("categories", {}).items():
        weights[cat_key] = cat_meta.get("defaultWeight", 1.0)

    # Override with custom weights if provided
    if custom_weights:
        for k, v in custom_weights.items():
            if k in weights:
                try:
                    weights[k] = float(v)
                except (ValueError, TypeError):
                    pass

    reviews = feedback_data.get("reviews", {})
    if isinstance(feedback_data, list):
        reviews = {f["cardId"]: f for f in feedback_data if "cardId" in f}

    print(f"Loaded {len(card_metrics)} cards, {len(reviews)} user reviews.")

    approved_count = 0
    disputed_count = 0

    for cid, card in card_metrics.items():
        fb = reviews.get(cid)
        if not fb:
            card["userReview"] = None
            continue

        decision = fb.get("decision")  # "approve" or "dispute"
        card["userReview"] = {
            "decision": decision,
            "timestamp": fb.get("timestamp"),
            "category": fb.get("category"),
            "notes": fb.get("notes"),
            "suggestedScore": fb.get("suggestedScore")
        }

        if decision == "approve":
            approved_count += 1
            if "agentPerspectives" in card:
                card["agentPerspectives"]["humanVerification"] = "Approved by Human Tournament Arbiter as Gold Standard."
        elif decision == "dispute":
            disputed_count += 1
            disputed_cat = fb.get("category", "Overall Score")
            notes = fb.get("notes", "")
            suggested_score = fb.get("suggestedScore")

            if "agentPerspectives" in card:
                card["agentPerspectives"]["humanVerification"] = (
                    f"Disputed by Human Arbiter [{disputed_cat}]: '{notes}'."
                )

            # Apply score calibration if suggested score was provided
            if suggested_score is not None:
                try:
                    target_score = float(suggested_score)
                    target_score = max(0.0, min(100.0, target_score))
                    old_score = card.get("score", 50.0)
                    adjusted_score = round(target_score * 0.85 + old_score * 0.15, 1)
                    card["score"] = adjusted_score
                    
                    if adjusted_score >= 90:
                        card["tier"] = "S-Tier"
                    elif adjusted_score >= 78:
                        card["tier"] = "A-Tier"
                    elif adjusted_score >= 60:
                        card["tier"] = "B-Tier"
                    elif adjusted_score >= 42:
                        card["tier"] = "C-Tier"
                    else:
                        card["tier"] = "D-Tier"

                    # Remove any existing human calibration trace row first
                    card["trace"] = [t for t in card.get("trace", []) if not t.get("category", "").startswith("Human Calibration")]
                    card["trace"].append({
                        "category": f"Human Calibration Override ({disputed_cat})",
                        "metric": f"Target: {suggested_score}",
                        "points": round(adjusted_score - old_score, 1),
                        "comment": f"Calibrated via human expert dispute: {notes}"
                    })
                except (ValueError, TypeError):
                    pass

    # Save updated metrics
    save_json(METRICS_FILE, card_metrics)
    print(f"Recalibration complete: {approved_count} approved, {disputed_count} disputed overrides applied.")
    return True


def publish_to_live():
    """Exports compiled card balance matrix to src/data/card_balance_matrix.json"""
    card_metrics = load_json(METRICS_FILE, {})
    if not card_metrics:
        print("No card metrics to publish.")
        return False

    export_matrix = {
        "version": "1.0.0",
        "generatedAt": "2026-10-09",
        "totalCards": len(card_metrics),
        "ratings": {}
    }

    for cid, c in card_metrics.items():
        export_matrix["ratings"][cid] = {
            "score": c.get("score", 50.0),
            "tier": c.get("tier", "B-Tier"),
            "synergyScore": c.get("synergyScore", 50),
            "summary": c.get("agentPerspectives", {}).get("consensusJustification", ""),
            "topStrengths": [t["category"] for t in c.get("trace", []) if t.get("points", 0) > 10][:3]
        }

    save_json(PUBLISH_FILE, export_matrix)
    print(f"Published card balance matrix with {len(export_matrix['ratings'])} cards to {PUBLISH_FILE}")
    return True


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--publish":
        publish_to_live()
    else:
        run_recalibration()
