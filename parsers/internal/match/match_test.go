package match

import (
	"testing"

	"electric-form/parsers/internal/shops"
)

func TestRelevant(t *testing.T) {
	cases := []struct {
		query, title string
		want         bool
	}{
		{"ВВГ 3х2.5", "Кабель силовой ВВГ-Пнг(А)-LS 3х2,5 мм², черный, плоский, ГОСТ", true},
		{"ВВГ 3х2.5", "Кабель силовой ВВГ-Пнг(А)-LS 3х1,5 мм², черный, плоский, ГОСТ", false},
		{"ВВГ 3х2.5", "Кабель силовой АВВГ-П 3х2,5 мм², черный, плоский, ГОСТ", false},
		{"ВВГ 3х2.5", "NYM-J 3*2,5 (ок)-0,66кВ медь серый круглый кабель", false},
		{"ВВГ 3х2.5", "Кабель ВВГп нг, 3x2.5мм²", true},
		{"ВВГ 3х2.5", "Кабель ВВГнг, ГОСТ, Димитров, 3х2.5мм²", true},
		{"автоматический выключатель 16А", "Автомат 1Р 16А C 4,5кА NXB-63S CHINT", true},
		{"дифавтомат 16А", "Выключатель автоматический дифференциального тока 16А 30мА", true},
		{"провод ПуВ 4", "Провод ПуВ 4х16 белый", true},
		{"провод ПуВ 4", "ПВ-3/ПуГВ 1*0,5 белый провод", false},
		{"щит 24 модуля", "Бокс ЩРН-П-24 модуля навесной", true},
		{"щит 24 модуля", "Бокс ЩРН-П-36 модулей навесной", false},
		{"УЗО 40А 30мА", "УЗО 40А 30мА 4п", true},
		{"УЗО 40А 30мА", "УЗО 25А 30мА", false},
		{"подрозетник", "Подрозетник блочный 68мм", true},
		{"подрозетник", "Автомат 16А", false},
		{"автоматический выключатель 16А", "Выключатель автоматический модульный 1п C 16А 4.5кА", true},
	}
	for _, c := range cases {
		if got := Relevant(c.query, c.title, 0, nil); got != c.want {
			t.Errorf("Relevant(%q, %q) = %v, want %v", c.query, c.title, got, c.want)
		}
	}
}

func TestBest(t *testing.T) {
	offers := []shops.Offer{
		{Shop: "a", Title: "Кабель ВВГ 3х2.5", PriceRub: 200, InStock: true},
		{Shop: "b", Title: "Кабель ВВГ 3х2.5", PriceRub: 150, InStock: true},
		{Shop: "c", Title: "Кабель ВВГ 3х1.5", PriceRub: 100, InStock: true},
		{Shop: "d", Title: "Кабель ВВГ 3х2.5", PriceRub: 50, InStock: false},
	}
	best, ok := Best("ВВГ 3х2.5", offers, 0, nil)
	if !ok || best.PriceRub != 150 || best.Shop != "b" {
		t.Errorf("Best = %+v, %v", best, ok)
	}
	// Все не в наличии — берем самый дешевый релевантный.
	for i := range offers {
		offers[i].InStock = false
	}
	best, ok = Best("ВВГ 3х2.5", offers, 0, nil)
	if !ok || best.PriceRub != 50 {
		t.Errorf("Best out-of-stock = %+v, %v", best, ok)
	}
	if _, ok := Best("ВВГ 3х2.5", nil, 0, nil); ok {
		t.Error("Best should fail on empty")
	}
}

func TestBestScoring(t *testing.T) {
	offers := []shops.Offer{
		{Shop: "a", Title: "Выключатель RWB-101 микро", PriceRub: 29, InStock: true},
		{Shop: "b", Title: "Выключатель 1-клавишный Blanca", PriceRub: 207, InStock: true},
	}
	// Больше совпавших слов побеждает цену.
	best, ok := Best("выключатель 1-клавишный", offers, 0, nil)
	if !ok || best.Shop != "b" {
		t.Errorf("Best scoring = %+v, %v", best, ok)
	}
	// minWords отсекает частично совпавшие.
	if _, ok := Best("домофон комплект", []shops.Offer{
		{Shop: "a", Title: "Комплект соединительный М6", PriceRub: 13, InStock: true},
	}, 2, nil); ok {
		t.Error("minWords=2 should reject partial match")
	}
	best, ok = Best("домофон комплект", []shops.Offer{
		{Shop: "a", Title: "Комплект соединительный М6", PriceRub: 13, InStock: true},
		{Shop: "b", Title: "Домофон комплект из 2 частей", PriceRub: 5000, InStock: true},
	}, 2, nil)
	if !ok || best.Shop != "b" {
		t.Errorf("Best minWords = %+v, %v", best, ok)
	}
}

func TestExclude(t *testing.T) {
	if Relevant("диммер", "Ночник с диммером", 0, []string{"ночник", "светильник"}) {
		t.Error("exclude should reject night light")
	}
	if !Relevant("диммер", "Диммер 600Вт настенный", 0, []string{"ночник", "светильник"}) {
		t.Error("exclude should keep wall dimmer")
	}
}
