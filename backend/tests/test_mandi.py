"""Tests for the AGMARKNET mandi feed normalisation."""

import pytest

from app.core import mandi


def _record(commodity, market, modal, low, high, date):
    return {
        "commodity": commodity,
        "market": market,
        "district": "Akola",
        "variety": "Standard",
        "min_price": low,
        "max_price": high,
        "modal_price": modal,
        "arrival_date": date,
    }


def test_trend_is_day_on_day_not_invented(monkeypatch):
    """Two arrivals for the same market must diff into a real trend."""
    records = [
        _record("Wheat", "Akola", 2450, 2310, 2580, "16/09/2026"),
        _record("Wheat", "Akola", 2400, 2300, 2500, "15/09/2026"),
    ]
    monkeypatch.setenv("DATA_GOV_API_KEY", "test-key")
    monkeypatch.setattr(mandi, "_fetch_records", lambda state, limit: records)

    cards = mandi.fetch_live_prices("Maharashtra")
    assert len(cards) == 1
    card = cards[0]
    assert card["price"] == 2450
    assert card["trend"] == "up"
    assert card["trendAmount"] == 50
    assert card["trendPercent"] == pytest.approx(2.1, abs=0.05)
    assert card["trendBasis"] == "day-on-day modal price"


def test_single_arrival_reports_flat_rather_than_guessing(monkeypatch):
    monkeypatch.setenv("DATA_GOV_API_KEY", "test-key")
    monkeypatch.setattr(
        mandi, "_fetch_records",
        lambda state, limit: [_record("Cotton", "Rajkot", 6800, 6400, 7150, "16/09/2026")],
    )

    card = mandi.fetch_live_prices("Gujarat")[0]
    assert card["trend"] == "flat"
    assert card["trendAmount"] == 0
    assert card["trendBasis"] == "no prior arrival in feed"


def test_bar_position_tracks_modal_inside_the_days_band(monkeypatch):
    """The bar marker is real data: where modal sits between min and max."""
    monkeypatch.setenv("DATA_GOV_API_KEY", "test-key")
    monkeypatch.setattr(
        mandi, "_fetch_records",
        lambda state, limit: [_record("Onion", "Lasalgaon", 2000, 1000, 3000, "16/09/2026")],
    )

    assert mandi.fetch_live_prices("Maharashtra")[0]["barHeight"] == "50%"


def test_missing_api_key_raises_so_caller_can_label_the_fallback(monkeypatch):
    monkeypatch.delenv("DATA_GOV_API_KEY", raising=False)
    with pytest.raises(EnvironmentError):
        mandi.fetch_live_prices("Maharashtra")


def test_sample_prices_invent_no_trend():
    """The offline fallback must not fabricate movement."""
    cards = mandi.sample_prices()
    assert cards, "sample feed should not be empty"
    assert all(c["trend"] == "flat" and c["trendAmount"] == 0 for c in cards)
    assert all(c["trendBasis"] == "sample data — no live arrival" for c in cards)


def test_market_prices_endpoint_labels_unkeyed_feed_as_not_live(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.delenv("DATA_GOV_API_KEY", raising=False)
    body = TestClient(app).get("/api/market-prices").json()

    assert body["is_live"] is False
    assert "DATA_GOV_API_KEY" in body["source"]
    assert len(body["crops"]) > 0
