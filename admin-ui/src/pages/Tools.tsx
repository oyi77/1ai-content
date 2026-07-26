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
    <div className="page">
      <h1>Tools</h1>
      <p className="page-subtitle">Utility tools and configurations</p>

      <section className="card-grid">
        {TOOLS.map((tool) => (
          <a
            key={tool.name}
            href={tool.path}
            className="card"
            style={{ textDecoration: "none" }}
          >
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
              {tool.icon}
            </div>
            <h3>{tool.name}</h3>
            <p style={{ color: "#666", margin: 0 }}>{tool.description}</p>
          </a>
        ))}
      </section>
    </div>
  );
}
