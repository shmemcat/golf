\set ON_ERROR_STOP on
GRANT USAGE ON SCHEMA public TO golf_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON golf_rooms, golf_results, golf_events, golf_deleted_users TO golf_runtime;
DO $$ BEGIN
  IF to_regclass('golf_achievement_unlocks') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON golf_achievement_unlocks TO golf_runtime;
  END IF;
END $$;
GRANT SELECT ON golf_schema_version TO golf_runtime;
GRANT USAGE, SELECT ON SEQUENCE golf_events_id_seq TO golf_runtime;
