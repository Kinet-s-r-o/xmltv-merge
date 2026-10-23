package database

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	config.MaxConns = 10
	config.MinConns = 2
	config.MaxConnLifetime = time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	files, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("list database migrations: %w", err)
	}
	sort.Strings(files)
	for _, file := range files {
		data, err := migrations.ReadFile(file)
		if err != nil {
			pool.Close()
			return nil, fmt.Errorf("read database migration %s: %w", file, err)
		}
		for _, statement := range strings.Split(string(data), ";") {
			if statement = strings.TrimSpace(statement); statement == "" {
				continue
			}
			if _, err := pool.Exec(ctx, statement); err != nil {
				pool.Close()
				return nil, fmt.Errorf("apply database migration %s: %w", file, err)
			}
		}
	}

	return pool, nil
}
