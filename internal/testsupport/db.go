// Package testsupport provides shared helpers for tests that need a real
// Postgres (per the Definition of Done: HTTP contract tests run against a
// throwaway testdb, not mocks). Tests skip cleanly when Postgres is
// unreachable so `go test ./...` still passes in environments without Docker.
package testsupport

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/db"
)

const defaultTestDSN = "postgres://lab:lab@localhost:5432/lab_test?sslmode=disable"
const adminDSN = "postgres://lab:lab@localhost:5432/lab?sslmode=disable"

var migrateOnce sync.Once

// DSN returns the test database DSN (TEST_DATABASE_URL or the local default).
func DSN() string {
	if v := os.Getenv("TEST_DATABASE_URL"); v != "" {
		return v
	}
	return defaultTestDSN
}

// NewPool returns a pool against a freshly-migrated test database. The first
// caller creates the `lab_test` database (if missing) and runs all migrations
// once per process. If Postgres is unreachable, the test is skipped.
func NewPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	ensureTestDB(t, ctx)

	pool, err := db.Connect(ctx, DSN())
	if err != nil {
		t.Skipf("skipping: cannot connect to test database (%v)", err)
	}

	var migErr error
	migrateOnce.Do(func() {
		migErr = db.Migrate(ctx, pool, DSN())
	})
	if migErr != nil {
		t.Fatalf("migrate test db: %v", migErr)
	}
	t.Cleanup(pool.Close)
	return pool
}

func ensureTestDB(t *testing.T, ctx context.Context) {
	t.Helper()
	admin, err := pgxpool.New(ctx, adminDSN)
	if err != nil {
		t.Skipf("skipping: cannot reach Postgres (%v)", err)
	}
	defer admin.Close()
	if err := admin.Ping(ctx); err != nil {
		t.Skipf("skipping: Postgres not ready (%v)", err)
	}
	// CREATE DATABASE cannot run inside a transaction; ignore "already exists".
	_, _ = admin.Exec(ctx, "CREATE DATABASE lab_test")
}

// Truncate removes all rows from the given tables (RESTART IDENTITY CASCADE) so
// a test starts from a clean slate. Safe to call on tables that may not exist
// yet within a partial parallel build (errors are ignored per-table).
func Truncate(t *testing.T, pool *pgxpool.Pool, tables ...string) {
	t.Helper()
	ctx := context.Background()
	for _, tbl := range tables {
		_, _ = pool.Exec(ctx, "TRUNCATE TABLE "+tbl+" RESTART IDENTITY CASCADE")
	}
}
