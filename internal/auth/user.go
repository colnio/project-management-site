package auth

import (
	"context"
	"fmt"
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
// Idempotent — safe to call on every boot.
func (s *Service) SeedDevUser(ctx context.Context) error {
	const devEmail = "dev@graphene-lab.org"
	const devName = "Dev User"
	const devFirstName = "Dev"
	const devLastName = "User"
	const devPw = "devpassword"

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
