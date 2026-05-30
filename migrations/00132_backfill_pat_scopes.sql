-- +goose Up
-- Legacy PATs with an empty scopes array were treated as unrestricted. Backfill
-- with the full scope taxonomy so behavior is preserved until owners rotate them.
UPDATE personal_access_tokens
SET scopes = ARRAY[
    'read:projects', 'write:projects',
    'read:samples', 'write:samples',
    'read:experiments', 'write:experiments',
    'read:iterations', 'write:iterations',
    'read:risks', 'write:risks',
    'read:artifacts', 'write:artifacts',
    'read:pages', 'write:pages',
    'read:meetings', 'write:meetings',
    'read:calendar', 'write:calendar',
    'read:ai', 'write:ai',
    'read:inbox', 'read:notify', 'write:notify',
    'read:audit',
    'read:approvals', 'write:approvals',
    'admin:org',
    'read:admin', 'write:admin',
    'manage:tokens', 'write:profile'
]::text[]
WHERE scopes = '{}'::text[] OR scopes IS NULL;

-- +goose Down
-- Cannot restore prior empty scopes; no-op.
