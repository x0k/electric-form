package shops

import (
	"context"
	"net/url"
	"strconv"
	"strings"

	"electric-form/parsers/internal/fetch"
	"electric-form/parsers/internal/parse"

	"github.com/PuerkitoBio/goquery"
)

// Kristall — *.kristall43.ru (Aspro CMax). Город задается поддоменом:
// https://syktyvkar.kristall43.ru. Цены есть в HTML выдачи поиска
// (.price[data-value] + .price_measure), наличие — .item-stock.
type Kristall struct {
	Base string
	HTTP *fetch.Client
}

func (s Kristall) Name() string { return "kristall" }

func (s Kristall) Search(ctx context.Context, query string) ([]Offer, error) {
	u := strings.TrimSuffix(s.Base, "/") + "/catalog/?q=" + url.QueryEscape(query)
	body, err := s.HTTP.Get(ctx, u)
	if err != nil {
		return nil, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	var out []Offer
	seen := map[string]bool{}
	doc.Find("a.js-notice-block__title").Each(func(_ int, a *goquery.Selection) {
		title := strings.TrimSpace(a.Text())
		href, _ := a.Attr("href")
		if title == "" || href == "" || seen[href] {
			return
		}
		seen[href] = true
		// Поднимаемся по родителям, пока не найдем блок с ценой.
		var card *goquery.Selection
		node := a
		for i := 0; i < 8; i++ {
			node = node.Parent()
			if node.Length() == 0 {
				break
			}
			if node.Find("div.price[data-value]").Length() > 0 {
				card = node
				break
			}
		}
		if card == nil {
			return
		}
		priceSel := card.Find("div.price[data-value]").First()
		rawVal, _ := priceSel.Attr("data-value")
		price := kristallPrice(rawVal)
		if price <= 0 {
			// Fallback: текст "3 399.97 ₽".
			if p, ok := parse.PriceRub(priceSel.Text()); ok {
				price = p
			} else {
				return
			}
		}
		unit := parse.Unit(card.Find("span.price_measure").First().Text())
		link := href
		if strings.HasPrefix(link, "/") {
			link = strings.TrimSuffix(s.Base, "/") + link
		}
		article := strings.TrimSpace(card.Find("div.article_block").First().Text())
		article = strings.TrimPrefix(article, "Арт.:")
		out = append(out, Offer{
			Shop:     s.Name(),
			Title:    title,
			URL:      link,
			Article:  strings.TrimSpace(article),
			PriceRub: price,
			Unit:     unit,
			InStock:  kristallStock(card.Text()),
		})
	})
	return out, nil
}

func kristallPrice(raw string) int {
	raw = strings.ReplaceAll(strings.TrimSpace(raw), ",", ".")
	f, err := strconv.ParseFloat(raw, 64)
	if err != nil || f <= 0 {
		return 0
	}
	return int(f)
}

func kristallStock(cardText string) bool {
	t := strings.ToLower(cardText)
	for _, neg := range []string{"нет в наличии", "под заказ", "ожидается", "нет на складе"} {
		if strings.Contains(t, neg) {
			return false
		}
	}
	return true
}
