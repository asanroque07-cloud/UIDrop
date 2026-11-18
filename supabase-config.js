/* UIDrop cloud config.
   Paste your Supabase project values here, then commit this file.

   Where to find them: Supabase Dashboard -> Project Settings -> API
     - "Project URL"            -> url      (https://<project-ref>.supabase.co)
     - "anon" / "public" key    -> anonKey  (starts with "eyJ...")
   Use the anon/public key ONLY. Never put the service_role key here: this
   file is served to every browser. Data is protected by the row-level
   security policies in supabase/schema.sql, not by hiding this key.

   Leave both empty to keep the app in local-only guest mode. */
window.UICLOUD_CONFIG = {
  url: '',
  anonKey: ''
};
