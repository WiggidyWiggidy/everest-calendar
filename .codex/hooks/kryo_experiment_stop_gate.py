#!/usr/bin/env python3
import json
import re
import subprocess
import sys
from pathlib import Path


def emit(obj):
    sys.stdout.write(json.dumps(obj))


def repo_root() -> Path:
    try:
        out = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
        return Path(out)
    except Exception:
        return Path.cwd()


def pass_through():
    emit({"continue": True})
    raise SystemExit(0)


def block(reason: str):
    emit({"decision": "block", "reason": reason})
    raise SystemExit(0)


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        pass_through()

    if payload.get("stop_hook_active"):
        pass_through()

    msg = payload.get("last_assistant_message") or ""
    match = re.search(
        r"\[KRYO-EXP:([A-Za-z0-9._-]+)\]\s+(BUILD_COMPLETE|QA_COMPLETE|READY_FOR_OWNER)",
        msg,
    )
    if not match:
        pass_through()

    experiment_id, stage = match.groups()
    root = repo_root()
    artifact_dir = root / "artifacts" / "experiments" / experiment_id
    exp_file = root / "marketing" / "experiments" / "active" / f"{experiment_id}.md"

    missing = []

    if not exp_file.exists():
        missing.append(str(exp_file.relative_to(root)))

    required = [artifact_dir / "treatment-spec.md", artifact_dir / "stats-plan.json"]
    if stage in {"BUILD_COMPLETE", "QA_COMPLETE", "READY_FOR_OWNER"}:
        required.append(artifact_dir / "build-manifest.json")
    if stage in {"QA_COMPLETE", "READY_FOR_OWNER"}:
        required.append(artifact_dir / "qa-report.json")

    for path in required:
        if not path.exists():
            missing.append(str(path.relative_to(root)))

    if missing:
        block(
            f"Do not claim {stage} for {experiment_id}. Missing required evidence: "
            + ", ".join(missing)
            + ". Create/repair the artifacts, then rerun the completion check."
        )

    if stage in {"QA_COMPLETE", "READY_FOR_OWNER"}:
        qa_path = artifact_dir / "qa-report.json"
        try:
            qa = json.loads(qa_path.read_text())
        except Exception as exc:
            block(f"qa-report.json is not valid JSON for {experiment_id}: {exc}")
        verdict = str(qa.get("verdict") or qa.get("status") or "").upper()
        if verdict != "PASS":
            block(
                f"Do not claim {stage} for {experiment_id}. Independent QA verdict is {verdict or 'MISSING'}, not PASS. "
                "Return blocking findings to the original builder, then have the independent reviewer retest."
            )

    if stage == "READY_FOR_OWNER":
        stats_test = root / "scripts" / "kryo-experiment-stats.test.mjs"
        if stats_test.exists():
            proc = subprocess.run(
                ["node", str(stats_test)],
                cwd=root,
                text=True,
                capture_output=True,
            )
            if proc.returncode != 0:
                block(
                    "Do not claim READY_FOR_OWNER. Deterministic experiment stats tests failed: "
                    + (proc.stderr or proc.stdout or "unknown error")[-1500:]
                )

    pass_through()


if __name__ == "__main__":
    main()
