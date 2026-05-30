package auth

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/colnio/project-management-site/internal/platform"
)

// User is the exported domain struct for a platform user.
type User struct {
	ID               uuid.UUID
	Email            string
	DisplayName      string
	GlobalRole       string    `json:"global_role"`
	Status           string    `json:"status"`
	FirstName        string    `json:"first_name"`
	LastName         string    `json:"last_name"`
	Title            string    `json:"title"`
	Description      string    `json:"description"`
	ProfileCompleted bool      `json:"profile_completed"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(
		&u.ID, &u.Email, &u.DisplayName,
		&u.GlobalRole, &u.Status,
		&u.FirstName, &u.LastName, &u.Title, &u.Description, &u.ProfileCompleted,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetUserByEmail returns the user with the given email (lowercased) or a
// platform.NotFound error if absent.
func (s *Service) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT id, email, display_name,
		        global_role, status,
		        first_name, last_name, title, description, profile_completed,
		        created_at, updated_at
		 FROM users WHERE email=$1`,
		strings.ToLower(email),
	)
	u, err := scanUser(row)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("user.not_found", "user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("auth: get user by email: %w", err)
	}
	return u, nil
}

// GetUsersByIDs returns users for the given IDs. Missing IDs are omitted from the
// map (no error). An empty ids slice returns an empty map.
func (s *Service) GetUsersByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]*User, error) {
	if len(ids) == 0 {
		return map[uuid.UUID]*User{}, nil
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, email, display_name,
		        global_role, status,
		        first_name, last_name, title, description, profile_completed,
		        created_at, updated_at
		 FROM users WHERE id = ANY($1)`,
		ids,
	)
	if err != nil {
		return nil, fmt.Errorf("auth: get users by ids: %w", err)
	}
	defer rows.Close()

	out := make(map[uuid.UUID]*User, len(ids))
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("auth: scan user: %w", err)
		}
		out[u.ID] = u
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("auth: get users by ids rows: %w", err)
	}
	return out, nil
}

// GetUserByID returns the user with the given ID or a platform.NotFound error.
func (s *Service) GetUserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT id, email, display_name,
		        global_role, status,
		        first_name, last_name, title, description, profile_completed,
		        created_at, updated_at
		 FROM users WHERE id=$1`,
		id,
	)
	u, err := scanUser(row)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("user.not_found", "user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("auth: get user by id: %w", err)
	}
	return u, nil
}

// CreateUser creates a new user. Email is lowercased. Returns platform.Conflict
// if the email already exists. New users receive defaults: global_role='member',
// status='pending' — later batches add approval/registration flows.
func (s *Service) CreateUser(ctx context.Context, email, displayName string) (*User, error) {
	row := s.pool.QueryRow(ctx,
		`INSERT INTO users (email, display_name) VALUES ($1,$2)
		 RETURNING id, email, display_name,
		           global_role, status,
		           first_name, last_name, title, description, profile_completed,
		           created_at, updated_at`,
		strings.ToLower(email), displayName,
	)
	u, err := scanUser(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if isPgError(err, &pgErr) && pgErr.Code == "23505" {
			return nil, platform.Conflict("user.email_conflict", "a user with that email already exists")
		}
		return nil, fmt.Errorf("auth: create user: %w", err)
	}
	return u, nil
}

