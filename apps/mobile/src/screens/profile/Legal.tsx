import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TopBar } from "../../components/TopBar";
import { LEGAL_DOCS } from "./legalContent";

export default function Legal() {
  const { doc } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const content = LEGAL_DOCS[doc ?? "terms"];
  if (!content) return null;

  return (
    <div className="screen">
      <TopBar title={content.title} onBack={() => navigate(params.get("from") === "onboarding" ? "/" : "/privacy")} />
      <div style={{ padding: "0 20px 40px" }}>
        {content.sections.map((s) => (
          <div key={s.heading} style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, marginBottom: 6 }}>{s.heading}</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--color-text-muted)" }}>{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
