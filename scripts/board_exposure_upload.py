"""
Put a measured match into NL Tools, from the machine that measured it.

Before this, the scan finished and somebody opened nl.tools and uploaded three
files by hand. The script already knew it had finished; the second visit existed
only because it had no way to prove who it was.

How it gets in
--------------
There is no HTTP endpoint to POST to. The project carries a Google Cloud org
policy blocking `allUsers` on new Cloud Run services, so a new callable cannot
be given a public invoker — the wall four other functions in this estate hit
first. What IS reachable without a Google account is Identity Toolkit, so:

  1. sign in anonymously                        -> a uid and a token
  2. write { key, matchId } to ingestRequests/<uid>
  3. brandExposureIngest validates the key and writes back a custom token
     carrying `be: <matchId>`
  4. delete the grant WHILE STILL HOLDING THE ANONYMOUS UID — step 5 changes
     identity and the rules will not let the new one tidy up after the old one
  5. sign in with the custom token
  6. upload the proxy and the detections, write the match record

The token names one match. Storage and RTDB rules compare `be` against the path
being written, so this key — sitting in a plain file on a laptop — can overwrite
the match it was minted for and nothing else.

Everything here is the Firebase REST API and nothing else: no firebase-admin, no
service-account JSON on the machine, no dependency beyond what the scan already
needs. `requests` is not assumed either — urllib does all of it.
"""

import json
import mimetypes
import os
import time
import urllib.error
import urllib.parse
import urllib.request

# Public web config, the same values the tool page ships. A Firebase web API key
# is an identifier, not a secret — it names the project, and every rule in this
# system gates on the token, never on knowing this string.
API_KEY  = "AIzaSyC3az3OMnU7TdqlaWp8yrO_EjgZ36l-mXU"
PROJECT  = "nl-tools"
RTDB     = "https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app"
BUCKET   = "nl-tools.firebasestorage.app"
ROOT     = "app-data/ops-brand-exposure"

IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts"
UPLOAD   = "https://firebasestorage.googleapis.com/v0/b/{}/o".format(BUCKET)

GRANT_TIMEOUT = 45.0        # the trigger is Eventarc, so seconds not milliseconds
GRANT_POLL    = 1.0
KEY_FILENAME  = "ingest-key.txt"


class UploadError(Exception):
    """Anything that stops the upload, with a sentence a human can act on."""


# ---------------------------------------------------------------- plumbing --

def _post(url, payload, token=None, timeout=30):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        raise UploadError(_explain(e)) from None
    except urllib.error.URLError as e:
        raise UploadError(f"Could not reach {urllib.parse.urlparse(url).netloc}: {e.reason}") from None


def _rtdb(path, method="GET", payload=None, token=None, timeout=30):
    url = f"{RTDB}/{path}.json"
    if token:
        url += "?auth=" + urllib.parse.quote(token)
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8")
            return json.loads(raw) if raw and raw != "null" else None
    except urllib.error.HTTPError as e:
        raise UploadError(_explain(e)) from None
    except urllib.error.URLError as e:
        raise UploadError(f"Could not reach the database: {e.reason}") from None


def _explain(e):
    """Turn a Firebase error body into something worth reading.

    The raw ones are unhelpful at exactly the moment you need help —
    PERMISSION_DENIED with no hint of which rule, or a bare 400 for an expired
    token. These are the three that actually happen.
    """
    try:
        body = json.loads(e.read().decode("utf-8") or "{}")
    except Exception:
        body = {}
    msg = ((body.get("error") or {}).get("message")
           if isinstance(body.get("error"), dict) else body.get("error")) or ""

    # RTDB says PERMISSION_DENIED and answers 401; Storage says "Permission
    # denied." and answers 403. Matching only the first pair meant a refused
    # UPLOAD printed a bare "403 Forbidden" with no hint of what to do, which is
    # the exact moment the message has to earn its place.
    denied = str(msg).lower()
    if e.code in (401, 403) or "permission_denied" in denied or "permission denied" in denied:
        return ("Refused. Usually the ingest key was revoked, or the rules have "
                "not been deployed yet — Actions -> Deploy RTDB rules and "
                "Deploy Storage rules, typing 'publish' in each.")
    if "TOKEN_EXPIRED" in str(msg) or "INVALID_ID_TOKEN" in str(msg):
        return ("The upload token expired mid-flight. Re-run with --upload; "
                "nothing was half-written that a re-run will not replace.")
    return f"{e.code} {e.reason}: {msg or '(no detail)'}"


