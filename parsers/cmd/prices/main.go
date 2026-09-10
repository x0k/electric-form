// prices — сбор минимальных цен из магазинов Сыктывкара в SQLite.
//
//	prices scrape [--city syktyvkar] [--db PATH] [--mapping PATH]
//	        [--only cable-vvg-3x2.5,breaker-16] [--shops orion,kristall]
//	        [--dry-run] [--delay 800ms] [--run-id 42]
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
	"log"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"electric-form/parsers/internal/fetch"
	"electric-form/parsers/internal/match"
	"electric-form/parsers/internal/shops"
	"electric-form/parsers/internal/store"
	"electric-form/parsers/mappings"
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
	runID   int64
}

func flagsFor(fs *flag.FlagSet) *options {
	o := &options{}
	fs.StringVar(&o.city, "city", "syktyvkar", "город (поддомен kristall43, фильтр выборки)")
	fs.StringVar(&o.db, "db", "", "путь к app.db (по умолчанию как в SvelteKit)")
	fs.StringVar(&o.mapping, "mapping", "", "путь к маппингу запросов (по умолчанию встроенный)")
	fs.StringVar(&o.only, "only", "", "только материалы через запятую")
	fs.StringVar(&o.shops, "shops", "orion,kristall,mkrep", "магазины через запятую")
	fs.BoolVar(&o.dryRun, "dry-run", false, "не писать в БД, только stdout")
	fs.DurationVar(&o.delay, "delay", 800*time.Millisecond, "пауза между HTTP-запросами")
	fs.Int64Var(&o.runID, "run-id", 0, "занять строку price_runs, созданную приложением")
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
	// Конкурентный опрос магазинов: у каждого магазина свой fetch-клиент
	// (свой rate-limit, без общего состояния), запросы одного материала
	// идут параллельно. Результаты конкурентных вызовов сохраняются
	// независимо: падение одного магазина не отменяет офферы остальных.
	newClient := func() *fetch.Client {
		fc, err := fetch.New(o.delay)
		if err != nil {
			fatal(err.Error())
		}
		return fc
	}
	allShops := []shops.Shop{
		shops.Orion{Base: "https://orionsvet.com", HTTP: newClient()},
		shops.Kristall{Base: fmt.Sprintf("https://%s.kristall43.ru", kristallSub(o.city)), HTTP: newClient()},
		shops.Mkrep{Base: "https://mkrep.ru", HTTP: newClient()},
	}
	wantShops := splitSet(o.shops)
	var active []shops.Shop
	for _, s := range allShops {
		if wantShops[s.Name()] {
			active = append(active, s)
		}
	}
	only := splitSet(o.only)

	// Детерминированный порядок материалов для стабильных логов.
	matIDs := make([]string, 0, len(mp.Materials))
	for matID := range mp.Materials {
		if len(only) > 0 && !only[matID] {
			continue
		}
		matIDs = append(matIDs, matID)
	}
	sort.Strings(matIDs)

	shopNames := make([]string, 0, len(active))
	for _, s := range active {
		shopNames = append(shopNames, s.Name())
	}

	var db *sql.DB
	var runID int64
	if !o.dryRun {
		db, err = store.Open(o.db)
		if err != nil {
			fatal(fmt.Sprintf("db: %v", err))
		}
		defer db.Close()
		if o.runID > 0 {
			// Строка создана приложением: занимаем её (нет строки — фатал,
			// чтобы не плодить сиротские running без владельца).
			runID = o.runID
			if err := store.ClaimRun(db, runID, len(matIDs)); err != nil {
				fatal(fmt.Sprintf("claim run %d: %v", runID, err))
			}
		} else {
			runID, err = store.StartRun(db, o.city)
			if err != nil {
				fatal(fmt.Sprintf("start run: %v", err))
			}
		}
	}

	log.Printf("prices run=%d city=%s start materials=%d shops=%v", runID, o.city, len(matIDs), shopNames)
	sum := summary{RunID: runID, City: o.city, Status: "ok"}
	failCount := 0
	for i, matID := range matIDs {
		entry := mp.Materials[matID]
		res := materialResult{MaterialID: matID, Query: entry.Query}
		// Магазины опрашиваются конкурентно: падение одного не отменяет
		// результаты остальных — офферы каждого успешного вызова сохраняются.
		var mu sync.Mutex
		var found []shops.Offer
		var wg sync.WaitGroup
		for _, s := range active {
			wg.Add(1)
			go func(s shops.Shop) {
				defer wg.Done()
				q := entry.Query
				if v, ok := entry.Search[s.Name()]; ok && v != "" {
					q = v
				}
				offers, err := s.Search(ctx, q)
				mu.Lock()
				defer mu.Unlock()
				if err != nil {
					msg := s.Name() + ": " + err.Error()
					res.Errors = append(res.Errors, msg)
					// В stderr — подхватывается docker logs.
					log.Printf("prices run=%d material=%s shop=%s error=%v", runID, matID, s.Name(), err)
					return
				}
				log.Printf("prices run=%d material=%s shop=%s offers=%d", runID, matID, s.Name(), len(offers))
				found = append(found, offers...)
			}(s)
		}
		wg.Wait()
		sort.Slice(res.Errors, func(i, j int) bool { return res.Errors[i] < res.Errors[j] })
		res.Offers = len(found)
		if best, ok := match.Best(entry.Query, found, entry.MinWords, entry.Exclude); ok {
			b := best
			res.Best = &b
		}
		if !o.dryRun && len(found) > 0 {
			if err := store.SaveOffers(db, runID, o.city, matID, found); err != nil {
				res.Errors = append(res.Errors, "store: "+err.Error())
				log.Printf("prices run=%d material=%s store error=%v", runID, matID, err)
			}
		}
		if len(found) == 0 {
			failCount++
			log.Printf("prices run=%d material=%s no offers errors=%v", runID, matID, res.Errors)
		}
		sum.Materials = append(sum.Materials, res)
		if !o.dryRun {
			// Heartbeat прогресса: UI видит done/total через live-статус,
			// зависший процесс — по отсутствию heartbeat.
			if err := store.Beat(db, runID, i+1); err != nil {
				log.Printf("prices run=%d heartbeat error=%v", runID, err)
			} else {
				log.Printf("prices run=%d progress %d/%d material=%s offers=%d", runID, i+1, len(matIDs), matID, len(found))
			}
		}
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
	log.Printf("prices run=%d city=%s finish status=%s materials=%d failed=%d", runID, o.city, sum.Status, len(sum.Materials), failCount)
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
	b, err := mappingBytes(path)
	if err != nil {
		return nil, err
	}
	var mp mapping
	if err := json.Unmarshal(b, &mp); err != nil {
		return nil, err
	}
	return &mp, nil
}

// mappingBytes возвращает маппинг: внешний файл при --mapping,
// иначе встроенный. Легаси-дефолт "mappings/seed-mapping.json" (который
// раньше падал в проде из-за отсутствия файла рядом с бинарём) тоже
// откатывается на встроенный, а не на ошибку.
func mappingBytes(path string) ([]byte, error) {
	if path == "" || path == "mappings/seed-mapping.json" {
		if path != "" {
			if b, err := os.ReadFile(path); err == nil {
				return b, nil
			}
		}
		if len(mappings.Seed) == 0 {
			return nil, fmt.Errorf("embedded mapping is empty")
		}
		return mappings.Seed, nil
	}
	return os.ReadFile(path)
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, "prices: "+msg)
	os.Exit(2)
}
