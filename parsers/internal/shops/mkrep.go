package shops

import (
	"context"
	"net/url"
	"strings"

	"electric-form/parsers/internal/fetch"
	"electric-form/parsers/internal/parse"

	"github.com/PuerkitoBio/goquery"
)

// Mkrep — mkrep.ru (Aspro Max). Выдача /search/?q= содержит только
// заголовки и ссылки, поэтому цены и наличие добираются с детальных
// страниц (первые maxDetails ссылок).
type Mkrep struct {
	Base string
	HTTP *fetch.Client
}

func (s Mkrep) Name() string { return "mkrep" }

// maxDetails ограничивает число детальных запросов на один поиск.
const maxDetails = 6

func (s Mkrep) Search(ctx context.Context, query string) ([]Offer, error) {
	u := strings.TrimSuffix(s.Base, "/") + "/search/?q=" + url.QueryEscape(query)
	body, err := s.HTTP.Get(ctx, u)
	if err != nil {
		return nil, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	type link struct{ title, href string }
	var links []link
	seen := map[string]bool{}
	doc.Find("a.dark_link.font_mlg.title, div.search-page-wrap a.title").Each(func(_ int, a *goquery.Selection) {
		href, _ := a.Attr("href")
		title := strings.TrimSpace(a.Text())
		if href == "" || seen[href] || !strings.HasPrefix(href, "/catalog/") {
			return
		}
		if strings.Count(strings.Trim(href, "/"), "/") < 2 {
			return // ссылка на раздел, а не на товар
		}
		seen[href] = true
		links = append(links, link{title: title, href: href})
	})
	if len(links) > maxDetails {
		links = links[:maxDetails]
	}
	var out []Offer
	for _, l := range links {
		if err := ctx.Err(); err != nil {
			return out, err
		}
		offer, err := s.detail(ctx, l.href, l.title)
		if err != nil {
			continue
		}
		out = append(out, offer)
	}
	return out, nil
}

func (s Mkrep) detail(ctx context.Context, href, listTitle string) (Offer, error) {
	var zero Offer
	full := href
	if strings.HasPrefix(full, "/") {
		full = strings.TrimSuffix(s.Base, "/") + full
	}
	body, err := s.HTTP.Get(ctx, full)
	if err != nil {
		return zero, err
	}
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(body))
	if err != nil {
		return zero, err
	}
	priceSel := doc.Find("div.price[data-value]").First()
	if priceSel.Length() == 0 {
		return zero, errNoPrice
	}
	rawVal, _ := priceSel.Attr("data-value")
	price := kristallPrice(rawVal)
	if price <= 0 {
		if p, ok := parse.PriceRub(priceSel.Text()); ok {
			price = p
		} else {
			return zero, errNoPrice
		}
	}
	title := strings.TrimSpace(doc.Find("h1").First().Text())
	if title == "" {
		title = listTitle
	}
	unit := parse.Unit(doc.Find("span.price_measure").First().Text())
	return Offer{
		Shop:     s.Name(),
		Title:    title,
		URL:      full,
		PriceRub: price,
		Unit:     unit,
		InStock:  mkrepStock(doc),
	}, nil
}

// mkrepStock смотрит в первую очередь на блок .item-stock
// ("Нет в наличии"), затем на всю страницу.
func mkrepStock(doc *goquery.Document) bool {
	if el := doc.Find(".item-stock").First(); el.Length() > 0 {
		return !hasNegStock(strings.ToLower(el.Text()))
	}
	return !hasNegStock(strings.ToLower(doc.Text()))
}

func hasNegStock(t string) bool {
	for _, neg := range []string{"нет в наличии", "под заказ", "ожидается поступление", "товар отсутствует"} {
		if strings.Contains(t, neg) {
			return true
		}
	}
	return false
}

var errNoPrice = errorString("no price on page")

type errorString string

func (e errorString) Error() string { return string(e) }
