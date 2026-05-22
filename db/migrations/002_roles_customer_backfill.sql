-- Backfill migration: replace legacy 'user' role with 'customer'

-- Ensure customer role exists
INSERT INTO roles (code, name, description, is_system)
VALUES ('customer', 'Customer', 'Customer app access', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Move legacy user-role assignments to customer role
WITH old_role AS (
  SELECT id FROM roles WHERE code = 'user'
),
new_role AS (
  SELECT id FROM roles WHERE code = 'customer'
)
INSERT INTO user_roles (user_id, role_id, assigned_at, assigned_by)
SELECT ur.user_id, nr.id, ur.assigned_at, ur.assigned_by
FROM user_roles ur
JOIN old_role o ON ur.role_id = o.id
JOIN new_role nr ON TRUE
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Optional cleanup of old user-role links
DELETE FROM user_roles
WHERE role_id IN (SELECT id FROM roles WHERE code = 'user');

-- Optional cleanup of old role definition
DELETE FROM roles WHERE code = 'user';
