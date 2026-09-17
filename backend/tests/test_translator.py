"""
Tests for the Bhashini translation path.

These never touch the network. The live contract was verified once by hand:
the inference API key authenticates as a bare ``Authorization`` header, the
endpoint accepts a batch and returns translations in input order.
"""

import json

import pytest

from app.core import translator


@pytest.fixture(autouse=True)
def _clear_service_cache():
    """The service-id lookup is lru_cached; stop it leaking between tests."""
    translator._bhashini_service_id.cache_clear()
    yield
    translator._bhashini_service_id.cache_clear()


class _Response:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def _config_response(service_id="ai4bharat/indictrans-v2-all-gpu--t4"):
    return _Response({"pipelineResponseConfig": [{"config": [{"serviceId": service_id}]}]})


def _translation_response(targets):
    return _Response({"pipelineResponse": [{"output": [{"target": t} for t in targets]}]})


def _stub_post(monkeypatch, responses):
    """Replace httpx.post, recording every call."""
    calls = []
    remaining = list(responses)

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.append({"url": url, "json": json, "headers": headers})
        return remaining.pop(0)

    monkeypatch.setattr(translator.httpx, "post", fake_post)
    return calls


def test_whole_batch_goes_in_one_request(monkeypatch):
    """A report costs one round trip, not one per field."""
    monkeypatch.setenv("BHASHINI_API_KEY", "test-key")
    calls = _stub_post(monkeypatch, [
        _config_response(),
        _translation_response(["एक", "दो", "तीन"]),
    ])

    out = translator._translate_via_bhashini(["one", "two", "three"], "hi")

    assert out == ["एक", "दो", "तीन"]
    inference = calls[-1]
    assert len(inference["json"]["inputData"]["input"]) == 3
    assert inference["url"] == translator.BHASHINI_API_URL


def test_authenticates_with_the_bare_api_key(monkeypatch):
    """No ULCA handshake and no user ID — that is a different credential scheme."""
    monkeypatch.setenv("BHASHINI_API_KEY", "test-key")
    calls = _stub_post(monkeypatch, [_config_response(), _translation_response(["एक"])])

    translator._translate_via_bhashini(["one"], "hi")

    for call in calls:
        assert call["headers"]["Authorization"] == "test-key"
        assert "ulcaApiKey" not in call["headers"]
        assert "userID" not in call["headers"]


def test_service_id_is_looked_up_then_cached(monkeypatch):
    """A model rotation must not need a code change, but must not cost a call each time."""
    monkeypatch.setenv("BHASHINI_API_KEY", "test-key")
    calls = _stub_post(monkeypatch, [
        _config_response("ai4bharat/new-model"),
        _translation_response(["एक"]),
        _translation_response(["दो"]),
    ])

    translator._translate_via_bhashini(["one"], "hi")
    translator._translate_via_bhashini(["two"], "hi")

    config_calls = [c for c in calls if c["url"] == translator.BHASHINI_CONFIG_URL]
    assert len(config_calls) == 1, "service id should be fetched once and cached"
    assert calls[1]["json"]["pipelineTasks"][0]["config"]["serviceId"] == "ai4bharat/new-model"


def test_short_response_raises_rather_than_misaligning_fields(monkeypatch):
    """
    Translations are matched back to fields by position, so a short response
    would shift every translation onto the wrong field.
    """
    monkeypatch.setenv("BHASHINI_API_KEY", "test-key")
    _stub_post(monkeypatch, [_config_response(), _translation_response(["एक"])])

    with pytest.raises(ValueError, match="1 translations for 3 inputs"):
        translator._translate_via_bhashini(["one", "two", "three"], "hi")


def test_empty_target_keeps_the_english(monkeypatch):
    """A blank translation would erase the field; English is the safer answer."""
    monkeypatch.setenv("BHASHINI_API_KEY", "test-key")
    _stub_post(monkeypatch, [_config_response(), _translation_response(["एक", ""])])

    assert translator._translate_via_bhashini(["one", "two"], "hi") == ["एक", "two"]


def test_missing_key_raises_so_the_caller_can_fall_back(monkeypatch):
    monkeypatch.delenv("BHASHINI_API_KEY", raising=False)
    with pytest.raises(EnvironmentError):
        translator._translate_via_bhashini(["one"], "hi")

    monkeypatch.setenv("BHASHINI_API_KEY", "your_bhashini_api_key_here")
    with pytest.raises(EnvironmentError):
        translator._translate_via_bhashini(["one"], "hi")


def test_report_translation_maps_every_field_back_into_place(monkeypatch):
    monkeypatch.setenv("BHASHINI_API_KEY", "test-key")
    report = {
        "analysis": "A",
        "feasibility_score": 62,
        "market_reach": "B",
        "opportunity_analysis": "C",
        "competitor_mapping": "D",
        "pricing_strategy": "E",
        "hyper_local_threats": ["F"],
        "swot": {"strengths": ["G"], "weaknesses": ["H"], "opportunities": ["I"], "threats": ["J"]},
    }

    def fake_translate(texts, lang):
        return [f"{t}-{lang}" for t in texts]

    monkeypatch.setattr(translator, "_translate_via_bhashini", fake_translate)
    out = translator.translate_report(report, "hi")

    assert out["market_reach"] == "B-hi"
    assert out["hyper_local_threats"] == ["F-hi"]
    assert out["swot"]["threats"] == ["J-hi"]
    # Numbers are not text and must pass through untouched.
    assert out["feasibility_score"] == 62
    # The caller's dict must not be mutated.
    assert report["market_reach"] == "B"


def test_english_is_returned_unchanged_without_any_call(monkeypatch):
    def explode(*args, **kwargs):
        raise AssertionError("no translation call should be made for English")

    monkeypatch.setattr(translator, "_translate_via_bhashini", explode)
    report = {"market_reach": "B"}
    assert translator.translate_report(report, "en") is report


def test_bhashini_failure_falls_through_to_mymemory(monkeypatch):
    def bhashini_down(texts, lang):
        raise RuntimeError("bhashini unavailable")

    monkeypatch.setattr(translator, "_translate_via_bhashini", bhashini_down)
    monkeypatch.setattr(translator, "_translate_via_mymemory", lambda texts, lang: ["fallback"])

    out = translator.translate_report({"market_reach": "B"}, "hi")
    assert out["market_reach"] == "fallback"


def test_both_providers_down_returns_english_rather_than_crashing(monkeypatch):
    def down(texts, lang):
        raise RuntimeError("unavailable")

    monkeypatch.setattr(translator, "_translate_via_bhashini", down)
    monkeypatch.setattr(translator, "_translate_via_mymemory", down)

    report = {"market_reach": "B"}
    assert translator.translate_report(report, "hi")["market_reach"] == "B"
