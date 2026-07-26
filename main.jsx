import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabaseClient";
import App from "./App.jsx";
import Auth from "./Auth.jsx";

function Root() {
  const [session, setSession] = useState(undefined); // undefined = en cours de vérification

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#F5F6F3", color: "#727E86",
        fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", fontSize: 14 }}>
        Chargement…
      </div>
    );
  }
  return session ? <App /> : <Auth />;
}

createRoot(document.getElementById("root")).render(<Root />);
