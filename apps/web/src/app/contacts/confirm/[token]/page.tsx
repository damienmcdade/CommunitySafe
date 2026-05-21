"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";

export default function ConfirmContactPage() {
  const params = useParams<{ token: string }>();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!params?.token) return;
    api(`/contacts/confirm/${params.token}`, { method: "POST" })
      .then(() => {
        setStatus("ok");
        setMessage("Thanks — you're now confirmed as a trusted contact. You'll only be notified when your contact actively uses a feature that involves you.");
      })
      .catch((e: Error) => {
        setStatus("error");
        setMessage(e.message);
      });
  }, [params?.token]);

  return (
    <main className="max-w-md mx-auto px-6 py-16">
      <h1 className="font-display text-3xl text-slate2-900">Confirm trusted contact</h1>
      {status === "working" && <p className="mt-4 text-slate2-500">Confirming…</p>}
      {status === "ok" && <p className="mt-4 text-sage-700">{message}</p>}
      {status === "error" && <p className="mt-4 text-dusk-700">Could not confirm: {message}</p>}
    </main>
  );
}
