// Package parse — нормализация цен и единиц измерения из HTML-текста.
package parse

import (
	"regexp"
	"strconv"
	"strings"
)

var digitsRe = regexp.MustCompile(`[\d\s .,]+`)

// PriceRub извлекает цену в рублях из строки вида
// "1 526 ₽/шт", "3 399.97", "164 руб.", "2 114 ₽/шт".
// Копейки отбрасываются округлением вниз. Возвращает false,
// если числа нет.
func PriceRub(s string) (int, bool) {
	// goquery уже декодирует &#8381; в ₽, &nbsp; в \u00a0.
	m := digitsRe.FindString(s)
	if m == "" {
		return 0, false
	}
	clean := strings.ReplaceAll(m, " ", "")
	clean = strings.ReplaceAll(clean, " ", "")
	clean = strings.ReplaceAll(clean, ",", ".")
	// Тысячи могут быть "1 526" (уже склеено) или "1.526"?
	// Эвристика: если точек больше одной — это разделители тысяч.
	if strings.Count(clean, ".") > 1 {
		clean = strings.ReplaceAll(clean, ".", "")
	} else if i := strings.LastIndex(clean, "."); i >= 0 {
		// Одна точка: копейки, только если после неё ровно 2 цифры.
		if len(clean)-i-1 == 2 {
			if f, err := strconv.ParseFloat(clean, 64); err == nil {
				return int(f), true
			}
			return 0, false
		}
		clean = strings.ReplaceAll(clean, ".", "")
	}
	n, err := strconv.Atoi(clean)
	if err != nil || n <= 0 {
		return 0, false
	}
	return n, true
}

// Unit приводит обозначение единицы к коду каталога:
// м -> m, шт -> pcs, компл -> set, иначе исходный нижний регистр.
func Unit(s string) string {
	t := strings.ToLower(strings.Trim(s, " \t\n/."))
	switch {
	case strings.HasPrefix(t, "м"):
		return "m"
	case strings.HasPrefix(t, "шт"):
		return "pcs"
	case strings.HasPrefix(t, "компл"), strings.HasPrefix(t, "набор"):
		return "set"
	case strings.HasPrefix(t, "кор"), strings.HasPrefix(t, "упак"):
		return "box"
	default:
		return t
	}
}

// priceTailRe вылавливает "175 ₽/м" внутри длинного текста карточки.
// Число начинается с цифры и не содержит переводов строк, чтобы одно
// совпадение не могло «проглотить» половину карточки.
var priceTailRe = regexp.MustCompile(`(\d[\d ]*(?:[.,]\d+)?)\s*₽\s*/\s*([A-Za-zА-Яа-я]+)`)

// CardPrice ищет в тексте карточки цену с единицей ("175 ₽/м").
// Возвращает цену и нормализованную единицу.
func CardPrice(text string) (int, string, bool) {
	// NBSP в обычный пробел — \s в Go-regexp его не покрывает.
	text = strings.ReplaceAll(text, " ", " ")
	m := priceTailRe.FindStringSubmatch(text)
	if m == nil {
		return 0, "", false
	}
	price, ok := PriceRub(m[1])
	if !ok {
		return 0, "", false
	}
	return price, Unit(m[2]), true
}
