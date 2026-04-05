import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt = "Build Claude Code";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return [{ locale: "zh" }, { locale: "en" }];
}

const messages: Record<string, { title: string; subtitle: string; badge: string }> = {
  zh: {
    title: "从零构建企业级 AI Agent CLI",
    subtitle: "逐课拆解 Claude Code 源码架构",
    badge: "49 节课程",
  },
  en: {
    title: "Build an Enterprise AI Agent CLI",
    subtitle: "Lesson-by-lesson Claude Code deep dive",
    badge: "49 Lessons",
  },
};

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = messages[locale] ?? messages.zh;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px 80px",
          backgroundColor: "#09090b",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Logo area */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "40px" }}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M26 16A10 10 0 1 1 16 6"
              stroke="#a1a1aa"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <polyline
              points="16,2 16,6 20,6"
              stroke="#a1a1aa"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="11,13 15,16.5 11,20"
              stroke="#fafafa"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1="17"
              y1="20"
              x2="22"
              y2="20"
              stroke="#fafafa"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          <span style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Build Claude Code
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: "52px",
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.03em",
            marginBottom: "16px",
          }}
        >
          {t.title}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "24px",
            color: "#a1a1aa",
            marginBottom: "48px",
          }}
        >
          {t.subtitle}
        </div>

        {/* Code block */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#18181b",
            borderRadius: "12px",
            border: "1px solid #27272a",
            padding: "24px 28px",
            marginBottom: "40px",
            fontFamily: "monospace",
            fontSize: "18px",
            lineHeight: 1.7,
            whiteSpace: "pre",
          }}
        >
          <span style={{ color: "#d4d4d8" }}>
            <span style={{ color: "#c084fc" }}>while</span>
            {" ("}
            <span style={{ color: "#fb923c" }}>true</span>
            {") {"}
          </span>
          <span style={{ color: "#d4d4d8" }}>
            {"  response = "}
            <span style={{ color: "#c084fc" }}>await</span>
            {" client.messages."}
            <span style={{ color: "#60a5fa" }}>create</span>
            <span style={{ color: "#71717a" }}>{"({ messages, tools })"}</span>
          </span>
          <span style={{ color: "#d4d4d8" }}>
            {"  "}
            <span style={{ color: "#c084fc" }}>if</span>
            {" (stop_reason !== "}
            <span style={{ color: "#4ade80" }}>{'"tool_use"'}</span>
            {") "}
            <span style={{ color: "#c084fc" }}>break</span>
          </span>
          <span style={{ color: "#d4d4d8" }}>{"}"}</span>
        </div>

        {/* Bottom badges */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "#166534",
              color: "#bbf7d0",
              borderRadius: "9999px",
              padding: "6px 16px",
              fontSize: "15px",
              fontWeight: 600,
            }}
          >
            {t.badge}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "#1e3a5f",
              color: "#93c5fd",
              borderRadius: "9999px",
              padding: "6px 16px",
              fontSize: "15px",
              fontWeight: 600,
            }}
          >
            TypeScript 100%
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: "16px", color: "#71717a" }}>build.funagent.app</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
