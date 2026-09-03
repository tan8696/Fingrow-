"""
Harvest Store Tests
====================
Exercises the SQLite harvest log store (round-trip, delete, persistence across
fresh connections) and the pure summary aggregation.
"""

from app.core.harvest_store import (
    delete_harvest,
    get_harvest,
    harvest_summary,
    list_harvests,
    save_harvest,
)


def _sample_lot(**overrides):
    lot = {
        "id": "HV-2026-0001",
        "produce": "Soybean",
        "quantity_qtl": 12.5,
        "price_per_qtl": 4800.0,
        "harvest_date": "2026-10-15",
        "notes": "Kharif batch A",
    }
    lot.update(overrides)
    return lot


def test_save_and_fetch(tmp_path):
    db = tmp_path / "harvest.db"
    lot = _sample_lot()
    assert save_harvest(lot["id"], lot, db_path=db) is True
    fetched = get_harvest(lot["id"], db_path=db)
    assert fetched == lot


def test_save_rejects_duplicate_id(tmp_path):
    db = tmp_path / "harvest.db"
    lot = _sample_lot()
    assert save_harvest(lot["id"], lot, db_path=db) is True
    assert save_harvest(lot["id"], dict(lot, quantity_qtl=99.0), db_path=db) is False


def test_delete_harvest(tmp_path):
    db = tmp_path / "harvest.db"
    save_harvest("HV-1", _sample_lot(id="HV-1"), db_path=db)
    assert delete_harvest("HV-1", db_path=db) is True
    assert delete_harvest("HV-1", db_path=db) is False
    assert get_harvest("HV-1", db_path=db) is None


def test_persists_across_fresh_connections(tmp_path):
    db = tmp_path / "harvest.db"
    save_harvest("HV-1", _sample_lot(id="HV-1"), db_path=db)
    save_harvest("HV-2", _sample_lot(id="HV-2", quantity_qtl=5.0, price_per_qtl=1000.0), db_path=db)
    # Fresh list (simulates a restart / new worker) still sees both rows
    lots = list_harvests(db_path=db)
    assert [lot["id"] for lot in lots] == ["HV-2", "HV-1"]
    assert lots[0]["quantity_qtl"] == 5.0


def test_summary_aggregation():
    lots = [
        _sample_lot(),                                                # 12.5 x 4800 = 60,000
        _sample_lot(id="HV-2", produce="Cotton", quantity_qtl=2.0, price_per_qtl=6800.0, harvest_date="2026-11-02"),  # 13,600
        _sample_lot(id="HV-3", produce="Tur", quantity_qtl=1.0, price_per_qtl=10400.0, harvest_date="2026-10-20"),   # 10,400
    ]
    summary = harvest_summary(lots)
    assert summary["lots"] == 3
    assert summary["total_quantity_qtl"] == 15.5
    assert summary["total_revenue"] == 84000.0
    assert round(summary["avg_price_per_qtl"], 2) == round(84000 / 15.5, 2)
    months = summary["by_month"]
    assert months[0]["month"] == "2026-11"   # newest month first
    assert months[0]["revenue"] == 13600.0
    assert months[1]["month"] == "2026-10"
    assert months[1]["revenue"] == 70400.0


def test_summary_empty():
    summary = harvest_summary([])
    assert summary["lots"] == 0
    assert summary["total_revenue"] == 0.0
    assert summary["avg_price_per_qtl"] == 0.0
    assert summary["by_month"] == []