# ------------------------------------------------------------------- steps --

def sign_in_anonymously():
    """A throwaway identity, purely to have a uid to hang a request node on.

    signUp DOES answer with localId, unlike signInWithCustomToken below — the
    two endpoints differ, which is exactly what went wrong the first time.
    """
    r = _post(f"{IDENTITY}:signUp?key={API_KEY}", {"returnSecureToken": True})
    missing = [k for k in ("localId", "idToken") if k not in r]
    if missing:
        raise UploadError(
            f"Anonymous sign-in returned no {' or '.join(missing)}. Response "
            f"carried: {', '.join(sorted(r)) or '(nothing)'}. Anonymous sign-in "
            f"may be switched off for this Firebase project.")
    return r["localId"], r["idToken"]


def sign_in_with_custom_token(custom_token):
    """Redeem the grant's custom token for an ID token.

    Returns the token ALONE. signInWithCustomToken answers with idToken,
    refreshToken, expiresIn and isNewUser — and no localId, unlike signUp. Asking
    for one here raised KeyError: 'localId' on the first real cloud run, after
    the unit test had passed against a stub that returned localId because I
    believed it did. A stub written from the same misunderstanding as the code
    tests nothing; tests/ now asserts the documented shape instead.

    The uid is not needed anyway — the caller has already deleted the grant by
    this point, which was the only thing it would have been used for.
    """
    r = _post(f"{IDENTITY}:signInWithCustomToken?key={API_KEY}",
              {"token": custom_token, "returnSecureToken": True})
    if "idToken" not in r:
        raise UploadError(
            "Signing in with the ingest token returned no idToken. Response "
            f"carried: {', '.join(sorted(r)) or '(nothing)'}")
    return r["idToken"]


def request_grant(uid, token, key, match_id, on_wait=None):
    """Ask for a token, wait for the trigger, hand back the grant.

    The request node carries the key in plain text; the function deletes it as
    its first act, whatever happens next.
    """
    _rtdb(f"{ROOT}/ingestGrants/{uid}", "DELETE", token=token)   # any stale reply
    _rtdb(f"{ROOT}/ingestRequests/{uid}", "PUT",
          {"key": key, "matchId": match_id}, token=token)

    deadline = time.time() + GRANT_TIMEOUT
    waited = 0.0
    while time.time() < deadline:
        grant = _rtdb(f"{ROOT}/ingestGrants/{uid}", token=token)
        if grant:
            # Delete it here, while this uid still owns the node. After the
            # custom token is redeemed the identity changes and the rules stop
            # allowing it — the grant would sit there holding a usable token.
            _rtdb(f"{ROOT}/ingestGrants/{uid}", "DELETE", token=token)
            if not grant.get("ok"):
                raise UploadError(grant.get("error") or "The ingest key was refused.")
            return grant
        time.sleep(GRANT_POLL)
        waited += GRANT_POLL
        if on_wait and waited % 5 < GRANT_POLL:
            on_wait(waited)

    raise UploadError(
        "No answer from the ingest function after "
        f"{int(GRANT_TIMEOUT)}s. It may not be deployed yet — a merge to main "
        "ships it automatically, so check the Actions tab.")


def put_file(path, dest, token, on_progress=None):
    """Upload one file to brand-exposure/<matchId>/<name>.

    Deliberately a single PUT rather than a resumable session: the proxy is
    ~150 MB, which one request handles comfortably, and a resumable upload adds
    a state machine whose only payoff is resuming a transfer that takes under a
    minute on this connection.
    """
    ctype = (mimetypes.guess_type(dest)[0]
             or ("video/mp4" if dest.endswith(".mp4") else "application/json"))
    size = os.path.getsize(path)
    url = f"{UPLOAD}?uploadType=media&name={urllib.parse.quote(dest, safe='')}"

    with open(path, "rb") as fh:
        blob = fh.read()
    req = urllib.request.Request(url, data=blob, method="POST")
    req.add_header("Content-Type", ctype)
    req.add_header("Authorization", "Bearer " + token)
    try:
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=900) as r:
            r.read()
        if on_progress:
            on_progress(dest, size, time.time() - t0)
    except urllib.error.HTTPError as e:
        raise UploadError(f"{os.path.basename(path)} was refused: {_explain(e)}") from None
    except urllib.error.URLError as e:
        raise UploadError(f"{os.path.basename(path)} did not upload: {e.reason}") from None


