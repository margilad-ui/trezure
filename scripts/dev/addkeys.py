"""Appends i18n keys to he.ts and en.ts. Usage: python3 addkeys.py keys.tsv  (key<TAB>he<TAB>en per line)"""
import sys
rows=[l.rstrip('\n').split('\t') for l in open(sys.argv[1], encoding='utf-8') if l.strip() and not l.startswith('#')]
for lang, col in (('he',1),('en',2)):
    p=f'/home/claude/trezure/src/i18n/{lang}.ts'; s=open(p, encoding='utf-8').read()
    add=''
    for r in rows:
        k=r[0]
        if f"'{k}':" in s: continue
        v=r[col].replace("'", "\\'")
        add+=f"  '{k}': '{v}',\n"
    i=s.rindex('} as const') if lang=='he' else s.rindex('}')
    s=s[:i]+add+s[i:]
    open(p,'w', encoding='utf-8').write(s)
print(len(rows),'keys')
