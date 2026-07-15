"""Full deobfuscation of Snaptik response."""
import requests, re, html

s = requests.Session()
s.headers['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'

# Step 1: Get token
r = s.get('https://snaptik.app/en2', timeout=15)
m = re.search(r'name="token"[^>]*value="([^"]+)"', r.text)
token = m.group(1)
print(f"Token: {token}")

# Step 2: POST to abc2
r2 = s.post('https://snaptik.app/abc2.php', data={
    'url': 'https://www.tiktok.com/@puttshop/video/7641233256800668935',
    'lang': 'en2',
    'token': token,
}, timeout=15)

data = r2.text

# Step 3: Extract eval args
# The structure is: eval(function(h,u,n,t,e,r){...})("PAYLOAD",U,"CHARSET",T,E,R))
# After the function body closing }, find the (
fidx = data.find('function(h,u,n,t,e,r)')
assert fidx >= 0, "function not found"

# Find the }( transition for IIFE args
brace_idx = data.find('}(', fidx)
assert brace_idx >= 0, "}( not found"

args_start = brace_idx + 2  # after }(
args_end = len(data) - 2  # skip trailing ))

# The args are: "PAYLOAD", U, "CHARSET", T, E, R
# We need to parse this CSV properly
# Let's just use ast.literal_eval on the tuple
import ast
# Try to parse as Python tuple (which is valid JS for these primitives)
# Remove outer parens that aren't part of the tuple but eval's closing )
# The args look like: "string...", 44, "charset", 35, 7, 0)
# We need to strip the trailing )) 
args_text = data[args_start:].strip()
# Remove trailing ) 
if args_text.endswith(')'):
    args_text = args_text[:-1]

# Try to parse as a Python tuple
try:
    args = ast.literal_eval(f"({args_text})")
except:
    print(f"Could not parse args: {args_text[:200]}")
    exit()

payload, u_val, charset, t_val, e_val, r_val = args
print(f"Payload len: {len(payload)}")
print(f"Charset: '{charset}' (len={len(charset)}, delimiter='{charset[e_val]}')")
print(f"u={u_val}, t={t_val}, e={e_val}, r={r_val}")

# Step 4: Decode
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
    
    # Replace each charset char with its index position
    digits = ""
    for ch in s:
        idx = charset.find(ch)
        if idx >= 0:
            digits += str(idx)
        else:
            digits += ch  # shouldn't happen
    
    # Parse as base-e number
    val = int(digits, e_val)
    char_code = val - t_val
    result.append(chr(char_code))

decoded = ''.join(result)
print(f"\n=== DECODED HTML ({len(decoded)} chars) ===")
print(decoded[:2000])
print("\n...\n")
print(decoded[-500:])

# Extract download links
print("\n=== EXTRACTED LINKS ===")
for pattern in [
    r'https://d\.rapidcdn\.app/[^"\'<>\s]+',
    r'https://api\.snaptik\.app[^"\'<>\s]+',
    r'https://cdn[^"\'<>\s]*\.snaptik[^"\'<>\s]+',
    r'https?://[^"\'<>\s]+\.mp4[^"\'<>\s]*',
    r'<a[^>]*href="([^"]+)"[^>]*>',
]:
    found = re.findall(pattern, decoded, re.IGNORECASE)
    for link in found:
        # If it's an <a> tag, extract href
        if link.startswith('<a '):
            href = re.search(r'href="([^"]+)"', link)
            if href:
                print(f"  A tag: {href.group(1)}")
            continue
        if 'mp4' in link or 'video' in link or 'download' in link or 'cdn' in link:
            print(f"  {link[:200]}")
