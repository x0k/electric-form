package shops

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"

	"electric-form/parsers/internal/fetch"
	"electric-form/parsers/internal/parse"

	"github.com/PuerkitoBio/goquery"
)

// Orion — orionsvet.com. Цены уже есть в HTML выдачи поиска
// (текст вида "175 ₽/м" внутри карточки), отдельный обход
// детальных страниц не нужен.
type Orion struct {
	Base string
	HTTP *fetch.Client
}

func (s Orion) Name() string { return "orion" }

type orionItem struct {
	Name string `json:"NAME"`
	URL  string `json:"DETAIL_PAGE_URL"`
}

func (s Orion) Search(ctx context.Context, query string) ([]Offer, error) {
	u := s.Base + "/catalog/?q=" + url.QueryEscape(query)
	body, err := s.HTTP.Get(ctx, u)
	if err != nil {
		return nil, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	var out []Offer
	doc.Find("div.catalog-block__info[data-item]").Each(func(_ int, info *goquery.Selection) {
		raw, ok := info.Attr("data-item")
		if !ok {
			return
		}
		var item orionItem
		if err := json.Unmarshal([]byte(raw), &item); err != nil {
			return
		}
		item.Name = strings.TrimSpace(item.Name)
		if item.Name == "" || item.URL == "" {
			return
		}
		// Карточка — ближайший предок, в тексте которого есть цена.
		// (Класс обертки нестабилен между разделами, поэтому ищем по ₽.)
		var card *goquery.Selection
		node := info
		for i := 0; i < 6; i++ {
			node = node.Parent()
			if node.Length() == 0 {
				break
			}
			if strings.Contains(node.Text(), "₽") {
				card = node
				break
			}
		}
		if card == nil {
			return
		}
		text := card.Text()
		price, unit, ok := parse.CardPrice(text)
		if !ok {
			return
		}
		link := item.URL
		if strings.HasPrefix(link, "/") {
			link = strings.TrimSuffix(s.Base, "/") + link
		}
		out = append(out, Offer{
			Shop:     s.Name(),
			Title:    item.Name,
			URL:      link,
			PriceRub: price,
			Unit:     unit,
			InStock:  orionStock(text),
		})
	})
	return out, nil
}

func orionStock(cardText string) bool {
	t := strings.ToLower(cardText)
	for _, neg := range []string{"нет в наличии", "под заказ", "ожидается", "снят с производства"} {
		if strings.Contains(t, neg) {
			return false
		}
	}
	return true
}
