#!/bin/sh
# Creates the dedicated test database on fresh Postgres volumes.
#
# This script is mounted into /docker-entrypoint-initdb.d/ and only runs
# automatically the *first* time the container starts with an empty data
# volume (that's how the official postgres image bootstraps itself). It
# guarantees that anyone spinning up the project from scratch gets both
# the dev database (POSTGRES_DB, created by the entrypoint itself) and the
# test database, without a manual `docker exec ... psql ...` step.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE coworking_booking_test;
EOSQL
