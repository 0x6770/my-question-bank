-- 0004_init_grants_and_defaults.sql
-- 所有 GRANT / ALTER DEFAULT PRIVILEGES / publication owner

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

-- Functions
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT ALL ON FUNCTION "public"."has_role"("target" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("target" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("target" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."in_roles"(VARIADIC "roles" "public"."user_role"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."in_roles"(VARIADIC "roles" "public"."user_role"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."in_roles"(VARIADIC "roles" "public"."user_role"[]) TO "service_role";

-- Tables & sequences

GRANT ALL ON TABLE "public"."chapters" TO "anon";
GRANT ALL ON TABLE "public"."chapters" TO "authenticated";
GRANT ALL ON TABLE "public"."chapters" TO "service_role";

GRANT ALL ON SEQUENCE "public"."chapters_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."chapters_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."chapters_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."exam_boards" TO "anon";
GRANT ALL ON TABLE "public"."exam_boards" TO "authenticated";
GRANT ALL ON TABLE "public"."exam_boards" TO "service_role";

GRANT ALL ON SEQUENCE "public"."exam_boards_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."exam_boards_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."exam_boards_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT ALL ON TABLE "public"."question_images" TO "anon";
GRANT ALL ON TABLE "public"."question_images" TO "authenticated";
GRANT ALL ON TABLE "public"."question_images" TO "service_role";

GRANT ALL ON SEQUENCE "public"."question_images_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."question_images_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."question_images_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."questions" TO "anon";
GRANT ALL ON TABLE "public"."questions" TO "authenticated";
GRANT ALL ON TABLE "public"."questions" TO "service_role";

GRANT ALL ON SEQUENCE "public"."questions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."questions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."questions_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."subjects" TO "anon";
GRANT ALL ON TABLE "public"."subjects" TO "authenticated";
GRANT ALL ON TABLE "public"."subjects" TO "service_role";

GRANT ALL ON SEQUENCE "public"."subjects_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."subjects_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."subjects_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";

GRANT ALL ON SEQUENCE "public"."tag_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tag_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tag_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."user_questions" TO "postgres";
GRANT ALL ON TABLE "public"."user_questions" TO "anon";
GRANT ALL ON TABLE "public"."user_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_questions" TO "service_role";

GRANT ALL ON SEQUENCE "public"."user_questions_id_seq" TO "postgres";
GRANT ALL ON SEQUENCE "public"."user_questions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_questions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_questions_id_seq" TO "service_role";

-- Default privileges

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
    GRANT ALL ON TABLES TO "service_role";