// RegisterLocalUser creates a user and local credential in one transaction.
func (s *Service) RegisterLocalUser(ctx context.Context, email, displayName, password string) (*User, error) {
	hash, err := HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("auth: hash password: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("auth: begin register tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	row := tx.QueryRow(ctx,
		`INSERT INTO users (email, display_name) VALUES ($1,$2)
		 RETURNING id, email, display_name,
		           global_role, status,
		           first_name, last_name, title, description, profile_completed,
		           created_at, updated_at`,
		strings.ToLower(email), displayName,
	)
	u, err := scanUser(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if isPgError(err, &pgErr) && pgErr.Code == "23505" {
			return nil, platform.Conflict("user.email_conflict", "a user with that email already exists")
		}
		return nil, fmt.Errorf("auth: create user: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO local_credentials (user_id, password_hash) VALUES ($1,$2)`,
		u.ID, hash,
	)
	if err != nil {
		return nil, fmt.Errorf("auth: set password: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("auth: commit register tx: %w", err)
	}
	return u, nil
}

func (s *Service) getUserByIDTx(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*User, error) {
	row := tx.QueryRow(ctx,
		`SELECT id, email, display_name,
		        global_role, status,
		        first_name, last_name, title, description, profile_completed,
		        created_at, updated_at
		 FROM users WHERE id=$1`,
		id,
	)
	u, err := scanUser(row)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("user.not_found", "user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("auth: get user by id: %w", err)
	}
	return u, nil
}

// SetPassword stores an argon2id hash for the user's local credential.
func (s *Service) SetPassword(ctx context.Context, userID uuid.UUID, password string) error {
	hash, err := HashPassword(password)
	if err != nil {
		return fmt.Errorf("auth: hash password: %w", err)
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO local_credentials (user_id, password_hash)
		 VALUES ($1,$2)
		 ON CONFLICT (user_id) DO UPDATE SET password_hash=$2, updated_at=now()`,
		userID, hash,
	)
	if err != nil {
		return fmt.Errorf("auth: set password: %w", err)
	}
	return nil
}

// verifyLocalLogin checks email+password and returns the User on success.
func (s *Service) verifyLocalLogin(ctx context.Context, email, password string) (*User, error) {
	u, err := s.GetUserByEmail(ctx, email)
	if err != nil {
		// Mask not-found as unauthorized to prevent email enumeration.
		return nil, platform.Unauthorized("invalid email or password")
	}
	var hash string
	err = s.pool.QueryRow(ctx,
		`SELECT password_hash FROM local_credentials WHERE user_id=$1`, u.ID,
	).Scan(&hash)
	if err == pgx.ErrNoRows {
		return nil, platform.Unauthorized("invalid email or password")
	}
	if err != nil {
		return nil, fmt.Errorf("auth: fetch credential: %w", err)
	}
	ok, err := VerifyPassword(hash, password)
	if err != nil {
		return nil, fmt.Errorf("auth: verify password: %w", err)
	}
	if !ok {
		return nil, platform.Unauthorized("invalid email or password")
	}
	return u, nil
}

// SeedDevUser upserts dev@graphene-lab.org as a platform admin with local password.
// Idempotent — safe to call on every boot. Refuses to run in production.
func (s *Service) SeedDevUser(ctx context.Context) error {
	if s.cfg.IsProduction() {
		return fmt.Errorf("auth: SeedDevUser must not run in production")
	}
	const devEmail = "dev@graphene-lab.org"
	const devName = "Dev User"
	const devFirstName = "Dev"
	const devLastName = "User"
	devPw := os.Getenv("DEV_USER_PASSWORD")
	if devPw == "" {
		devPw = "devpassword"
	}

	hash, err := HashPassword(devPw)
	if err != nil {
		return fmt.Errorf("auth: seed dev user hash: %w", err)
	}

	var userID uuid.UUID
	err = s.pool.QueryRow(ctx,
		`INSERT INTO users (email, display_name, global_role, status, first_name, last_name, profile_completed)
		 VALUES ($1,$2,'admin','approved',$3,$4,true)
		 ON CONFLICT (email) DO UPDATE
		   SET display_name=$2, global_role='admin', status='approved',
		       first_name=$3, last_name=$4, profile_completed=true, updated_at=now()
		 RETURNING id`,
		devEmail, devName, devFirstName, devLastName,
	).Scan(&userID)
	if err != nil {
		return fmt.Errorf("auth: seed dev user: %w", err)
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO local_credentials (user_id, password_hash)
		 VALUES ($1,$2)
		 ON CONFLICT (user_id) DO UPDATE SET password_hash=$2, updated_at=now()`,
		userID, hash,
	)
	if err != nil {
		return fmt.Errorf("auth: seed dev user credentials: %w", err)
	}
	return nil
}

// emailDomainAllowed reports whether the email's domain is in the allow-list.
// If AllowedEmailDomains is empty, all domains are allowed.
func emailDomainAllowed(email string, allowed []string) bool {
	if len(allowed) == 0 {
		return true
	}
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 {
		return false
	}
	domain := strings.ToLower(parts[1])
	for _, a := range allowed {
		if strings.ToLower(a) == domain {
			return true
		}
	}
	return false
}

// UpdateProfile updates a user's profile fields and marks profile_completed=true.
// If displayName is empty it is derived from strings.TrimSpace(firstName+" "+lastName).
func (s *Service) UpdateProfile(ctx context.Context, userID uuid.UUID, firstName, lastName, title, description, displayName string) (*User, error) {
	if strings.TrimSpace(displayName) == "" {
		displayName = strings.TrimSpace(firstName + " " + lastName)
	}
	row := s.pool.QueryRow(ctx,
		`UPDATE users
		 SET first_name=$2, last_name=$3, title=$4, description=$5, display_name=$6,
		     profile_completed=true, updated_at=now()
		 WHERE id=$1
		 RETURNING id, email, display_name,
		           global_role, status,
		           first_name, last_name, title, description, profile_completed,
		           created_at, updated_at`,
		userID, firstName, lastName, title, description, displayName,
	)
	u, err := scanUser(row)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("user.not_found", "user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("auth: update profile: %w", err)
	}
	return u, nil
}

// ListUsers returns all users ordered by created_at DESC.
func (s *Service) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, email, display_name,
		        global_role, status,
		        first_name, last_name, title, description, profile_completed,
		        created_at, updated_at
		 FROM users ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("auth: list users: %w", err)
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		var u User
		if err := rows.Scan(
			&u.ID, &u.Email, &u.DisplayName,
			&u.GlobalRole, &u.Status,
			&u.FirstName, &u.LastName, &u.Title, &u.Description, &u.ProfileCompleted,
			&u.CreatedAt, &u.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// SetUserStatus sets the status of a user (approved/pending/suspended).
func (s *Service) SetUserStatus(ctx context.Context, id uuid.UUID, status string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET status=$2, updated_at=now() WHERE id=$1`,
		id, status,
	)
	if err != nil {
		return fmt.Errorf("auth: set user status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("user.not_found", "user not found")
	}
	return nil
}

// SetUserGlobalRole sets the global_role of a user.
func (s *Service) SetUserGlobalRole(ctx context.Context, id uuid.UUID, role string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET global_role=$2, updated_at=now() WHERE id=$1`,
		id, role,
	)
	if err != nil {
		return fmt.Errorf("auth: set user global role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("user.not_found", "user not found")
	}
	return nil
}

// DeleteUser deletes a user (local_credentials cascade via FK).
func (s *Service) DeleteUser(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM users WHERE id=$1`,
		id,
	)
	if err != nil {
		return fmt.Errorf("auth: delete user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("user.not_found", "user not found")
	}
	return nil
}

// isPgError attempts to unwrap err as a *pgconn.PgError.
func isPgError(err error, target **pgconn.PgError) bool {
	if err == nil {
		return false
	}
	if e, ok := err.(*pgconn.PgError); ok {
		*target = e
		return true
	}
	return false
}
