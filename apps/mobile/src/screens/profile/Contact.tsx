import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Chip, Input, Textarea } from "@toboggo/design-system";
import { sendContactMessage } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";

// `value` is the stable string sent to the support inbox (one vocabulary
// regardless of the sender's locale); only the visible label is localized.
const SUBJECTS: { value: string; key: string }[] = [
  { value: "Question générale", key: "contact.subject.general" },
  { value: "Problème technique", key: "contact.subject.technical" },
  { value: "Partenariat", key: "contact.subject.partnership" },
  { value: "Presse", key: "contact.subject.press" },
];

export default function Contact() {
  const { t } = useTranslation("profile");
  const profile = useSession((s) => s.profile);
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [subject, setSubject] = useState(SUBJECTS[0].value);
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
        <h1 style={{ fontSize: 20, marginTop: 12 }}>{t("contact.sentTitle")}</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>{t("contact.sentBody")}</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title={t("contact.title")} />
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{t("contact.intro")}</p>
        <Input label={t("contact.nameLabel")} value={name} onChange={(e) => setName(e.target.value)} />
        <Input label={t("contact.emailLabel")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t("contact.subjectLabel")}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SUBJECTS.map((s) => (
              <Chip key={s.value} active={subject === s.value} onClick={() => setSubject(s.value)}>
                {t(s.key)}
              </Chip>
            ))}
          </div>
        </div>
        <Textarea label={t("contact.messageLabel")} value={message} onChange={(e) => setMessage(e.target.value)} rows={5} />
        <Button block disabled={!name || !email || !message} loading={sending} onClick={submit}>
          {t("contact.send")}
        </Button>
      </div>
    </div>
  );
}
