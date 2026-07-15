"""Debug the eval args structure."""
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

fidx = data.find('function(h,u,n,t,e,r)')
print(f"function at offset: {fidx}")

# Show from fidx to fidx+3000
print(f"\n=== FROM function (3000 chars) ===")
print(data[fidx:fidx+3000])

# Show last 500 chars
print(f"\n=== LAST 500 CHARS ===")
print(data[-500:])
