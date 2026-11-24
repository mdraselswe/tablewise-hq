-- Outlets module: the company's physical branches.

CREATE SCHEMA IF NOT EXISTS outlets;

CREATE TABLE outlets.outlets (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  code       varchar(8)   NOT NULL,
  name       varchar(120) NOT NULL,
  address    varchar(500),
  timezone   varchar(64)  NOT NULL DEFAULT 'Asia/Dhaka',
  is_active  boolean      NOT NULL DEFAULT true,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT outlets_code_key UNIQUE (code),
  CONSTRAINT outlets_code_format_chk CHECK (code ~ '^[A-Z0-9]{2,8}$')
);

CREATE TRIGGER outlets_set_updated_at
  BEFORE UPDATE ON outlets.outlets
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
