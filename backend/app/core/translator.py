"""
Translation Wrapper — MyMemory (Free) / Bhashini (Pending Approval)
====================================================================
Translates the LLM's English JSON report fields into the user's native language.

Primary: Bhashini (Government of India, IndicTrans v2). Batches the whole
report into one request and needs only BHASHINI_API_KEY.
Fallback: MyMemory (free, no key, one request per string, 500-char truncation).
Final fallback: return the original English — degrade, never crash.

Supported target language codes (ISO 639-1 + BCP-47):
  hi = Hindi, mr = Marathi, ta = Tamil, te = Telugu, bn = Bengali,
  gu = Gujarati, kn = Kannada, ml = Malayalam, pa = Punjabi, or = Odia,
  en = English (no translation needed)
"""

import logging
import os
from functools import lru_cache
from typing import Dict, Any, List

import httpx

logger = logging.getLogger(__name__)

BHASHINI_API_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"
BHASHINI_CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
# Bhashini's standard translation pipeline.
BHASHINI_PIPELINE_ID = "64392f96daac500b55c543cd"
MYMEMORY_API_URL = "https://api.mymemory.translated.net/get"

# Fields in the FeasibilityReport JSON that require translation
TRANSLATABLE_STRING_FIELDS = [
    "analysis",
    "market_reach",
    "opportunity_analysis",
    "competitor_mapping",
    "pricing_strategy",
]
TRANSLATABLE_LIST_FIELDS = [
    "hyper_local_threats",
]
SWOT_KEYS = ["strengths", "weaknesses", "opportunities", "threats"]


# ---------------------------------------------------------------------------
# MyMemory Free Translation (Primary — no API key needed)
# ---------------------------------------------------------------------------

def _translate_via_mymemory(texts: List[str], target_lang: str) -> List[str]:
    """
    Translate a list of English texts to target_lang via MyMemory free API.
    MyMemory supports Indian languages: hi, mr, ta, te, bn, gu, kn, ml, pa, or.
    Rate limit: ~5000 chars/day for anonymous, 50000/day with email.
    """
    results = []
    lang_pair = f"en|{target_lang}"
    
    with httpx.Client(timeout=15.0) as client:
        for text in texts:
            # Truncate very long texts to avoid API limits
            truncated = text[:500] if len(text) > 500 else text
            try:
                resp = client.get(
                    MYMEMORY_API_URL,
                    params={
                        "q": truncated,
                        "langpair": lang_pair,
                    },
                    headers={"User-Agent": "SIH-RuralBizAdvisor/1.0"},
                )
                resp.raise_for_status()
                data = resp.json()
                
                translated_text = data.get("responseData", {}).get("translatedText", "")
                
                # MyMemory returns the original text or an error message if it fails
                if translated_text and translated_text.upper() != "PLEASE SELECT TWO DISTINCT LANGUAGES":
                    results.append(translated_text)
                else:
                    results.append(text)  # Fallback to original
            except Exception as e:
                logger.warning(f"MyMemory translation failed for chunk: {e}")
                results.append(text)  # Fallback to original text
    
    return results


