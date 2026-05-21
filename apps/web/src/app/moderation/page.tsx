"use client";
import { useState } from "react";
import { api, useApi } from "@/lib/api-client";

interface PendingPost {
  id: string;
  body: string;
  kind: string;
  status: string;
  createdAt: string;
  area: { name: string };
  author: { email: string; displayName: string | null };
  flags: { kind: string; detail: string | null }[];
}

const ACTIONS = ["VERIFY", "REJECT", "REQUEST_EDITS"] as const;
type Action = (typeof ACTIONS)[number];

export default function ModeratorQueuePage() {
  const { data, reload } = useApi<PendingPost[]>("/moderation/queue");
  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <h1 className="font-display text-3xl text-slate2-900">Moderator queue</h1>
      <p className="text-slate2-500 text-sm">
        Verifying a post requires confirming it is area-level and names no individual.
        Set <code>MODERATOR_EMAILS</code> in the API env to grant access.
      </p>
      {(data ?? []).length === 0 && <p className="text-slate2-500">Queue is empty.</p>}
      {(data ?? []).map((p) => <ReviewCard key={p.id} post={p} onDecided={reload} />)}
    </main>
  );
}

function ReviewCard({ post, onDecided }: { post: PendingPost; onDecided: () => void }) {
  const [reason, setReason] = useState("");
  const [confirmAreaLevel, setConfirmAreaLevel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: Action) {
    setBusy(true);
    setError(null);
    try {
      await api(`/moderation/posts/${post.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          action,
          reason: reason || undefined,
          confirmedAreaLevelAndAnonymized: action === "VERIFY" ? confirmAreaLevel : undefined,
        }),
      });
      onDecided();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="surface p-5">
      <header className="flex justify-between items-center text-xs text-slate2-500">
        <span>{post.area.name} · {post.kind} · {new Date(post.createdAt).toLocaleString()}</span>
        <span>by {post.author.displayName ?? post.author.email}</span>
      </header>
      <pre className="mt-3 whitespace-pre-wrap text-slate2-900 font-sans">{post.body}</pre>
      {post.flags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          {post.flags.map((f, i) => (
            <li key={i} className="px-2 py-1 surface-muted">{f.kind}{f.detail ? `: ${f.detail}` : ""}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 space-y-3">
        <input
          placeholder="Reason (required to reject or request edits)"
          value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 surface"
        />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmAreaLevel} onChange={(e) => setConfirmAreaLevel(e.target.checked)} className="mt-1" />
          <span>I confirm this post is area-level and names no individual.</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => decide("VERIFY")} disabled={busy || !confirmAreaLevel} className="px-3 py-1.5 bg-sage-500 text-sand-50 rounded-xl disabled:opacity-50">Verify</button>
          <button onClick={() => decide("REQUEST_EDITS")} disabled={busy} className="px-3 py-1.5 bg-amber2-500 text-sand-50 rounded-xl">Request edits</button>
          <button onClick={() => decide("REJECT")} disabled={busy} className="px-3 py-1.5 bg-dusk-700 text-sand-50 rounded-xl">Reject</button>
        </div>
        {error && <p className="text-sm text-dusk-700">{error}</p>}
      </div>
    </article>
  );
}
