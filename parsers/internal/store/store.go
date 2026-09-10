// Package store — запись результатов парсинга в SQLite.
// Таблицы создаются миграцией drizzle (0002_prices.sql), здесь только
// INSERT. Путь к БД: флаг --db, иначе SQLITE_PATH, иначе
// DATA_DIR/app.db, иначе ./data/app.db — как в src/lib/server/db/client.ts.
package store

import (
	"database/sql"
	"os"
	"path/filepath"
	"time"

	"electric-form/parsers/internal/shops"

	_ "modernc.org/sqlite"
)

// Run описывает один прогон парсера.
type Run struct {
	ID        int64
	City      string
	Status    string
	ErrorText string
}

// Open открывает БД (создает каталог при необходимости).
func Open(path string) (*sql.DB, error) {
	if path == "" {
		path = ResolvePath()
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)")
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	if err := ensureSchema(db); err != nil {
		return nil, err
	}
	return db, nil
}

// ensureSchema создает таблицы парсера, если их нет.
// DDL повторяет drizzle-миграцию 0002 (IF NOT EXISTS — безопасно
// вызывать при каждом запуске, в т.ч. до старта Node-приложения).
func ensureSchema(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS price_runs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		city TEXT NOT NULL,
		status TEXT NOT NULL,
		error TEXT,
		started_at TEXT NOT NULL,
		finished_at TEXT
	);
	CREATE TABLE IF NOT EXISTS price_offers (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		run_id INTEGER,
		material_id TEXT NOT NULL,
		shop TEXT NOT NULL,
		title TEXT NOT NULL,
		url TEXT NOT NULL,
		article TEXT,
		price_rub INTEGER NOT NULL,
		unit TEXT NOT NULL,
		in_stock INTEGER NOT NULL,
		city TEXT NOT NULL,
		observed_at TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_price_offers_material
		ON price_offers (material_id, city, observed_at);`)
	return err
}

// ResolvePath повторяет логику resolveDbPath() из TS-клиента.
func ResolvePath() string {
	if p := os.Getenv("SQLITE_PATH"); p != "" {
		return p
	}
	dir := os.Getenv("DATA_DIR")
	if dir == "" {
		dir = filepath.Join(mustCwd(), "data")
	}
	return filepath.Join(dir, "app.db")
}

func mustCwd() string {
	wd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return wd
}

// StartRun создает запись price_runs со статусом running.
func StartRun(db *sql.DB, city string) (int64, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := db.Exec(
		`INSERT INTO price_runs(city, status, started_at) VALUES (?, 'running', ?)`,
		city, now,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// FinishRun помечает прогон завершенным.
func FinishRun(db *sql.DB, id int64, status, errText string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.Exec(
		`UPDATE price_runs SET status = ?, error = ?, finished_at = ? WHERE id = ?`,
		status, nullIfEmpty(errText), now, id,
	)
	return err
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// SaveOffers пишет офферы материала одним батчем.
func SaveOffers(db *sql.DB, runID int64, city, materialID string, offers []shops.Offer) error {
	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmt, err := tx.Prepare(`INSERT INTO price_offers
		(run_id, material_id, shop, title, url, article, price_rub, unit, in_stock, city, observed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, o := range offers {
		inStock := 0
		if o.InStock {
			inStock = 1
		}
		if _, err := stmt.Exec(runID, materialID, o.Shop, o.Title, o.URL,
			nullIfEmpty(o.Article), o.PriceRub, o.Unit, inStock, city, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}
