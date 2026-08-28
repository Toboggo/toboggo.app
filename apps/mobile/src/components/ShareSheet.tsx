import { BottomSheet } from "@toboggo/design-system";
import type { Park } from "@toboggo/shared";
import { parkPhotoUrl } from "../lib/photos";
import { useToastStore } from "../lib/toast";

export function ShareSheet({ open, onClose, park }: { open: boolean; onClose: () => void; park: Park }) {
  const showToast = useToastStore((s) => s.show);
  const shareUrl = `${window.location.origin}/park/${park.id}`;

  const links = [
    { label: "WhatsApp", icon: "💬", href: `https://wa.me/?text=${encodeURIComponent(`${park.name} — ${shareUrl}`)}` },
    { label: "SMS", icon: "✉️", href: `sms:?body=${encodeURIComponent(`${park.name} — ${shareUrl}`)}` },
    { label: "Instagram", icon: "📷", href: `https://instagram.com` },
    { label: "Mail", icon: "📧", href: `mailto:?subject=${encodeURIComponent(park.name)}&body=${encodeURIComponent(shareUrl)}` },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[320]} initialSnap={0} showBackdrop>
      <div style={{ padding: "8px 20px 28px" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              backgroundImage: `url(${parkPhotoUrl(park)})`,
              backgroundSize: "cover",
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600 }}>{park.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{park.formatted_address}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 11 }}
            >
              <span
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "var(--color-bg-alt)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                }}
              >
                {l.icon}
              </span>
              {l.label}
            </a>
          ))}
        </div>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(shareUrl);
            showToast("Lien copié dans le presse-papiers");
            onClose();
          }}
          style={{
            width: "100%",
            padding: 13,
            borderRadius: 999,
            border: "1.5px solid var(--color-border-strong)",
            background: "var(--color-surface)",
            fontFamily: "var(--font-heading)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Copier le lien
        </button>
      </div>
    </BottomSheet>
  );
}
