"""Collect a bounded public BPJPH demo sample using only Python's standard library."""

import csv
import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE = "https://bpjph.halal.go.id/cari/sertifikat"
OUT = Path(__file__).resolve().parents[1] / "datasets/bpjph-demo"
QUERIES = ["gelatin", "minyak goreng", "tepung terigu", "bumbu", "keju", "perisa", "margarin", "coklat"]


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag == "td" and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if len(self.row) == 5 and re.fullmatch(r"ID\d+", self.row[3]):
                self.rows.append(self.row)
            self.row = None


def main():
    args_parser = argparse.ArgumentParser(description=__doc__)
    args_parser.add_argument("--target", type=int, default=1500)
    args_parser.add_argument("--pages-per-query", type=int, default=25)
    args = args_parser.parse_args()
    if not 1 <= args.target <= 5000 or not 1 <= args.pages_per_query <= 100:
        args_parser.error("target must be 1..5000 and pages-per-query 1..100")
    OUT.mkdir(parents=True, exist_ok=True)
    raw_dir = OUT / "raw"
    raw_dir.mkdir(exist_ok=True)
    old_records = json.loads((OUT / "products.json").read_text()) if (OUT / "products.json").exists() else []
    records = {(r["product_name"], r["producer_name"], r["certificate_number"]): r for r in old_records}
    manifest_path = OUT / "manifest.json"
    pages = json.loads(manifest_path.read_text())["pages"] if manifest_path.exists() else []
    completed = {p["source_url"]: p for p in pages if "error" not in p}
    stop_reason = "page_limit"
    halted = False
    def checkpoint():
        save(records, pages, args, stop_reason)

    # Round-robin traversal keeps the sample balanced if the target is reached early.
    for page in range(1, args.pages_per_query + 1):
      if halted or len(records) >= args.target:
        break
      for term in QUERIES:
            if len(records) >= args.target:
                stop_reason = "target_reached"
                break
            params = {"produk": term, "page": page}
            url = BASE + "?" + urlencode(params)
            if url in completed:
                previous = completed[url]
                original = raw_dir.parent / previous["raw_file"]
                if not original.exists() or hashlib.sha256(original.read_bytes()).hexdigest() != previous["sha256"]:
                    raise SystemExit(f"Cached evidence missing or changed: {original}")
                continue
            # A previous empty page exhausts that query for this snapshot.
            if any(p["query"] == term and p.get("extracted_rows") == 0 for p in pages):
                continue
            time.sleep(1)
            fetched = datetime.now(timezone.utc).isoformat()
            request = Request(url, headers={"User-Agent": "TelusurHalalDemoResearch/0.1", "Accept": "text/html"})
            try:
                for attempt in range(2):
                    try:
                        with urlopen(request, timeout=30) as response:
                            data = response.read()
                            final_url = response.url
                        break
                    except (HTTPError, URLError, TimeoutError) as exc:
                        if isinstance(exc, HTTPError) and exc.code in (401, 403, 429):
                            raise
                        if attempt == 1:
                            raise
                        time.sleep(3)
                html = data.decode("utf-8")
                parser = TableParser()
                parser.feed(html)
                if not parser.rows and "Data tidak ditemukan" not in html and "No results" not in html:
                    raise ValueError("No recognized rows or explicit empty-result marker; stop for inspection")
                filename = f"{QUERIES.index(term) + 1:02d}-page-{page}.html"
                (raw_dir / filename).write_bytes(data)
                pages.append({"query": term, "page": page, "source_url": url,
                              "final_url": final_url, "retrieved_at": fetched,
                              "raw_file": "raw/" + filename,
                              "sha256": hashlib.sha256(data).hexdigest(),
                              "extracted_rows": len(parser.rows)})
                for row in parser.rows:
                    _, product, producer, cert, date = row
                    key = (product, producer, cert)
                    if key not in records:
                        records[key] = {"product_name": product, "producer_name": producer,
                                        "certificate_number": cert, "date_displayed": date,
                                        "source": "BPJPH public certificate search",
                                        "source_url": url, "retrieved_at": fetched,
                                        "evidence_status": "listed_in_public_search",
                                        "matched_queries": [], "observations": []}
                    record = records[key]
                    if term not in record["matched_queries"]:
                        record["matched_queries"].append(term)
                    record["observations"].append({"source_url": url, "raw_file": "raw/" + filename,
                                                   "retrieved_at": fetched})
                print(f"{term}, page {page}: {len(parser.rows)} rows", flush=True)
                checkpoint()
            except Exception as exc:
                pages.append({"query": term, "page": page, "source_url": url,
                              "retrieved_at": fetched, "error": str(exc)})
                print(f"{term}, page {page}: ERROR {exc}", flush=True)
                # Stop on access restrictions instead of bypassing them.
                stop_reason = "access_restricted" if getattr(exc, "code", None) in (401, 403, 429) else "fetch_or_parse_error"
                halted = True
                checkpoint()
                break
    if len(records) >= args.target:
        stop_reason = "target_reached"
    checkpoint()
    print(f"Saved {len(records)} unique products to {OUT}; {stop_reason}", flush=True)
    if halted or not records:
        raise SystemExit("Collection stopped; inspect manifest before resuming.")


def save(records, pages, args, stop_reason):
    result = list(records.values())
    (OUT / "products.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    fields = ["product_name", "producer_name", "certificate_number", "date_displayed",
              "source", "source_url", "retrieved_at", "evidence_status", "matched_queries"]
    with (OUT / "products.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for item in result:
            writer.writerow({**item, "matched_queries": " | ".join(item["matched_queries"])})
    manifest = {"source": BASE, "queries": QUERIES, "pages_per_query_limit": args.pages_per_query,
                "target_records": args.target, "stop_reason": stop_reason,
                "unique_records": len(result), "pages": pages,
                "limitations": ["Public search snapshot; not an independent halal ruling.",
                                "No completeness or current certificate-status guarantee.",
                                "Dates preserved verbatim; source dates may differ from retrieval date.",
                                "No bulk reuse license or official API confirmed."]}
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    files = sorted([*OUT.glob("*.json"), *OUT.glob("*.csv"), *OUT.glob("raw/*.html")])
    (OUT / "SHA256SUMS").write_text("".join(hashlib.sha256(f.read_bytes()).hexdigest() + "  " + f.relative_to(OUT).as_posix() + "\n" for f in files))


if __name__ == "__main__":
    main()
