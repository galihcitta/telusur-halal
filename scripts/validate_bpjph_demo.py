"""Validate demo records against saved BPJPH public HTML and checksums offline."""

import csv
import hashlib
import json
from collections import Counter

from scrape_bpjph_demo import OUT, TableParser


def key(record):
    return (record["product_name"], record["producer_name"], record["certificate_number"])


def main():
    records = json.loads((OUT / "products.json").read_text())
    manifest = json.loads((OUT / "manifest.json").read_text())
    csv_records = list(csv.DictReader((OUT / "products.csv").open(encoding="utf-8")))
    assert len(records) == len(csv_records) == manifest["unique_records"]
    assert len({key(r) for r in records}) == len(records), "Duplicate record keys"
    assert [key(r) for r in records] == [key(r) for r in csv_records]
    for original, flat in zip(records, csv_records):
        for field, value in flat.items():
            expected = " | ".join(original[field]) if field == "matched_queries" else original[field]
            assert value == expected, f"CSV mismatch: {field}"

    source_rows = {}
    seen = set()
    counts = Counter()
    for page in manifest["pages"]:
        assert "error" not in page, page
        path = OUT / page["raw_file"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == page["sha256"]
        parser = TableParser()
        parser.feed(path.read_text())
        assert len(parser.rows) == page["extracted_rows"]
        # Confirm that the public page honored pagination instead of returning page one.
        if parser.rows:
            assert int(parser.rows[0][0]) == (page["page"] - 1) * 10 + 1, page["source_url"]
        source_rows[page["raw_file"]] = {(row[1], row[2], row[3], row[4]) for row in parser.rows}
        seen.update((row[1], row[2], row[3]) for row in parser.rows)
        counts[page["query"]] += len(parser.rows)
    assert seen == {key(r) for r in records}, "Missing or invented normalized records"
    for record in records:
        assert record["evidence_status"] == "listed_in_public_search"
        assert record["observations"] and record["matched_queries"]
        for observation in record["observations"]:
            rows = source_rows[observation["raw_file"]]
            # Dates can change across observations; the retained date must be in the first.
            assert key(record) in {row[:3] for row in rows}
        assert (*key(record), record["date_displayed"]) in source_rows[record["observations"][0]["raw_file"]]
    for line in (OUT / "SHA256SUMS").read_text().splitlines():
        expected, name = line.split("  ", 1)
        assert hashlib.sha256((OUT / name).read_bytes()).hexdigest() == expected, name
    print(json.dumps({"records": len(records), "certificates": len({r["certificate_number"] for r in records}),
                      "pages": len(manifest["pages"]), "rows_by_query": counts,
                      "stop_reason": manifest.get("stop_reason"), "validation": "passed"}, indent=2))


if __name__ == "__main__":
    main()
