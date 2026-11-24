-- Identity module: people who sign in, and what they may touch.

CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE identity.users (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  email         varchar(255) NOT NULL,
  full_name     varchar(120) NOT NULL,
  password_hash text         NOT NULL,
  role          varchar(20)  NOT NULL,
  outlet_id     uuid,
  is_active     boolean      NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_email_lowercase_chk CHECK (email = lower(email)),
  CONSTRAINT users_role_chk CHECK (role IN ('HQ_ADMIN', 'OUTLET_STAFF')),
  -- HQ admins see every outlet; outlet staff belong to exactly one.
  CONSTRAINT users_role_outlet_chk CHECK (
    (role = 'HQ_ADMIN' AND outlet_id IS NULL) OR (role = 'OUTLET_STAFF' AND outlet_id IS NOT NULL)
  ),
  CONSTRAINT users_outlet_fkey FOREIGN KEY (outlet_id) REFERENCES outlets.outlets (id) ON DELETE RESTRICT
);

CREATE INDEX users_outlet_id_idx ON identity.users (outlet_id) WHERE outlet_id IS NOT NULL;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON identity.users
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