# ---------------------------------------------------------------------------
# Bhashini Translation (Secondary — pending approval)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=32)
def _bhashini_service_id(target_lang: str, api_key: str) -> str:
    """
    The translation model Bhashini currently serves for en -> target_lang.

    Looked up rather than hardcoded so a model rotation on Bhashini's side does
    not silently break translation. Cached because the answer does not change
    within a run (every Indic target currently resolves to the same IndicTrans
    model, so this is normally a single call per process).
    """
    resp = httpx.post(
        BHASHINI_CONFIG_URL,
        json={
            "pipelineTasks": [{
                "taskType": "translation",
                "config": {"language": {"sourceLanguage": "en", "targetLanguage": target_lang}},
            }],
            "pipelineRequestConfig": {"pipelineId": BHASHINI_PIPELINE_ID},
        },
        headers={"Authorization": api_key, "Content-Type": "application/json"},
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["pipelineResponseConfig"][0]["config"][0]["serviceId"]


def _translate_via_bhashini(texts: List[str], target_lang: str) -> List[str]:
    """
    Translate a batch of English strings to target_lang via Bhashini.

    The whole report goes in a single request — Bhashini accepts a list and
    returns the translations in the same order, so a report costs one round
    trip rather than one per field.

    Authentication is the inference API key alone, sent as ``Authorization``.
    There is no ULCA handshake and no user ID: those belong to the older
    getModelsPipeline credential scheme, which this key is not issued under.
    """
    api_key = os.getenv("BHASHINI_API_KEY", "")
    if not api_key or api_key == "your_bhashini_api_key_here":
        raise EnvironmentError("BHASHINI_API_KEY not configured.")

    service_id = _bhashini_service_id(target_lang, api_key)

    resp = httpx.post(
        BHASHINI_API_URL,
        json={
            "pipelineTasks": [{
                "taskType": "translation",
                "config": {
                    "language": {"sourceLanguage": "en", "targetLanguage": target_lang},
                    "serviceId": service_id,
                },
            }],
            "inputData": {"input": [{"source": text} for text in texts]},
        },
        headers={"Authorization": api_key, "Content-Type": "application/json"},
        timeout=60.0,
    )
    resp.raise_for_status()
    outputs = resp.json()["pipelineResponse"][0]["output"]

    if len(outputs) != len(texts):
        # Results are matched back to fields by position, so a short response
        # would silently shift every translation onto the wrong field.
        raise ValueError(
            f"Bhashini returned {len(outputs)} translations for {len(texts)} inputs."
        )

    # An empty target would blank a field; keep the English in that case.
    return [out.get("target") or original for out, original in zip(outputs, texts)]


# ---------------------------------------------------------------------------
# Core Public Function
# ---------------------------------------------------------------------------

def translate_report(report_dict: Dict[str, Any], target_lang: str) -> Dict[str, Any]:
    """
    Translate all human-readable fields of a FeasibilityReport dict into
    the target language.

    Operates on a shallow copy — the original dict is not mutated.
    Falls back to English if all translation APIs are unavailable.

    Args:
        report_dict:  Dict matching the FeasibilityReport JSON schema.
        target_lang:  BCP-47 language code (e.g., "hi", "mr", "ta").

    Returns:
        Translated copy of report_dict. Falls back to English on error.
    """
    if target_lang == "en":
        return report_dict  # Nothing to translate

    # Collect all texts to translate in a single batch (one API call)
    texts_to_translate: list[str] = []
    text_index_map: list[tuple] = []  # (field_type, field_key, optional_index)

    for field in TRANSLATABLE_STRING_FIELDS:
        if field in report_dict and report_dict[field]:
            texts_to_translate.append(report_dict[field])
            text_index_map.append(("str", field))

    for field in TRANSLATABLE_LIST_FIELDS:
        for i, item in enumerate(report_dict.get(field, [])):
            texts_to_translate.append(item)
            text_index_map.append(("list", field, i))

    swot = report_dict.get("swot", {})
    for key in SWOT_KEYS:
        for i, item in enumerate(swot.get(key, [])):
            texts_to_translate.append(item)
            text_index_map.append(("swot", key, i))

    if not texts_to_translate:
        return report_dict

    # Attempt translation — try Bhashini first, then MyMemory, then give up
    translated: list[str] = []
    
    # Try Bhashini first (if configured)
    try:
        translated = _translate_via_bhashini(texts_to_translate, target_lang)
        logger.info(f"Translated {len(translated)} strings via Bhashini → {target_lang}")
    except Exception as bhashini_err:
        logger.warning(f"Bhashini unavailable: {bhashini_err}. Trying MyMemory (free).")
        
        # Try MyMemory (free, no API key)
        try:
            translated = _translate_via_mymemory(texts_to_translate, target_lang)
            logger.info(f"Translated {len(translated)} strings via MyMemory → {target_lang}")
        except Exception as mymemory_err:
            logger.error(f"MyMemory also failed: {mymemory_err}. Returning English.")
            return report_dict  # Graceful degradation

    # Rebuild translated report dict
    import copy
    result = copy.deepcopy(report_dict)

    for i, (entry, translated_text) in enumerate(zip(text_index_map, translated)):
        if entry[0] == "str":
            result[entry[1]] = translated_text
        elif entry[0] == "list":
            result[entry[1]][entry[2]] = translated_text
        elif entry[0] == "swot":
            result["swot"][entry[1]][entry[2]] = translated_text

    return result
