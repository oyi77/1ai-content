"""
Caption Presets — Pre-built caption configurations for common content types.

Pairs with CaptionGenerator for quick caption generation without LLM calls.
"""

PRESET_CAPTIONS = {
    "product_launch": {
        "hype": "🚀🚀🚀 AKHIRNYA RILIS!!\n\n{name} udah hadir dan siap bikin hidup kamu lebih mudah!\n\n✅ {benefit_1}\n✅ {benefit_2}\n✅ {benefit_3}\n\n💥 Launch price: {price} (hemat {discount}!)\n⏰ Berlaku sampai {deadline}\n\nLink di bio 👇\n\n#launch #{brand} #newproduct #limited",
        "minimal": "{name}\n\n{tagline}\n\n{price}\nLink in bio.",
        "educational": "📚 Kenapa {name} berbeda?\n\n1️⃣ {feature_1}\n2️⃣ {feature_2}\n3️⃣ {feature_3}\n\nCocok untuk: {target_audience}\n\nInfo lengkap: link di bio 🔗",
    },
    "behind_the_scenes": {
        "storytelling": "Jadi ceritanya...\n\n{story}\n\nProses ini mengajarkan kami bahwa {lesson}.\n\nShare kalau kamu relate! 💪",
        "humor": "POV: Kamu bikin {product} dan ternyata...\n\n{punchline}\n\n😂😂😂\n\nTag temen yang kayak gini!",
    },
    "tutorial": {
        "educational": "📖 Tutorial: {title}\n\nStep 1: {step_1}\nStep 2: {step_2}\nStep 3: {step_3}\n\n💡 Pro tip: {tip}\n\nSave post ini buat referensi nanti! 💾",
        "hype": "GAK USAH BINGUNG LAGI!! 🔥\n\nCara {action} dalam {time}:\n\n{steps}\n\nSEMUANYA GRATIS!! Follow buat tips lainnya! ✨",
    },
    "user_testimonial": {
        "storytelling": "\"{testimonial_text}\"\n\n— {user_name}, {user_title}\n\nMakasih banyak kak {user_name}! 🙏\n\nMau coba juga? Link di bio 👇",
        "minimal": "\"{testimonial_text}\"\n\n— {user_name}\n\n🔗 Link in bio",
    },
    "weekly_recap": {
        "educational": "📊 Minggu ini di {brand}:\n\n🔹 {highlight_1}\n🔹 {highlight_2}\n🔹 {highlight_3}\n\nNext week: {upcoming}\n\nFollow biar gak ketinggalan! 📱",
        "hype": "RECAP MINGGU INI!! 📊🔥\n\n{highlights}\n\nNext week bakal lebih SERU lagi!! Stay tuned! 👀\n\n#weeklyrecap #update",
    },
    "giveaway": {
        "hype": "🎉🎉 GIVEAWAY TIME!! 🎉🎉\n\nKami mau bagi-bagi {prize} GRATIS!\n\nCara ikut:\n1️⃣ Follow @{account}\n2️⃣ Like post ini\n3️⃣ Tag {tag_count} temen\n4️⃣ Share ke story\n\n⏰ Berakhir: {deadline}\n🏆 Pemenang: {winner_count} orang\n\nGood luck! 🍀",
    },
}


def get_preset(category: str, style: str = "hype") -> str | None:
    """Get a preset caption template."""
    cat = PRESET_CAPTIONS.get(category)
    if not cat:
        return None
    return cat.get(style) or cat.get(list(cat.keys())[0])


def list_presets() -> list[dict]:
    """List all available presets."""
    return [
        {"category": cat, "styles": list(styles.keys())}
        for cat, styles in PRESET_CAPTIONS.items()
    ]
