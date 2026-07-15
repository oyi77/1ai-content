"""Snaptik deobfuscation — working v4."""
import requests, re

s = requests.Session()
s.headers['User-Agent'] = 'Mozilla/5.0'
r = s.get('https://snaptik.app/en2', timeout=15)
m = re.search(r'name="token"[^>]*value="([^"]+)"', r.text)
token = m.group(1)
print(f"Token: {token}")

r2 = s.post('https://snaptik.app/abc2.php', data={
    'url': 'https://www.tiktok.com/@puttshop/video/7641233256800668935',
    'lang': 'en2',
    'token': token,
}, timeout=15)

data = r2.text
print(f"Response: {len(data)} bytes")

fidx = data.find('function(h,u,n,t,e,r)')
assert fidx >= 0
brace_idx = data.find('}(', fidx)
assert brace_idx >= 0

args_text = data[brace_idx+2:]  # everything after }(

# Parse: "PAYLOAD",U,"CHARSET",T,E,R))
# Step 1: extract payload (first quoted string)
q1 = args_text.find('"')
q2 = args_text.find('"', q1 + 1)
payload = args_text[q1+1:q2]
rest = args_text[q2+1:].lstrip(',')

# Step 2: extract U (first number)
parts = rest.split(',')
u_val = int(parts[0].strip())
rest2 = ','.join(parts[1:]).lstrip(',')

# Step 3: extract charset (second quoted string)
q3 = rest2.find('"')
q4 = rest2.find('"', q3 + 1)
charset = rest2[q3+1:q4]
rest3 = rest2[q4+1:].lstrip(',')

# Step 4: extract T, E, R (strip trailing parens)
rest3 = rest3.rstrip(')').strip()
nums = [int(x.strip()) for x in rest3.split(',')]
t_val, e_val, r_val = nums[0], nums[1], nums[2]

print(f"Payload: {len(payload)} chars")
print(f"u={u_val}, charset='{charset}' (len={len(charset)}, delim='{charset[e_val]}'), t={t_val}, e={e_val}, r={r_val}")

# Decode
delim = charset[e_val]
result = []
i = 0
while i < len(payload):
    s = ""
    while i < len(payload) and payload[i] != delim:
        s += payload[i]
        i += 1
    i += 1  # skip delimiter
    if not s:
        continue
    digits = "".join(str(charset.find(ch)) if ch in charset else ch for ch in s)
    val = int(digits, e_val)
    result.append(chr(val - t_val))

decoded = "".join(result)
print(f"\n=== DECODED ({len(decoded)} chars) ===")
print(decoded[:2000])
print("\n...\n")
print(decoded[-500:])

# Extract download links
print("\n=== DOWNLOAD LINKS ===")
unique = set()
for pat in [r'href="([^"]+)"', r'src="([^"]+)"', r'data-url="([^"]+)"']:
    for link in re.findall(pat, decoded, re.IGNORECASE):
        if any(kw in link for kw in ['snaptik', 'rapidcdn', '.mp4', 'tiktokcdn', '/download', 'token=']):
            unique.add(link)
for link in sorted(unique):
    print(f"  {link[:200]}")
