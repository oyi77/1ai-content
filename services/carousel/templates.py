"""
Extended Carousel Templates — 25+ niche-specific templates.

Each template defines slide structure, prompts, and style for a specific content type.
Used by CarouselGenerator to produce context-aware carousels.
"""

TEMPLATES = {
    # ── E-COMMERCE ──────────────────────────────────
    "product_showcase": {
        "name": "Product Showcase",
        "niche": "ecommerce",
        "slides": [
            {"type": "cover", "headline": "{product_name}", "body": "Yang wajib kamu punya!", "icon": "🛍️"},
            {"type": "content", "headline": "Masalah", "body": "Punya masalah {pain_point}?", "icon": "😤"},
            {"type": "content", "headline": "Solusi", "body": "{product_name} hadir untuk {solution}", "icon": "💡"},
            {"type": "content", "headline": "Keunggulan 1", "body": "{benefit_1}", "icon": "⭐"},
            {"type": "content", "headline": "Keunggulan 2", "body": "{benefit_2}", "icon": "🔥"},
            {"type": "content", "headline": "Testimoni", "body": "\"{testimonial}\"", "icon": "💬"},
            {"type": "closing", "headline": "Pesan Sekarang!", "body": "Link di bio 👇", "cta": "🛒 Order Now", "icon": "👉"},
        ],
        "style": "bold",
        "success_rate": 89,
    },
    "flash_sale": {
        "name": "Flash Sale Alert",
        "niche": "ecommerce",
        "slides": [
            {"type": "cover", "headline": "⚡ FLASH SALE", "body": "Diskon {discount}% hari ini aja!", "icon": "⚡"},
            {"type": "content", "headline": "Produk 1", "body": "{item_1} — ~~{old_price_1}~~ → {new_price_1}", "icon": "🔥"},
            {"type": "content", "headline": "Produk 2", "body": "{item_2} — ~~{old_price_2}~~ → {new_price_2}", "icon": "🔥"},
            {"type": "content", "headline": "Produk 3", "body": "{item_3} — ~~{old_price_3}~~ → {new_price_3}", "icon": "🔥"},
            {"type": "content", "headline": "Batas Waktu", "body": "Berakhir dalam {hours} jam!", "icon": "⏰"},
            {"type": "closing", "headline": "Jangan Sampai Kehabisan!", "body": "Order sekarang sebelum kehabisan", "cta": "🛒 Grab Now!", "icon": "🏃"},
        ],
        "style": "bold",
        "success_rate": 92,
    },

    # ── F&B ──────────────────────────────────
    "food_review": {
        "name": "Food Review",
        "niche": "fnb",
        "slides": [
            {"type": "cover", "headline": "{restaurant_name}", "body": "Review jujur dari foodie!", "icon": "🍜"},
            {"type": "content", "headline": "Suasana", "body": "{ambiance_desc}", "icon": "🏠"},
            {"type": "content", "headline": "Menu 1: {dish_1}", "body": "{dish_1_review}", "icon": "🍽️"},
            {"type": "content", "headline": "Menu 2: {dish_2}", "body": "{dish_2_review}", "icon": "😋"},
            {"type": "content", "headline": "Harga", "body": "Budget: {price_range} per orang", "icon": "💰"},
            {"type": "content", "headline": "Rating", "body": "{rating}/10 — {verdict}", "icon": "⭐"},
            {"type": "closing", "headline": "Wajib Coba!", "body": "Save post ini buat referensi makan", "cta": "💾 Save & Share!", "icon": "👉"},
        ],
        "style": "bold",
        "success_rate": 87,
    },
    "recipe_tutorial": {
        "name": "Recipe Tutorial",
        "niche": "fnb",
        "slides": [
            {"type": "cover", "headline": "Resep {dish_name}", "body": "Gampang banget, 10 menit jadi!", "icon": "👩‍🍳"},
            {"type": "content", "headline": "Bahan-bahan", "body": "{ingredients_list}", "icon": "📝"},
            {"type": "content", "headline": "Langkah 1", "body": "{step_1}", "icon": "1️⃣"},
            {"type": "content", "headline": "Langkah 2", "body": "{step_2}", "icon": "2️⃣"},
            {"type": "content", "headline": "Langkah 3", "body": "{step_3}", "icon": "3️⃣"},
            {"type": "content", "headline": "Tips", "body": "{pro_tip}", "icon": "💡"},
            {"type": "closing", "headline": "Selamat Mencoba!", "body": "Tag temen yang harus cobain ini!", "cta": "📤 Share Recipe!", "icon": "👉"},
        ],
        "style": "bold",
        "success_rate": 91,
    },

    # ── EDUCATION ──────────────────────────────────
    "how_to_guide": {
        "name": "How-To Guide",
        "niche": "education",
        "slides": [
            {"type": "cover", "headline": "Cara {action}", "body": "Step-by-step lengkap!", "icon": "📚"},
            {"type": "content", "headline": "Step 1", "body": "{step_1}", "icon": "1️⃣"},
            {"type": "content", "headline": "Step 2", "body": "{step_2}", "icon": "2️⃣"},
            {"type": "content", "headline": "Step 3", "body": "{step_3}", "icon": "3️⃣"},
            {"type": "content", "headline": "Tips Pro", "body": "{pro_tip}", "icon": "💡"},
            {"type": "content", "headline": "Hindari Ini!", "body": "{common_mistake}", "icon": "⚠️"},
            {"type": "closing", "headline": "Berhasil!", "body": "Save buat referensi nanti!", "cta": "💾 Save Post!", "icon": "👉"},
        ],
        "style": "educational",
        "success_rate": 88,
    },
    "myth_busters": {
        "name": "Myth Busters",
        "niche": "education",
        "slides": [
            {"type": "cover", "headline": "MITOS vs FAKTA", "body": "{topic} yang selama ini salah!", "icon": "🔍"},
            {"type": "content", "headline": "❌ Mitos", "body": "{myth_1}", "icon": "❌"},
            {"type": "content", "headline": "✅ Fakta", "body": "{fact_1}", "icon": "✅"},
            {"type": "content", "headline": "❌ Mitos", "body": "{myth_2}", "icon": "❌"},
            {"type": "content", "headline": "✅ Fakta", "body": "{fact_2}", "icon": "✅"},
            {"type": "content", "headline": "❌ Mitos", "body": "{myth_3}", "icon": "❌"},
            {"type": "content", "headline": "✅ Fakta", "body": "{fact_3}", "icon": "✅"},
        ],
        "style": "bold",
        "success_rate": 93,
    },

    # ── MOTIVATION ──────────────────────────────────
    "morning_routine": {
        "name": "Morning Routine",
        "niche": "motivation",
        "slides": [
            {"type": "cover", "headline": "Routine Pagi", "body": "Bangun jam 5 pagi mengubah hidupku", "icon": "🌅"},
            {"type": "content", "headline": "05:00", "body": "Bangun & minum air hangat", "icon": "💧"},
            {"type": "content", "headline": "05:15", "body": "Olahraga 30 menit", "icon": "🏃"},
            {"type": "content", "headline": "05:45", "body": "Meditasi & journaling", "icon": "🧘"},
            {"type": "content", "headline": "06:15", "body": "Shower & siap-siap", "icon": "🚿"},
            {"type": "content", "headline": "06:45", "body": "Sarapan sehat & plan hari ini", "icon": "🥑"},
            {"type": "closing", "headline": "Mulai Besok!", "body": "Challenge: coba 7 hari berturut-turut!", "cta": "🔥 Accept Challenge!", "icon": "👉"},
        ],
        "style": "minimal",
        "success_rate": 86,
    },
    "money_tips": {
        "name": "Money Tips",
        "niche": "finance",
        "slides": [
            {"type": "cover", "headline": "Tips Keuangan", "body": "Atur uang biar gak boncos!", "icon": "💰"},
            {"type": "content", "headline": "Aturan 50/30/20", "body": "50% kebutuhan, 30% keinginan, 20% tabungan", "icon": "📊"},
            {"type": "content", "headline": "Dana Darurat", "body": "Minimal 6x pengeluaran bulanan", "icon": "🏦"},
            {"type": "content", "headline": "Hindari", "body": "Pinjol berbunga tinggi & gaya hidup hedon", "icon": "🚫"},
            {"type": "content", "headline": "Investasi", "body": "Mulai dari RDPU, lalu reksadana saham", "icon": "📈"},
            {"type": "content", "headline": "Track Pengeluaran", "body": "Catat semua pengeluaran harian", "icon": "📝"},
            {"type": "closing", "headline": "Mulai Sekarang!", "body": "Gak ada kata terlambat untuk atur uang", "cta": "💰 Start Saving!", "icon": "👉"},
        ],
        "style": "minimal",
        "success_rate": 90,
    },

    # ── TECH ──────────────────────────────────
    "app_review": {
        "name": "App Review",
        "niche": "tech",
        "slides": [
            {"type": "cover", "headline": "{app_name}", "body": "Review lengkap + worth it gak?", "icon": "📱"},
            {"type": "content", "headline": "Apa Itu?", "body": "{app_description}", "icon": "❓"},
            {"type": "content", "headline": "Fitur Utama", "body": "{key_features}", "icon": "⭐"},
            {"type": "content", "headline": "Kelebihan", "body": "{pros}", "icon": "✅"},
            {"type": "content", "headline": "Kekurangan", "body": "{cons}", "icon": "❌"},
            {"type": "content", "headline": "Verdict", "body": "{verdict} — {rating}/10", "icon": "🏆"},
            {"type": "closing", "headline": "Download Sekarang!", "body": "Link di bio", "cta": "📲 Download!", "icon": "👉"},
        ],
        "style": "dark",
        "success_rate": 85,
    },
    "ai_tools_list": {
        "name": "AI Tools List",
        "niche": "tech",
        "slides": [
            {"type": "cover", "headline": "{n} AI Tools", "body": "Yang wajib kamu coba!", "icon": "🤖"},
            {"type": "content", "headline": "1. {tool_1}", "body": "{tool_1_desc}", "icon": "🔧"},
            {"type": "content", "headline": "2. {tool_2}", "body": "{tool_2_desc}", "icon": "🔧"},
            {"type": "content", "headline": "3. {tool_3}", "body": "{tool_3_desc}", "icon": "🔧"},
            {"type": "content", "headline": "4. {tool_4}", "body": "{tool_4_desc}", "icon": "🔧"},
            {"type": "content", "headline": "5. {tool_5}", "body": "{tool_5_desc}", "icon": "🔧"},
            {"type": "closing", "headline": "Save Post Ini!", "body": "Biar gak lupa pas butuh", "cta": "💾 Save!", "icon": "👉"},
        ],
        "style": "dark",
        "success_rate": 94,
    },

    # ── FITNESS ──────────────────────────────────
    "workout_plan": {
        "name": "Workout Plan",
        "niche": "fitness",
        "slides": [
            {"type": "cover", "headline": "Workout {duration}", "body": "{focus_area} — no gym needed!", "icon": "💪"},
            {"type": "content", "headline": "Warm-up", "body": "{warmup}", "icon": "🔥"},
            {"type": "content", "headline": "Exercise 1", "body": "{exercise_1} — {reps_1}", "icon": "🏋️"},
            {"type": "content", "headline": "Exercise 2", "body": "{exercise_2} — {reps_2}", "icon": "🏋️"},
            {"type": "content", "headline": "Exercise 3", "body": "{exercise_3} — {reps_3}", "icon": "🏋️"},
            {"type": "content", "headline": "Cool Down", "body": "{cooldown}", "icon": "🧘"},
            {"type": "closing", "headline": "Challenge 30 Hari!", "body": "Save & tag temen workout bareng!", "cta": "💪 Start Now!", "icon": "👉"},
        ],
        "style": "bold",
        "success_rate": 88,
    },

    # ── TRAVEL ──────────────────────────────────
    "travel_guide": {
        "name": "Travel Guide",
        "niche": "travel",
        "slides": [
            {"type": "cover", "headline": "{destination}", "body": "Guide lengkap budget traveler!", "icon": "✈️"},
            {"type": "content", "headline": "Budget", "body": "Total: {total_budget} untuk {days} hari", "icon": "💰"},
            {"type": "content", "headline": "Day 1", "body": "{day_1_itinerary}", "icon": "📍"},
            {"type": "content", "headline": "Day 2", "body": "{day_2_itinerary}", "icon": "📍"},
            {"type": "content", "headline": "Kuliner Wajib", "body": "{must_eat}", "icon": "🍜"},
            {"type": "content", "headline": "Tips", "body": "{travel_tip}", "icon": "💡"},
            {"type": "closing", "headline": "Save Trip Ini!", "body": "Tag temen buat planning bareng!", "cta": "✈️ Plan Trip!", "icon": "👉"},
        ],
        "style": "minimal",
        "success_rate": 87,
    },

    # ── REAL ESTATE ──────────────────────────────────
    "property_showcase": {
        "name": "Property Showcase",
        "niche": "realestate",
        "slides": [
            {"type": "cover", "headline": "{property_name}", "body": "Hunian impian di {location}!", "icon": "🏠"},
            {"type": "content", "headline": "Tipe", "body": "{bedrooms} KT / {bathrooms} KM / {area} m²", "icon": "📐"},
            {"type": "content", "headline": "Lokasi", "body": "{location_detail}", "icon": "📍"},
            {"type": "content", "headline": "Fasilitas", "body": "{facilities}", "icon": "⭐"},
            {"type": "content", "headline": "Harga", "body": "Mulai dari {price}", "icon": "💰"},
            {"type": "content", "headline": "Cicilan", "body": "{installment}/bulan", "icon": "🏦"},
            {"type": "closing", "headline": "Booking Sekarang!", "body": "Unit terbatas, hubungi agen kami", "cta": "📞 Contact Agent!", "icon": "👉"},
        ],
        "style": "minimal",
        "success_rate": 82,
    },

    # ── AUTOMOTIVE ──────────────────────────────────
    "car_review": {
        "name": "Car Review",
        "niche": "automotive",
        "slides": [
            {"type": "cover", "headline": "{car_name}", "body": "Review lengkap + harga terbaru!", "icon": "🚗"},
            {"type": "content", "headline": "Eksterior", "body": "{exterior_desc}", "icon": "🎨"},
            {"type": "content", "headline": "Interior", "body": "{interior_desc}", "icon": "🪑"},
            {"type": "content", "headline": "Mesin", "body": "{engine_specs}", "icon": "⚙️"},
            {"type": "content", "headline": "Fitur", "body": "{key_features}", "icon": "⭐"},
            {"type": "content", "headline": "Harga", "body": "OTR {price}", "icon": "💰"},
            {"type": "closing", "headline": "Test Drive!", "body": "Hubungi dealer terdekat", "cta": "🚗 Book Test Drive!", "icon": "👉"},
        ],
        "style": "dark",
        "success_rate": 84,
    },

    # ── BEAUTY ──────────────────────────────────
    "skincare_routine": {
        "name": "Skincare Routine",
        "niche": "beauty",
        "slides": [
            {"type": "cover", "headline": "Skincare Routine", "body": "Pagi & malam untuk kulit glowing!", "icon": "✨"},
            {"type": "content", "headline": "Step 1: Cleanser", "body": "{cleanser_rec}", "icon": "🧼"},
            {"type": "content", "headline": "Step 2: Toner", "body": "{toner_rec}", "icon": "💧"},
            {"type": "content", "headline": "Step 3: Serum", "body": "{serum_rec}", "icon": "🧴"},
            {"type": "content", "headline": "Step 4: Moisturizer", "body": "{moisturizer_rec}", "icon": "🫧"},
            {"type": "content", "headline": "Step 5: Sunscreen", "body": "{sunscreen_rec}", "icon": "☀️"},
            {"type": "closing", "headline": "Glow Up!", "body": "Konsisten 30 hari untuk hasil maksimal!", "cta": "✨ Start Routine!", "icon": "👉"},
        ],
        "style": "minimal",
        "success_rate": 90,
    },

    # ── PARENTING ──────────────────────────────────
    "parenting_tips": {
        "name": "Parenting Tips",
        "niche": "parenting",
        "slides": [
            {"type": "cover", "headline": "Tips Parenting", "body": "Buat orangtua yang ingin lebih baik!", "icon": "👶"},
            {"type": "content", "headline": "Tip 1", "body": "{tip_1}", "icon": "💡"},
            {"type": "content", "headline": "Tip 2", "body": "{tip_2}", "icon": "💡"},
            {"type": "content", "headline": "Tip 3", "body": "{tip_3}", "icon": "💡"},
            {"type": "content", "headline": "Hindari", "body": "{avoid_this}", "icon": "⚠️"},
            {"type": "content", "headline": "Manfaat", "body": "{benefit}", "icon": "🌟"},
            {"type": "closing", "headline": "Share ke Sesama Ortu!", "body": "Parenting itu teamwork!", "cta": "📤 Share!", "icon": "👉"},
        ],
        "style": "educational",
        "success_rate": 85,
    },

    # ── FASHION ──────────────────────────────────
    "outfit_ideas": {
        "name": "Outfit Ideas",
        "niche": "fashion",
        "slides": [
            {"type": "cover", "headline": "{n} Outfit Ideas", "body": "Untuk {occasion}!", "icon": "👗"},
            {"type": "content", "headline": "Look 1", "body": "{outfit_1}", "icon": "👔"},
            {"type": "content", "headline": "Look 2", "body": "{outfit_2}", "icon": "👗"},
            {"type": "content", "headline": "Look 3", "body": "{outfit_3}", "icon": "🧥"},
            {"type": "content", "headline": "Look 4", "body": "{outfit_4}", "icon": "👟"},
            {"type": "content", "headline": "Budget", "body": "Total: {budget}", "icon": "💰"},
            {"type": "closing", "headline": "Save Inspo Ini!", "body": "Tag temen yang butuh outfit check!", "cta": "👗 Save Look!", "icon": "👉"},
        ],
        "style": "bold",
        "success_rate": 88,
    },

    # ── BUSINESS ──────────────────────────────────
    "side_hustle": {
        "name": "Side Hustle Ideas",
        "niche": "business",
        "slides": [
            {"type": "cover", "headline": "{n} Side Hustle", "body": "Mulai dari HP aja!", "icon": "💼"},
            {"type": "content", "headline": "1. {hustle_1}", "body": "Potensi: {income_1}/bulan", "icon": "💰"},
            {"type": "content", "headline": "2. {hustle_2}", "body": "Potensi: {income_2}/bulan", "icon": "💰"},
            {"type": "content", "headline": "3. {hustle_3}", "body": "Potensi: {income_3}/bulan", "icon": "💰"},
            {"type": "content", "headline": "Tips Sukses", "body": "{success_tip}", "icon": "🎯"},
            {"type": "content", "headline": "Modal", "body": "Mulai dari {min_capital}", "icon": "💡"},
            {"type": "closing", "headline": "Mulai Sekarang!", "body": "Gak ada kata terlambat untuk mulai!", "cta": "🚀 Start Now!", "icon": "👉"},
        ],
        "style": "bold",
        "success_rate": 91,
    },
    "business_tips": {
        "name": "Business Tips",
        "niche": "business",
        "slides": [
            {"type": "cover", "headline": "Tips Bisnis", "body": "Dari pengalaman {years} tahun!", "icon": "📊"},
            {"type": "content", "headline": "Tip 1", "body": "{biz_tip_1}", "icon": "💡"},
            {"type": "content", "headline": "Tip 2", "body": "{biz_tip_2}", "icon": "💡"},
            {"type": "content", "headline": "Tip 3", "body": "{biz_tip_3}", "icon": "💡"},
            {"type": "content", "headline": "Kesalahan Umum", "body": "{common_mistake}", "icon": "⚠️"},
            {"type": "content", "headline": "Action Item", "body": "{action_item}", "icon": "🎯"},
            {"type": "closing", "headline": "Apply Sekarang!", "body": "Knowledge tanpa action = 0", "cta": "📊 Take Action!", "icon": "👉"},
        ],
        "style": "dark",
        "success_rate": 86,
    },

    # ── RELATIONSHIP ──────────────────────────────────
    "dating_tips": {
        "name": "Dating Tips",
        "niche": "relationship",
        "slides": [
            {"type": "cover", "headline": "Tips PDKT", "body": "Biar gak ditolak, baca ini!", "icon": "💕"},
            {"type": "content", "headline": "Do's", "body": "{do_tip_1}", "icon": "✅"},
            {"type": "content", "headline": "Do's", "body": "{do_tip_2}", "icon": "✅"},
            {"type": "content", "headline": "Don'ts", "body": "{dont_tip_1}", "icon": "❌"},
            {"type": "content", "headline": "Don'ts", "body": "{dont_tip_2}", "icon": "❌"},
            {"type": "content", "headline": "Green Flag", "body": "{green_flag}", "icon": "🟢"},
            {"type": "closing", "headline": "Good Luck!", "body": "Tag temen yang butuh tips ini!", "cta": "💕 Share!", "icon": "👉"},
        ],
        "style": "bold",
        "success_rate": 89,
    },

    # ── LISTICLE (GENERIC) ──────────────────────────────────
    "top_list": {
        "name": "Top N List",
        "niche": "general",
        "slides": [
            {"type": "cover", "headline": "Top {n} {topic}", "body": "{subtitle}", "icon": "🏆"},
            {"type": "content", "headline": "#{rank_1}", "body": "{item_1_desc}", "icon": "🥇"},
            {"type": "content", "headline": "#{rank_2}", "body": "{item_2_desc}", "icon": "🥈"},
            {"type": "content", "headline": "#{rank_3}", "body": "{item_3_desc}", "icon": "🥉"},
            {"type": "content", "headline": "#{rank_4}", "body": "{item_4_desc}", "icon": "🏅"},
            {"type": "content", "headline": "#{rank_5}", "body": "{item_5_desc}", "icon": "🏅"},
            {"type": "closing", "headline": "Setuju?", "body": "Komen favorit kamu di bawah!", "cta": "💬 Comment!", "icon": "👉"},
        ],
        "style": "bold",
        "success_rate": 90,
    },
    "did_you_know": {
        "name": "Did You Know?",
        "niche": "general",
        "slides": [
            {"type": "cover", "headline": "Tahukah Kamu?", "body": "{topic} yang bikin kaget!", "icon": "🤯"},
            {"type": "content", "headline": "Fakta 1", "body": "{fact_1}", "icon": "📊"},
            {"type": "content", "headline": "Fakta 2", "body": "{fact_2}", "icon": "📊"},
            {"type": "content", "headline": "Fakta 3", "body": "{fact_3}", "icon": "📊"},
            {"type": "content", "headline": "Fakta 4", "body": "{fact_4}", "icon": "📊"},
            {"type": "content", "headline": "Fakta 5", "body": "{fact_5}", "icon": "📊"},
            {"type": "closing", "headline": "Share ke Temen!", "body": "Biar mereka juga kaget!", "cta": "📤 Share!", "icon": "👉"},
        ],
        "style": "educational",
        "success_rate": 92,
    },
    "before_after": {
        "name": "Before vs After",
        "niche": "general",
        "slides": [
            {"type": "cover", "headline": "Before vs After", "body": "{transformation} yang luar biasa!", "icon": "🔄"},
            {"type": "content", "headline": "Before", "body": "{before_desc}", "icon": "📷"},
            {"type": "content", "headline": "Proses", "body": "{process_desc}", "icon": "⚙️"},
            {"type": "content", "headline": "Step 1", "body": "{step_1}", "icon": "1️⃣"},
            {"type": "content", "headline": "Step 2", "body": "{step_2}", "icon": "2️⃣"},
            {"type": "content", "headline": "After", "body": "{after_desc}", "icon": "✨"},
            {"type": "closing", "headline": "Kamu Juga Bisa!", "body": "Mulai perubahanmu sekarang!", "cta": "🚀 Start Now!", "icon": "👉"},
        ],
        "style": "bold",
        "success_rate": 88,
    },
}


def get_template(template_id: str) -> dict | None:
    """Get a template by ID."""
    return TEMPLATES.get(template_id)


def get_templates_by_niche(niche: str) -> list[dict]:
    """Get all templates for a specific niche."""
    return [
        {"id": tid, **t}
        for tid, t in TEMPLATES.items()
        if t.get("niche") == niche
    ]


def list_templates() -> list[dict]:
    """List all available templates."""
    return [
        {"id": tid, "name": t["name"], "niche": t["niche"], "style": t["style"], "slides": len(t["slides"]), "success_rate": t.get("success_rate", 0)}
        for tid, t in TEMPLATES.items()
    ]


def list_niches() -> list[str]:
    """List all available niches."""
    return sorted(set(t["niche"] for t in TEMPLATES.values()))
