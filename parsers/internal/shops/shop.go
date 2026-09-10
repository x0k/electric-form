// Package shops — общий тип оффера и интерфейс магазина.
package shops

import "context"

// Offer — одна товарная позиция с ценой в конкретном магазине.
type Offer struct {
	Shop     string `json:"shop"`
	Title    string `json:"title"`
	URL      string `json:"url"`
	Article  string `json:"article,omitempty"`
	PriceRub int    `json:"priceRub"`
	Unit     string `json:"unit"`
	InStock  bool   `json:"inStock"`
}

// Shop умеет искать товары по текстовому запросу.
type Shop interface {
	// Name возвращает код магазина: orion | kristall | mkrep.
	Name() string
	// Search возвращает найденные офферы (без фильтра релевантности).
	Search(ctx context.Context, query string) ([]Offer, error)
}