# ------------------------------------------------------------ the record ----

def slugify(s):
    """Must agree character for character with slug() in brand-exposure/index.html.

    The tool builds a match id the same way when somebody uploads by hand. If
    these two disagree, the same fixture lands under two ids and the Grounds tab
    counts one match as two.
    """
    out, prev_dash = [], False
    for ch in str(s or "").lower():
        if ch.isascii() and ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-")


def match_id_for(date, club, opponent):
    return "-".join([date, slugify(club), "v", slugify(opponent)])


def profile_of(settings):
    """Mirror of profileOf() in the tool. Two matches only compare if this string
    matches, so it is built from the same six fields in the same order."""
    if not settings:
        return "unknown"
    w = settings.get("clarity_weights") or {}
    parts = [settings.get("engine_version"), settings.get("sample_fps"),
             w.get("size"), w.get("focus"), w.get("contrast"), w.get("angle")]
    return "/".join("" if p is None else str(p) for p in parts)


def build_record(data, club, opponent, date, source_type, complete,
                 has_proxy, has_detections):
    """The same shape saveMatch() writes in the tool — one record, two writers.

    Kept deliberately close to that function: a field added there and not here
    shows up as a match that renders with gaps, and a field named differently
    shows up as a match that renders with nothing.
    """
    sponsors = {}
    scope = data.get("scope") or {}
    for name, s in (data.get("sponsors") or {}).items():
        s = s or {}
        sponsors[slugify(name)] = {
            "name": name,
            "scope": scope.get(name) or "partner",
            "seconds": s.get("seconds") or 0,
            "pct": s.get("pct") or 0,
            "index": s.get("index") or 0,
            "clarity": s.get("clarity") or 0,
            "area": s.get("area") or 0,
            "logoArea": s.get("logo_area") or 0,
            "runs": s.get("runs") or 0,
            "most": s.get("most") or 0,
            "detections": s.get("detections") or 0,
            "longest": s.get("longest") or 0,
            # Nullable on purpose, and RTDB drops null keys, so a match
            # measured before visibility existed simply lacks them — the tool
            # renders absent as "—", never as 0% blocked.
            "visibility": s.get("visibility"),
            "blockedPct": s.get("blockedPct"),
        }

    return {
        "meta": {
            "fixture": data.get("match"),
            "club": club,
            "opponent": opponent,
            "date": date,
            "duration": data.get("duration"),
            "interval": data.get("interval"),
            "samples": data.get("samples"),
            "videoW": data.get("video_w"),
            "videoH": data.get("video_h"),
            "sourceType": source_type,
            "referenceSetComplete": bool(complete),
            "profile": profile_of(data.get("settings")),
            "engineVersion": (data.get("settings") or {}).get("engine_version", "unknown"),
            "references": len(data.get("references") or []),
            "hasProxy": bool(has_proxy),
            "hasDetections": bool(has_detections),
            # The tool writes 'local' for a hand upload from a laptop too; this
            # says how it ARRIVED, which is the question worth answering when a
            # number looks wrong and you need to know what produced it.
            "runner": "local-script",
            "uploadedAt": {".sv": "timestamp"},
        },
        "sponsors": sponsors,
    }


# ----------------------------------------------------------------- the key --

def write_record(match_id, record, token):
    """PUT the match record, last.

    Deliberately after the files: the record is what makes a match visible in
    the tool, so writing it first would put a match on screen whose video and
    detections had not arrived — and hasProxy/hasDetections would be lying for
    however long the upload took, or forever if it failed.
    """
    _rtdb(f"{ROOT}/matches/{match_id}", "PUT", record, token=token)


def key_path(refs_dir):
    return os.path.join(refs_dir, KEY_FILENAME)


def read_key(refs_dir):
    """The key lives beside the references, in a file git ignores.

    Not an environment variable and not a command-line flag: an env var is
    invisible when it is wrong and a flag ends up in shell history and in the
    screenshots people send when asking why something failed.
    """
    p = key_path(refs_dir)
    if not os.path.exists(p):
        raise UploadError(
            f"No ingest key. Put one in {p} — a superadmin generates it in the "
            f"tool under Ingest keys, and it is shown once.")
    key = ""
    for line in open(p, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#"):
            key = line
            break
    if not key:
        raise UploadError(f"{p} has no key in it, only blank lines or comments.")
    return key
