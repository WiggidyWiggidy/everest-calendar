#!/usr/bin/env python3
"""
Sync filesystem agent memory <-> Supabase agent_memory table.

Source: /Users/happy/.claude/projects/-Users-happy-Desktop-Claude-Project/memory/*.md
Target: Supabase public.agent_memory (schema in migration agent_memory_shared_kb_2026_05_18).

What it does on every run:
  1. Scans every *.md file in the memory dir.
  2. Parses YAML frontmatter (name / description / type).
  3. Upserts each as a row in Supabase agent_memory (idempotent on slug).
  4. Reconciles MEMORY.md — if any file exists on disk but isn't referenced from MEMORY.md,
     appends a pointer line under "## Recent additions (auto-merged by sync)" so Claude
     auto-loads it on next session. Tom can then re-file into the proper section.

Self-sufficient: reads .env.local directly so it can be invoked from launchd or cron
without sourcing the shell environment first.

Run manually:  python3 scripts/sync_agent_memory.py
Run from launchd: see co.everestlabs.sync_agent_memory.plist
Idempotent — safe to run as often as you like.
"""

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

# ---- Paths ----
MEMORY_DIR = Path("/Users/happy/.claude/projects/-Users-happy-Desktop-Claude-Project/memory")
INDEX_FILE = MEMORY_DIR / "MEMORY.md"
ENV_FILE = Path("/Users/happy/Desktop/Claude Project/everest-calendar/.env.local")

# ---- Auto-load .env.local so launchd/cron can invoke us ----
def load_env_file(path: Path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)

load_env_file(ENV_FILE)

SUPABASE_URL = os.environ.get("EVEREST_SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY = os.environ.get("EVEREST_SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SERVICE_KEY:
    print("ERROR: set EVEREST_SUPABASE_URL + EVEREST_SUPABASE_SERVICE_KEY (or NEXT_PUBLIC_/SUPABASE_SERVICE_ROLE_KEY)", file=sys.stderr)
    sys.exit(1)

# ---- Domain tag inference rules — keep in sync with codex AGENTS.md memory-cluster list ----
TAG_RULES = [
    ("marketing", lambda s, n, d: any(k in s or k in n.lower() or k in d.lower() for k in [
        "marketing", "kryo_marketing", "clone_product", "clone_ad", "launch_angle", "launch_kryo",
        "page_build", "winning_ads", "marketing_engine", "marketing_findings",
    ])),
    ("kryo", lambda s, n, d: any(k in s or k in n.lower() or k in d.lower() for k in [
        "kryo", "v4_component", "shower_head", "cold_exposure", "thermostat", "electrical_system",
        "ux_solution", "promo_video",
    ])),
    ("cad", lambda s, n, d: any(k in s or k in n.lower() or k in d.lower() for k in [
        "cad", "shell", "cadquery", "dxf", "step", "component_cad", "orientation_truth",
        "component_placement", "rotation_process",
    ])),
    ("supplier", lambda s, n, d: any(k in s or k in n.lower() or k in d.lower() for k in [
        "supplier", "alpicool", "negotiation", "alibaba", "1688", "chinese_comms", "freelancer",
        "upwork", "mcp_comms_routing",
    ])),
    ("openclaw", lambda s, n, d: any(k in s or k in n.lower() for k in ["openclaw"])),
    ("tom_profile", lambda s, n, d: s.startswith("user_") or "tom_location" in s or "tom_mac" in s),
    ("tools", lambda s, n, d: any(k in s for k in [
        "tools_preferences", "shopify_auth", "credentials", "show_in_browser", "http_server",
        "image_gen", "clarity_api", "alibaba_chrome", "1688_search", "system_engineering",
    ])),
    ("workflow", lambda s, n, d: any(k in s for k in [
        "workflow_patterns", "be_proactive", "15min_checkpoint", "business_impact",
        "test_velocity", "deliverables_to_desktop", "no_em_dash", "verify_before_claiming",
        "resolution_protocol", "qc_before_shipping",
    ])),
    ("storefront", lambda s, n, d: any(k in s for k in [
        "storefront_bug", "storefront_error", "clarity_api", "shopify",
    ])),
]


FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)", re.DOTALL)


def parse_frontmatter(text: str):
    """Return (frontmatter_dict, body) or (None, text) if no frontmatter."""
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None, text
    fm_raw, body = m.group(1), m.group(2)
    fm = {}
    for line in fm_raw.split("\n"):
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm, body.lstrip()


def infer_tags(slug: str, name: str, description: str) -> list:
    tags = []
    for tag, rule in TAG_RULES:
        try:
            if rule(slug, name, description):
                tags.append(tag)
        except Exception:
            pass
    return sorted(set(tags))


def supabase_upsert(rows: list):
    """POST rows to /rest/v1/agent_memory with on-conflict on slug."""
    url = f"{SUPABASE_URL}/rest/v1/agent_memory?on_conflict=slug"
    data = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.status, resp.read().decode("utf-8")


# ---- MEMORY.md reconciliation ----
AUTO_SECTION_HEADER = "## Recent additions (auto-merged by sync — please re-file when convenient)"
POINTER_RE = re.compile(r"\[[^\]]+\]\(([^)]+\.md)\)")


def parse_referenced_files(memory_md: str) -> set:
    """Return the set of filenames referenced as markdown links in MEMORY.md."""
    refs = set()
    for m in POINTER_RE.finditer(memory_md):
        href = m.group(1)
        # Strip leading "./" and any anchor
        href = href.lstrip("./").split("#")[0]
        refs.add(href)
    return refs


