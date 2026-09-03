import { useNavigate, useParams } from "react-router-dom";
import { LogoMark } from "@toboggo/design-system";
import { DetailHeader } from "../../components/DetailHeader";
import { usePark } from "../../lib/parksQuery";

export default function DetailPhotos() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: park } = usePark(id);
  if (!park) return null;
  const photos = park.photos;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      <DetailHeader title="Photos" />
      <div style={{ flex: 1, overflow: "auto", padding: "6px 20px 30px" }}>
        {photos.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 14,
              marginTop: 48,
              color: "var(--color-text-muted)",
            }}
          >
            <LogoMark size={44} rounded={false} />
            <p style={{ fontSize: 13, maxWidth: 260 }}>
              Aucune photo pour l'instant. Soyez le premier à en ajouter une !
            </p>
            <button
              type="button"
              onClick={() => navigate(`/photo-add?park=${park.id}`)}
              style={{
                marginTop: 4,
                padding: "10px 18px",
                borderRadius: 999,
                border: "none",
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Ajouter une photo
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {photos.map((p, i) => (
              <div
                key={i}
                style={{ width: "100%", height: 140, borderRadius: 16, background: `var(--color-border) url(${p}) center/cover no-repeat` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
