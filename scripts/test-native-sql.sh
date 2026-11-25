#!/usr/bin/env bash
set -euo pipefail
: "${QA_CONTAINER:?Set QA_CONTAINER to a disposable pgvector PostgreSQL container}"
qa_database="obratrack_qa_${RANDOM}_$$"
docker exec "$QA_CONTAINER" createdb -U postgres "$qa_database"
trap 'docker exec "$QA_CONTAINER" dropdb -U postgres "$qa_database" >/dev/null' EXIT
# Roles are cluster-wide, unlike all fixtures below.
docker exec "$QA_CONTAINER" psql -U postgres -c "DO \$\$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END \$\$;" >/dev/null
apply() { docker exec -i "$QA_CONTAINER" psql -U postgres -d "$qa_database" -v ON_ERROR_STOP=1 < "$1"; }
apply tests/sql/bootstrap.sql
for migration in schema migrations_v2 whatsapp_jefe produccion_copiloto copiloto_materiales permisos_obra registro_constructor flujo_obra archivos_privados whatsapp_avisos whatsapp_dispatch presupuestos_alternativas presupuesto_whatsapp_obra contactos_whatsapp flujo_terreno_rbac estados_proyecto asistencia_solo_jefatura especialidades_equipo whatsapp_identidad_obra gestion_diaria_20261113 logica_constructor_20261113 corregir_guardado_obras_rls 20261114_perfil_empresa_logo obrabot_quality obrabot_rag obrabot_chat_history billing_flow whatsapp_debounce_concurrencia 20261116_billing_atomic 20261116_sync_atomic 20261116_ai_usage 20261116_storage_limits 20261116_registration_guard 20261116_whatsapp_versions 20261116_sync_row_locks 20261116_push_commit_replay obrabot_rag_whatsapp push_notificaciones 20261117_iso_masking_audit 20261117_convert_and_reportes 20261117_whatsapp_reply_delivery 20261117_obrabot_unlimited_daily 20261119_sync_allowlist_fix 20261119_security_hardening_rls 20261119_whatsapp_avisos_delete 20261120_delete_account_cascade 20261122_obrabot_cotizaciones 20261122_obrabot_destino_cotizacion 20261123_whatsapp_reply_context 20261125_fix_auth_orphans_and_login; do
  echo "MIGRATION $migration"; apply "supabase/$migration.sql"
done
# The initial schema contains historical demo rows; every test below uses synthetic fixtures.
docker exec "$QA_CONTAINER" psql -U postgres -d "$qa_database" -v ON_ERROR_STOP=1 -c 'TRUNCATE public.empresas CASCADE;' >/dev/null
for test in tests/sql/*.sql; do
  if [[ "$test" == tests/sql/bootstrap.sql ]]; then continue; fi
  echo "TEST $test";apply "$test"
done
