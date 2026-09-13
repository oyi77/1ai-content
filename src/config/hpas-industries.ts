// HPAS industry templates (split from hpas-engine.ts — re-exported there).

import type { IndustryId, IndustryTemplate } from "./hpas-types";

// ── Industry Templates ────────────────────────────────────────────────────────

export const INDUSTRY_TEMPLATES: Record<IndustryId, IndustryTemplate> = {
  beauty: {
    id: "beauty",
    name: "Beauty & Skincare",
    nameId: "Kecantikan & Skincare",
    description: "Skincare, makeup, perawatan wajah, produk kecantikan",
    colorPalette: ["#F8E8EE", "#FFB6C1", "#D4A5A5", "#8B4F6B", "#FFF0F5"],
    scenes: [
      {
        sceneId: "hook",
        promptId: "beauty_hook",
        promptEn:
          "Extreme close-up of skin texture — pores, texture, imperfections visible. High contrast beauty lighting.",
        promptId_lang:
          "Close-up ekstrem tekstur kulit — pori-pori dan bekas jerawat terlihat jelas. Pencahayaan beauty yang dramatis.",
        visualStyle: "Ultra macro beauty photography",
        lighting: "High contrast single source",
        mood: "Intriguing, slightly uncomfortable",
      },
      {
        sceneId: "problem",
        promptId: "beauty_problem",
        promptEn:
          "Woman looking frustrated in bathroom mirror, touching problematic skin, desaturated warm tones.",
        promptId_lang:
          "Wanita menatap cermin kamar mandi dengan ekspresi frustrasi, menyentuh kulit bermasalah, warna desaturasi hangat.",
        visualStyle: "Lifestyle documentary",
        lighting: "Natural bathroom window light",
        mood: "Frustration, recognition",
      },
      {
        sceneId: "agitate",
        promptId: "beauty_agitate",
        promptEn:
          "Extreme close-up of skin problem — dark spots, uneven tone, under harsh lighting. Tense dark atmosphere.",
        promptId_lang:
          "Close-up ekstrem masalah kulit — noda gelap, warna tidak merata, pencahayaan keras. Atmosfer tegang dan gelap.",
        visualStyle: "Harsh clinical close-up",
        lighting: "Harsh overhead light",
        mood: "Urgency, anxiety",
      },
      {
        sceneId: "discovery",
        promptId: "beauty_discovery",
        promptEn:
          "Elegant skincare product on white marble surface, soft golden light, hand reaching to pick it up. Light, airy, hopeful.",
        promptId_lang:
          "Produk skincare elegan di permukaan marmer putih, cahaya emas lembut, tangan meraih produk. Terang, ringan, penuh harapan.",
        visualStyle: "Luxury product photography",
        lighting: "Soft golden hour",
        mood: "Hope, elegance, relief",
      },
      {
        sceneId: "interaction",
        promptId: "beauty_interaction",
        promptEn:
          "Woman applying serum to glowing skin, gentle massage motion, warm natural lighting. Authentic, natural moment.",
        promptId_lang:
          "Wanita mengaplikasikan serum ke kulit bercahaya, gerakan pijat lembut, pencahayaan alami hangat. Momen autentik dan natural.",
        visualStyle: "Natural lifestyle beauty",
        lighting: "Warm natural window light",
        mood: "Desire, engagement, care",
      },
      {
        sceneId: "result",
        promptId: "beauty_result",
        promptEn:
          "Close-up of glowing, radiant skin — smooth texture, even tone, dewy finish. Woman smiling confidently. High vibrancy.",
        promptId_lang:
          "Close-up kulit bercahaya — tekstur halus, warna merata, tampak segar. Wanita tersenyum percaya diri. Saturasi tinggi.",
        visualStyle: "High vibrancy beauty",
        lighting: "Bright even lighting with warmth",
        mood: "Transformation, confidence, satisfaction",
      },
      {
        sceneId: "cta",
        promptId: "beauty_cta",
        promptEn:
          'Product centered on clean pink/white background, price tag visible, "Order Sekarang" text overlay. Brand colors.',
        promptId_lang:
          'Produk di tengah background merah muda/putih bersih, harga terlihat, teks "Order Sekarang". Warna brand.',
        visualStyle: "Clean product end card",
        lighting: "Even studio light",
        mood: "Action, confidence, decision",
      },
    ],
  },

  food: {
    id: "food",
    name: "Food & Culinary",
    nameId: "Makanan & Kuliner",
    description: "Restoran, kafe, makanan jadi, minuman, katering",
    colorPalette: ["#FFF8DC", "#FF6B35", "#F7C59F", "#3D5A80", "#E8B86D"],
    scenes: [
      {
        sceneId: "hook",
        promptId: "food_hook",
        promptEn:
          "Extreme close-up of food — steam rising, sizzling, cheese pull, or perfect pour. Dramatic food lighting.",
        promptId_lang:
          "Close-up ekstrem makanan — uap mengepul, mendesis, keju meleleh, atau minuman dituang. Pencahayaan makanan dramatis.",
        visualStyle: "Food macro photography",
        lighting: "Side backlight for steam/texture",
        mood: "Temptation, appetite trigger",
      },
      {
        sceneId: "problem",
        promptId: "food_problem",
        promptEn:
          "Person looking bored at plain/unappealing meal, scrolling phone while eating, uninspired expression.",
        promptId_lang:
          "Orang menatap makanan biasa dengan ekspresi bosan, main hp sambil makan, kurang bersemangat.",
        visualStyle: "Relatable everyday dining",
        lighting: "Flat neutral light",
        mood: "Boredom, dissatisfaction",
      },
      {
        sceneId: "agitate",
        promptId: "food_agitate",
        promptEn:
          "Failed cooking attempt — burnt food, messy kitchen, wasted ingredients. Frustration and time wasted.",
        promptId_lang:
          "Percobaan masak yang gagal — makanan gosong, dapur berantakan, bahan terbuang. Frustrasi dan waktu terbuang.",
        visualStyle: "Kitchen disaster documentary",
        lighting: "Unflattering overhead",
        mood: "Urgency, wasted effort",
      },
      {
        sceneId: "discovery",
        promptId: "food_discovery",
        promptEn:
          "Beautiful food plating revealed — professional restaurant quality, steam rising, perfect presentation. Wow moment.",
        promptId_lang:
          "Sajian makanan indah terungkap — kualitas restoran profesional, uap mengepul, presentasi sempurna. Momen wow.",
        visualStyle: "Professional food photography",
        lighting: "Perfect food lighting",
        mood: "Wow, delight, hunger",
      },
      {
        sceneId: "interaction",
        promptId: "food_interaction",
        promptEn:
          "Chef/person preparing the food — skilled hands, beautiful ingredients, cooking process. Authentic behind-the-scenes.",
        promptId_lang:
          "Chef/orang mempersiapkan makanan — tangan terampil, bahan-bahan indah, proses memasak. Autentik di balik layar.",
        visualStyle: "Kitchen process documentary",
        lighting: "Warm kitchen light",
        mood: "Craft, desire, engagement",
      },
      {
        sceneId: "result",
        promptId: "food_result",
        promptEn:
          "Happy family/friends eating together, big smiles, thumbs up. Beautiful table setting, joy and satisfaction.",
        promptId_lang:
          "Keluarga/teman makan bersama bahagia, senyum lebar, jempol atas. Meja makan indah, sukacita dan kepuasan.",
        visualStyle: "Joyful lifestyle dining",
        lighting: "Warm golden lifestyle",
        mood: "Joy, satisfaction, togetherness",
      },
      {
        sceneId: "cta",
        promptId: "food_cta",
        promptEn:
          'Hero food shot centered, price + menu visible, "Pesan Sekarang" or "Kunjungi Kami". Brand restaurant colors.',
        promptId_lang:
          'Foto makanan hero di tengah, harga + menu terlihat, "Pesan Sekarang" atau "Kunjungi Kami". Warna brand restoran.',
        visualStyle: "Restaurant end card",
        lighting: "Appetizing product light",
        mood: "Decision, appetite, action",
      },
    ],
  },

  fashion: {
    id: "fashion",
    name: "Fashion & Lifestyle",
    nameId: "Fashion & Gaya Hidup",
    description: "Pakaian, tas, sepatu, aksesori, fashion online",
    colorPalette: ["#1A1A2E", "#16213E", "#0F3460", "#E94560", "#FFFFFF"],
    scenes: [
      {
        sceneId: "hook",
        promptId: "fashion_hook",
        promptEn:
          "Fashion model walking confidently toward camera, dramatic outfit reveal, high fashion lighting. Power pose.",
        promptId_lang:
          "Model fashion berjalan percaya diri ke arah kamera, reveal outfit dramatis, pencahayaan high fashion. Pose power.",
        visualStyle: "High fashion editorial",
        lighting: "Dramatic high contrast",
        mood: "Confidence, intrigue, power",
      },
      {
        sceneId: "problem",
        promptId: "fashion_problem",
        promptEn:
          'Person standing in front of full wardrobe, overwhelmed, "nothing to wear" expression. Clothes everywhere.',
        promptId_lang:
          'Orang berdiri di depan lemari penuh, kewalahan, ekspresi "tidak ada yang cocok dipakai". Baju berserakan.',
        visualStyle: "Relatable wardrobe chaos",
        lighting: "Flat bedroom light",
        mood: "Overwhelm, fashion crisis",
      },
      {
        sceneId: "agitate",
        promptId: "fashion_agitate",
        promptEn:
          "Late for event, outfit not working, rushing, stress. Clock visible. Outfit embarrassment scenario.",
        promptId_lang:
          "Telat ke acara, outfit tidak cocok, terburu-buru, stres. Jam terlihat. Skenario memalukan karena penampilan.",
        visualStyle: "Stress lifestyle documentary",
        lighting: "Harsh rushed lighting",
        mood: "Urgency, style anxiety",
      },
      {
        sceneId: "discovery",
        promptId: "fashion_discovery",
        promptEn:
          "Beautiful fashion item revealed from box — unboxing moment, tissue paper, product in elegant packaging.",
        promptId_lang:
          "Item fashion indah terungkap dari kotak — momen unboxing, kertas tissue, produk dalam kemasan elegan.",
        visualStyle: "Luxury unboxing",
        lighting: "Soft elegant light",
        mood: "Excitement, hope, desire",
      },
      {
        sceneId: "interaction",
        promptId: "fashion_interaction",
        promptEn:
          "Person trying on outfit, looking in mirror, smiling with approval. Trying different looks, confident.",
        promptId_lang:
          "Orang mencoba outfit, berkaca, tersenyum puas. Mencoba berbagai tampilan, percaya diri.",
        visualStyle: "Authentic try-on lifestyle",
        lighting: "Natural mirror light",
        mood: "Desire, self-discovery",
      },
      {
        sceneId: "result",
        promptId: "fashion_result",
        promptEn:
          "Complete polished look — person walking confidently in public, compliments, heads turning. Style transformation complete.",
        promptId_lang:
          "Tampilan lengkap dan rapi — orang berjalan percaya diri di tempat umum, mendapat pujian, semua melirik. Transformasi style selesai.",
        visualStyle: "Aspirational lifestyle",
        lighting: "Golden hour outdoor",
        mood: "Confidence, aspiration, transformation",
      },
      {
        sceneId: "cta",
        promptId: "fashion_cta",
        promptEn:
          'Fashion item on minimal background, price, sizes available, "Shop Now" / "Order via DM". Clean brand aesthetic.',
        promptId_lang:
          'Item fashion di background minimal, harga, ukuran tersedia, "Beli Sekarang" / "Order via DM". Estetika brand bersih.',
        visualStyle: "Minimal fashion end card",
        lighting: "Clean studio",
        mood: "Action, style, decision",
      },
    ],
  },

  tech: {
    id: "tech",
    name: "Tech & Gadgets",
    nameId: "Teknologi & Gadget",
    description: "Smartphone, laptop, aksesori tech, software, gadget",
    colorPalette: ["#0A0A0A", "#1E1E2E", "#00B4D8", "#48CAE4", "#FFFFFF"],
    scenes: [
      {
        sceneId: "hook",
        promptId: "tech_hook",
        promptEn:
          "Sleek device powering on, LED glow, unboxing reveal. Dark dramatic background, blue-white tech lighting.",
        promptId_lang:
          "Perangkat ramping menyala, cahaya LED, reveal unboxing. Background gelap dramatis, pencahayaan tech biru-putih.",
        visualStyle: "Premium tech product shot",
        lighting: "Dark background with LED accent",
        mood: "Intrigue, innovation, power",
      },
      {
        sceneId: "problem",
        promptId: "tech_problem",
        promptEn:
          "Person frustrated with slow/old device, spinning loading icon, missed deadline. Stress and wasted time.",
        promptId_lang:
          "Orang frustrasi dengan perangkat lambat/lama, ikon loading berputar, deadline terlewat. Stres dan waktu terbuang.",
        visualStyle: "Tech frustration documentary",
        lighting: "Screen glow only, frustrated",
        mood: "Frustration, time waste",
      },
      {
        sceneId: "agitate",
        promptId: "tech_agitate",
        promptEn:
          "Device crash at critical moment — presentation about to start, data loss, battery dying. Critical failure close-up.",
        promptId_lang:
          "Perangkat crash di momen kritis — presentasi akan dimulai, data hilang, baterai habis. Close-up kegagalan kritis.",
        visualStyle: "Critical tech failure",
        lighting: "Red/warning light accent",
        mood: "Urgency, critical failure anxiety",
      },
      {
        sceneId: "discovery",
        promptId: "tech_discovery",
        promptEn:
          "New device reveal in stylish box, unboxing, product glowing in hands. Premium packaging, anticipation.",
        promptId_lang:
          "Reveal perangkat baru dalam kotak stylish, unboxing, produk bercahaya di tangan. Kemasan premium, antisipasi.",
        visualStyle: "Premium tech unboxing",
        lighting: "Soft premium backlight",
        mood: "Excitement, innovation, hope",
      },
      {
        sceneId: "interaction",
        promptId: "tech_interaction",
        promptEn:
          "Person using device effortlessly — fast typing, smooth scrolling, feature demo. Speed and responsiveness visible.",
        promptId_lang:
          "Orang menggunakan perangkat dengan mudah — ketik cepat, scroll mulus, demo fitur. Kecepatan dan responsivitas terlihat.",
        visualStyle: "Tech usage lifestyle",
        lighting: "Clean office/home setup",
        mood: "Capability, desire, efficiency",
      },
      {
        sceneId: "result",
        promptId: "tech_result",
        promptEn:
          "Person finishing work efficiently, relaxed and happy. Productivity achieved, project done, satisfied smile.",
        promptId_lang:
          "Orang menyelesaikan pekerjaan efisien, santai dan bahagia. Produktivitas tercapai, proyek selesai, senyum puas.",
        visualStyle: "Productivity success lifestyle",
        lighting: "Bright productive environment",
        mood: "Success, efficiency, satisfaction",
      },
      {
        sceneId: "cta",
        promptId: "tech_cta",
        promptEn:
          'Device centered on dark background, specs visible, price, "Beli Sekarang" / "Dapatkan Sekarang". Tech brand colors.',
        promptId_lang:
          'Perangkat di tengah background gelap, spesifikasi terlihat, harga, "Beli Sekarang" / "Dapatkan Sekarang". Warna brand tech.',
        visualStyle: "Dark tech end card",
        lighting: "Dark background LED accent",
        mood: "Action, innovation, decision",
      },
    ],
  },

  fitness: {
    id: "fitness",
    name: "Fitness & Health",
    nameId: "Kebugaran & Kesehatan",
    description: "Gym, suplemen, alat olahraga, program diet, kesehatan",
    colorPalette: ["#1A1A1A", "#FF4500", "#FF6B35", "#2ECC71", "#FFFFFF"],
    scenes: [
      {
        sceneId: "hook",
        promptId: "fitness_hook",
        promptEn:
          "Impressive workout clip — athlete performing feat, body transformation tease, dynamic motion. High energy.",
        promptId_lang:
          "Klip olahraga mengesankan — atlet melakukan gerakan, tease transformasi tubuh, gerakan dinamis. Energi tinggi.",
        visualStyle: "High energy sports photography",
        lighting: "Dramatic gym lighting",
        mood: "Inspiration, aspiration, energy",
      },
      {
        sceneId: "problem",
        promptId: "fitness_problem",
        promptEn:
          "Out of breath climbing stairs, clothes not fitting, tired face. Sedentary lifestyle visible. Low energy relatable.",
        promptId_lang:
          "Ngos-ngosan naik tangga, baju tidak muat, wajah lelah. Gaya hidup sedentari terlihat. Energi rendah yang relatable.",
        visualStyle: "Relatable health struggle",
        lighting: "Flat natural light",
        mood: "Struggle, recognition, motivation needed",
      },
      {
        sceneId: "agitate",
        promptId: "fitness_agitate",
        promptEn:
          "Mirror showing unflattering angle, scale with high number, doctor warning. Consequences of unhealthy lifestyle.",
        promptId_lang:
          "Cermin menunjukkan sudut yang tidak menyenangkan, timbangan angka tinggi, peringatan dokter. Konsekuensi gaya hidup tidak sehat.",
        visualStyle: "Reality check close-up",
        lighting: "Harsh confrontational light",
        mood: "Urgency, health anxiety, wake-up call",
      },
      {
        sceneId: "discovery",
        promptId: "fitness_discovery",
        promptEn:
          "Fitness product/supplement reveal — sleek packaging, natural ingredients, professional presentation.",
        promptId_lang:
          "Reveal produk fitness/suplemen — kemasan ramping, bahan alami, presentasi profesional.",
        visualStyle: "Health product hero shot",
        lighting: "Clean bright product light",
        mood: "Hope, solution found, energy",
      },
      {
        sceneId: "interaction",
        promptId: "fitness_interaction",
        promptEn:
          "Person working out using product — exercise demo, supplement usage, transformation in progress. Authentic movement.",
        promptId_lang:
          "Orang berolahraga menggunakan produk — demo latihan, penggunaan suplemen, transformasi sedang berlangsung. Gerakan autentik.",
        visualStyle: "Authentic fitness documentary",
        lighting: "Natural gym/outdoor light",
        mood: "Action, capability, desire",
      },
      {
        sceneId: "result",
        promptId: "fitness_result",
        promptEn:
          "Body transformation reveal — before/after implied, confident pose, energy visible, healthy glow. Achievement unlocked.",
        promptId_lang:
          "Reveal transformasi tubuh — sebelum/sesudah tersirat, pose percaya diri, energi terlihat, kilau sehat. Pencapaian terbuka.",
        visualStyle: "Transformation aspirational",
        lighting: "Golden ratio hero shot",
        mood: "Transformation, confidence, achievement",
      },
      {
        sceneId: "cta",
        promptId: "fitness_cta",
        promptEn:
          'Product centered, results mentioned, price/offer visible. "Mulai Sekarang" / "Coba 30 Hari". Energy brand colors.',
        promptId_lang:
          'Produk di tengah, hasil disebutkan, harga/penawaran terlihat. "Mulai Sekarang" / "Coba 30 Hari". Warna brand energi.',
        visualStyle: "Motivational end card",
        lighting: "Energetic bright",
        mood: "Action, motivation, decision",
      },
    ],
  },

  general: {
    id: "general",
    name: "General",
    nameId: "Umum",
    description: "Template umum untuk semua jenis produk",
    colorPalette: ["#FFFFFF", "#F5F5F5", "#333333", "#007AFF", "#FF9500"],
    scenes: [
      {
        sceneId: "hook",
        promptId: "general_hook",
        promptEn:
          "Intriguing product close-up from unexpected angle. High contrast, clean background, attention-grabbing composition.",
        promptId_lang:
          "Close-up produk menarik dari sudut yang tidak terduga. Kontras tinggi, background bersih, komposisi eye-catching.",
        visualStyle: "Clean product macro",
        lighting: "High contrast studio",
        mood: "Curiosity, intrigue",
      },
      {
        sceneId: "problem",
        promptId: "general_problem",
        promptEn:
          "Person dealing with everyday frustration related to the product category. Relatable struggle, desaturated.",
        promptId_lang:
          "Orang menghadapi frustrasi sehari-hari terkait kategori produk. Perjuangan yang relatable, warna desaturasi.",
        visualStyle: "Everyday documentary",
        lighting: "Natural desaturated",
        mood: "Recognition, frustration",
      },
      {
        sceneId: "agitate",
        promptId: "general_agitate",
        promptEn:
          "Problem intensified — consequences visible, urgency implied. Close-up on pain point. Dramatic lighting.",
        promptId_lang:
          "Masalah dipertegas — konsekuensi terlihat, urgensi tersirat. Close-up pada pain point. Pencahayaan dramatis.",
        visualStyle: "Problem intensification",
        lighting: "Dramatic shadow",
        mood: "Urgency, need for solution",
      },
      {
        sceneId: "discovery",
        promptId: "general_discovery",
        promptEn:
          "Product revealed as solution — clean presentation, hero shot, bright hopeful lighting. Product is the answer.",
        promptId_lang:
          "Produk terungkap sebagai solusi — presentasi bersih, hero shot, pencahayaan terang penuh harapan. Produk adalah jawabannya.",
        visualStyle: "Product hero revelation",
        lighting: "Bright clean hopeful",
        mood: "Relief, hope, discovery",
      },
      {
        sceneId: "interaction",
        promptId: "general_interaction",
        promptEn:
          "Person using product in natural setting. Hands-on usage, authentic moment, product integrated into life.",
        promptId_lang:
          "Orang menggunakan produk dalam setting natural. Penggunaan hands-on, momen autentik, produk terintegrasi dalam kehidupan.",
        visualStyle: "Authentic usage lifestyle",
        lighting: "Natural warm",
        mood: "Desire, engagement, natural fit",
      },
      {
        sceneId: "result",
        promptId: "general_result",
        promptEn:
          "Happy person with solved problem. Before state vs after implied. Satisfied, confident, life improved.",
        promptId_lang:
          "Orang bahagia dengan masalah yang teratasi. Kondisi sebelum vs sesudah tersirat. Puas, percaya diri, hidup membaik.",
        visualStyle: "Aspirational after state",
        lighting: "Bright vibrant",
        mood: "Satisfaction, transformation, aspiration",
      },
      {
        sceneId: "cta",
        promptId: "general_cta",
        promptEn:
          "Product on clean background, price visible, clear call to action text. Brand colors. Professional end card.",
        promptId_lang:
          "Produk di background bersih, harga terlihat, teks ajakan bertindak yang jelas. Warna brand. End card profesional.",
        visualStyle: "Professional end card",
        lighting: "Clean even",
        mood: "Action, confidence, decision",
      },
    ],
  },
};
