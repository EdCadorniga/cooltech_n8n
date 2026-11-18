"""Simulated writes only; two independent database sessions and a restart."""
import sqlite3
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "fixture.db"
    first = sqlite3.connect(path, isolation_level=None)
    first.executescript(Path(__file__).with_name("ledger.sql").read_text().split("-- PostgreSQL pilot adapter")[0])
    second = sqlite3.connect(path, isolation_level=None)
    reserve = """INSERT INTO cooltech_quote_step(source_uuid,step,owner)
        VALUES(?,?,?) ON CONFLICT(source_uuid,step) DO NOTHING RETURNING owner"""
    def claim(db, step, owner):
        return db.execute(reserve, ("synthetic", step, owner)).fetchall()
    for step in ("quote", "contact", "note", "sha256:synthetic"):
        assert claim(first, step, "A") == [("A",)]
        assert claim(second, step, "B") == []
    first.close()  # simulated crash after side effect, before acknowledgement
    recovered = sqlite3.connect(path, isolation_level=None)
    assert not claim(recovered, "quote", "C")
    assert recovered.execute("SELECT count(*) FROM cooltech_quote_step WHERE result_uuid IS NULL").fetchone() == (4,)
    recovered.execute("UPDATE cooltech_quote_step SET result_uuid=? WHERE source_uuid=? AND step=? AND owner=?", ("verified-quote", "synthetic", "quote", "A"))
    assert not claim(recovered, "quote", "D")
    assert second.execute("SELECT result_uuid FROM cooltech_quote_step WHERE step='quote'").fetchone() == ("verified-quote",)
    second.close()
    recovered.close()
print("PASS: exclusive per-step claim, competing session, crash/reopen, reconcile without re-create.")
