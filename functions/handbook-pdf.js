/**
 * NL Tools — publish the handbook, get the PDF (RTDB-triggered).
 *
 * WHAT THIS IS
 * ------------
 * The handbook's Download PDF button serves a real file, handbook/handbook.pdf,
 * rendered from the PUBLISHED edition by .github/workflows/render-handbook-pdf
 * .yml. That workflow runs hourly and no-ops when the PDF already matches the
 * live publishedEditionId, so a publish reaches the PDF within the hour on its
 * own. To get it sooner someone had to open GitHub Actions and press Run
 * workflow — which is a GitHub account, a repository, and knowing that
 * "rendering the PDF" is a thing that exists.
 *
 * WHY IT IS A TRIGGER AND NOT A BUTTON
 * ------------------------------------
 * The ask was "a colleague should be able to get it published immediately
 * without my involvement". They already have the Publish button. Adding a
 * second one — "Rebuild PDF now" — would be a second thing to know about, a
 * second thing to forget, and it names an implementation detail: to the person
 * publishing, the PDF is not a separate artefact, it is part of what publishing
 * means. So publishing IS the trigger, and nobody presses anything.
 *
 * The hourly schedule stays underneath. This makes the PDF prompt; the cron is
 * what makes it certain, and it is the thing that still works if the token
 * below expires, GitHub is down, or this function is broken.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not render anything. It asks GitHub to start the workflow that does,
 * and returns. Rendering needs Chrome and about a minute; that belongs in
 * Actions, where it already is and already works.
 *
 * IT CANNOT PUBLISH ANYTHING
 * --------------------------
 * Worth stating plainly, because "a function that talks to GitHub with a
 * token" deserves the suspicion. It fires one fixed workflow in one fixed
 * repository. It takes no input from the event beyond the fact that something
 * changed, so there is nothing a caller can steer. A publish is still a
 * publish — this only decides when the PDF catches up.
 *
 * THE TOKEN
 * ---------
 * GITHUB_DISPATCH_TOKEN, a Secret Manager secret. It is the first secret any
 * function in this project uses. Scope it as narrowly as GitHub allows: a
 * fine-grained personal access token, this repository only, Actions:
 * read and write, and nothing else. It expires; when it does, the failure mode
 * is this function logging an error and the hourly cron carrying on exactly as
 * before — the PDF goes back to being up to an hour late, and nothing breaks.
 * That is deliberate: the fallback is the thing that was already there.
 */

"use strict";

const { onValueWritten } = require("firebase-functions/v2/database");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const GITHUB_DISPATCH_TOKEN = defineSecret("GITHUB_DISPATCH_TOKEN");

const OWNER = "thenationalleague";
const REPO = "nl-tools";
const WORKFLOW = "render-handbook-pdf.yml";
const BRANCH = "main";

const TRIGGER_OPTS = {
  /* The pointer every public surface reads. It moves exactly once per publish,
     which is exactly when the PDF becomes stale. */
  ref: "/app-data/ops-handbook/publishedEditionId",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  /* One at a time. Two publishes a minute apart should not start two renders
     racing to commit the same file; the workflow's own concurrency group would
     cancel one, but not starting it is cheaper and clearer. */
  maxInstances: 1,
  /* The same account the other four triggers name. This one does not need it
     for RTDB reasons — it only reads the event payload — but naming it keeps
     the Secret Manager grant to ONE identity across the project, rather than
     this function alone running as the gen-2 default compute account and
     needing its own binding that nobody would remember existed. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
  secrets: [GITHUB_DISPATCH_TOKEN],
};

exports.handbookPdfOnPublish = onValueWritten(TRIGGER_OPTS, async (event) => {
  const after = event.data && event.data.after;
  const editionId = after && after.exists() ? after.val() : null;

  /* Nothing published (the pointer cleared) is not an error and is not a
     render — there is no edition to render. */
  if (!editionId) {
    logger.info("handbook-pdf: publishedEditionId is empty, nothing to render");
    return;
  }

  const before = event.data && event.data.before;
  const was = before && before.exists() ? before.val() : null;
  /* An RTDB write that does not change the value still fires. Re-rendering the
     same edition is a no-op in the workflow too, but a run that does nothing is
     still a run someone has to read past in the Actions list. */
  if (was === editionId) {
    logger.info("handbook-pdf: pointer rewritten unchanged, skipping");
    return;
  }

  const url = "https://api.github.com/repos/" + OWNER + "/" + REPO +
    "/actions/workflows/" + WORKFLOW + "/dispatches";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + GITHUB_DISPATCH_TOKEN.value(),
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      /* No inputs. `force` defaults to false, so the workflow still checks
         pdf-meta.json against the live pointer and no-ops if it is already
         current — which is what makes a duplicate dispatch harmless. */
      body: JSON.stringify({ ref: BRANCH }),
    });

    if (res.status === 204) {
      logger.info("handbook-pdf: render requested for edition " + editionId);
      return;
    }
    /* Log and return, never throw. A throw is a retry, and retrying a
       dispatch that GitHub rejected (bad token, expired token) just fires the
       same rejected request again on a backoff. The hourly cron is the
       fallback and it needs no help from here. */
    const body = await res.text().catch(() => "");
    logger.error("handbook-pdf: GitHub refused the dispatch", {
      status: res.status,
      body: body.slice(0, 500),
    });
  } catch (err) {
    logger.error("handbook-pdf: could not reach GitHub", {
      message: (err && err.message) || String(err),
    });
  }
});
