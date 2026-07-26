import { supabase } from "./supabaseClient";

/*
  Couche de persistance : même interface que l'ancien store (get/set async),
  mais adossée à Supabase. Chaque "bloc" de l'app (settings, payments, ...) est
  stocké comme une ligne (user_id, key, value jsonb) dans la table app_state.
  Le RLS garantit que chacun ne voit que ses propres lignes.
*/

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || null;
}

export const store = {
  async get(key, fallback) {
    try {
      const { data, error } = await supabase
        .from("app_state")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      if (data && data.value != null) return data.value; // déjà un objet (jsonb)
    } catch (e) {
      /* ligne absente ou hors ligne : on retombe sur la valeur par défaut */
    }
    return fallback;
  },

  async set(key, value) {
    try {
      const uid = await currentUserId();
      if (!uid) return;
      await supabase
        .from("app_state")
        .upsert({ user_id: uid, key, value }, { onConflict: "user_id,key" });
    } catch (e) {
      /* silencieux : la saisie reste en mémoire, réessai au prochain changement */
    }
  },
};
