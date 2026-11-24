-- Runs once when the local database volume is created: a separate database for the test suite,
-- so running tests never touches development data.
CREATE DATABASE tablewise_test OWNER tablewise;
