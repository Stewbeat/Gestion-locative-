import React, { useState } from "react";
import { supabase } from "./supabaseClient";

const C = {
  paper: "#F5F6F3", surface: "#FFFFFF", ink: "#16222B", muted: "#727E86",
  line: "#E6E8E3", brand: "#123E52", brandSoft: "#E1EBEF", accent: "#A9772F",
  serif: "'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif",
  sans: "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

export default function Auth() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const send = async () => {
    if (!email) return;
    setErr(""); setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    setLoading(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.paper, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20, fontFamily: C.sans }}>
      <div style={{ width: "100%", maxWidth: 380, background: C.surface,
        border: `1px solid ${C.line}`, borderRadius: 16, padding: "32px 28px",
        boxShadow: "0 10px 30px rgba(18,62,82,.08)" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.brand,
          color: "#fff", display: "grid", placeItems: "center", marginBottom: 18,
          fontFamily: C.serif, fontSize: 22, fontWeight: 600 }}>G</div>
        <h1 style={{ fontFamily: C.serif, fontSize: 22, color: C.ink, margin: "0 0 6px" }}>
          Gestion locative
        </h1>
        <p style={{ color: C.muted, fontSize: 13.5, margin: "0 0 22px" }}>
          Connecte-toi pour accéder à ton suivi LMNP. Tu recevras un lien de connexion par e-mail.
        </p>

        {sent ? (
          <div style={{ background: C.brandSoft, borderRadius: 10, padding: "14px 16px",
            color: C.ink, fontSize: 13.5, lineHeight: 1.55 }}>
            Lien envoyé à <b>{email}</b>. Ouvre-le sur cet appareil pour te connecter.
          </div>
        ) : (
          <>
            <label style={{ fontSize: 12, color: C.ink, fontWeight: 500 }}>Adresse e-mail</label>
            <input
              type="email" value={email} autoFocus
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="prenom@exemple.fr"
              style={{ width: "100%", boxSizing: "border-box", marginTop: 6, marginBottom: 14,
                border: `1px solid ${C.line}`, borderRadius: 9, padding: "11px 12px",
                fontSize: 14, fontFamily: C.sans, color: C.ink }}
            />
            {err && <div style={{ color: "#A8392F", fontSize: 12.5, marginBottom: 12 }}>{err}</div>}
            <button
              onClick={send} disabled={loading || !email}
              style={{ width: "100%", background: C.brand, color: "#fff", border: "none",
                borderRadius: 9, padding: "11px 14px", fontSize: 14, fontWeight: 600,
                cursor: loading ? "default" : "pointer", opacity: loading || !email ? 0.6 : 1 }}
            >
              {loading ? "Envoi…" : "Recevoir le lien de connexion"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
