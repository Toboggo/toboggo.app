import { useState } from "react";
import { Button, Chip, Input, Textarea } from "@toboggo/design-system";
import { sendContactMessage } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";

const SUBJECTS = ["Question générale", "Problème technique", "Partenariat", "Presse"];

export default function Contact() {
  const profile = useSession((s) => s.profile);
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setSending(true);
    try {
      await sendContactMessage({ name, email, subject, message });
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 56 }}>🎉</div>
        <h1 style={{ fontSize: 20, marginTop: 12 }}>Message envoyé</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>Notre équipe vous répondra sous peu.</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title="Contact" />
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Pour un parc endommagé ou une information erronée, utilisez plutôt le bouton « Signaler » depuis la fiche
          du parc.
        </p>
        <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Sujet</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SUBJECTS.map((s) => (
              <Chip key={s} active={subject === s} onClick={() => setSubject(s)}>
                {s}
              </Chip>
            ))}
          </div>
        </div>
        <Textarea label="Message" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} />
        <Button block disabled={!name || !email || !message} loading={sending} onClick={submit}>
          Envoyer
        </Button>
      </div>
    </div>
  );
}
