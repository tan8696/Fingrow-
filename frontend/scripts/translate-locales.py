#!/usr/bin/env python3
"""
Generate UI locale files from src/locales/en.json via Bhashini.

The language picker can only offer a language that has a locale file; without
one i18next silently falls back to English, which looks like the app ignoring
the user's choice. This fills the gap for the languages the report engine
already supports.

Hindi and Marathi are never touched: those were written by hand and are better
than anything generated here.

Usage (from frontend/, with BHASHINI_API_KEY in ../backend/.env):

    python scripts/translate-locales.py              # fill in missing keys only
    python scripts/translate-locales.py --force      # regenerate every file
    python scripts/translate-locales.py --lang ta te # limit to some languages

Re-run after adding keys to en.json. Existing translations are kept, so only
the new keys cost a call.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

import httpx

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ROOT / "src" / "locales"
ENV_FILE = ROOT.parent / "backend" / ".env"

BHASHINI_API_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"
BHASHINI_CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
BHASHINI_PIPELINE_ID = "64392f96daac500b55c543cd"

# Hand-written; regenerating them would be a downgrade.
PROTECTED = {"en", "hi", "mr"}

TARGETS = {
    "ta": "Tamil", "te": "Telugu", "bn": "Bengali", "gu": "Gujarati",
    "kn": "Kannada", "ml": "Malayalam", "pa": "Punjabi", "or": "Odia",
}

# Bhashini handles the whole file in one request, but smaller batches fail more
# cheaply and keep one bad string from costing the entire language.
BATCH_SIZE = 50


def load_api_key() -> str:
    key = os.getenv("BHASHINI_API_KEY", "")
    if not key and ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if line.startswith("BHASHINI_API_KEY="):
                key = line.split("=", 1)[1].strip()
                break
    if not key or key == "your_bhashini_api_key_here":
        sys.exit(f"BHASHINI_API_KEY not set (looked in the environment and {ENV_FILE}).")
    return key


def flatten(obj: Dict[str, Any], prefix: str = "") -> Dict[str, str]:
    out: Dict[str, str] = {}
    for key, value in obj.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            out.update(flatten(value, path))
        else:
            out[path] = value
    return out


def unflatten(flat: Dict[str, str]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for path, value in flat.items():
        node = out
        parts = path.split(".")
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = value
    return out


def service_id(lang: str, api_key: str) -> str:
    resp = httpx.post(
        BHASHINI_CONFIG_URL,
        json={
            "pipelineTasks": [{
                "taskType": "translation",
                "config": {"language": {"sourceLanguage": "en", "targetLanguage": lang}},
            }],
            "pipelineRequestConfig": {"pipelineId": BHASHINI_PIPELINE_ID},
        },
        headers={"Authorization": api_key, "Content-Type": "application/json"},
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["pipelineResponseConfig"][0]["config"][0]["serviceId"]


def translate(texts: List[str], lang: str, api_key: str, svc: str) -> List[str]:
    resp = httpx.post(
        BHASHINI_API_URL,
        json={
            "pipelineTasks": [{
                "taskType": "translation",
                "config": {
                    "language": {"sourceLanguage": "en", "targetLanguage": lang},
                    "serviceId": svc,
                },
            }],
            "inputData": {"input": [{"source": t} for t in texts]},
        },
        headers={"Authorization": api_key, "Content-Type": "application/json"},
        timeout=120.0,
    )
    resp.raise_for_status()
    outputs = resp.json()["pipelineResponse"][0]["output"]
    if len(outputs) != len(texts):
        # Results are matched back by position; a short response would shift
        # every translation onto the wrong key.
        raise ValueError(f"asked for {len(texts)} translations, got {len(outputs)}")
    return [out.get("target") or original for out, original in zip(outputs, texts)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="retranslate keys that already exist")
    parser.add_argument("--lang", nargs="*", default=sorted(TARGETS), help="languages to generate")
    args = parser.parse_args()

    api_key = load_api_key()
    english = flatten(json.loads((LOCALES / "en.json").read_text(encoding="utf-8")))
    print(f"en.json: {len(english)} strings")

    for lang in args.lang:
        if lang in PROTECTED:
            print(f"{lang}: hand-written, skipping")
            continue
        if lang not in TARGETS:
            print(f"{lang}: not a supported target, skipping")
            continue

        path = LOCALES / f"{lang}.json"
        existing: Dict[str, str] = {}
        if path.exists() and not args.force:
            current = json.loads(path.read_text(encoding="utf-8"))
            current.pop("_meta", None)
            existing = flatten(current)

        todo = [k for k in english if args.force or k not in existing]
        if not todo:
            print(f"{lang} ({TARGETS[lang]}): already complete")
            continue

        print(f"{lang} ({TARGETS[lang]}): translating {len(todo)} strings...", end="", flush=True)
        svc = service_id(lang, api_key)
        result = dict(existing)

        for start in range(0, len(todo), BATCH_SIZE):
            chunk = todo[start:start + BATCH_SIZE]
            try:
                for key, value in zip(chunk, translate([english[k] for k in chunk], lang, api_key, svc)):
                    result[key] = value
            except Exception as exc:
                # Keep the English for this chunk rather than losing the language.
                print(f"\n  batch at {start} failed ({exc}); keeping English for those keys")
                for key in chunk:
                    result.setdefault(key, english[key])
            print(".", end="", flush=True)
            time.sleep(0.3)  # be polite to a free government endpoint

        payload = unflatten({k: result[k] for k in english})
        payload = {
            "_meta": {
                "generated_by": "scripts/translate-locales.py via Bhashini IndicTrans v2",
                "source": "en.json",
                "note": "Machine translated — not reviewed by a native speaker.",
            },
            **payload,
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f" wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
