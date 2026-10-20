package main

// Postgres checks. grugbot only needs CONNECT on the database and USAGE + CREATE on one schema.

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type DBParts struct{ Host, Port, Name, User, Password, SSLMode string }

func (p DBParts) URL() string {
	u := url.URL{Scheme: "postgres", User: url.UserPassword(p.User, p.Password), Host: p.Host + ":" + p.Port, Path: "/" + p.Name}
	q := url.Values{}
	if p.SSLMode != "" {
		q.Set("sslmode", p.SSLMode)
	}
	u.RawQuery = q.Encode()
	return u.String()
}

// TestDB connects, then creates and drops a probe table to prove the app can run its migrations.
func TestDB(dsn string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	c, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return "", fmt.Errorf("connect: %s", scrub(err.Error(), dsn))
	}
	defer c.Close(ctx)
	var ver, schema string
	if err := c.QueryRow(ctx, "select current_setting('server_version'), current_schema()").Scan(&ver, &schema); err != nil {
		return "", fmt.Errorf("query: %s", scrub(err.Error(), dsn))
	}
	if _, err := c.Exec(ctx, "create table if not exists grugbot_probe(x int)"); err != nil {
		return "", fmt.Errorf("this user cannot CREATE TABLE in schema %q: %s", schema, scrub(err.Error(), dsn))
	}
	if _, err := c.Exec(ctx, "drop table grugbot_probe"); err != nil {
		return "", fmt.Errorf("drop probe table: %s", scrub(err.Error(), dsn))
	}
	return fmt.Sprintf("Postgres %s, schema %s", ver, schema), nil
}

// scrub keeps passwords out of error messages.
func scrub(msg, dsn string) string {
	if u, err := url.Parse(dsn); err == nil && u.User != nil {
		if pw, ok := u.User.Password(); ok && pw != "" {
			msg = strings.ReplaceAll(msg, pw, "****")
		}
	}
	return msg
}

func maskDSN(dsn string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		return "(unparseable url)"
	}
	if u.User != nil {
		u.User = url.UserPassword(u.User.Username(), "****")
	}
	return strings.Replace(u.String(), "%2A%2A%2A%2A", "****", 1)
}
