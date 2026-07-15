"""Test Snaptik obfuscation deobfuscation."""
import re, requests, sys

# Step 1: Get landing page + token
s = requests.Session()
s.headers['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'

r = s.get('https://snaptik.app/en2', timeout=15)
m = re.search(r'name="token"[^>]*value="([^"]+)"', r.text)
token = m.group(1) if m else None
print(f"Token: {token}")

# Step 2: POST to abc2.php
r2 = s.post('https://snaptik.app/abc2.php', data={
    'url': 'https://www.tiktok.com/@puttshop/video/7641233256800668935',
    'lang': 'en2',
    'token': token,
}, timeout=15)

js = r2.text
print(f"Response length: {len(js)}")
print(f"First 100: {js[:100]}")

# Step 3: Extract eval parameters
# Pattern: )(next part of )(the params(...))
# The format is: eval(function(h,u,n,t,e,r){...})("PAYLOAD",U,"CHARSET",T,E,R))

# Find the args after })(
idx = js.find('})(')
if idx < 0:
    print("Could not find })(")
    sys.exit(1)

args_start = idx + 2  # skip })
# Find the closing ))
depth = 0
args_end = args_start
while args_end < len(js):
    c = js[args_end]
    if c == '(':
        depth += 1
    elif c == ')':
        depth -= 1
        if depth < 0:
            args_end += 1  # include the closing )
            break
    args_end += 1

args_str = js[args_start:args_end]
print(f"\nArgs string ({len(args_str)} chars):")
# The args are: "PAYLOAD", U, "CHARSET", T, E, R
# We need to parse them carefully since PAYLOAD is a long string

# Let's use a simple approach: find the pattern by tracking quotes
# The first arg is a string, then numbers and strings follow
# Format: "LONG_PAYLOAD",NUM,"CHARSET",NUM,NUM,NUM

# Find the first " - then find the closing " of payload
first_quote = args_str.find('"')
if first_quote < 0:
    print("Could not find first quote")
    sys.exit(1)

# Now find the last " before "CHARSET"
# Simple: find all quoted strings
quoted_parts = re.findall(r'"([^"]*)"', args_str)
print(f"\nQuoted strings found: {len(quoted_parts)}")
print(f"First quoted (payload): {quoted_parts[0][:200]}...")
print(f"Second quoted (charset): {quoted_parts[1]}")

# Now extract numeric params
# Remove first two quoted strings to get remaining
remaining = args_str
for q in quoted_parts[:2]:
    remaining = remaining.replace(f'"{q}"', '', 1)

remaining = remaining.lstrip(',')
nums = re.findall(r'(\d+)', remaining)
print(f"\nNumeric params: {nums}")
print(f"u={nums[0]}, t={nums[1]}, e={nums[2]}, r={nums[3]}")

# Step 4: Manual deobfuscation
payload = quoted_parts[0]
charset = quoted_parts[1]
u_val = int(nums[0])
t_val = int(nums[1])
e_val = int(nums[2])
r_val = int(nums[3])

print(f"\n=== OBJUSCATION PARAMS ===")
print(f"Payload len: {len(payload)}")
print(f"Charset: '{charset}' (len={len(charset)})")
print(f"delimiter: charset[e] = charset[{e_val}] = '{charset[e_val]}'")
print(f"u={u_val}, t={t_val}, e={e_val}, r={r_val}")

# The algorithm:
# For each segment (delimited by charset[e]):
#   1. Build s from chars until delimiter
#   2. Replace each charset char with its index
#   3. Parse s as base-e number -> decimal -> subtract t -> chr
#   4. Accumulate

delim = charset[e_val]
print(f"\n=== DECODING ===")

result_chars = []
i = 0
segments = 0
while i < len(payload):
    s = ""
    while i < len(payload) and payload[i] != delim:
        s += payload[i]
        i += 1
    # Skip delimiter
    i += 1
    
    if not s:
        print(f"  Segment {segments}: EMPTY STRING at pos {i}")
        segments += 1
        continue
    
    # Replace charset chars with indices
    decoded_s = ""
    for ch in s:
        idx_in_charset = charset.find(ch)
        if idx_in_charset >= 0:
            decoded_s += str(idx_in_charset)
        else:
            decoded_s += ch  # shouldn't happen
    
    # Parse as base-e number
    try:
        val = int(decoded_s, e_val)
    except ValueError:
        print(f"  Segment {segments}: Cannot parse '{decoded_s}' as base-{e_val}, s='{s[:50]}'")
        val = 0
    
    char_code = val - t_val
    char = chr(char_code)
    result_chars.append(char)
    segments += 1
    
    if segments <= 5:
        print(f"  Segment {segments}: s='{s[:30]}' -> decoded='{decoded_s[:30]}' -> val={val} -> char_code={char_code} -> '{char}'")

result = ''.join(result_chars)
print(f"\n=== DECODED ({len(result)} chars) ===")
print(result[:2000])
print("...")
print(result[-500:])

# Check if it looks like HTML
if '<' in result and '>' in result:
    print("\n✓ Looks like HTML!")
    # Extract download links
    rapid_links = re.findall(r'https://d\.rapidcdn\.app/v2\?token=[^"\'<>\s]+', result)
    print(f"\nRapidCDN links: {len(rapid_links)}")
    for l in rapid_links[:2]:
        print(f"  {l[:180]}")
    
    hd_links = re.findall(r'https://api\.snaptik\.app[^"\'<>\s]+', result)
    print(f"\nSnaptik API links: {len(hd_links)}")
    for l in hd_links[:2]:
        print(f"  {l[:180]}")
