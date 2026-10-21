"""
Analyzes pilot study results: pre/post confidence scores per item, overall
delta, and a paired t-test on the participants who completed both surveys.

Usage:
    python analyze.py export.json

Get export.json by logging in as the study administrator account (the email
set as RESEARCHER_EMAIL in functions/api/pilot/export.js) and fetching:
    http://localhost:8788/api/pilot/export        (local dev)
    https://<your-deployed-domain>/api/pilot/export   (production)
Save the response body as export.json, or use the curl command printed by
--help.
"""
import json
import sys
import statistics

from scipy import stats

QUESTIONS = {
    "q1": "Can clearly state what I need",
    "q2": "Can stay calm when the other person gets defensive",
    "q3": "Can set a boundary without over-explaining/apologizing",
    "q4": "Can handle pushback without abandoning my point",
    "q5": "Can start a hard conversation instead of avoiding it",
    "q6": "Overall, feel prepared for my specific conversation",
}
QUESTION_KEYS = list(QUESTIONS.keys())


def cohens_d(pre, post):
    diffs = [b - a for a, b in zip(pre, post)]
    if len(diffs) < 2:
        return 0.0
    return statistics.mean(diffs) / (statistics.stdev(diffs) or 1e-9)


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        print("Example fetch (adjust host and cookie):")
        print('  curl -s "http://localhost:8788/api/pilot/export" \\')
        print('    -H "Cookie: rehearsals_session=<your session cookie>" > export.json')
        return

    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)

    participants = data.get("participants", [])
    paired = [p for p in participants if p.get("pre") and p.get("post")]
    pre_only = [p for p in participants if p.get("pre") and not p.get("post")]

    print(f"Total participants with a pre response: {len([p for p in participants if p.get('pre')])}")
    print(f"Completed both pre and post:            {len(paired)}")
    print(f"Pre only (post not yet due/collected):  {len(pre_only)}")
    print()

    if not paired:
        print("No paired responses yet - nothing to analyze until participants complete both check-ins.")
        return

    print(f"{'Item':<55} {'Pre':>6} {'Post':>6} {'Delta':>7} {'p-value':>9}")
    print("-" * 86)

    overall_pre_means, overall_post_means = [], []
    for key in QUESTION_KEYS:
        pre_scores = [p["pre"]["answers"][key] for p in paired]
        post_scores = [p["post"]["answers"][key] for p in paired]
        pre_mean = statistics.mean(pre_scores)
        post_mean = statistics.mean(post_scores)
        overall_pre_means.append(pre_mean)
        overall_post_means.append(post_mean)

        if len(paired) >= 2 and len(set(pre_scores + post_scores)) > 1:
            _, p_value = stats.ttest_rel(post_scores, pre_scores)
            p_str = f"{p_value:.3f}"
        else:
            p_str = "n/a"

        print(f"{QUESTIONS[key]:<55} {pre_mean:>6.2f} {post_mean:>6.2f} {post_mean - pre_mean:>+7.2f} {p_str:>9}")

    overall_pre = statistics.mean(overall_pre_means)
    overall_post = statistics.mean(overall_post_means)
    all_pre_scores = [p["pre"]["answers"][k] for p in paired for k in QUESTION_KEYS]
    all_post_scores = [p["post"]["answers"][k] for p in paired for k in QUESTION_KEYS]
    d = cohens_d(all_pre_scores, all_post_scores)

    print("-" * 86)
    print(f"{'OVERALL (all 6 items averaged)':<55} {overall_pre:>6.2f} {overall_post:>6.2f} {overall_post - overall_pre:>+7.2f}")
    print(f"\nEffect size (Cohen's d, paired, all items pooled): {d:.2f}")
    print("  (rule of thumb: 0.2 small, 0.5 medium, 0.8 large)")

    print("\n-- What participants said they're avoiding (pre) --")
    for p in paired:
        text = p["pre"]["answers"].get("openText", "").strip()
        if text:
            print(f"  - {text}")

    print("\n-- What changed, in their own words (post) --")
    for p in paired:
        text = p["post"]["answers"].get("openText", "").strip()
        if text:
            print(f"  - {text}")


if __name__ == "__main__":
    main()
