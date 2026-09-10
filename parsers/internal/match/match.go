// Package match — проверка релевантности оффера запросу и выбор
// минимальной цены. Ключевая эвристика: оффер должен содержать
// нормализованный «спецтокен» (сечение кабеля, номинал автомата и т.п.),
// иначе это нерелевантный товар из выдачи поиска.
package match

import (
	"regexp"
	"strings"

	"electric-form/parsers/internal/shops"
)

var spacesRe = regexp.MustCompile(`\s+`)

// Norm приводит строку к каноническому виду для сравнения:
// нижний регистр, кириллическое х и * -> x, ё -> е.
func Norm(s string) string {
	t := strings.ToLower(s)
	t = strings.ReplaceAll(t, "ё", "е")
	t = strings.ReplaceAll(t, "х", "x")
	t = strings.ReplaceAll(t, "×", "x")
	t = strings.ReplaceAll(t, "*", "x")
	t = strings.ReplaceAll(t, ",", ".")
	t = strings.ReplaceAll(t, " ", " ")
	t = spacesRe.ReplaceAllString(t, " ")
	t = strings.ReplaceAll(t, " x ", "x")
	t = strings.ReplaceAll(t, " x", "x")
	t = strings.ReplaceAll(t, "x ", "x")
	return strings.TrimSpace(t)
}

// specRe вылавливает токены вида 3x2.5, 5x6, 16а, 30ма, а также голые
// числа (сечение, число модулей: "ПуВ 4", "щит 24 модуля").
// Внимание: \b в Go работает только с ASCII, поэтому границы токена
// заданы явно. Порядок альтернатив важен: x-форма, затем А/мА,
// затем голое число — чтобы "16А" не разбивалось на "16".
// Norm() уже lower-case: "А" (ампер) -> "а", "мА" -> "ма".
var specRe = regexp.MustCompile(`\d+[xх×]\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:ма|а)(?:\s|$)|(?:^|\s)\d+(?:[.,]\d+)?(?:\s|$)`)

// SpecTokens возвращает множество спецтокенов запроса.
func SpecTokens(query string) []string {
	var out []string
	for _, m := range specRe.FindAllString(Norm(query)+" ", -1) {
		tok := strings.ReplaceAll(strings.TrimSpace(m), " ", "")
		out = append(out, tok)
	}
	return out
}

// wordRe бьет строку на слова (буквы и цифры).
var wordRe = regexp.MustCompile(`[\p{L}\p{N}]+`)

// canon сводит синонимы к канонической форме:
// автомат/автоматический, дифавтомат/дифференциальный,
// щит/бокс (корпус щита).
func canon(w string) string {
	switch {
	case strings.HasPrefix(w, "автомат"):
		return "автомат"
	case strings.HasPrefix(w, "дифавтомат") || strings.HasPrefix(w, "дифференц"):
		return "дифавтомат"
	case strings.HasPrefix(w, "бокс") || strings.HasPrefix(w, "щит"):
		return "щит"
	default:
		return w
	}
}

// wordMatch: точное равенство канонических форм, совпадение с начала
// слова (ввг/ввгп, выключатель/выключатели) или общий префикс >= 5.
// Подстрока в середине запрещена — чтобы «ввг» не находился в «аввг».
func wordMatch(qw, tw string) bool {
	qw, tw = canon(qw), canon(tw)
	if qw == tw {
		return true
	}
	qr, tr := []rune(qw), []rune(tw)
	if len(qr) >= 3 && len(tr) >= len(qr) && startsWith(tr, qr) {
		return true
	}
	if len(tr) >= 5 && len(qr) >= len(tr) && startsWith(qr, tr) {
		return true
	}
	return false
}

func startsWith(s, prefix []rune) bool {
	for i := range prefix {
		if s[i] != prefix[i] {
			return false
		}
	}
	return true
}

// matchedWords считает, сколько значимых слов запроса совпало
// со словами заголовка (wordMatch). Слова с цифрами пропускаются —
// цифры покрываются спецтокенами.
func matchedWords(query, title string) int {
	nq := Norm(query)
	nt := Norm(title)
	tws := wordRe.FindAllString(nt, -1)
	n := 0
	for _, qw := range wordRe.FindAllString(nq, -1) {
		if len([]rune(qw)) < 3 || hasDigit(qw) {
			continue
		}
		for _, tw := range tws {
			if wordMatch(qw, tw) {
				n++
				break
			}
		}
	}
	return n
}

// Relevant проверяет:
//  1. заголовок не содержит exclude-слов (лампа ≠ датчик);
//  2. заголовок содержит ВСЕ спецтокены запроса (сечение, номинал);
//  3. число совпавших значимых слов >= minWords (по умолчанию 1).
//
// Если у запроса спецтокенов нет (например, "подрозетник"),
// словами считаются вхождения подстроки длиной >= 4
// (покрывает множественное число), порог тот же minWords.
func Relevant(query, title string, minWords int, exclude []string) bool {
	nt := Norm(title)
	for _, ex := range exclude {
		if ex = Norm(ex); len([]rune(ex)) >= 4 && strings.Contains(nt, ex) {
			return false
		}
	}
	need := max(minWords, 1)
	nq := Norm(query)
	specs := SpecTokens(query)
	if len(specs) > 0 {
		for _, sp := range specs {
			if !strings.Contains(nt, sp) {
				return false
			}
		}
		return matchedWords(nq, nt) >= need
	}
	hits := 0
	for _, w := range wordRe.FindAllString(nq, -1) {
		if len([]rune(w)) >= 4 && strings.Contains(nt, w) {
			hits++
		}
	}
	return hits >= need
}

func hasDigit(s string) bool {
	for _, r := range s {
		if r >= '0' && r <= '9' {
			return true
		}
	}
	return false
}

// Best возвращает лучший релевантный оффер: больше совпавших слов,
// затем в наличии, затем дешевле. Если в наличии ничего нет —
// лучший релевантный без учета наличия.
// Возвращает false, если релевантных нет.
func Best(query string, offers []shops.Offer, minWords int, exclude []string) (shops.Offer, bool) {
	type scored struct {
		offer shops.Offer
		words int
	}
	var rel []scored
	for _, o := range offers {
		if Relevant(query, o.Title, minWords, exclude) {
			rel = append(rel, scored{o, matchedWords(query, o.Title)})
		}
	}
	if len(rel) == 0 {
		return shops.Offer{}, false
	}
	better := func(a, b scored) bool {
		if a.words != b.words {
			return a.words > b.words
		}
		if a.offer.InStock != b.offer.InStock {
			return a.offer.InStock
		}
		return a.offer.PriceRub < b.offer.PriceRub
	}
	best := rel[0]
	for _, r := range rel[1:] {
		if better(r, best) {
			best = r
		}
	}
	return best.offer, true
}
