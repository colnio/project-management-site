-- +goose Up

ALTER TABLE users ADD COLUMN global_role text NOT NULL DEFAULT 'member' CHECK (global_role IN ('admin','pi','member'));
ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended'));
ALTER TABLE users ADD COLUMN first_name text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN last_name text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN title text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN profile_completed boolean NOT NULL DEFAULT false;

UPDATE users SET global_role='admin' WHERE is_system_admin = true;
UPDATE users SET status='approved', profile_completed=true; -- don't lock out existing accounts

ALTER TABLE users DROP COLUMN is_system_admin;

-- +goose Down

ALTER TABLE users ADD COLUMN is_system_admin boolean NOT NULL DEFAULT false;
UPDATE users SET is_system_admin = true WHERE global_role = 'admin';

ALTER TABLE users DROP COLUMN profile_completed;
ALTER TABLE users DROP COLUMN description;
ALTER TABLE users DROP COLUMN title;
ALTER TABLE users DROP COLUMN last_name;
ALTER TABLE users DROP COLUMN first_name;
ALTER TABLE users DROP COLUMN status;
ALTER TABLE users DROP COLUMN global_role;
