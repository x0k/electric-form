// prices — сбор минимальных цен из магазинов Сыктывкара в SQLite.
//
//	prices scrape [--city syktyvkar] [--db PATH] [--mapping PATH]
//	        [--only cable-vvg-3x2.5,breaker-16] [--shops orion,kristall]
//	        [--dry-run] [--delay 800ms]
//	prices daemon [--interval 24h] [остальные флаги scrape]
//
// scrape пишет офферы в price_offers и печатает JSON-итог в stdout
// (для вызова из SvelteKit remote-функции).
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"electric-form/parsers/internal/fetch"
	"electric-form/parsers/internal/match"
	"electric-form/parsers/internal/shops"
	"electric-form/parsers/internal/store"
)

type mappingEntry struct {
	// Query — канонический запрос: по нему идет сопоставление (Relevant/Best).
	Query string `json:"query"`
	// MinWords — минимум совпавших слов для spec-запросов (по умолчанию 1).
	MinWords int `json:"minWords"`
	// Exclude — слова-маркеры чужого класса ("лампа" ≠ датчик).
	Exclude []string `json:"exclude"`
	// Search — поисковые строки по магазинам (по умолчанию Query).
	// Нужны, т.к. поиск Ориона строгий (AND), а Кристалл/Мкреп — loose.
	Search map[string]string `json:"search"`
}

type mapping struct {
	Materials map[string]mappingEntry `json:"materials"`
}

type materialResult struct {
	MaterialID string       `json:"materialId"`
	Query      string       `json:"query"`
	Best       *shops.Offer `json:"best"`
	Offers     int          `json:"offers"`
	Errors     []string     `json:"errors,omitempty"`
}

type summary struct {
	RunID     int64            `json:"runId"`
	City      string           `json:"city"`
	Status    string           `json:"status"`
	Materials []materialResult `json:"materials"`
}

func main() {
	if len(os.Args) < 2 {
		fatal("usage: prices <scrape|daemon> [flags]")
	}
	switch os.Args[1] {
	case "scrape":
		os.Exit(runScrape(os.Args[2:]))
	case "daemon":
		os.Exit(runDaemon(os.Args[2:]))
	default:
		fatal("unknown command: " + os.Args[1])
	}
}

type options struct {
	city    string
	db      string
	mapping string
	only    string
	shops   string
	dryRun  bool
	delay   time.Duration
}

func flagsFor(fs *flag.FlagSet) *options {
	o := &options{}
	fs.StringVar(&o.city, "city", "syktyvkar", "город (поддомен kristall43, фильтр выборки)")
	fs.StringVar(&o.db, "db", "", "путь к app.db (по умолчанию как в SvelteKit)")
	fs.StringVar(&o.mapping, "mapping", "mappings/seed-mapping.json", "путь к маппингу запросов")
	fs.StringVar(&o.only, "only", "", "только материалы через запятую")
	fs.StringVar(&o.shops, "shops", "orion,kristall,mkrep", "магазины через запятую")
	fs.BoolVar(&o.dryRun, "dry-run", false, "не писать в БД, только stdout")
	fs.DurationVar(&o.delay, "delay", 800*time.Millisecond, "пауза между HTTP-запросами")
	return o
}

func runDaemon(args []string) int {
	fs := flag.NewFlagSet("daemon", flag.ExitOnError)
	o := flagsFor(fs)
	interval := fs.Duration("interval", 24*time.Hour, "период повтора")
	_ = fs.Parse(args)
	for {
		code := scrape(*o)
		if code != 0 {
			fmt.Fprintf(os.Stderr, "scrape failed, retry in %s\n", *interval)
		}
		time.Sleep(*interval)
	}
}

func runScrape(args []string) int {
	fs := flag.NewFlagSet("scrape", flag.ExitOnError)
	o := flagsFor(fs)
	_ = fs.Parse(args)
	return scrape(*o)
}

func scrape(o options) int {
	ctx := context.Background()
	mp, err := loadMapping(o.mapping)
	if err != nil {
		fatal(fmt.Sprintf("mapping: %v", err))
	}
	fc, err := fetch.New(o.delay)
	if err != nil {
		fatal(err.Error())
	}
	allShops := []shops.Shop{
		shops.Orion{Base: "https://orionsvet.com", HTTP: fc},
		shops.Kristall{Base: fmt.Sprintf("https://%s.kristall43.ru", kristallSub(o.city)), HTTP: fc},
		shops.Mkrep{Base: "https://mkrep.ru", HTTP: fc},
	}
	wantShops := splitSet(o.shops)
	var active []shops.Shop
	for _, s := range allShops {
		if wantShops[s.Name()] {
			active = append(active, s)
		}
	}
	only := splitSet(o.only)

	var db *sql.DB
	var runID int64
	if !o.dryRun {
		db, err = store.Open(o.db)
		if err != nil {
			fatal(fmt.Sprintf("db: %v", err))
		}
		defer db.Close()
		runID, err = store.StartRun(db, o.city)
		if err != nil {
			fatal(fmt.Sprintf("start run: %v", err))
		}
	}

	sum := summary{RunID: runID, City: o.city, Status: "ok"}
	failCount := 0
	for matID, entry := range mp.Materials {
		if len(only) > 0 && !only[matID] {
			continue
		}
		res := materialResult{MaterialID: matID, Query: entry.Query}
		var found []shops.Offer
		for _, s := range active {
			q := entry.Query
			if v, ok := entry.Search[s.Name()]; ok && v != "" {
				q = v
			}
			offers, err := s.Search(ctx, q)
			if err != nil {
				res.Errors = append(res.Errors, s.Name()+": "+err.Error())
				continue
			}
			found = append(found, offers...)
		}
		res.Offers = len(found)
		if best, ok := match.Best(entry.Query, found, entry.MinWords, entry.Exclude); ok {
			b := best
			res.Best = &b
		}
		if !o.dryRun && len(found) > 0 {
			if err := store.SaveOffers(db, runID, o.city, matID, found); err != nil {
				res.Errors = append(res.Errors, "store: "+err.Error())
			}
		}
		if len(found) == 0 {
			failCount++
		}
		sum.Materials = append(sum.Materials, res)
	}
	if failCount > 0 && len(sum.Materials) > 0 && failCount == len(sum.Materials) {
		sum.Status = "error"
	} else if failCount > 0 {
		sum.Status = "partial"
	}
	if !o.dryRun {
		errText := ""
		if sum.Status != "ok" {
			errText = fmt.Sprintf("%d/%d без офферов", failCount, len(sum.Materials))
		}
		if err := store.FinishRun(db, runID, sum.Status, errText); err != nil {
			fmt.Fprintf(os.Stderr, "finish run: %v\n", err)
			return 1
		}
	}
	out, _ := json.MarshalIndent(sum, "", "  ")
	fmt.Println(string(out))
	if sum.Status == "error" {
		return 1
	}
	return 0
}

// kristallSub отображает город в поддомен kristall43.
func kristallSub(city string) string {
	switch strings.ToLower(city) {
	case "", "syktyvkar", "сыктывкар":
		return "syktyvkar"
	default:
		return strings.ToLower(city)
	}
}

func splitSet(s string) map[string]bool {
	m := map[string]bool{}
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			m[p] = true
		}
	}
	return m
}

func loadMapping(path string) (*mapping, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var mp mapping
	if err := json.Unmarshal(b, &mp); err != nil {
		return nil, err
	}
	return &mp, nil
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, "prices: "+msg)
	os.Exit(2)
}
