import React, { useState, useEffect } from "react";
import { supabase, redirectUrl } from "./supabaseClient";

const C = {
  paper: "#F5F6F3", surface: "#FFFFFF", ink: "#16222B", muted: "#727E86",
  line: "#E6E8E3", brand: "#123E52", brandSoft: "#E1EBEF", red: "#A8392F",
  green: "#2E6B52", greenSoft: "#E3F0E9",
  serif: "'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif",
  sans: "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

export default function Auth() {
  const [mode, setMode] = useState("signin");   // signin | signup | reset
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  /* Affiche l'erreur éventuellement renvoyée par Supabase dans l'URL */
  useEffect(() => {
    const parse = (str) => new URLSearchParams(str.replace(/^[#?]/, ""));
    const h = parse(window.location.hash);
    const q = parse(window.location.search);
    const desc = h.get("error_description") || q.get("error_description")
              || h.get("error") || q.get("error");
    if (desc) setErr(decodeURIComponent(desc.replace(/\+/g, " ")));
  }, []);

  const traduire = (m = "") => {
    const s = m.toLowerCase();
    if (s.includes("invalid login")) return "E-mail ou mot de passe incorrect.";
    if (s.includes("already registered")) return "Ce compte existe déjà — utilise « Se connecter ».";
    if (s.includes("at least 6")) return "Le mot de passe doit faire au moins 6 caractères.";
    if (s.includes("rate limit")) return "Trop de tentatives : patiente quelques minutes.";
    if (s.includes("email not confirmed")) return "Compte à confirmer : désactive « Confirm email » dans Supabase, ou valide l'e-mail reçu.";
    return m;
  };

  const submit = async () => {
    setErr(""); setMsg(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password: pwd });
        if (error) throw error;
        setMsg("Compte créé. Tu peux te connecter.");
        setMode("signin");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
        if (error) throw error;
        /* succès : onAuthStateChange bascule automatiquement sur l'app */
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
        if (error) throw error;
        setMsg("Si un compte existe, un lien de réinitialisation a été envoyé.");
      }
    } catch (e) {
      setErr(traduire(e.message || String(e)));
    }
    setLoading(false);
  };

  const titre = mode === "signup" ? "Créer un compte"
              : mode === "reset" ? "Mot de passe oublié" : "Connexion";
  const bouton = mode === "signup" ? "Créer le compte"
               : mode === "reset" ? "Envoyer le lien" : "Se connecter";
  const valide = email && (mode === "reset" || pwd.length >= 6);

  const champ = {
    width: "100%", boxSizing: "border-box", marginTop: 6, marginBottom: 14,
    border: `1px solid ${C.line}`, borderRadius: 9, padding: "11px 12px",
    fontSize: 16, fontFamily: C.sans, color: C.ink,
  };
  const lien = {
    background: "none", border: "none", color: C.brand, fontSize: 12.5,
    fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: C.sans,
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
        <p style={{ color: C.muted, fontSize: 13.5, margin: "0 0 22px" }}>{titre}</p>

        <label style={{ fontSize: 12, color: C.ink, fontWeight: 500 }}>Adresse e-mail</label>
        <input
          type="email" value={email} autoComplete="username" autoFocus
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valide && submit()}
          placeholder="prenom@exemple.fr" style={champ}
        />

        {mode !== "reset" && (
          <>
            <label style={{ fontSize: 12, color: C.ink, fontWeight: 500 }}>Mot de passe</label>
            <input
              type="password" value={pwd}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && valide && submit()}
              placeholder="6 caractères minimum" style={champ}
            />
          </>
        )}

        {err && <div style={{ color: C.red, fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}
        {msg && <div style={{ background: C.greenSoft, color: C.green, fontSize: 12.5,
          borderRadius: 8, padding: "10px 12px", marginBottom: 12, lineHeight: 1.5 }}>{msg}</div>}

        <button
          onClick={submit} disabled={loading || !valide}
          style={{ width: "100%", background: C.brand, color: "#fff", border: "none",
            borderRadius: 9, padding: "12px 14px", fontSize: 14, fontWeight: 600,
            cursor: loading || !valide ? "default" : "pointer",
            opacity: loading || !valide ? 0.55 : 1 }}
        >
          {loading ? "…" : bouton}
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 16 }}>
          {mode !== "signin" && (
            <button style={lien} onClick={() => { setMode("signin"); setErr(""); setMsg(""); }}>
              ← Se connecter
            </button>
          )}
          {mode === "signin" && (
            <>
              <button style={lien} onClick={() => { setMode("signup"); setErr(""); setMsg(""); }}>
                Créer un compte
              </button>
              <button style={{ ...lien, color: C.muted }} onClick={() => { setMode("reset"); setErr(""); setMsg(""); }}>
                Mot de passe oublié ?
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
