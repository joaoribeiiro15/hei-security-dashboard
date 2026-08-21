# users/

This directory contains the database seed file that defines all platform users.

## How it works

On first `docker-compose up`, MySQL executes `seed.sql` automatically via
`docker-entrypoint-initdb.d`. The Python backend (`server.py`) queries the
`hei_dashboard.users` table on every `POST /auth` request to validate
credentials and build the session token.

**The container does NOT re-run seed.sql on subsequent starts.** To reset the
database, remove the named volume:

```bash
docker-compose down -v          # removes hei_db_data volume
docker-compose up --build       # rebuilds from seed.sql
```

## Adding a new user

Open `seed.sql` and append an INSERT at the bottom:

```sql
INSERT INTO users (username, password, role, country, display_name) VALUES
  ('admin@myuniversity.no', 'securepassword', 'regional', 'no', 'My University Admin');
```

Then reset the database volume as shown above, or connect directly:

```bash
docker exec -it hei-dashboard-db \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" hei_dashboard \
  -e "INSERT INTO users ..."
```

## Roles

| Role       | Access                                                                 |
|------------|------------------------------------------------------------------------|
| `global`   | All tabs including Data Management; no blur; all countries             |
| `regional` | Overview, HTTPS, DNSSEC, Headers, Institutions Table, NUTS2 Map        |

## Country codes

Use ISO 3166-1 alpha-2 lowercase: `no`, `de`, `fr`, `it`, `pt`, etc.
Set `country = NULL` only for `global` accounts.

## Password hashing (production)

Passwords are stored as plain text by default for development convenience.
For production, set `USE_BCRYPT=1` in your `.env` file and store bcrypt hashes:

```bash
python3 -c "import bcrypt; print(bcrypt.hashpw(b'mypassword', bcrypt.gensalt(12)).decode())"
```

Replace the plain-text password in the INSERT with the resulting hash.
