import { useParams } from "react-router-dom";
import { DetailHeader } from "../../components/DetailHeader";
import { usePark } from "../../lib/parksQuery";
import { parkPhotoUrl } from "../../lib/photos";

export default function DetailPhotos() {
  const { id } = useParams();
  const { data: park } = usePark(id);
  if (!park) return null;
  const photos = park.photos.length ? park.photos : [0, 1, 2, 3, 4, 5].map((i) => parkPhotoUrl(park, i, 400, 400));

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      <DetailHeader title="Photos" />
      <div style={{ flex: 1, overflow: "auto", padding: "6px 20px 30px" }}>
        {photos.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: 13, marginTop: 40 }}>
            Aucune photo pour ce parc.
          </p>
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
