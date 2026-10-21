"""
Generates a synthetic labeled dataset for the turn-state classifier.

Why synthetic: we don't have real user transcripts yet (that comes from the
Phase 4 pilot). This bootstraps a real, working v1 classifier now, trained on
diverse LLM-generated examples of each emotional state. It's documented as
synthetic throughout - not passed off as real user data anywhere downstream.

Classes (must match the existing debrief/classifier semantics in index.html):
  comfortable - confident, clear, grounded statement of needs/boundaries
  hesitant    - hedging, qualifying, apologizing before stating needs, trailing off
  defensive   - justifying, counter-attacking, blaming, arguing back sharply
  shutdown    - withdrawing, giving up, minimal/avoidant, capitulating

Usage:
    python generate_data.py
Writes ml/data/raw_examples.jsonl (one {"text": ..., "label": ...} per line).
"""
import json
import os
import random
import time
import requests

GROQ_API_KEY = None
with open(os.path.join(os.path.dirname(__file__), "..", ".dev.vars"), encoding="utf-8") as f:
    for line in f:
        if line.startswith("GROQ_API_KEY="):
            GROQ_API_KEY = line.strip().split("=", 1)[1]

assert GROQ_API_KEY, "GROQ_API_KEY not found in .dev.vars"

SCENARIOS = [
    "telling a parent something they don't want to hear",
    "pushing back on a defensive manager in a performance review",
    "setting a boundary with a conflict-avoidant roommate",
    "negotiating salary for the first time",
    "confronting a partner about a broken promise",
    "telling a friend their joke was hurtful",
    "asking a sibling to repay a debt",
    "pushing back on a parent who is guilt-tripping them",
    "telling a coworker they're not pulling their weight",
    "ending a friendship that has become one-sided",
    "asking a landlord to fix a serious issue",
    "telling a family member their comments about weight need to stop",
]

LABEL_SPEC = {
    "comfortable": "The speaker is confident, clear, and grounded. They state their need or boundary directly, without over-apologizing, without hedging, and without being aggressive. Calm and steady.",
    "hesitant": "The speaker is hedging, qualifying, apologizing before stating their need, trailing off, or undermining their own point with soft language ('I don't know, maybe, sorry, it's probably nothing, I guess'). Uncertain and self-doubting.",
    "defensive": "The speaker is justifying themselves, counter-attacking, blaming the other person, or arguing back sharply instead of staying on their own point. Combative or self-protective in a pointed way.",
    "shutdown": "The speaker is withdrawing, giving up, going quiet, capitulating, or giving a minimal/avoidant non-answer ('fine, whatever, it doesn't matter, forget it, never mind'). Checked out or resigned.",
}

OUT_PATH = os.path.join(os.path.dirname(__file__), "data", "raw_examples.jsonl")
EXAMPLES_PER_CALL = 12
CALLS_PER_LABEL = 10  # 12 * 10 = ~120 examples per label, ~480 total


def call_groq(system, user):
    resp = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": 1200,
            "temperature": 1.05,
            "response_format": {"type": "json_object"},
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def generate_batch(label, scenario):
    system = (
        "You generate training data for a text classifier used in a conversation-practice app. "
        "You write short, realistic lines a REAL PERSON might say mid-conversation during a hard, "
        "emotionally loaded discussion - not narration, not dialogue tags, just the line itself, "
        "the way someone would actually say it out loud. Vary sentence length and phrasing a lot. "
        f"Every line must clearly match this emotional state: {label.upper()} - {LABEL_SPEC[label]}\n\n"
        'Respond with ONLY valid JSON: {"examples": ["line 1", "line 2", ...]}'
    )
    user = (
        f"Generate {EXAMPLES_PER_CALL} distinct example lines for the scenario: "
        f"{scenario}. Each line must sound like {label}, per the definition given. "
        "No two lines should be similar in structure. Keep each line 1-3 sentences."
    )
    raw = call_groq(system, user)
    data = json.loads(raw)
    return [ex.strip() for ex in data.get("examples", []) if ex and ex.strip()]


def main():
    random.seed(7)
    written = 0
    with open(OUT_PATH, "w", encoding="utf-8") as out:
        for label in LABEL_SPEC:
            calls_done = 0
            attempts = 0
            while calls_done < CALLS_PER_LABEL and attempts < CALLS_PER_LABEL * 2:
                attempts += 1
                scenario = random.choice(SCENARIOS)
                try:
                    lines = generate_batch(label, scenario)
                except Exception as e:
                    print(f"  ! {label}/{scenario}: {e} - retrying")
                    time.sleep(1.5)
                    continue
                for line in lines:
                    out.write(json.dumps({"text": line, "label": label, "scenario": scenario}) + "\n")
                    written += 1
                calls_done += 1
                print(f"[{label}] batch {calls_done}/{CALLS_PER_LABEL} ({scenario}) -> {len(lines)} lines, total={written}")
                time.sleep(0.3)
    print(f"\nDone. Wrote {written} examples to {OUT_PATH}")


if __name__ == "__main__":
    main()
