"""Full deobfuscation of Snaptik response - fixed."""
import requests, re, ast

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

# Extract eval call using balanced parens
# Structure: eval(function(h,u,n,t,e,r){...})("PAYLOAD",U,"CHARSET",T,E,R))
# The args start after }( and end before the last ))
# Since payload is a big string with no quotes, we can parse it simply

# Find the function body
fidx = data.find('function(h,u,n,t,e,r)')
assert fidx >= 0

# Find args: after the }(
brace_idx = data.find('}(', fidx)
assert brace_idx >= 0

args_start = brace_idx + 2  # skip }(
# Find the end - last )) in the response
# The args end with ... ,R))
last_double = data.rfind('))')
if last_double >= 0 and last_double > args_start:
    args_end = last_double
else:
    args_end = len(data) - 1

args_text = data[args_start:args_end]
print(f"Args text length: {len(args_text)}")

# Parse: "PAYLOAD", U, "CHARSET", T, E, R
# First find the payload string (from first " to the next ", which is followed by ,\d+)
first_quote = args_text.find('"')
second_quote_after = args_text.find('",', first_quote + 1)
if second_quote_after < 0:
    # try just the second quote
    second_quote = args_text.find('"', first_quote + 1)
    payload = args_text[first_quote + 1:second_quote]
    rest = args_text[second_quote + 1:]
else:
    payload = args_text[first_quote + 1:second_quote_after]
    rest = args_text[second_quote_after + 2:]

print(f"Payload: {len(payload)} chars, first 100: {payload[:100]}")

# Rest should be: U,"CHARSET",T,E,R
# Find the charset string
rest = rest.lstrip(',')
c_quote = rest.find('"')
c_end = rest.find('"', c_quote + 1)
charset = rest[c_quote + 1:c_end]
rest2 = rest[c_end + 1:].lstrip(',')

# Remaining: T,E,R
nums = [int(x) for x in rest2.split(',')]
if len(nums) >= 3:
    u_val = nums[0]
    t_val = nums[1]
    e_val = nums[2]
elif len(nums) >= 4:
    u_val = nums[0]
    t_val = nums[2]
    e_val = nums[3]
else:
    u_val, t_val, e_val = 0, 0, 0

print(f"Charset: '{charset}' (len={len(charset)})")
print(f"u={u_val}, t={t_val}, e={e_val}")

delim = charset[e_val]
print(f"Delimiter (charset[{e_val}]): '{delim}'")

# Decode
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
    
    digits = ""
    for ch in s:
        idx = charset.find(ch)
        if idx >= 0:
            digits += str(idx)
        else:
            digits += ch
    
    val = int(digits, e_val)
    char_code = val - t_val
    result.append(chr(char_code))

decoded = ''.join(result)
print(f"\n=== DECODED ({len(decoded)} chars) ===")
print(decoded[:2000])
print("\n...\n")
print(decoded[-500:])

# Extract download links
print("\n=== DOWNLOAD LINKS ===")
for pattern in [
    r'href="([^"]*snaptik[^"]*)"',
    r'href="([^"]*rapidcdn[^"]*)"',
    r'href="([^"]*\.mp4[^"]*)"',
    r'src="([^"]*\.mp4[^"]*)"',
    r'data-url="([^"]*)"',
]:
    for link in re.findall(pattern, decoded, re.IGNORECASE):
        print(f"  {link[:200]}")
