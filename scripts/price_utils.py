#!/usr/bin/env python3
"""Price formatter + product matcher for Indonesian e-commerce"""
import re

def parse_price(price_str):
    """Parse Indonesian price formats to integer Rupiah.
    Input: '42,0RB', '42.000', '42000', 'Rp42.000', '323,0RB', etc.
    Output: 42000 (int)
    """
    if isinstance(price_str, (int, float)):
        return int(price_str)
    
    s = str(price_str).strip().replace('Rp', '').replace('RP', '').replace(' ', '')
    
    # "42,0RB" or "42.0RB" format (thousands)
    rb_match = re.match(r'([\d,.]+)\s*RB', s, re.IGNORECASE)
    if rb_match:
        num = rb_match.group(1).replace('.', '').replace(',', '.')
        try:
            return int(float(num) * 1000)
        except:
            pass
    
    # "42.000" or "42,000" format
    s_clean = s.replace('.', '').replace(',', '')
    try:
        return int(s_clean)
    except:
        pass
    
    # "42,0" (comma decimal, raw thousands)
    try:
        return int(float(s.replace(',', '.')) * 1000)
    except:
        return 0

def format_price(price):
    """Format integer price to display string: Rp42.000"""
    if isinstance(price, str):
        price = parse_price(price)
    return f"Rp{price:,}".replace(',', '.')

def match_product(video_title, products):
    """Smart product matching based on video content.
    
    Args:
        video_title: Title of TikTok video  
        products: List of product dicts with 'Nama Produk' or 'name' field
    
    Returns: best matching product dict, or None
    """
    title_lower = video_title.lower()
    
    # Extract key terms from title
    key_terms = []
    keywords = [
        'daster', 'gamis', 'oneset', 'setelan', 'dress', 'piyama', 'jilbab',
        'kaos', 'tunik', 'cardigan', 'ransel', 'tas', 'hijab', 'cepol',
        'flanella', 'kemeja', 'anak', 'bayi', 'balita', 'gajah', 'thailand',
        'perempuan', 'laki', 'cowok', 'cewek', 'wanita', 'motif', 'kodok', 
        'mama', 'galak', 'islami', 'kicau', 'mania', 'spiderman', 'ironman',
        'stitch', 'kimono', 'rayon', 'busui', 'brukat', 'satin', 'rempel',
        'ciput', 'turky', 'pashmina', 'segiempat', 'bergo', 'khimar',
    ]
    
    for term in keywords:
        if term in title_lower:
            key_terms.append(term)
    
    if not key_terms:
        return None
    
    # Score products by keyword overlap
    scored = []
    for p in products:
        pname = (p.get('Nama Produk', p.get('name', ''))).lower()
        score = sum(1 for t in key_terms if t in pname)
        if score > 0:
            # Bonus for products from matching niche CSV
            source = p.get('source', '')
            if 'gajah' in title_lower and 'gajah' in source:
                score += 3
            if 'kids' in source and ('anak' in title_lower or 'bayi' in title_lower):
                score += 2
            scored.append((score, p))
    
    if scored:
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]
    
    return None

# Test
if __name__ == '__main__':
    tests = ['42,0RB', '26,3RB', '323,0RB', '42.000', 'Rp49.000', '42000', '15,8RB']
    for t in tests:
        print(f"  {t:>15} → Rp{parse_price(t):,}")

    print(f"\n  {format_price('42,0RB')}")
    print(f"  {format_price(49000)}")
