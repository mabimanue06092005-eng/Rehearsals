# Running the pilot study

The survey infrastructure is already live in the app (Settings → Research
Study). This is the human process around it — the part nobody but you and
your team can automate.

## 1. Before recruiting anyone

- Open [`functions/api/pilot/export.js`](../functions/api/pilot/export.js) and set `RESEARCHER_EMAIL` to
  whichever account will act as study administrator. Only that account can
  fetch everyone's raw responses.
- Deploy (or run locally) so the app is reachable by whoever you recruit.

## 2. Recruiting (15-20 people)

Anyone with a real hard conversation coming up is a good fit — classmates,
coworkers, friends. Ask them to:
1. Create a Rehearsals account.
2. Go to **Settings → Research Study** and fill out the **baseline
   check-in** (this is also where they give consent — required before the
   response saves).
3. Use the app normally for a couple of weeks — a few rehearsals, whatever
   feels natural, not a fixed script.
4. Come back to **Settings → Research Study** and fill out the **follow-up
   check-in**.

There's no automatic reminder to come back for the follow-up yet — that's a
manual nudge from you (a message, an email) roughly 2-3 weeks after their
baseline. Real hard conversations don't happen on a fixed schedule, so don't
over-automate the timing.

## 3. Pulling the data

Once you have a few completed pairs, fetch the export while logged in as the
`RESEARCHER_EMAIL` account:

```
curl -s "https://<your-domain>/api/pilot/export" \
  -H "Cookie: rehearsals_session=<your session cookie>" > export.json
```

(Get the cookie value from your browser's dev tools → Application →
Cookies, while logged into that account. Or open the URL directly in a
browser you're logged in with and save the page as `export.json`.)

## 4. Analyzing

```
cd pilot
python analyze.py export.json
```

This prints per-item pre/post means, deltas, a paired t-test per item, and
an overall effect size (Cohen's d) — plus the qualitative "what changed"
answers, verbatim. Re-run it anytime as more responses come in; nothing
needs to be recomputed by hand.

## What this can and can't claim

15-20 people is a real pilot, not a clinical trial — frame results as "early
signal," not proof. A large, consistent shift across most items with a
handful of concrete "here's what changed" quotes is a strong, honest story
for a judge. A p-value on n=15 is illustrative, not the point — the
qualitative answers usually carry more weight than the stats at this scale.
