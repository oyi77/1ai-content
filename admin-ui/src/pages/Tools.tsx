interface ToolItem {
  name: string;
  description: string;
  path: string;
  icon: string;
}

const TOOLS: ToolItem[] = [
  {
    name: "TTS Voice",
    description: "Generate text-to-speech audio",
    path: "/admin/react/tts",
    icon: "🗣️",
  },
  {
    name: "Music Generator",
    description: "Generate AI music tracks",
    path: "/admin/react/music",
    icon: "🎵",
  },
  {
    name: "CloakBrowser",
    description: "Manage CloakBrowser profiles and posting",
    path: "/admin/react/tools/cloak",
    icon: "🕶️",
  },
  {
    name: "Engagement",
    description: "Track social engagement metrics",
    path: "/admin/react/tools/engagement",
    icon: "📊",
  },
  {
    name: "Video Tools",
    description: "Video processing and editing tools",
    path: "/admin/react/tools/video-tools",
    icon: "🎬",
  },
  {
    name: "Storyboard",
    description: "Create storyboards from video content",
    path: "/admin/react/tools/storyboard",
    icon: "📋",
  },
  {
    name: "Fanpage Manager",
    description: "Manage Facebook fan pages",
    path: "/admin/react/tools/fanpage",
    icon: "📱",
  },
  {
    name: "Pinterest Scan",
    description: "Search and browse Pinterest content",
    path: "/admin/react/tools/pinterest",
    icon: "📌",
  },
  {
    name: "Ad Renderer",
    description: "Render ad creatives",
    path: "/admin/react/tools/render-ad",
    icon: "🖼️",
  },
  {
    name: "Prompts",
    description: "Manage AI prompt templates",
    path: "/admin/react/prompts",
    icon: "🤖",
  },
  {
    name: "Playground",
    description: "Test AI model interactions",
    path: "/admin/react/playground",
    icon: "🧪",
  },
  {
    name: "Broadcast",
    description: "Send broadcast messages to users",
    path: "/admin/broadcast",
    icon: "📢",
  },
];

export default function Tools() {
  return (
    <div>
      <p className="text-text-muted text-sm mb-6">
        Utility tools and configurations
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {TOOLS.map((tool) => (
          <a
            key={tool.name}
            href={tool.path}
            className="block bg-surface border border-border rounded-xl p-5 hover:border-accent/30 hover:bg-surface-hover transition-all group"
          >
            <div className="text-2xl mb-3">{tool.icon}</div>
            <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
              {tool.name}
            </h3>
            <p className="text-xs text-text-muted mt-1">
              {tool.description}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
