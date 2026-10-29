import type { ReactNode } from "react";

/**
 * Just enough Markdown for a terminal: fenced code, headings, bullet and
 * numbered lists, **bold** and `code`. Everything else stays as typed,
 * which is what a terminal would show too. Nothing here ever becomes HTML
 * from a string; it is all React nodes, so Claude's output cannot inject
 * markup.
 */

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${n++}`;
    out.push(
      tok.startsWith("`") ? (
        <code key={key} className="rounded bg-white/10 px-1 py-px text-[#e8b4a0]">
          {tok.slice(1, -1)}
        </code>
      ) : (
        <strong key={key} className="font-semibold text-zinc-50">
          {tok.slice(2, -2)}
        </strong>
      ),
    );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MdLite({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push(
        <pre
          key={k++}
          className="my-1.5 overflow-x-auto rounded-md border border-white/10 bg-black/40 p-2.5 text-[12px] leading-snug text-zinc-300"
        >
          {body.join("\n")}
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <div key={k++} className="mt-2 font-semibold text-zinc-50">
          {inline(heading[2], `h${k}`)}
        </div>,
      );
      i++;
      continue;
    }
    const item = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      const indent = Math.min(4, Math.floor(item[1].length / 2));
      blocks.push(
        <div key={k++} className="flex gap-2" style={{ paddingLeft: `${indent * 1}rem` }}>
          <span className="shrink-0 text-zinc-500">{/^\d/.test(item[2]) ? item[2] : "•"}</span>
          <span className="min-w-0">{inline(item[3], `l${k}`)}</span>
        </div>,
      );
      i++;
      continue;
    }
    if (line.trim() === "") {
      blocks.push(<div key={k++} className="h-2" />);
      i++;
      continue;
    }
    blocks.push(<div key={k++}>{inline(line, `p${k}`)}</div>);
    i++;
  }
  return <div className="space-y-0.5 break-words">{blocks}</div>;
}
