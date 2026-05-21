"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api-client";

interface Contact {
  id: string;
  label: string;
  email: string | null;
  phone: string | null;
  status: "PENDING" | "CONFIRMED" | "REVOKED";
}

export default function TrustedContactsPage() {
  const { data, reload } = useApi<Contact[]>("/contacts");
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const contacts = data ?? [];
  const atLimit = contacts.length >= 5;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/contacts", {
        method: "POST",
        body: JSON.stringify({ label, email: email || null, phone: phone || null }),
      });
      setLabel(""); setEmail(""); setPhone("");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string) {
    await api(`/contacts/${id}`, { method: "DELETE" });
    await reload();
  }

  async function resend(id: string) {
    await api(`/contacts/${id}/resend`, { method: "POST" });
    await reload();
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-slate2-900">Trusted contacts (optional)</h1>
      <p className="mt-2 text-slate2-500">
        Add up to 5 people. They receive an opt-in email; only after they confirm will they
        be notified when a check-in timer expires or you share a live location with them.
      </p>

      <section className="mt-8 surface p-6">
        <h2 className="font-display text-lg text-slate2-900">Your contacts</h2>
        {contacts.length === 0 && (
          <p className="text-sm text-slate2-500 mt-2">No contacts yet.</p>
        )}
        <ul className="mt-3 divide-y divide-sand-200">
          {contacts.map((c) => (
            <li key={c.id} className="py-3 flex justify-between items-center gap-3">
              <div>
                <div className="text-slate2-900">{c.label}</div>
                <div className="text-xs text-slate2-500">
                  {[c.email, c.phone].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {c.status === "CONFIRMED" ? (
                  <span className="px-2 py-1 rounded-full bg-sage-200 text-sage-700">Confirmed</span>
                ) : (
                  <>
                    <span className="px-2 py-1 rounded-full bg-amber2-200 text-amber2-700">Pending</span>
                    <button onClick={() => resend(c.id)} className="text-slate2-700 underline">Resend</button>
                  </>
                )}
                <button onClick={() => remove(c.id)} className="text-dusk-700 underline">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 surface p-6">
        <h2 className="font-display text-lg text-slate2-900">Add a contact</h2>
        <p className="text-xs text-slate2-500 mt-1">Provide at least one of email or phone.</p>
        <form className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3" onSubmit={add}>
          <input required disabled={atLimit} placeholder="Label (e.g. Roommate)" value={label} onChange={(e) => setLabel(e.target.value)} className="px-3 py-2 surface" />
          <input disabled={atLimit} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="px-3 py-2 surface" />
          <input disabled={atLimit} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="px-3 py-2 surface" />
          <button type="submit" disabled={atLimit} className="sm:col-span-3 px-4 py-2 bg-slate2-900 text-sand-50 rounded-xl disabled:opacity-50">
            {atLimit ? "Limit reached (5)" : "Send confirmation"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-dusk-700">{error}</p>}
      </section>

      <div className="mt-8">
        <Link href="/threats" className="text-slate2-700 underline">Skip and continue →</Link>
      </div>
    </main>
  );
}
