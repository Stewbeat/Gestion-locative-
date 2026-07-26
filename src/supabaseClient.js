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

export const supabase = createClient(url || "", anon || "");
