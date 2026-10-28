import { CopyButton } from "./copy";
export function CodeBlock({ code, label = "command" }: { code: string; label?: string }) {
  return (
    <div className="relative rounded-lg border border-border bg-surface-2">
      <pre className="num whitespace-pre-wrap break-all p-3 pr-10 text-xs leading-relaxed">{code}</pre>
      <CopyButton value={code} label={label} className="absolute right-1 top-1" />
    </div>
  );
}
