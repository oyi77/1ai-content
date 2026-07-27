interface ToolItem {
  name: string;
  description: string;
  path: string;
  icon: string;
}

const TOOLS: ToolItem[] = [
  {
    name: "Prompts",
    description: "Manage AI prompt templates",
    path: "/admin/react/prompts",
    icon: "🤖",
  },
  {
    name: "Medias",
    description: "Browse and manage media uploads",
    path: "/admin/react/medias",
    icon: "🎬",
  },
  {
    name: "Trending",
    description: "View trending content research data",
    path: "/admin/react/trending",
    icon: "🔥",
  },
  {
    name: "Playground",
    description: "Test AI model interactions",
    path: "/admin/playground",
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
