// Command seed loads demo data into the local database. It is safe to run
// repeatedly (each seeder is idempotent). Modules contribute seeders here as
// tracks land; for now it seeds the dev login user.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/db"
)

func main() {
	if err := run(); err != nil {
		slog.Error("seed failed", "err", err)
		os.Exit(1)
	}
	slog.Info("seed complete")
}

func run() error {
	_ = godotenv.Load()
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool, cfg.DatabaseURL); err != nil {
		return err
	}

	authSvc, err := auth.NewService(ctx, pool, cfg, audit.NewRecorder(pool, logger), logger)
	if err != nil {
		return err
	}
	if err := authSvc.SeedDevUser(ctx); err != nil {
		return err
	}
	logger.Info("seeded dev user", "email", "dev@graphene-lab.org", "password", "devpassword")

	if err := seedDemo(ctx, pool, logger); err != nil {
		return fmt.Errorf("seedDemo: %w", err)
	}
	return nil
}

// seedDemo inserts a graphene-domain demo narrative that exercises every
// major feature. The whole function is guarded by the workspace slug so
// running it twice is safe (idempotent).
func seedDemo(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	// ── 1. Look up dev user ──────────────────────────────────────────────────
	var devUserID string
	err := pool.QueryRow(ctx,
		`SELECT id FROM users WHERE email = 'dev@graphene-lab.org'`).Scan(&devUserID)
	if err != nil {
		return fmt.Errorf("look up dev user: %w", err)
	}

	// ── 2. Idempotency guard ──────────────────────────────────────────────────
	var existingWS string
	err = pool.QueryRow(ctx,
		`SELECT id FROM workspaces WHERE slug = 'graphene-lab'`).Scan(&existingWS)
	if err == nil {
		logger.Info("demo already seeded", "workspace_id", existingWS)
		return nil
	}
	if err != pgx.ErrNoRows {
		return fmt.Errorf("check workspace: %w", err)
	}

	// ── 3. Begin transaction ──────────────────────────────────────────────────
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// ── 4. Workspace ─────────────────────────────────────────────────────────
	var wsID string
	err = tx.QueryRow(ctx, `
		INSERT INTO workspaces (name, slug, created_by)
		VALUES ('Graphene Lab', 'graphene-lab', $1)
		RETURNING id`, devUserID).Scan(&wsID)
	if err != nil {
		return fmt.Errorf("insert workspace: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO workspace_memberships (workspace_id, user_id, role)
		VALUES ($1, $2, 'owner')`, wsID, devUserID)
	if err != nil {
		return fmt.Errorf("insert workspace_membership: %w", err)
	}

	// ── 5. Projects ───────────────────────────────────────────────────────────
	var proj1ID string
	err = tx.QueryRow(ctx, `
		INSERT INTO projects (workspace_id, name, description, visibility, created_by)
		VALUES ($1, 'CVD Graphene Growth',
		        'LPCVD graphene growth on copper-foil substrates for all-carbon device fabrication.',
		        'workspace', $2)
		RETURNING id`, wsID, devUserID).Scan(&proj1ID)
	if err != nil {
		return fmt.Errorf("insert project 1: %w", err)
	}

	var proj2ID string
	err = tx.QueryRow(ctx, `
		INSERT INTO projects (workspace_id, name, description, visibility, created_by)
		VALUES ($1, 'All-Carbon Resistive Switches',
		        'Two-terminal MIM resistive switching devices with graphene electrodes.',
		        'workspace', $2)
		RETURNING id`, wsID, devUserID).Scan(&proj2ID)
	if err != nil {
		return fmt.Errorf("insert project 2: %w", err)
	}

	// ── 6. Iterations (project 1) ─────────────────────────────────────────────
	var iter1ID string
	err = tx.QueryRow(ctx, `
		INSERT INTO iterations (project_id, title, description, status, position,
		                        start_at, end_at, created_by)
		VALUES ($1, 'Growth Parameter Sweep — Q2',
		        'Systematically vary T, pressure, and CH4 flow to map phase space.',
		        'active', 1,
		        now(), now() + interval '30 days',
		        $2)
		RETURNING id`, proj1ID, devUserID).Scan(&iter1ID)
	if err != nil {
		return fmt.Errorf("insert iteration 1: %w", err)
	}

	var iter2ID string
	err = tx.QueryRow(ctx, `
		INSERT INTO iterations (project_id, title, description, status, position,
		                        start_at, end_at, created_by)
		VALUES ($1, 'Transfer Protocol Optimisation',
		        'Compare PMMA vs. electrochemical delamination transfer routes.',
		        'planned', 2,
		        now() + interval '31 days', now() + interval '60 days',
		        $2)
		RETURNING id`, proj1ID, devUserID).Scan(&iter2ID)
	if err != nil {
		return fmt.Errorf("insert iteration 2: %w", err)
	}

	// ── 7. Samples ────────────────────────────────────────────────────────────
	// Project 1 samples
	var sCuFoilID string
	err = tx.QueryRow(ctx, `
		INSERT INTO samples (project_id, identifier, name, kind, status, properties, created_by)
		VALUES ($1, 'Cu-foil-01', 'Copper foil substrate batch A',
		        'precursor', 'active',
		        '{"supplier":"Alfa Aesar","thickness_um":25,"purity":"99.8%"}',
		        $2)
		RETURNING id`, proj1ID, devUserID).Scan(&sCuFoilID)
	if err != nil {
		return fmt.Errorf("insert sample Cu-foil-01: %w", err)
	}

	var sGCVD014ID string
	err = tx.QueryRow(ctx, `
		INSERT INTO samples (project_id, identifier, name, kind, status, properties, created_by)
		VALUES ($1, 'G-CVD-014', 'Graphene on Cu (1000 °C, 30 min)',
		        'other', 'active',
		        '{"growth_temp_C":1000,"duration_min":30,"CH4_sccm":5,"H2_sccm":50,"pressure_mTorr":200}',
		        $2)
		RETURNING id`, proj1ID, devUserID).Scan(&sGCVD014ID)
	if err != nil {
		return fmt.Errorf("insert sample G-CVD-014: %w", err)
	}

	var sGCVD015ID string
	err = tx.QueryRow(ctx, `
		INSERT INTO samples (project_id, identifier, name, kind, status, properties, created_by)
		VALUES ($1, 'G-CVD-015', 'Graphene on Cu (1050 °C, 20 min)',
		        'other', 'active',
		        '{"growth_temp_C":1050,"duration_min":20,"CH4_sccm":3,"H2_sccm":50,"pressure_mTorr":200}',
		        $2)
		RETURNING id`, proj1ID, devUserID).Scan(&sGCVD015ID)
	if err != nil {
		return fmt.Errorf("insert sample G-CVD-015: %w", err)
	}

	// Project 2 samples
	var sElectrodeID string
	err = tx.QueryRow(ctx, `
		INSERT INTO samples (project_id, identifier, name, kind, status, properties, created_by)
		VALUES ($1, 'GE-001', 'Graphene bottom electrode on SiO2/Si',
		        'electrode', 'active',
		        '{"substrate":"SiO2/Si","transfer_method":"PMMA","sheet_resistance_ohm_sq":320}',
		        $2)
		RETURNING id`, proj2ID, devUserID).Scan(&sElectrodeID)
	if err != nil {
		return fmt.Errorf("insert sample GE-001: %w", err)
	}

	var sRSdevID string
	err = tx.QueryRow(ctx, `
		INSERT INTO samples (project_id, identifier, name, kind, status, properties, created_by)
		VALUES ($1, 'RS-dev-03', 'MIM resistive switch device #3',
		        'cell', 'active',
		        '{"insulator":"HfO2","thickness_nm":8,"compliance_current_A":1e-4,"HRS_ohm":1e6,"LRS_ohm":5e3}',
		        $2)
		RETURNING id`, proj2ID, devUserID).Scan(&sRSdevID)
	if err != nil {
		return fmt.Errorf("insert sample RS-dev-03: %w", err)
	}

	// Sample relations: G-CVD-014 derived_from Cu-foil-01; RS-dev-03 assembled_into using GE-001
	_, err = tx.Exec(ctx, `
		INSERT INTO sample_relations (parent_sample_id, child_sample_id, relation_type, project_id, notes)
		VALUES ($1, $2, 'derived_from', $3, 'CVD growth on Cu foil batch A')`,
		sCuFoilID, sGCVD014ID, proj1ID)
	if err != nil {
		return fmt.Errorf("insert sample_relation derived_from: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO sample_relations (parent_sample_id, child_sample_id, relation_type, project_id, notes)
		VALUES ($1, $2, 'split_from', $3, 'Same Cu batch, different growth conditions')`,
		sGCVD014ID, sGCVD015ID, proj1ID)
	if err != nil {
		return fmt.Errorf("insert sample_relation split_from: %w", err)
	}

	// ── 8. iteration_samples ──────────────────────────────────────────────────
	_, err = tx.Exec(ctx, `
		INSERT INTO iteration_samples (iteration_id, sample_id, role, note)
		VALUES ($1, $2, 'input', 'Raw Cu foil for this growth cycle')`,
		iter1ID, sCuFoilID)
	if err != nil {
		return fmt.Errorf("insert iteration_sample Cu-foil-01: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO iteration_samples (iteration_id, sample_id, role, note)
		VALUES ($1, $2, 'output', 'Primary growth product under evaluation')`,
		iter1ID, sGCVD014ID)
	if err != nil {
		return fmt.Errorf("insert iteration_sample G-CVD-014: %w", err)
	}

	// ── 9. Experiments (project 1) ────────────────────────────────────────────
	performedAt1 := time.Now().Add(-72 * time.Hour)
	var exp1ID string
	err = tx.QueryRow(ctx, `
		INSERT INTO experiments (project_id, iteration_id, method, seq, code,
		                         parameters, result_summary, status,
		                         performed_by, performed_at, created_by)
		VALUES ($1, $2, 'synthesis', 1, 'EX-1',
		        '{"temp_C":1000,"pressure_mTorr":200,"CH4_sccm":5,"H2_sccm":50,"duration_min":30}',
		        'Single-layer graphene confirmed by Raman 2D/G ratio ~2.1; full Cu coverage.',
		        'completed',
		        $3, $4, $3)
		RETURNING id`, proj1ID, iter1ID, devUserID, performedAt1).Scan(&exp1ID)
	if err != nil {
		return fmt.Errorf("insert experiment EX-1: %w", err)
	}

	performedAt2 := time.Now().Add(-48 * time.Hour)
	var exp2ID string
	err = tx.QueryRow(ctx, `
		INSERT INTO experiments (project_id, iteration_id, method, seq, code,
		                         parameters, result_summary, status,
		                         performed_by, performed_at, created_by)
		VALUES ($1, $2, 'SEM', 2, 'EX-2',
		        '{"accelerating_kV":5,"WD_mm":10,"magnification":5000}',
		        'SEM shows continuous graphene film; grain boundaries visible at 10 kX.',
		        'completed',
		        $3, $4, $3)
		RETURNING id`, proj1ID, iter1ID, devUserID, performedAt2).Scan(&exp2ID)
	if err != nil {
		return fmt.Errorf("insert experiment EX-2: %w", err)
	}

	var exp3ID string
	err = tx.QueryRow(ctx, `
		INSERT INTO experiments (project_id, iteration_id, method, seq, code,
		                         parameters, result_summary, status,
		                         performed_by, performed_at, created_by)
		VALUES ($1, $2, 'synthesis', 3, 'EX-3',
		        '{"temp_C":1050,"pressure_mTorr":200,"CH4_sccm":3,"H2_sccm":50,"duration_min":20}',
		        '',
		        'in_progress',
		        $3, now(), $3)
		RETURNING id`, proj1ID, iter1ID, devUserID).Scan(&exp3ID)
	if err != nil {
		return fmt.Errorf("insert experiment EX-3: %w", err)
	}

	// Project 2 experiments
	performedAt4 := time.Now().Add(-24 * time.Hour)
	var exp4ID string
	err = tx.QueryRow(ctx, `
		INSERT INTO experiments (project_id, method, seq, code,
		                         parameters, result_summary, status,
		                         performed_by, performed_at, created_by)
		VALUES ($1, 'EIS', 1, 'EX-1',
		        '{"freq_range_Hz":[0.01,1e6],"Vac_mV":10,"Vdc_V":0}',
		        'RC time constant ~2.1 µs; Rs 35 Ω, Rct 1.2 MΩ.',
		        'completed',
		        $2, $3, $2)
		RETURNING id`, proj2ID, devUserID, performedAt4).Scan(&exp4ID)
	if err != nil {
		return fmt.Errorf("insert experiment proj2/EX-1: %w", err)
	}

	var exp5ID string
	err = tx.QueryRow(ctx, `
		INSERT INTO experiments (project_id, method, seq, code,
		                         parameters, result_summary, status,
		                         performed_by, performed_at, created_by)
		VALUES ($1, 'cycling', 2, 'EX-2',
		        '{"cycles":100,"V_set_V":2.0,"V_reset_V":-1.5,"compliance_A":1e-4}',
		        'SET/RESET endurance stable to 87 cycles; HRS/LRS ratio >100.',
		        'completed',
		        $2, now(), $2)
		RETURNING id`, proj2ID, devUserID).Scan(&exp5ID)
	if err != nil {
		return fmt.Errorf("insert experiment proj2/EX-2: %w", err)
	}

	// ── 10. experiment_samples ────────────────────────────────────────────────
	_, err = tx.Exec(ctx, `
		INSERT INTO experiment_samples (experiment_id, sample_id, role, note)
		VALUES ($1, $2, 'subject', 'Primary growth sample')`,
		exp1ID, sGCVD014ID)
	if err != nil {
		return fmt.Errorf("insert experiment_sample exp1/G-CVD-014: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO experiment_samples (experiment_id, sample_id, role, note)
		VALUES ($1, $2, 'subject', 'SEM characterisation target')`,
		exp2ID, sGCVD014ID)
	if err != nil {
		return fmt.Errorf("insert experiment_sample exp2/G-CVD-014: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO experiment_samples (experiment_id, sample_id, role, note)
		VALUES ($1, $2, 'subject', 'EIS characterisation of MIM cell')`,
		exp4ID, sRSdevID)
	if err != nil {
		return fmt.Errorf("insert experiment_sample exp4/RS-dev-03: %w", err)
	}

	// ── 11. Risks ─────────────────────────────────────────────────────────────
	_, err = tx.Exec(ctx, `
		INSERT INTO risks (project_id, iteration_id, seq, title,
		                   likelihood, impact_headline, impact_description, mitigation, plan_b,
		                   status, flagged_for_pi_review, source, created_by)
		VALUES ($1, $2, 1,
		        'Cu foil surface oxidation before growth',
		        'high',
		        'Non-uniform graphene coverage',
		        'Oxidised Cu surface sites nucleate multilayer islands, degrading film uniformity.',
		        'Anneal in 5% H2/Ar at 1000 °C for 30 min immediately before CH4 introduction.',
		        'Switch to electropolished Cu or Pt foil substrates.',
		        'open', true, 'human', $3)`,
		proj1ID, iter1ID, devUserID)
	if err != nil {
		return fmt.Errorf("insert risk 1: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO risks (project_id, seq, title,
		                   likelihood, impact_headline, impact_description, mitigation, plan_b,
		                   status, flagged_for_pi_review, source, created_by)
		VALUES ($1, 2,
		        'PMMA residue on transferred graphene',
		        'med',
		        'Elevated sheet resistance and device variability',
		        'Incomplete PMMA removal leaves polymer residue that degrades electrical contact.',
		        'Extend acetone soak to 12 h + 350 °C vacuum anneal.',
		        'Switch to electrochemical delamination (bubbling) transfer.',
		        'open', false, 'human', $2)`,
		proj1ID, devUserID)
	if err != nil {
		return fmt.Errorf("insert risk 2: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO risks (project_id, seq, title,
		                   likelihood, impact_headline, impact_description, mitigation, plan_b,
		                   status, flagged_for_pi_review, source, created_by)
		VALUES ($1, 1,
		        'HfO2 dielectric breakdown during cycling',
		        'low',
		        'Permanent device failure above compliance current',
		        'HfO2 pinhole defects may cause hard breakdown at high compliance settings.',
		        'Keep compliance current ≤ 100 µA; thicken HfO2 to 10 nm.',
		        'Use Al2O3 as alternative dielectric.',
		        'mitigated', false, 'ai', $2)`,
		proj2ID, devUserID)
	if err != nil {
		return fmt.Errorf("insert risk 3: %w", err)
	}

	// ── 12. Artifacts ─────────────────────────────────────────────────────────
	_, err = tx.Exec(ctx, `
		INSERT INTO artifacts (project_id, type, filename, content_type, size_bytes,
		                       storage_key, metadata, processing_status, uploaded_by)
		VALUES ($1, 'image', 'G-CVD-014_SEM_5kX.tiff',
		        'image/tiff', 4194304,
		        'graphene-lab/proj1/artifacts/G-CVD-014_SEM_5kX.tiff',
		        '{"magnification":5000,"detector":"SE2","stage_tilt_deg":0}',
		        'done', $2)`,
		proj1ID, devUserID)
	if err != nil {
		return fmt.Errorf("insert artifact 1: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO artifacts (project_id, type, filename, content_type, size_bytes,
		                       storage_key, metadata, processing_status, uploaded_by)
		VALUES ($1, 'ipynb', 'CVD_growth_analysis.ipynb',
		        'application/x-ipynb+json', 81920,
		        'graphene-lab/proj1/artifacts/CVD_growth_analysis.ipynb',
		        '{"kernel":"python3","raman_peaks":{"D":1347,"G":1582,"2D":2695}}',
		        'done', $2)`,
		proj1ID, devUserID)
	if err != nil {
		return fmt.Errorf("insert artifact 2: %w", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO artifacts (project_id, type, filename, content_type, size_bytes,
		                       storage_key, metadata, processing_status, uploaded_by)
		VALUES ($1, 'pdf', 'RS-dev-03_EIS_report.pdf',
		        'application/pdf', 614400,
		        'graphene-lab/proj2/artifacts/RS-dev-03_EIS_report.pdf',
		        '{"pages":8,"software":"ZView 3.5b"}',
		        'done', $2)`,
		proj2ID, devUserID)
	if err != nil {
		return fmt.Errorf("insert artifact 3: %w", err)
	}

	// ── 13. Meeting ───────────────────────────────────────────────────────────
	meetingStart := time.Now().Add(48 * time.Hour).Truncate(time.Hour)
	_, err = tx.Exec(ctx, `
		INSERT INTO meetings (workspace_id, project_id, title, kind, chair,
		                      start_at, end_at, location, agenda, notes,
		                      attendees, decisions, action_items, created_by)
		VALUES ($1, $2,
		        'Q2 Graphene Growth Review',
		        'review',
		        $3,
		        $4::timestamptz,
		        $4::timestamptz + interval '1 hour',
		        'E3A-06-25 Seminar Room',
		        '1. Growth parameter sweep results\n2. SEM characterisation summary\n3. Risk review & PI sign-off',
		        '',
		        '["dev"]',
		        '["Proceed with 1050 °C growth at reduced CH4 flow for next iteration"]',
		        '[{"text":"Re-run EIS on G-CVD-014 after improved transfer","owner":"dev","done":false},{"text":"Order electropolished Cu foil (25 µm) from Alfa Aesar","owner":"dev","done":false}]',
		        $3)`,
		wsID, proj1ID, devUserID, meetingStart)
	if err != nil {
		return fmt.Errorf("insert meeting: %w", err)
	}

	// ── 14. Commit ────────────────────────────────────────────────────────────
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	logger.Info("demo seeded",
		"workspace", "graphene-lab",
		"projects", 2,
		"iterations", 2,
		"samples", 5,
		"sample_relations", 2,
		"experiments", 5,
		"risks", 3,
		"artifacts", 3,
		"meetings", 1,
	)
	return nil
}
