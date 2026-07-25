# How attention routes information

Mode: `course`

```text
Use $html-docs to research transformer attention from primary papers and create
a private course. Teach the query-key-value mechanism, scaled dot-product
attention, multi-head routing, masking, and one worked token example. Create a
rich page and narrated visual video for every lesson.
```

```bash
html-docs project init "transformer attention routing" \
  --topic "transformer attention routing" \
  --mode course \
  --output ./attention-routing-course \
  --title "How attention routes information"
```

The committed manifest is a starting source ledger. A production run freezes
the exact paper versions, extracted evidence, checksums, and citations.
