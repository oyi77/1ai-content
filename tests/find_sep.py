"""Find the eval separator in obfuscated JS."""
import requests, re

s = requests.Session()
s.headers['User-Agent'] = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'

# Get fresh token
r = s.get('https://snaptik.app/en2', timeout=15)
m = re.search(r'name="token"[^>]*value="([^"]+)"', r.text)
token = m.group(1)

# POST to abc2
r2 = s.post('https://snaptik.app/abc2.php', data={
    'url': 'https://www.tiktok.com/@puttshop/video/7641233256800668935',
    'lang': 'en2',
    'token': token,
}, timeout=15)

data = r2.text
print(f"Response: {len(data)} bytes")

# Find the obfuscated eval function structure
fidx = data.find('function(h,u,n,t,e,r)')
print(f"function(h,u,n,t,e,r) at offset {fidx}")
if fidx < 0:
    print("Pattern not found")
    exit()

# After function body, find the arguments
# The structure is: function(h,u,n,t,e,r){...}(args)
# The args come after the closing })
# Look for }) at various depths
for depth in [1, 2, 3, 4]:
    search = '}' * depth + '('
    idx = data.find(search, fidx)
    if idx >= 0:
        preview = data[idx:idx+300]
        print(f"\nFound {'}'*depth + '('} at {idx}:")
        print(repr(preview[:200]))
    else:
        print(f"\nNot found: {'}'*depth + '('}")
