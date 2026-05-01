import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="font-sans text-2xl font-semibold tracking-tight">apiq</h1>
      <p className="text-sm text-zinc-500">
        API Intelligence — a knowledgeable second opinion for your OpenAPI
        specs.
      </p>
      <p className="text-xs text-zinc-500">
        Try a path:{" "}
        <code className="font-mono text-zinc-400">/v1/users/{`{id}`}</code>
      </p>
      <Button>Violet primary</Button>
    </main>
  );
}
