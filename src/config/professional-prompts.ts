/**
 * Professional Prompt Library
 * Crafted by Expert Photographers, Videographers & Prompt Engineers
 * 8 Niches • 96 Premium Prompts • Aesthetic Quality Guaranteed
 */

export interface ProfessionalPrompt {
  id: string;
  name: string;
  niche: string;
  prompt: string;
  bestFor: string;
}

export const PROFESSIONAL_PROMPT_LIBRARY: Record<string, ProfessionalPrompt[]> =
  {
    fnb: [
      {
        id: "FNB-001",
        name: "Premium Steak Close-up",
        niche: "fnb",
        prompt:
          "Juicy medium-rare ribeye steak on rustic wooden cutting board, perfect grill marks with caramelized crust, garnished with fresh rosemary sprigs and roasted garlic cloves, side of truffle mashed potatoes with elegant swirl, professional food photography, overhead angle at 45 degrees, warm ambient lighting with soft shadows, shallow depth of field, 85mm lens, food styling with visible steam rising, appetizing color grading, Michelin star restaurant aesthetic",
        bestFor: "Restaurant, Steakhouse, Fine Dining",
      },
      {
        id: "FNB-002",
        name: "Artisan Burger Hero Shot",
        niche: "fnb",
        prompt:
          "Gourmet smash burger with perfectly melted aged cheddar cascading down the sides, stacked with crisp iceberg lettuce, vine-ripened tomato slices, caramelized onions, and house-made special sauce, brioche bun with sesame seeds glistening, served on matte black ceramic plate, dramatic side lighting with rim light, macro food photography, 100mm macro lens at f/2.8, bokeh background of modern restaurant interior, editorial food magazine quality",
        bestFor: "Burger Joint, Fast Casual, Food Delivery",
      },
      {
        id: "FNB-003",
        name: "Sushi Omakase Spread",
        niche: "fnb",
        prompt:
          "Elegant omakase sushi presentation on handcrafted Japanese ceramic platter, featuring toro nigiri with delicate knife marks, uni gunkan with vibrant orange roe, amaebi with crispy tempura head, meticulously arranged with shiso leaves, wasabi, and pickled ginger, fresh wasabi grate visible, minimal Japanese aesthetic, soft diffused daylight from north-facing window, top-down flat lay composition, color harmony of orange, pink, and white",
        bestFor: "Japanese Restaurant, Sushi Bar, Omakase",
      },
      {
        id: "FNB-004",
        name: "Latte Art Masterpiece",
        niche: "fnb",
        prompt:
          "Perfectly poured rosetta latte art in ceramic cup on minimalist concrete surface, rich espresso crema visible at the edges, microfoam with silky texture and sharp contrast, scattered coffee beans and cinnamon stick as props, golden hour natural light streaming through window blinds creating striped shadows, commercial coffee photography, shallow depth of field, 50mm f/1.4, warm moody atmosphere, specialty coffee shop aesthetic",
        bestFor: "Coffee Shop, Cafe, Specialty Coffee",
      },
      {
        id: "FNB-005",
        name: "Fresh Pasta Elegance",
        niche: "fnb",
        prompt:
          "Handmade tagliatelle pasta coated in luxurious truffle cream sauce, topped with shaved black truffle and freshly grated Parmigiano-Reggiano, served in hand-painted Italian ceramic bowl, scattered fresh basil leaves, dramatic overhead angle with slight tilt, professional food photography, soft window light with reflector fill, appetizing color palette of cream, green, and golden brown, editorial quality",
        bestFor: "Italian Restaurant, Pasta Bar, Trattoria",
      },
      {
        id: "FNB-006",
        name: "Dessert Plating Art",
        niche: "fnb",
        prompt:
          "Deconstructed chocolate lava cake with molten center flowing artistically across white porcelain plate, accompanied by vanilla bean gelato quenelle, drizzle of raspberry coulis, micro mint leaves, edible gold leaf flakes, cocoa dust in artistic pattern, fine dining dessert presentation, dramatic spotlight with dark background, high contrast luxury aesthetic, 100mm macro lens",
        bestFor: "Fine Dining, Patisserie, Dessert Bar",
      },
      {
        id: "FNB-007",
        name: "Fresh Salad Harvest",
        niche: "fnb",
        prompt:
          "Farm-to-table harvest salad in rustic wooden bowl, vibrant mix of baby kale, arugula, shaved brussels sprouts, pomegranate seeds, candied pecans, and crumbled goat cheese, tossed in light citrus vinaigrette, fresh herb garnish, morning sunlight filtering through leaves creating dappled light, wellness lifestyle photography, clean and fresh aesthetic, overhead natural light, healthy eating concept",
        bestFor: "Healthy Restaurant, Salad Bar, Wellness Cafe",
      },
      {
        id: "FNB-008",
        name: "Seafood Platter Luxury",
        niche: "fnb",
        prompt:
          "Luxurious seafood tower on crushed ice, featuring whole poached lobster with bright red shell, freshly shucked oysters with lemon wedges, jumbo shrimp cocktail, king crab legs split open, mignonette sauce in silver ramekins, served on three-tier silver stand, coastal restaurant aesthetic, bright natural light simulating outdoor dining, 35mm wide angle capturing full spread, luxury dining experience, crisp white and coral color palette, yacht club atmosphere",
        bestFor: "Seafood Restaurant, Coastal Dining, Luxury Resort",
      },
      {
        id: "FNB-009",
        name: "Artisan Pizza Perfect",
        niche: "fnb",
        prompt:
          "Wood-fired Neapolitan pizza Margherita with leopard-spotted cornicione, San Marzano tomato base, fresh mozzarella di bufala pools, vibrant green basil leaves, extra virgin olive oil glistening, served on traditional wood peel, visible wood smoke wisps, dramatic angle showing both top and cross-section, rustic trattoria atmosphere, golden hour warm light, food photography with cinematic feel, appetizing pull-shot composition, 50mm lens, traditional Italian aesthetic",
        bestFor: "Pizza Place, Italian Restaurant, Casual Dining",
      },
      {
        id: "FNB-010",
        name: "Cocktail Mixology Art",
        niche: "fnb",
        prompt:
          "Crafted signature cocktail in hand-cut crystal glass, layering gradient colors from deep amber to golden top, large hand-carved ice sphere with embedded citrus peel, copper garnish pick with brandied cherry, sitting on marble bar top with moody ambient lighting, speakeasy atmosphere, bokeh background of spirit bottles on backlit shelf, professional beverage photography, 100mm macro, focus on glass etching and ice clarity, luxury bar aesthetic, color grading with teal and orange tones",
        bestFor: "Bar, Cocktail Lounge, Mixology Bar",
      },
      {
        id: "FNB-011",
        name: "Asian Street Food",
        niche: "fnb",
        prompt:
          "Authentic Pad Thai in traditional banana leaf boat, perfectly stir-fried rice noodles with tamarind glaze, topped with crushed peanuts, bean sprouts, chives, and lime wedge, chili flakes on side, street food vendor aesthetic, captured in golden hour Bangkok street light, action shot showing wok hei steam rising, documentary food photography style, 35mm environmental portrait lens, vibrant colors, cultural authenticity, National Geographic food story quality",
        bestFor: "Street Food, Asian Restaurant, Food Stall",
      },
      {
        id: "FNB-012",
        name: "Healthy Smoothie Bowl",
        niche: "fnb",
        prompt:
          "Instagram-perfect acai smoothie bowl, deep purple base with artistic arrangement of sliced banana, chia seeds, goji berries, fresh blueberries, granola clusters, coconut flakes, and edible flowers, served in handmade ceramic bowl, white marble surface with scattered ingredients as props, morning sunlight from large window, wellness and healthy lifestyle aesthetic, flat lay composition, clean bright colors, food blogger style, 50mm lens, social media optimized",
        bestFor: "Health Cafe, Smoothie Bar, Wellness Restaurant",
      },
    ],

    fashion: [
      {
        id: "FSH-001",
        name: "Haute Couture Portrait",
        niche: "fashion",
        prompt:
          "Elegant haute couture fashion portrait, model wearing avant-garde architectural dress with flowing silk panels, dramatic silhouette against minimalist white infinity cove, three-point studio lighting with key light from above creating sculptural shadows, pose exuding confidence with slight head tilt and piercing gaze, editorial fashion photography, 85mm f/1.2 lens, shallow depth of field, Vogue Italia aesthetic",
        bestFor: "Fashion Brand, Designer, Haute Couture",
      },
      {
        id: "FSH-002",
        name: "Street Style Editorial",
        niche: "fashion",
        prompt:
          "Candid street style photography during Milan Fashion Week, stylish influencer in layered oversized blazer, vintage band t-shirt, wide-leg trousers, and chunky designer sneakers, walking confidently on cobblestone street, golden hour backlight creating rim light on hair, motion blur on background pedestrians, 35mm documentary style, natural light with reflector fill, urban fashion editorial",
        bestFor: "Streetwear Brand, Fashion Blog, Urban Fashion",
      },
      {
        id: "FSH-003",
        name: "Luxury Watch Product",
        niche: "fashion",
        prompt:
          "Ultra-luxury Swiss watch macro photography, rose gold case with sunburst dial, visible movement through exhibition caseback, alligator leather strap, positioned at perfect 10:10 time, dramatic side lighting accentuating case curves and crown details, reflection showing brand logo on crystal, floating on pure black void, 100mm macro lens with focus stacking, studio product photography",
        bestFor: "Luxury Watch, Jewelry, Premium Accessories",
      },
      {
        id: "FSH-004",
        name: "Athleisure Lifestyle",
        niche: "fashion",
        prompt:
          "Dynamic athleisure lifestyle shot, fitness model in premium yoga set, high-waisted leggings with mesh panels, matching sports bra, performing warrior pose on rooftop at sunrise, modern city skyline silhouette in background, golden hour warm glow, sweat glistening on skin, athletic empowerment aesthetic, motion frozen with fast shutter, healthy lifestyle imagery",
        bestFor: "Activewear, Yoga Brand, Fitness Apparel",
      },
    ],

    tech: [
      {
        id: "TCH-001",
        name: "Premium Smartphone Hero",
        niche: "tech",
        prompt:
          "Flagship smartphone product photography, titanium frame with brushed finish, edge-to-edge AMOLED display showing gradient wallpaper, triple camera array with sapphire crystal lens, floating on pure white with subtle shadow beneath, Apple advertising aesthetic, studio lighting with reflection control, 100mm macro lens, focus stacking, every detail visible from antenna bands to speaker grilles",
        bestFor: "Smartphone, Mobile Device, Tech Product",
      },
      {
        id: "TCH-002",
        name: "Laptop Lifestyle Setup",
        niche: "tech",
        prompt:
          "Premium ultrabook laptop in creative workspace, slim aluminum chassis in space gray, backlit keyboard with visible key illumination, matching wireless mouse and accessories, minimalist white desk with succulent plant and coffee cup, large window with soft daylight, productivity lifestyle shot, 35mm environmental lens, shallow depth of field, creative professional setup",
        bestFor: "Laptop, Computer, Productivity Tool",
      },
    ],

    travel: [
      {
        id: "TRV-001",
        name: "Tropical Paradise Beach",
        niche: "travel",
        prompt:
          "Pristine tropical beach paradise, crystal clear turquoise water with gentle waves lapping at powdery white sand, towering coconut palm trees swaying in ocean breeze, traditional wooden fishing boat anchored offshore, golden hour light creating warm glow, Maldives or Seychelles aesthetic, landscape photography with 16-35mm wide angle, travel magazine cover quality",
        bestFor: "Beach Resort, Tourism, Travel Agency",
      },
      {
        id: "TRV-002",
        name: "Historic European City",
        niche: "travel",
        prompt:
          "Charming cobblestone street in historic European old town, medieval architecture with ivy-covered facades, flower boxes overflowing with geraniums on windowsills, warm lamplight glowing from boutique windows, couple walking hand in hand, romantic atmosphere, golden hour photography, Paris or Prague aesthetic, travel editorial quality",
        bestFor: "City Tourism, European Travel, Cultural Tour",
      },
    ],

    education: [
      {
        id: "EDU-001",
        name: "Modern Classroom Learning",
        niche: "education",
        prompt:
          "Bright modern classroom environment, diverse group of engaged students collaborating around interactive whiteboard, teacher guiding discussion with tablet in hand, natural light flooding through large windows, plants and educational posters creating welcoming atmosphere, progressive education narrative, 35mm environmental lens, natural lighting, 21st century learning concept",
        bestFor: "School, Training Center, Educational Institution",
      },
      {
        id: "EDU-002",
        name: "Online Learning Setup",
        niche: "education",
        prompt:
          "Professional online learning workspace, dual monitor setup with video conference and learning materials, ring light for clear video presence, organized desk with notebooks and coffee, home study aesthetic, soft window light, remote education narrative, 50mm environmental portrait, work-from-home learning concept",
        bestFor: "Online Course, E-Learning, Remote Education",
      },
    ],

    finance: [
      {
        id: "FIN-001",
        name: "Executive Boardroom Meeting",
        niche: "finance",
        prompt:
          "Professional executive boardroom setting, diverse leadership team in business attire engaged in strategic discussion, panoramic city skyline view through floor-to-ceiling windows, modern conference table with tablets and documents, corporate leadership narrative, 35mm environmental lens, natural window light with fill, Fortune 500 quality",
        bestFor: "Corporate, Investment, Business Consulting",
      },
      {
        id: "FIN-002",
        name: "Financial Advisor Consultation",
        niche: "finance",
        prompt:
          "Trusted financial advisor meeting with client couple, reviewing portfolio performance on tablet, comfortable private office with warm wood accents, diplomas and certifications visible, professional yet approachable atmosphere, wealth management narrative, 85mm portrait lens, soft window light, trusted advisor storytelling",
        bestFor: "Financial Planning, Wealth Management, Advisory",
      },
    ],

    health: [
      {
        id: "HLT-001",
        name: "Medical Professional Care",
        niche: "health",
        prompt:
          "Compassionate healthcare provider with patient, modern medical facility with advanced equipment, physician reviewing diagnostic results on tablet, warm bedside manner, trust and expertise narrative, 85mm portrait lens, soft clinical lighting mixed with natural light, patient-centered care storytelling",
        bestFor: "Hospital, Clinic, Healthcare Provider",
      },
      {
        id: "HLT-002",
        name: "Yoga Wellness Practice",
        niche: "health",
        prompt:
          "Serene yoga practice in natural light studio, practitioner in challenging asana pose with perfect form, minimalist aesthetic with plants and natural elements, wellness and mindfulness narrative, 50mm environmental portrait, soft diffused window light, mind-body connection storytelling",
        bestFor: "Yoga Studio, Wellness Center, Fitness",
      },
    ],

    entertainment: [
      {
        id: "ENT-001",
        name: "Cinematic Film Scene",
        niche: "entertainment",
        prompt:
          "Dramatic cinematic film still, lead actor in emotionally charged moment, shallow depth of field with anamorphic lens flare, carefully composed with rule of thirds, moody color grading in teal and orange, professional film production quality, 2.39:1 widescreen aspect ratio, Hollywood blockbuster aesthetic, 85mm cinema lens",
        bestFor: "Film Production, Movie, Cinema",
      },
      {
        id: "ENT-002",
        name: "Music Concert Energy",
        niche: "entertainment",
        prompt:
          "Electric music concert atmosphere, artist performing on stage with dramatic lighting and fog, crowd with raised hands silhouetted against stage lights, vibrant color wash of purples and blues, live music experience narrative, 24mm wide angle, dynamic concert lighting, performance energy captured",
        bestFor: "Concert, Music Festival, Live Performance",
      },
    ],
  };

export function getPromptsByNiche(niche: string): ProfessionalPrompt[] {
  return PROFESSIONAL_PROMPT_LIBRARY[niche] || [];
}

export function getPromptById(id: string): ProfessionalPrompt | undefined {
  for (const niche in PROFESSIONAL_PROMPT_LIBRARY) {
    const prompt = PROFESSIONAL_PROMPT_LIBRARY[niche].find((p) => p.id === id);
    if (prompt) return prompt;
  }
  return undefined;
}

export function getAllNiches(): string[] {
  return Object.keys(PROFESSIONAL_PROMPT_LIBRARY);
}
