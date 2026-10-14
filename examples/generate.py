"""Python 3 standard-library API example. Running this spends generation credits."""
import json
import os
import time
import uuid
from pathlib import Path
from urllib.request import Request, urlopen

ORIGIN = "https://prompt2cad.com"
RUN = os.environ.get("RUN_ID", str(uuid.uuid4()))
MODEL = os.environ.get("PROMPT2CAD_MODEL", "default")
HEADERS = {"Authorization": "Bearer " + os.environ["PROMPT2CAD_API_KEY"]}


def api(path, body=None, operation=None):
    headers = dict(HEADERS, **{"Content-Type": "application/json"})
    if operation:
        headers["Idempotency-Key"] = RUN + ":" + operation
    data = None if body is None else json.dumps(body).encode()
    with urlopen(Request(ORIGIN + "/api/v1" + path, data=data, headers=headers), timeout=60) as response:
        return json.load(response)


def poll(path):
    for _ in range(420):
        result = api(path)
        if result["status"] == "completed":
            return result
        if result["status"] not in ("accepted", "running"):
            raise RuntimeError(result)
        time.sleep(5)
    raise TimeoutError("Polling timed out; retain the operation ID and reconnect")


if __name__ == "__main__":
    project = api("/projects", {"name": "Bracket"}, "project")
    base = "/projects/" + project["id"]
    started = api(base + "/generations", {
        "prompt": "Create an L bracket, 100 mm wide, with 6 mm walls, 60 mm legs and two 8 mm mounting holes.",
        "model": MODEL,
    }, "generate")
    print({"run": RUN, "projectId": project["id"], "generationId": started["id"]}, flush=True)
    poll(base + "/generations/" + started["id"])
    exported = api(base + "/exports", {"generationId": started["id"], "formats": ["step", "png"]}, "export")
    result = poll(base + "/exports/" + exported["id"])
    for artifact in result["artifacts"]:
        if artifact["status"] != "completed":
            print(artifact)
            continue
        with urlopen(Request(ORIGIN + artifact["downloadUrl"], headers=HEADERS), timeout=60) as response:
            Path(artifact["filename"]).write_bytes(response.read())