def reconcile_memory_index(rows: list) -> dict:
    """Append pointers for any .md files that exist but aren't referenced in MEMORY.md.
    Returns {added: [...], total_orphans: N}."""
    if not INDEX_FILE.exists():
        return {"added": [], "total_orphans": 0, "note": "MEMORY.md not found, skipping reconcile"}

    memory_md = INDEX_FILE.read_text(encoding="utf-8")
    referenced = parse_referenced_files(memory_md)

    # Build set of all .md filenames in the dir (excluding MEMORY.md itself)
    on_disk = {f.name for f in MEMORY_DIR.glob("*.md") if f.name != "MEMORY.md"}

    orphans = on_disk - referenced
    if not orphans:
        return {"added": [], "total_orphans": 0}

    # Build pointer lines, preferring name/description from the parsed rows
    rows_by_filename = {Path(r["file_path"]).name: r for r in rows}
    new_lines = []
    for fname in sorted(orphans):
        row = rows_by_filename.get(fname)
        if row:
            display_name = row["name"]
            hook = row["description"] or ""
        else:
            display_name = fname[:-3].replace("_", " ").title()
            hook = "(no description in frontmatter)"
        hook = hook[:140]  # keep one-liner discipline
        new_lines.append(f"- [{display_name}]({fname}) — {hook}")

    # Build the auto-merged section. If header already exists, append below; else add at end.
    if AUTO_SECTION_HEADER in memory_md:
        # Append new lines after the header, before the next H2 (or EOF)
        parts = memory_md.split(AUTO_SECTION_HEADER, 1)
        before = parts[0]
        after_section = parts[1]
        # Find existing lines in this section + the next H2 boundary
        next_h2 = re.search(r"\n## ", after_section)
        if next_h2:
            section_body = after_section[:next_h2.start()]
            section_tail = after_section[next_h2.start():]
        else:
            section_body = after_section
            section_tail = ""
        # De-dupe: only add lines whose pointer isn't already present in section_body
        existing_pointers = parse_referenced_files(section_body)
        truly_new = [l for l in new_lines if POINTER_RE.search(l).group(1) not in existing_pointers]
        if not truly_new:
            return {"added": [], "total_orphans": len(orphans), "note": "all orphans already in auto-merged section"}
        updated_section_body = section_body.rstrip() + "\n" + "\n".join(truly_new) + "\n"
        memory_md_new = before + AUTO_SECTION_HEADER + updated_section_body + section_tail
        added_count = len(truly_new)
    else:
        # New section appended at end
        addendum = f"\n\n{AUTO_SECTION_HEADER}\n" + "\n".join(new_lines) + "\n"
        memory_md_new = memory_md.rstrip() + addendum
        added_count = len(new_lines)

    INDEX_FILE.write_text(memory_md_new, encoding="utf-8")
    return {"added": new_lines[:added_count], "total_orphans": len(orphans)}


def main():
    if not MEMORY_DIR.exists():
        print(f"ERROR: memory dir not found: {MEMORY_DIR}", file=sys.stderr)
        sys.exit(1)

    files = sorted(MEMORY_DIR.glob("*.md"))
    if not files:
        print("No memory files found.", file=sys.stderr)
        sys.exit(1)

    rows = []
    skipped = []
    for fp in files:
        slug = fp.stem
        if slug == "MEMORY":
            continue
        text = fp.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(text)
        if not fm:
            skipped.append((slug, "no frontmatter"))
            continue
        type_ = fm.get("type", "project").strip().lower()
        if type_ not in {"user", "feedback", "project", "reference"}:
            type_ = "project"
        name = fm.get("name") or slug.replace("_", " ").title()
        description = fm.get("description") or ""
        tags = infer_tags(slug, name, description)
        # Detect which tool wrote the file:
        # 1. explicit frontmatter `created_by_tool` or `written_by_tool` wins
        # 2. body-line "Created by: codex" or similar wins next (codex sometimes writes this in body)
        # 3. default claude (the majority of historical memory)
        tool = (fm.get("created_by_tool") or fm.get("written_by_tool") or "").strip().lower()
        if tool not in {"claude", "codex", "other"}:
            if "created by: codex" in body.lower() or "(codex)" in body.lower()[:200]:
                tool = "codex"
            else:
                tool = "claude"
        rows.append({
            "slug": slug,
            "type": type_,
            "name": name,
            "description": description,
            "content": body,
            "written_by_tool": tool,
            "domain_tags": tags,
            "file_path": str(fp),
        })

    # Batch upsert in chunks of 25 (PostgREST friendly).
    inserted = 0
    for i in range(0, len(rows), 25):
        chunk = rows[i:i + 25]
        try:
            status, body = supabase_upsert(chunk)
            if status not in (200, 201):
                print(f"chunk {i}: HTTP {status} — {body[:200]}", file=sys.stderr)
            else:
                inserted += len(chunk)
        except Exception as e:
            print(f"chunk {i} failed: {e}", file=sys.stderr)

    # Reconcile MEMORY.md
    reconcile = reconcile_memory_index(rows)

    print(f"Synced {inserted}/{len(rows)} memory entries to agent_memory.")
    if skipped:
        print(f"Skipped {len(skipped)} files lacking frontmatter:")
        for s in skipped[:5]:
            print(f"  - {s[0]} ({s[1]})")
        if len(skipped) > 5:
            print(f"  ... and {len(skipped) - 5} more")
    if reconcile.get("added"):
        print(f"MEMORY.md: appended {len(reconcile['added'])} new pointer(s) under '{AUTO_SECTION_HEADER}'")
        for line in reconcile["added"]:
            print(f"  + {line}")
    elif reconcile.get("total_orphans"):
        print(f"MEMORY.md: {reconcile['total_orphans']} orphans already listed in auto-merged section")
    else:
        print("MEMORY.md: in sync with filesystem (no orphans)")


if __name__ == "__main__":
    main()
