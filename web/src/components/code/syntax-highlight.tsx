import React from "react";

const TS_KEYWORDS = new Set([
  "import", "export", "from", "const", "let", "var", "function", "return",
  "if", "else", "while", "for", "of", "in", "new", "class", "extends",
  "async", "await", "try", "catch", "throw", "switch", "case", "break",
  "continue", "default", "type", "interface", "typeof", "instanceof",
  "true", "false", "null", "undefined", "void", "this", "super",
]);

export function highlightLine(line: string): React.ReactNode[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/**")) {
    return [<span key={0} className="text-zinc-500 italic">{line}</span>];
  }
  const parts = line.split(
    /(\b(?:import|export|from|const|let|var|function|return|if|else|while|for|of|in|new|class|extends|async|await|try|catch|throw|switch|case|break|continue|default|type|interface|typeof|instanceof|true|false|null|undefined|void|this|super)\b|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$|\b\d+(?:\.\d+)?\b)/
  );
  return parts.map((part, idx) => {
    if (!part) return null;
    if (TS_KEYWORDS.has(part)) return <span key={idx} className="text-blue-400 font-medium">{part}</span>;
    if (part.startsWith("//")) return <span key={idx} className="text-zinc-500 italic">{part}</span>;
    if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'")) || (part.startsWith("`") && part.endsWith("`")))
      return <span key={idx} className="text-emerald-400">{part}</span>;
    if (/^\d+(?:\.\d+)?$/.test(part)) return <span key={idx} className="text-orange-400">{part}</span>;
    return <span key={idx}>{part}</span>;
  });
}
