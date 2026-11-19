#!/bin/sh
# Run on the Katwill host as root, after a verified current backup.
# Requires the exact live PostgreSQL container ID as its only argument.
set -eu
umask 077
pg=${1:?PostgreSQL container ID required}
root=/opt/n8n/cooltech-deploy-92a679e
data=/opt/n8n/postgres_data
host=postgres.automation_backend
tls=$data/cooltech-quotes-tls
test -s "$root/predeploy-n8n.dump"
test -s "$root/compose.before.yaml"
test "$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Source}}{{end}}{{end}}' "$pg")" = "$data"
psql_admin() {
  if [ "$#" -eq 0 ]; then
    docker exec -i "$pg" sh -c 'exec psql -X -qAt -w -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres'
  else
    docker exec "$pg" sh -c 'exec psql -X -qAt -w -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres "$@"' sh "$@"
  fi
}
test "$(psql_admin -c 'SHOW ssl')" = off
test "$(psql_admin -c 'SHOW hba_file')" = /var/lib/postgresql/data/pg_hba.conf
test ! -e "$root/pg_hba.before"
test ! -e "$tls"
cp -p "$data/pg_hba.conf" "$root/pg_hba.before"
cp -p "$data/postgresql.auto.conf" "$root/postgresql.auto.before"
rollback() {
  cp -p "$root/pg_hba.before" "$data/pg_hba.conf"
  cp -p "$root/postgresql.auto.before" "$data/postgresql.auto.conf"
  psql_admin -c 'SELECT pg_reload_conf()' >/dev/null
}
trap 'rollback' EXIT
mkdir -m 700 "$tls"
openssl req -x509 -newkey rsa:3072 -nodes -days 825 -sha256 \
  -subj '/CN=Katwill Cooltech PostgreSQL CA' -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' \
  -keyout "$root/postgres-ca.key" -out "$root/postgres-ca.pem" 2>/dev/null
openssl req -new -newkey rsa:3072 -nodes -sha256 -subj "/CN=$host" \
  -keyout "$tls/server.key" -out "$root/postgres.csr" 2>/dev/null
cat >"$root/postgres-cert.conf" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:$host
EOF
openssl x509 -req -in "$root/postgres.csr" -CA "$root/postgres-ca.pem" \
  -CAkey "$root/postgres-ca.key" -CAcreateserial -days 365 -sha256 \
  -extfile "$root/postgres-cert.conf" -out "$tls/server.crt" 2>/dev/null
openssl verify -verify_hostname "$host" -CAfile "$root/postgres-ca.pem" "$tls/server.crt"
chown -R 999:999 "$tls"
chmod 600 "$tls/server.key"
psql_admin <<'SQL'
ALTER SYSTEM SET ssl_cert_file = 'cooltech-quotes-tls/server.crt';
ALTER SYSTEM SET ssl_key_file = 'cooltech-quotes-tls/server.key';
ALTER SYSTEM SET ssl = 'on';
SELECT pg_reload_conf();
SQL
sleep 1
test "$(psql_admin -c 'SHOW ssl')" = on
{
  printf '%s\n' \
    'local all cooltech_quote_runtime reject' \
    'hostssl cooltech_quotes cooltech_quote_runtime all scram-sha-256' \
    'host all cooltech_quote_runtime all reject'
  cat "$root/pg_hba.before"
} >"$data/pg_hba.conf.cooltech-new"
chown --reference="$data/pg_hba.conf" "$data/pg_hba.conf.cooltech-new"
chmod --reference="$data/pg_hba.conf" "$data/pg_hba.conf.cooltech-new"
mv "$data/pg_hba.conf.cooltech-new" "$data/pg_hba.conf"
test "$(psql_admin -c 'SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL')" = 0
psql_admin -c 'SELECT pg_reload_conf()' | grep -Fx t
trap - EXIT
echo 'PostgreSQL TLS enabled via reload; existing auth rules retained after the Cooltech-specific rules.'
