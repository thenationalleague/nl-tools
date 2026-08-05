/**
 * Handbook — render the PDF when an edition is published.
 *
 * WHAT THIS REPLACES
 *
 * handbook/index.html writes `app-data/ops-handbook/publishedEditionId` when
 * someone presses Publish. The PDF behind the reader's Download button is a
 * separate artefact that has to be rendered — a headless Chrome pass over
 * handbook/print.html, run by .github/workflows/render-handbook-pdf.yml.
 *
 * Nothing connected those two events. So the workflow polled: it woke at :25
 * past every hour, compared handbook/pdf-meta.json against the live
 * publishedEditionId, and 23 times out of 24 found nothing to do. The person
 * who pressed Publish waited up to an hour for their download to become the
 * edition they had just published, with no way to tell whether it was coming.
 *
 * This is the doorbell. The database announces the publish; the render starts
 * immediately; the wait drops from up to an hour to about two minutes.
 *
 * WHY A WORKFLOW DISPATCH AND NOT A RENDER HERE
 *
 * The render needs headless Chrome, puppeteer, pdf-lib, fontkit and a variable-
 * font instancing pass through fonttools, and it commits the result back to the
 * repo. That is a CI job, not a 256MiB function. This function's whole job is to
 * press the button that already exists.
 *
 * THE TOKEN
 *
 * Dispatching a workflow needs a GitHub credential, and this is the first one
 * the project has — every other automation authenticates to GCP through
 * Workload Identity Federation, keylessly. The token is therefore:
 *
 *   · a fine-grained PAT, not a classic one;
 *   · scoped to this repository alone;
 *   · holding exactly one permission, Actions: read and write;
 *   · stored in Secret Manager as GITHUB_DISPATCH_TOKEN, never in this repo.
 *
 * It must exist before this function deploys — see functions/README.md. A
 * missing secret fails the deploy rather than failing quietly at run time,
 * which is the right way round.
 *
 * WHEN IT FAILS
 *
 * A failed dispatch is logged and swallowed. It is deliberately not retried and
 * deliberately does not throw: the hourly poll is still in place as the safety
 * net, so the worst case of a broken doorbell is the behaviour we had before —
 * the PDF arrives within the hour instead of within two minutes. That fallback
 * is why this can ship without being load-bearing on day one.
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const GITHUB_DISPATCH_TOKEN = defineSecret("GITHUB_DISPATCH_TOKEN");

const REPO = "thenationalleague/tools";
const WORKFLOW = "render-handbook-pdf.yml";
const REF = "main";

/* A dispatch that hangs must not hold the function open to its own timeout —
   the render is not waiting on our response, only on the request landing. */
const DISPATCH_TIMEOUT_MS = 15000;

const TRIGGER_OPTS = {
  ref: "/app-data/ops-handbook/publishedEditionId",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. Same
     reason as programme.js and club-directory.js. */
  region: "europe-west1",
  memory: "256MiB",
  /* Publishing is a handful of events a year. The cap is here so a pathological
     write loop cannot turn into a pathological dispatch loop. */
  maxInstances: 3,
  /* Pinned for the same reason as the other RTDB triggers: the gen-2 default
     compute SA holds no Firebase roles. See account.js. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
  secrets: [GITHUB_DISPATCH_TOKEN],
};

/* Should a write of publishedEditionId start a render?
 *
 * Three cases say no, and each has cost a run somewhere if you let it through:
 *
 *   · a delete or a blank — unpublishing leaves nothing to render, and the
 *     render script would resolve an empty edition id and fail;
 *   · an unchanged value — RTDB fires on any write, including one that sets the
 *     same id again. The workflow would no-op on pdf-meta.json anyway, but the
 *     point of the doorbell is to stop paying for runs that find nothing;
 *   · a non-string — publishedEditionId is a pointer key. Anything else means
 *     something upstream is wrong, and dispatching on it hides that.
 *
 * Kept pure and free of the Firebase types so tests/handbook-render.test.mjs can
 * exercise it without the SDK — same approach as normCode in programme.js.
 */
function shouldDispatch(before, after) {
  if (typeof after !== "string") return false;
  if (after.trim() === "") return false;
  if (before === after) return false;
  return true;
}

async function dispatchRender(token, editionId) {
  const url =
    "https://api.github.com/repos/" + REPO +
    "/actions/workflows/" + WORKFLOW + "/dispatches";

  /* No `inputs` — the workflow's only input is `force`, and the whole reason to
     dispatch here is that the edition genuinely changed. Letting it compare
     against pdf-meta.json keeps a duplicate dispatch cheap. */
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "nl-tools-handbook-render",
    },
    body: JSON.stringify({ ref: REF }),
    signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
  });

  /* 204 No Content is success here — GitHub returns no body on an accepted
     dispatch, so anything with a body is worth reading into the log. */
  if (res.status === 204) {
    logger.info("Handbook render dispatched for edition " + editionId);
    return;
  }

  const body = await res.text().catch(() => "");
  logger.error(
    "Handbook render dispatch failed: " + res.status + " " + res.statusText +
    (body ? " — " + body.slice(0, 500) : "") +
    ". The hourly poll will pick the edition up instead."
  );
}

exports.handbookRenderOnPublish = onValueWritten(TRIGGER_OPTS, async (event) => {
  const before = event.data.before.val();
  const after = event.data.after.val();

  if (!shouldDispatch(before, after)) return;

  try {
    await dispatchRender(GITHUB_DISPATCH_TOKEN.value(), after);
  } catch (err) {
    /* Swallowed on purpose — see the header. A publish must not fail because
       the renderer could not be reached. */
    logger.error(
      "Handbook render dispatch threw: " + (err && err.message) +
      ". The hourly poll will pick the edition up instead."
    );
  }
});
