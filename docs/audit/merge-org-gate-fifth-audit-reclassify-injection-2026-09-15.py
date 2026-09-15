import pathlib, re, sys
tbl = sys.argv[1]
p = pathlib.Path('packages/platform-merge/src/pgPlatformUserMerge.ts')
s = p.read_text()
start_marker = "const MEDICAL_HISTORY_RECORDS = ["
end_marker = "] satisfies readonly BlockingMedicalHistoryRecord[];"
a = s.index(start_marker) + len(start_marker)
b = s.index(end_marker)
block = s[a:b]
# split top-level records: they all start with "\n  {\n" and end with "\n  },\n"
recs = re.findall(r'\n  \{\n.*?\n  \},', block, re.S)
assert ''.join(recs) + '\n' == block, (len(recs), repr(block[:80]), repr(block[-80:]))
hit = [r for r in recs if re.search(r'FROM ' + tbl + r'\b', r)]
assert len(hit) == 1, f'{tbl}: {len(hit)} matches'
rec = hit[0]
stripped = re.sub(r'\n    automaticProbe: \(ids\) =>\n(?:      [^\n]*\n)*?(?=    (?:prepareTransfer|transfer):)', '\n', rec)
assert stripped != rec and 'automaticProbe' not in stripped, repr(stripped[:300])
new_block = block.replace(rec, '')
s = s[:a] + new_block + s[b:]
anchor = "const NON_BLOCKING_MERGE_RECORDS = ["
i = s.index(anchor) + len(anchor)
s = s[:i] + stripped + s[i:]
p.write_text(s)
