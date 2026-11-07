"""Validate demo records against saved BPJPH public HTML and checksums offline."""

import csv
import hashlib
import json
from collections import Counter, defaultdict

from scrape_bpjph_demo import OUT, TableParser


def key(record):
    return (record["product_name"], record["producer_name"], record["certificate_number"])


def main():
    if not __debug__:
        raise SystemExit("Run the validator without Python optimization.")
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

    expected = defaultdict(list)
    successful = {page["source_url"]: page for page in manifest["pages"] if "error" not in page}
    seen_urls = set()
    raw_files = set()
    counts = Counter()
    for page in manifest["pages"]:
        if "error" in page:
            assert page["source_url"] in successful, page
            continue
        assert page["source_url"] not in seen_urls, "Duplicate successful URL"
        assert page["raw_file"] not in raw_files, "Duplicate raw page"
        seen_urls.add(page["source_url"])
        raw_files.add(page["raw_file"])
        path = OUT / page["raw_file"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == page["sha256"]
        parser = TableParser()
        parser.feed(path.read_text())
        assert len(parser.rows) == page["extracted_rows"]
        # Confirm that the public page honored pagination instead of returning page one.
        if parser.rows:
            assert int(parser.rows[0][0]) == (page["page"] - 1) * 10 + 1, page["source_url"]
        for _, product, producer, cert, date in parser.rows:
            expected[(product, producer, cert)].append((page, date))
        counts[page["query"]] += len(parser.rows)
    assert set(expected) == {key(r) for r in records}, "Missing or invented normalized records"
    for record in records:
        assert record["source"] == "BPJPH public certificate search"
        assert record["evidence_status"] == "listed_in_public_search"
        observations = expected[key(record)]
        assert record["observations"] == [
            {field: page[field] for field in ("source_url", "raw_file", "retrieved_at")}
            for page, _ in observations
        ], f"Incorrect observation provenance for {key(record)}"
        assert record["matched_queries"] == list(dict.fromkeys(page["query"] for page, _ in observations))
        first, date = observations[0]
        assert record["date_displayed"] == date
        assert record["source_url"] == first["source_url"]
        assert record["retrieved_at"] == first["retrieved_at"]
    checksummed = set()
    for line in (OUT / "SHA256SUMS").read_text().splitlines():
        digest, name = line.split("  ", 1)
        assert name not in checksummed, f"Duplicate checksum: {name}"
        assert name in raw_files or name in {"products.json", "products.csv", "manifest.json"}, name
        assert hashlib.sha256((OUT / name).read_bytes()).hexdigest() == digest, name
        checksummed.add(name)
    assert checksummed == raw_files | {"products.json", "products.csv", "manifest.json"}, "Missing checksums"
    print(json.dumps({"records": len(records), "certificates": len({r["certificate_number"] for r in records}),
                      "pages": len(successful), "rows_by_query": counts,
                      "stop_reason": manifest.get("stop_reason"), "validation": "passed"}, indent=2))


if __name__ == "__main__":
    main()
