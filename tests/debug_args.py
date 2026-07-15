"""Debug Snaptik args parsing."""
import requests, re

s = requests.Session()
s.headers['User-Agent'] = 'Mozilla/5.0'
r = s.get('https://snaptik.app/en2', timeout=15)
m = re.search(r'name="token"[^>]*value="([^"]+)"', r.text)
token = m.group(1)

r2 = s.post('https://snaptik.app/abc2.php', data={
    'url': 'https://www.tiktok.com/@puttshop/video/7641233256800668935',
    'lang': 'en2',
    'token': token,
}, timeout=15)

data = r2.text

# Find function
fidx = data.find('function(h,u,n,t,e,r)')
assert fidx >= 0

# Find }(
brace_idx = data.find('}(', fidx)
assert brace_idx >= 0

# Show 500 chars after }(
after = data[brace_idx+2:brace_idx+2+500]
print(f"After }}(")
print(after)
print()

# Also show last 200 chars of response
print(f"Last 200 chars:")
print(repr(data[-200:]))
