import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Clé anon = publique par nature (sécurité assurée par le RLS côté base).
  console.error(
    "Configuration Supabase manquante : renseigne VITE_SUPABASE_URL et " +
    "VITE_SUPABASE_ANON_KEY dans un fichier .env (voir .env.example)."
  );
}

export const supabase = createClient(url || "", anon || "", {
  auth: {
    /*
      flowType "implicit" : le jeton arrive directement dans l'URL (#access_token).
      Indispensable ici car le lien reçu par e-mail s'ouvre souvent dans un
      navigateur different (webview Gmail/Mail sur mobile) de celui qui a fait
      la demande. Le flux PKCE, lui, exige le meme navigateur et echoue sinon.
    */
    flowType: "implicit",
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});

/* URL de retour propre : ni hash, ni parametres (doit figurer telle quelle
   dans Supabase > Authentication > URL Configuration > Redirect URLs). */
export const redirectUrl = () => window.location.origin + window.location.pathname;
